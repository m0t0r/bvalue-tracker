import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FULL from "../../test/fixtures/seiscomp-2026-08-10_2026-09-18.html?raw";
import worker from "../index.ts";
import { fastLaneBlocked, ingest, ingestSweep, sweepChunks } from "../ingest.ts";

// The fixture covers 2026-08-10 .. 2026-09-18 22:08 UTC.
const FROM = new Date("2026-08-10T00:00:00Z");
const TO = new Date("2026-09-19T00:00:00Z");
const NOW = new Date("2026-09-18T23:00:00Z");

const serve = (html: string) => (async () => new Response(html, { status: 200 })) as unknown as typeof fetch;
const deps = (html: string, now = NOW) => ({ db: env.DB, now, fetchOptions: { fetchImpl: serve(html), backoffMs: 1, retries: 1 } });

const count = async (where = "1=1") =>
  (await env.DB.prepare(`SELECT COUNT(*) AS n FROM events WHERE ${where}`).first<{ n: number }>())!.n;

const runCount = async () =>
  (await env.DB.prepare("SELECT COUNT(*) AS n FROM ingest_runs").first<{ n: number }>())!.n;

/** Rewrites one table cell of the row belonging to `id`. */
function editRow(html: string, id: string, edit: (row: string) => string): string {
  const at = html.indexOf(`id_sismo=${id}&`);
  const start = html.lastIndexOf("<tr>", at);
  const end = html.indexOf("</tr>", at) + 5;
  return html.slice(0, start) + edit(html.slice(start, end)) + html.slice(end);
}

function dropRows(html: string, n: number): string {
  let out = html;
  for (let i = 0; i < n; i++) out = out.slice(0, out.lastIndexOf("<tr>")) + "</tbody></table></body></html>";
  return out.replace(/(colspan=2>)786</, `$1${786 - n}<`);
}

