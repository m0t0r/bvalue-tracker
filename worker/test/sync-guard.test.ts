import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SEISCOMP_ENDPOINT } from "../../core/seiscomp.ts";
import EMPTY from "../../test/fixtures/seiscomp-empty.html?raw";
import worker from "../index.ts";
import { TEST_SYNC_CODE } from "./sync-code.ts";

/**
 * The code that guards "Sincronizar ahora" (worker/sync-guard.ts). Every code here is made up: the
 * real one lives in production's D1 only, and the repo is public.
 */
const CODE = TEST_SYNC_CODE;
const OTHER = "9035";

/** SGC answers an empty catalogue, and counts the requests it took. */
const server = setupServer();
let sgcCalls = 0;
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => {
  sgcCalls = 0;
  server.use(
    http.post(SEISCOMP_ENDPOINT, () => {
      sgcCalls++;
      return HttpResponse.html(EMPTY);
    }),
  );
});
afterEach(() => server.resetHandlers());

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM events"),
    env.DB.prepare("DELETE FROM ingest_runs"),
    env.DB.prepare("DELETE FROM sync_code"),
    env.DB.prepare("DELETE FROM sync_lockouts"),
  ]);
});

/** The owner's command (docs/deployment.md, "The sync code"). */
const setCode = (code: string) =>
  env.DB.prepare(
    "INSERT INTO sync_code (id, code, updated_at) VALUES (1, ?, datetime('now')) ON CONFLICT(id) DO UPDATE SET code = excluded.code, updated_at = excluded.updated_at",
  )
    .bind(code)
    .run();

