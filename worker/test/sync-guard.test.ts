import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SEISCOMP_ENDPOINT } from "../../core/seiscomp.ts";
import EMPTY from "../../test/fixtures/seiscomp-empty.html?raw";
import worker from "../index.ts";
import { checkSyncCode } from "../sync-guard.ts";
import { TEST_SYNC_CODE, setSyncCode } from "./sync-code.ts";

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

const setCode = setSyncCode;

/**
 * One request as the page sends it, from `ip`, with `code` in the header (none when undefined): a step
 * of a catch-up, or with `first` the opening request of a press (`context=1`).
 */
async function refresh(code: string | undefined, ip = "198.51.100.7", { first = false } = {}) {
  const ctx = createExecutionContext();
  const headers = new Headers({ "sec-fetch-site": "same-origin", "cf-connecting-ip": ip });
  if (code !== undefined) headers.set("x-sync-code", code);
  const res = await worker.fetch(
    new Request(`https://x.test/api/refresh?zone=tolima${first ? "&context=1" : ""}`, { method: "POST", headers }),
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

  // Every open tab holds the old code after the owner changes it, and would otherwise spend one of the
  // network's three tries at its next press (code review).
  it("asks a page holding the code before the owner's last change for the new one, without counting it", async () => {
    await setCode(OTHER);
    await setCode(CODE);
    for (let i = 0; i < 4; i++) {
      const res = await refresh(OTHER);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "sync code changed" });
    }
    expect((await refresh("1111")).body.attemptsLeft).toBe(2);
    expect((await refresh(CODE)).status).toBe(200);
  });

  it("counts the code from two changes back as a wrong one", async () => {
    await setCode("1111");
    await setCode(OTHER);
    await setCode(CODE);
    expect((await refresh("1111")).status).toBe(403);
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

  // A /48 comes free with a tunnel broker: keyed by /64 it was 65,536 callers with three tries each,
  // every code within one lock's time (code review).
  it("counts an IPv6 caller by its /48, so walking the /64s of one tunnel broker's block gets nowhere", async () => {
    await setCode(CODE);
    await refresh(OTHER, "2001:db8:1:2::1");
    await refresh(OTHER, "2001:db8:1:ffff:aaaa::7");
    expect((await refresh(OTHER, "2001:0db8:0001:abcd:ffff:ffff:ffff:fffe")).status).toBe(429);
    expect((await refresh(CODE, "2001:db8:1::9")).status).toBe(429);
    expect((await refresh(CODE, "2001:db8:2::1")).status).toBe(200);
  });

  it("counts a malformed address as itself rather than failing the request", async () => {
    await setCode(CODE);
    expect((await refresh(OTHER, "1:2:3:4::5:6:7:8")).status).toBe(403);
    expect((await refresh(OTHER, "1:2:3:4:5::6:7:8:9")).status).toBe(403);
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

  it("forgets a caller who has sent no code for a day, at the next press whose code is accepted", async () => {
    // The press's first request also asks USGS and Open-Meteo, which answer nothing useful here.
    server.use(
      http.get(/earthquake\.usgs\.gov|marine-api\.open-meteo\.com/, () => new HttpResponse(null, { status: 503 })),
    );
    await setCode(CODE);
    await refresh(OTHER, "198.51.100.7");
    await env.DB.prepare("UPDATE sync_lockouts SET updated_at = ?")
      .bind(new Date(Date.now() - 25 * 3600 * 1000).toISOString())
      .run();
    const count = async () =>
      (await env.DB.prepare("SELECT COUNT(*) AS n FROM sync_lockouts").first<{ n: number }>())!.n;
    // A later step of a catch-up does not purge: once a press is enough (code review).
    await refresh(CODE, "203.0.113.20");
    expect(await count()).toBe(2);
    await refresh(CODE, "203.0.113.20", { first: true });
    expect(await count()).toBe(1);
  });

  // Through the route the requests of a burst land on different milliseconds; the guard itself is given
  // one, which is the case that once made every request after the lock claim to have set it (code review).
  it("says a lock was set by one request alone, however many arrive in the same millisecond", async () => {
    await setCode(CODE);
    const now = new Date();
    const verdicts = await Promise.all(
      Array.from({ length: 8 }, () => checkSyncCode(env.DB, OTHER, "198.51.100.7", now)),
    );
    expect(verdicts.filter((v) => !v.ok && v.lockedNow)).toHaveLength(1);
    expect(verdicts.filter((v) => !v.ok && v.status === 429)).toHaveLength(6);
  });

  it("logs no code set as a warning, not an error, since any caller can send it", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const warns: string[] = [];
    vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => void warns.push(JSON.stringify(args)));
    await refresh(CODE);
    expect(errors).not.toHaveBeenCalled();
    vi.restoreAllMocks();
    expect(warns.some((l) => l.includes("sync code not set"))).toBe(true);
  });
});