/** Calls the Worker as the page does: same-origin, which /api/* now requires. */
async function call(path: string, init: RequestInit = {}) {
  const ctx = createExecutionContext();
  const headers = new Headers(init.headers);
  if (!headers.has("sec-fetch-site")) headers.set("sec-fetch-site", "same-origin");
  const res = await worker.fetch(new Request(`https://x.test${path}`, { ...init, headers }), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

/** Calls the Worker as an outsider does: no same-origin signal at all. */
async function callRaw(path: string, init: RequestInit = {}) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`https://x.test${path}`, init), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

beforeEach(async () => {
  await env.DB.batch([env.DB.prepare("DELETE FROM events"), env.DB.prepare("DELETE FROM ingest_runs")]);
});
afterEach(() => vi.unstubAllGlobals());

/** Marks every history chunk as swept, as a finished back-fill would. */
async function completeBackfill() {
  const old = "2026-01-01T00:00:00.000Z";
  await env.DB.batch(sweepChunks(new Date()).map((c) =>
    env.DB.prepare("INSERT INTO ingest_runs (started_at, finished_at, trigger, window_start, window_end, ok) VALUES (?, ?, 'sweep', ?, ?, 1)")
      .bind(old, old, c.start.toISOString(), c.end.toISOString())));
}

describe("ingest", () => {
  it("inserts every event, and re-ingesting the same response changes nothing", async () => {
    const first = await ingest(deps(FULL), FROM, TO, "manual");
    expect(first).toMatchObject({ ok: true, fetched: 786, inserted: 786, updated: 0, removed: 0, error: null });
    expect(await count()).toBe(786);

    const later = new Date(NOW.getTime() + 3_600_000);
    const second = await ingest(deps(FULL, later), FROM, TO, "manual");
    expect(second).toMatchObject({ ok: true, fetched: 786, inserted: 0, updated: 0, removed: 0 });
    expect(await count(`updated_at != '${NOW.toISOString()}'`)).toBe(0);
  });

  it("updates exactly the row whose magnitude and status changed", async () => {
    await ingest(deps(FULL), FROM, TO, "manual");
    const revised = editRow(FULL, "SGC2026skywaa", (row) =>
      row.replace("<center>2.1</center>", "<center>2.4</center>").replace("<center>manual</center>", "<center>automatic</center>"));
    const later = new Date(NOW.getTime() + 3_600_000);
    const run = await ingest(deps(revised, later), FROM, TO, "manual");
    expect(run).toMatchObject({ ok: true, inserted: 0, updated: 1, removed: 0 });

    const row = await env.DB.prepare("SELECT mag, status, first_seen_at, updated_at FROM events WHERE id = 'SGC2026skywaa'").first();
    expect(row).toEqual({ mag: 2.4, status: "automatic", first_seen_at: NOW.toISOString(), updated_at: later.toISOString() });
    expect(await count(`updated_at = '${later.toISOString()}'`)).toBe(1);
  });

  it("marks an event SGC stopped returning as removed, and restores it if it comes back", async () => {
    await ingest(deps(FULL), FROM, TO, "manual");
    const run = await ingest(deps(dropRows(FULL, 1)), FROM, TO, "manual");
    expect(run).toMatchObject({ ok: true, removed: 1 });
    expect(await count("removed_at IS NOT NULL")).toBe(1);
    expect(await count()).toBe(786);

    const back = await ingest(deps(FULL), FROM, TO, "manual");
    expect(back).toMatchObject({ ok: true, updated: 1, removed: 0 });
    expect(await count("removed_at IS NOT NULL")).toBe(0);
  });

  it("lets only one of two overlapping runs claim the window", async () => {
    // The guard used to be a read followed by an insert, so both callers passed it and
    // both queried SGC. The claim is one atomic statement now: the loser gets null.
    const runs = await Promise.all([ingest(deps(FULL), FROM, TO, "cron"), ingest(deps(FULL), FROM, TO, "manual")]);
    const won = runs.filter((r) => r !== null);
    expect(won).toHaveLength(1);
    expect(won[0]).toMatchObject({ ok: true, error: null });
    expect(await count()).toBe(786);
    expect(await runCount()).toBe(1);
  });

  it("keeps a burst of concurrent refreshes down to a single SGC request", async () => {
    await completeBackfill();
    let calls = 0;
    vi.stubGlobal("fetch", async () => { calls++; return new Response(FULL); });
    const burst = await Promise.all(Array.from({ length: 8 }, () => call("/api/refresh", { method: "POST" })));
    const bodies = (await Promise.all(burst.map((r) => r.json()))) as any[];
    expect(bodies.filter((b) => b.refreshed)).toHaveLength(1);
    expect(calls).toBe(1);
  });

  it("does not remove events outside the requested window", async () => {
    await ingest(deps(FULL), FROM, TO, "manual");
    // A response for a late window legitimately lacks the early events.
    const run = (await ingest(deps(dropRows(FULL, 0)), new Date("2026-09-15T00:00:00Z"), TO, "manual"))!;
    expect(run.removed).toBe(0);
  });

  it("refuses a response that would retire more than 20% of a window", async () => {
    await ingest(deps(FULL), FROM, TO, "manual");
    const run = (await ingest(deps(dropRows(FULL, 300)), FROM, TO, "manual"))!;
    expect(run.ok).toBe(true);
    expect(run.removed).toBe(0);
    expect(run.error).toMatch(/removal skipped: response lacks 300 of 786/);
    expect(await count("removed_at IS NOT NULL")).toBe(0);
  });

  it.each([
    ["an unparseable page", async () => new Response("<html>mantenimiento</html>")],
    ["a truncated page", async () => new Response(FULL.slice(0, 400_000))],
    ["an HTTP error", async () => new Response("", { status: 503 })],
    ["a network failure", async () => { throw new TypeError("fetch failed"); }],
  ])("leaves events untouched and records the error on %s", async (_name, impl) => {
    await ingest(deps(FULL), FROM, TO, "manual");
    const bad = { db: env.DB, now: NOW, fetchOptions: { fetchImpl: impl as unknown as typeof fetch, backoffMs: 1, retries: 1 } };
    const run = (await ingest(bad, FROM, TO, "cron"))!;
    expect(run.ok).toBe(false);
    expect(run.error).toBeTruthy();
    expect(await count("removed_at IS NULL")).toBe(786);
  });
});

describe("sweep", () => {
  it("splits history into 7-day chunks covering mainshock to now", () => {
    const chunks = sweepChunks(NOW);
    expect(chunks).toHaveLength(6);
    expect(chunks[0]!.start.toISOString()).toBe("2026-08-10T00:00:00.000Z");
    expect(chunks.at(-1)!.end.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("sends a chunk that keeps failing to the back of the queue", async () => {
    const failing = { db: env.DB, now: NOW, fetchOptions: { fetchImpl: (async () => new Response("", { status: 503 })) as unknown as typeof fetch, backoffMs: 1, retries: 0 } };
    const bad = (await ingestSweep(failing))!;
    expect(bad.ok).toBe(false);
    const next = (await ingestSweep(deps(FULL, new Date(NOW.getTime() + 60_000))))!;
    expect(next.windowStart).not.toBe(bad.windowStart);
  });

  it("visits never-swept chunks first, then the least recently swept", async () => {
    const seen: string[] = [];
    for (let i = 0; i < 7; i++) {
      const run = (await ingestSweep(deps(FULL, new Date(NOW.getTime() + i * 60_000))))!;
      seen.push(run.windowStart);
    }
    expect(new Set(seen.slice(0, 6)).size).toBe(6);
    expect(seen[6]).toBe(seen[0]);
  });
});

describe("API", () => {
  it("sends the security headers the static-asset layer cannot reach on /api/*", async () => {
    // Refusals and 404s carry them too: the middleware wraps everything under /api/.
    for (const res of [await call("/api/status"), await callRaw("/api/status"), await call("/api/nope")]) {
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("referrer-policy")).toBe("no-referrer");
      expect(res.headers.get("strict-transport-security")).toBe("max-age=63072000; includeSubDomains; preload");
    }
  });

  it("reports the reference statistics for the captured catalogue", async () => {
    await ingest(deps(FULL), FROM, TO, "manual");
    const stats = (await (await call("/api/stats")).json()) as any;
    expect(stats.count).toBe(786);
    expect(stats.mcMaxc).toBeCloseTo(2.3, 9);
    expect(stats.mc).toBeCloseTo(2.3, 9);
    expect(stats.fit.n).toBe(528);
    expect(stats.fit.b).toBeCloseTo(0.75, 2);
    expect(stats.fit.sigmaB).toBeCloseTo(0.031, 3);
    expect(stats.windows.at(-1).b).toBeCloseTo(0.58, 2);
    expect(stats.windows.at(-1).n).toBe(150);

    // Each cluster is fitted above the Mc of the whole catalogue, as on the page; together they account for every event.
    const shallow = (await (await call("/api/stats?cluster=shallow")).json()) as any;
    const deep = (await (await call("/api/stats?cluster=deep")).json()) as any;
    expect([shallow.mc, deep.mc]).toEqual([stats.mc, stats.mc]);
    expect(shallow.count + deep.count).toBe(786);
    expect(shallow.fit.n + deep.fit.n).toBe(528);
    expect(shallow.fit.b).toBeCloseTo(0.738, 3);
    expect(deep.fit.b).toBeCloseTo(0.816, 3);
    expect(deep.windows).toHaveLength(0);
    expect(((await (await call("/api/events?cluster=deep")).json()) as any[]).every((e) => e.depthKm >= 70)).toBe(true);
    expect((await (await call("/api/events.csv?cluster=shallow")).text()).trim().split("\n")).toHaveLength(639 + 1);
    expect((await (await call("/api/b-windows.csv?cluster=shallow")).text()).trim().split("\n")).toHaveLength(29 + 1);
    const bad = await call("/api/stats?cluster=middle");
    expect(bad.status).toBe(400);
    expect(bad.headers.get("cache-control")).toBe("no-store");

    const manual = (await (await call("/api/stats?mc=2.5")).json()) as any;
    expect(manual.mc).toBe(2.5);
    expect(manual.fit.mc).toBe(2.5);
  });

  it("serves b over time as CSV with the same windows as /api/stats", async () => {
    await ingest(deps(FULL), FROM, TO, "manual");
    const stats = (await (await call("/api/stats?mc=2.5")).json()) as any;
    const res = await call("/api/b-windows.csv?mc=2.5");
    expect(res.headers.get("content-type")).toContain("text/csv");
    const lines = (await res.text()).trimEnd().split("\n");
    expect(lines).toHaveLength(stats.windows.length + 1);
    expect(lines[1]!.split(",").slice(0, 4)).toEqual([stats.windows[0].from, stats.windows[0].to, "150", "2.5"]);
    expect(lines[0]).toBe("from,to,n,mc,b,sigmaB,a,meanMag");
    const es = (await (await call("/api/b-windows.csv?mc=2.5&lang=es")).text()).trimEnd().split("\n");
    expect(es[0]).toBe("desde,hasta,n,mc,b,sigma_b,a,magnitud_media");
    expect(es.slice(1)).toEqual(lines.slice(1));
  });

  it("filters events and hides removed ones by default", async () => {
    await ingest(deps(FULL), FROM, TO, "manual");
    await ingest(deps(dropRows(FULL, 1)), FROM, TO, "manual");
    const all = (await (await call("/api/events")).json()) as unknown[];
    expect(all).toHaveLength(785);
    expect(await (await call("/api/events?includeRemoved=1")).json()).toHaveLength(786);
    const big = (await (await call("/api/events?minMag=4")).json()) as { mag: number }[];
    expect(big.length).toBe(26);
    expect(big.every((e) => e.mag >= 4)).toBe(true);
    const csv = await (await call("/api/events.csv?minMag=7")).text();
    expect(csv.split("\n")[1]).toContain("SGC2026pqqmro");
    expect(csv.startsWith("id,time,")).toBe(true);
    expect((await (await call("/api/events.csv?minMag=7&lang=es")).text()).startsWith("id,hora_utc,")).toBe(true);
  });

  it("excludes the mainshock by id, never the largest event of whatever range is asked for", async () => {
    await ingest(deps(FULL), FROM, TO, "manual");
    const late = (await (await call("/api/events?from=2026-08-20")).json()) as { id: string; mag: number }[];
    const lateNoMain = (await (await call("/api/events?from=2026-08-20&excludeMainshock=1")).json()) as unknown[];
    expect(late.some((e) => e.id === "SGC2026pqqmro")).toBe(false);
    expect(lateNoMain).toHaveLength(late.length);
    const all = (await (await call("/api/events?excludeMainshock=1")).json()) as { id: string }[];
    expect(all).toHaveLength(785);
  });

  it("treats a bare `to` date as inclusive of that day", async () => {
    await ingest(deps(FULL), FROM, TO, "manual");
    const day = (await (await call("/api/events?from=2026-08-10&to=2026-08-10")).json()) as { time: string }[];
    expect(day.length).toBeGreaterThan(0);
    expect(day.every((e) => e.time.startsWith("2026-08-10"))).toBe(true);
  });

  it("stops fast-laning the back-fill once SGC starts failing", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => { calls++; return new Response("", { status: 503 }); });
    const first = (await (await call("/api/refresh", { method: "POST" })).json()) as any;
    expect(first.refreshed).toBe(true);
    expect(first.lastRun.ok).toBe(false);
    const attempts = calls;

    const second = (await (await call("/api/refresh", { method: "POST" })).json()) as any;
    expect(second.refreshed).toBe(false);
    expect(second.retryAfterS).toBeGreaterThan(200);
    expect(calls).toBe(attempts);
  });

  it("refresh loads missing history first, one chunk per call, and reports progress", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => { calls++; return new Response(FULL); });
    const before = (await (await call("/api/status")).json()) as any;
    expect(before.backfill.done).toBe(0);
    const total = before.backfill.total as number;
    expect(total).toBeGreaterThanOrEqual(6);

    for (let i = 1; i <= total; i++) {
      const res = (await (await call("/api/refresh", { method: "POST" })).json()) as any;
      expect(res.backfill).toEqual({ done: i, total });
      expect(res.lastRun.trigger).toBe("sweep");
    }
    expect(calls).toBe(total);
  });

  it("refresh queries SGC once, then is rate limited", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => { calls++; return new Response(FULL); });
    await completeBackfill();
    calls = 0;
    const first = (await (await call("/api/refresh", { method: "POST" })).json()) as any;
    expect(first.refreshed).toBe(true);
    expect(first.lastSuccessfulRun.trigger).toBe("manual");
    expect(calls).toBe(1);

    const second = (await (await call("/api/refresh", { method: "POST" })).json()) as any;
    expect(second.refreshed).toBe(false);
    expect(second.retryAfterS).toBeGreaterThan(0);
    expect(calls).toBe(1);
  });

  it("refresh stands down while another run is in flight", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => { calls++; return new Response(FULL); });
    await env.DB.prepare("INSERT INTO ingest_runs (started_at, trigger, window_start, window_end) VALUES (?, 'cron', ?, ?)")
      .bind(new Date().toISOString(), FROM.toISOString(), TO.toISOString()).run();
    const res = (await (await call("/api/refresh", { method: "POST" })).json()) as any;
    expect(res.refreshed).toBe(false);
    expect(calls).toBe(0);
    expect(res.lastRun).toBeNull(); // an unfinished run is not reported as a failed one
  });

  it("never lets an error response be cached", async () => {
    const broken = { ...env, DB: { prepare: () => { throw new Error("D1 down"); } } as unknown as D1Database };
    const req = new Request("https://x.test/api/events", { headers: { "sec-fetch-site": "same-origin" } });
    const res = await worker.fetch(req, broken, {} as ExecutionContext);
    expect(res.status).toBe(500);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ error: "internal error" });
  });

  it.each(["/api/events", "/api/events.csv", "/api/stats", "/api/b-windows.csv", "/api/status"])(
    "refuses %s without a same-origin signal",
    async (path) => {
      await ingest(deps(FULL), FROM, TO, "manual");
      const res = await callRaw(path);
      expect(res.status).toBe(403);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(await res.json()).toEqual({ error: "forbidden" });
    },
  );

  it.each(["cross-site", "same-site", "none"])(
    "refuses /api/events when Sec-Fetch-Site is %s",
    async (site) => {
      const res = await callRaw("/api/events", { headers: { "sec-fetch-site": site } });
      expect(res.status).toBe(403);
    },
  );

  it("refuses a cross-site POST /api/refresh without touching SGC", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => { calls++; return new Response(FULL); });
    const res = await callRaw("/api/refresh", { method: "POST", headers: { "sec-fetch-site": "cross-site" } });
    expect(res.status).toBe(403);
    expect(calls).toBe(0);
    expect(await runCount()).toBe(0);
  });

  it("accepts a request whose Origin matches, for clients that send no Sec-Fetch-Site", async () => {
    await ingest(deps(FULL), FROM, TO, "manual");
    const ok = await callRaw("/api/events", { headers: { origin: "https://x.test" } });
    expect(ok.status).toBe(200);
    const bad = await callRaw("/api/events", { headers: { origin: "https://evil.test" } });
    expect(bad.status).toBe(403);
  });

  // The deploy smoke test and any uptime check call this one, so it must stay open.
  it("leaves /api/health reachable with no same-origin signal", async () => {
    await ingest(deps(FULL), FROM, TO, "manual");
    const res = await callRaw("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, totalEvents: 786 });
  });

  it("returns JSON 404 for unknown API routes", async () => {
    expect((await call("/api/nope")).status).toBe(404);
  });
});