/** One press as the page sends it, from `ip`, with `code` in the header (none when undefined). */
async function refresh(code: string | undefined, ip = "198.51.100.7") {
  const ctx = createExecutionContext();
  const headers = new Headers({ "sec-fetch-site": "same-origin", "cf-connecting-ip": ip });
  if (code !== undefined) headers.set("x-sync-code", code);
  const res = await worker.fetch(
    new Request("https://x.test/api/refresh?zone=tolima", { method: "POST", headers }),
    env,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return { status: res.status, headers: res.headers, body: (await res.json()) as any };
}

/** Ends every lock now in place, as 15 minutes passing would. */
const lockExpires = () =>
  env.DB.prepare("UPDATE sync_lockouts SET locked_until = ? WHERE locked_until IS NOT NULL")
    .bind(new Date(Date.now() - 1000).toISOString())
    .run();

describe("the sync code", () => {
  it("refuses every sync with a 503 until the owner has set one, and asks SGC nothing", async () => {
    const res = await refresh(CODE);
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/not set/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(sgcCalls).toBe(0);
  });

  it("does not count a code sent while none is set, so setting one later locks nobody out", async () => {
    for (let i = 0; i < 4; i++) expect((await refresh(OTHER)).status).toBe(503);
    await setCode(CODE);
    expect((await refresh(CODE)).status).toBe(200);
  });

  it("syncs with the right code", async () => {
    await setCode(CODE);
    const res = await refresh(CODE);
    expect(res.status).toBe(200);
    expect(res.body.refreshed).toBe(true);
    expect(sgcCalls).toBe(1);
  });

  it("answers a press with no code with a 401, and does not count it: a tab from before the guard sends none", async () => {
    await setCode(CODE);
    for (let i = 0; i < 5; i++) {
      const res = await refresh(undefined);
      expect(res.status).toBe(401);
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
    expect((await refresh(CODE)).status).toBe(200);
  });

  it("answers a code that is not four digits with a 400, and does not count it", async () => {
    await setCode(CODE);
    for (const bad of ["", "12a4", "12345", "482", "48 1"]) expect((await refresh(bad)).status).toBe(400);
    expect((await refresh(CODE)).status).toBe(200);
  });

  it("refuses a wrong code with a 403 and the attempts left, and asks SGC nothing", async () => {
    await setCode(CODE);
    const first = await refresh(OTHER);
    expect(first.status).toBe(403);
    expect(first.body).toEqual({ error: "wrong sync code", attemptsLeft: 2 });
    expect(first.headers.get("cache-control")).toBe("no-store");
    expect((await refresh(OTHER)).body.attemptsLeft).toBe(1);
    expect(sgcCalls).toBe(0);
  });

  it("counts wrong codes in a row: a right one starts the count again", async () => {
    await setCode(CODE);
    await refresh(OTHER);
    await refresh(OTHER);
    expect((await refresh(CODE)).status).toBe(200);
    expect((await refresh(OTHER)).body.attemptsLeft).toBe(2);
    expect((await refresh(OTHER)).body.attemptsLeft).toBe(1);
  });
});

describe("the lockout", () => {
  it("locks the caller out for 15 minutes on the third wrong code in a row", async () => {
    await setCode(CODE);
    await refresh(OTHER);
    await refresh(OTHER);
    const third = await refresh(OTHER);
    expect(third.status).toBe(429);
    expect(third.body).toEqual({ error: "too many wrong sync codes", retryAfterS: 900 });
    expect(third.headers.get("retry-after")).toBe("900");
    expect(third.headers.get("cache-control")).toBe("no-store");
  });

  it("refuses even the right code while it lasts, and asks SGC nothing", async () => {
    await setCode(CODE);
    for (let i = 0; i < 3; i++) await refresh(OTHER);
    const right = await refresh(CODE);
    expect(right.status).toBe(429);
    expect(right.body.retryAfterS).toBeGreaterThan(890);
    expect(right.body.retryAfterS).toBeLessThanOrEqual(900);
    expect(sgcCalls).toBe(0);
  });

  it("does not lengthen the lock for guesses sent while it lasts", async () => {
    await setCode(CODE);
    for (let i = 0; i < 3; i++) await refresh(OTHER);
    const until = await env.DB.prepare("SELECT locked_until AS u FROM sync_lockouts").first<{ u: string }>();
    for (let i = 0; i < 3; i++) await refresh(OTHER);
    expect(await env.DB.prepare("SELECT locked_until AS u FROM sync_lockouts").first<{ u: string }>()).toEqual(until);
  });

  it("is per caller: another address still syncs", async () => {
    await setCode(CODE);
    for (let i = 0; i < 3; i++) await refresh(OTHER, "198.51.100.7");
    expect((await refresh(CODE, "198.51.100.7")).status).toBe(429);
    expect((await refresh(CODE, "203.0.113.20")).status).toBe(200);
  });

  it("counts an IPv6 caller by its /64, so walking the addresses of one subscriber's block gets nowhere", async () => {
    await setCode(CODE);
    await refresh(OTHER, "2001:db8:1:2::1");
    await refresh(OTHER, "2001:db8:1:2:aaaa::7");
    expect((await refresh(OTHER, "2001:0db8:0001:0002:ffff:ffff:ffff:fffe")).status).toBe(429);
    expect((await refresh(CODE, "2001:db8:1:2::9")).status).toBe(429);
    expect((await refresh(CODE, "2001:db8:1:3::1")).status).toBe(200);
  });

  it("ends after 15 minutes, and the next three wrong codes count afresh", async () => {
    await setCode(CODE);
    for (let i = 0; i < 3; i++) await refresh(OTHER);
    await lockExpires();
    expect((await refresh(OTHER)).body).toEqual({ error: "wrong sync code", attemptsLeft: 2 });
    expect((await refresh(CODE)).status).toBe(200);
  });

  it("holds against a burst of parallel guesses: no more than two are compared before the lock", async () => {
    await setCode(CODE);
    const burst = await Promise.all(Array.from({ length: 8 }, () => refresh(OTHER)));
    const statuses = burst.map((r) => r.status).sort();
    expect(statuses).toEqual([403, 403, 429, 429, 429, 429, 429, 429]);
    expect((await refresh(CODE)).status).toBe(429);
  });

  it("holds against a parallel burst that hides the right code among wrong ones", async () => {
    await setCode(CODE);
    for (let i = 0; i < 3; i++) await refresh(OTHER);
    const burst = await Promise.all([refresh(OTHER), refresh(CODE), refresh(OTHER)]);
    expect(burst.map((r) => r.status)).toEqual([429, 429, 429]);
    expect(sgcCalls).toBe(0);
  });
});

describe("what the guard keeps and writes", () => {
  it("never puts the code or the caller's address in a log line", async () => {
    const lines: string[] = [];
    for (const m of ["debug", "info", "warn", "error"] as const)
      vi.spyOn(console, m).mockImplementation((...args: unknown[]) => void lines.push(JSON.stringify(args)));
    await refresh(OTHER, "198.51.100.7");
    await setCode(CODE);
    await refresh(OTHER, "198.51.100.7");
    await refresh(CODE, "198.51.100.7");
    for (let i = 0; i < 4; i++) await refresh(OTHER, "198.51.100.7");
    vi.restoreAllMocks();
    expect(lines.some((l) => l.includes("sync code refused"))).toBe(true);
    expect(lines.some((l) => l.includes("sync locked out"))).toBe(true);
    for (const l of lines) {
      expect(l).not.toContain(CODE);
      expect(l).not.toContain(OTHER);
      expect(l).not.toContain("198.51.100.7");
    }
  });

  it("stores a hash of the caller, never its address", async () => {
    await setCode(CODE);
    await refresh(OTHER, "198.51.100.7");
    const rows = (await env.DB.prepare("SELECT ip_hash FROM sync_lockouts").all<{ ip_hash: string }>()).results;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.ip_hash).toMatch(/^[0-9a-f]{32}$/);
    expect(rows[0]!.ip_hash).not.toContain("198.51.100.7");
  });

  it("forgets a caller who has sent no code for a day, once anyone's code is accepted", async () => {
    await setCode(CODE);
    await refresh(OTHER, "198.51.100.7");
    await env.DB.prepare("UPDATE sync_lockouts SET updated_at = ?")
      .bind(new Date(Date.now() - 25 * 3600 * 1000).toISOString())
      .run();
    await refresh(CODE, "203.0.113.20");
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM sync_lockouts").first<{ n: number }>();
    expect(n!.n).toBe(1);
  });
});