/** Fires the scheduled handler as Cloudflare does, for one cron pattern at one minute. */
async function tick(cron: string, minute: number) {
  // scheduled() awaits its own work, so unlike the refresh route it needs no execution context.
  const at = new Date(Date.UTC(2026, 8, 19, 12, minute));
  await worker.scheduled!({ cron, scheduledTime: at.getTime(), noRetry() {} }, env);
}

const latestRun = async () =>
  (await env.DB.prepare("SELECT * FROM ingest_runs ORDER BY id DESC LIMIT 1").first<Record<string, unknown>>())!;

/** The window a trailing run of `days` opened, derived from when it actually started. */
function expectedWindowStart(startedAt: string, days: number): string {
  const d = new Date(startedAt);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - days * 86_400_000).toISOString();
}

/** Records a finished run, as the back-off reads them. */
const recordRun = (ok: number, fields: { http_status?: number | null; retry_after_s?: number | null } = {}, finishedAt = NOW) =>
  env.DB
    .prepare(`INSERT INTO ingest_runs (started_at, finished_at, trigger, window_start, window_end, ok, http_status, retry_after_s)
              VALUES (?, ?, 'cron', '2026-09-01T00:00:00.000Z', '2026-09-02T00:00:00.000Z', ?, ?, ?)`)
    .bind(finishedAt.toISOString(), finishedAt.toISOString(), ok, fields.http_status ?? null, fields.retry_after_s ?? null)
    .run();

describe("cron lanes", () => {
  it("loads one trailing day on a five-minute tick and three on a fifteen-minute one", async () => {
    // Otherwise the wide tick also pulls a history chunk, and that would be the latest run.
    await completeBackfill();
    vi.stubGlobal("fetch", async () => new Response(FULL));

    await tick("*/5 * * * *", 5);
    const fast = await latestRun();
    expect(fast.window_start).toBe(expectedWindowStart(fast.started_at as string, 1));

    await tick("*/5 * * * *", 15);
    const wide = await latestRun();
    expect(wide.window_start).toBe(expectedWindowStart(wide.started_at as string, 3));
  });

  it("sends the sweep cron to the sweep, on a minute the five-minute tick cannot share", async () => {
    vi.stubGlobal("fetch", async () => new Response(FULL));
    await tick("7 * * * *", 7);
    expect((await latestRun()).trigger).toBe("sweep");
    // A multiple of 5 here would collide with the tick above and lose the claim every hour.
    expect(7 % 5).not.toBe(0);
  });

  // The fast lane's window holds a handful of events — too few for MAX_REMOVAL_SHARE to
  // engage — so one short response could retire real ones. Only the wide lanes retire.
  it("never retires an event on the fast lane, and still does on the wide one", async () => {
    await ingest(deps(FULL), FROM, TO, "manual");

    const fast = (await ingest(deps(dropRows(FULL, 1)), FROM, TO, "cron", { allowRemovals: false }))!;
    expect(fast).toMatchObject({ ok: true, removed: 0 });
    expect(await count("removed_at IS NOT NULL")).toBe(0);

    const wide = (await ingest(deps(dropRows(FULL, 1)), FROM, TO, "cron"))!;
    expect(wide).toMatchObject({ ok: true, removed: 1 });
    expect(await count("removed_at IS NOT NULL")).toBe(1);
  });
});

describe("fast lane back-off", () => {
  it("runs while the last finished run succeeded", async () => {
    expect(await fastLaneBlocked(env.DB, NOW)).toBe(false); // no runs yet
    await recordRun(1);
    expect(await fastLaneBlocked(env.DB, NOW)).toBe(false);
  });

  it("stands down until a success when a run failed for no HTTP reason", async () => {
    await recordRun(0);
    expect(await fastLaneBlocked(env.DB, new Date(NOW.getTime() + 86_400_000))).toBe(true);
    await recordRun(1, {}, new Date(NOW.getTime() + 60_000));
    expect(await fastLaneBlocked(env.DB, new Date(NOW.getTime() + 120_000))).toBe(false);
  });

  it("waits out Retry-After after a 429, then resumes by itself", async () => {
    await recordRun(0, { http_status: 429, retry_after_s: 600 });
    expect(await fastLaneBlocked(env.DB, new Date(NOW.getTime() + 599_000))).toBe(true);
    expect(await fastLaneBlocked(env.DB, new Date(NOW.getTime() + 601_000))).toBe(false);
  });

  it("falls back to 30 minutes when the server named no cooldown", async () => {
    await recordRun(0, { http_status: 503 });
    expect(await fastLaneBlocked(env.DB, new Date(NOW.getTime() + 1_799_000))).toBe(true);
    expect(await fastLaneBlocked(env.DB, new Date(NOW.getTime() + 1_801_000))).toBe(false);
  });

  it("keeps the wide tick running while the fast lane is standing down", async () => {
    await completeBackfill();
    await recordRun(0, { http_status: 429, retry_after_s: 86_400 });
    let calls = 0;
    vi.stubGlobal("fetch", async () => { calls++; return new Response(FULL); });

    await tick("*/5 * * * *", 5);
    expect(calls).toBe(0);

    await tick("*/5 * * * *", 15);
    expect(calls).toBe(1);
  });
});
