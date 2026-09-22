import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SEISCOMP_ENDPOINT } from "../../core/seiscomp.ts";
import FULL from "../../test/fixtures/seiscomp-2026-08-10_2026-09-18.html?raw";
import { ABANDONED_ERROR, sgcHealth } from "../db.ts";
import worker from "../index.ts";
import { ingest, ingestSweep, sweepChunks } from "../ingest.ts";
import { IN_FLIGHT_MS } from "../plan.ts";

// The fixture covers 2026-08-10 .. 2026-09-18 22:08 UTC.
const FROM = new Date("2026-08-10T00:00:00Z");
const TO = new Date("2026-09-19T00:00:00Z");
const NOW = new Date("2026-09-18T23:00:00Z");

/**
 * SGC itself, answered from the captured fixture. An unhandled request is an error rather
 * than a passthrough, so a test can never reach bdrsnc.sgc.gov.co by accident.
 */
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());

/** Makes SGC answer this way, and hands back how many requests it has taken so far. */
function serves(respond: () => Response): () => number {
  let calls = 0;
  server.use(http.post(SEISCOMP_ENDPOINT, () => { calls++; return respond(); }));
  return () => calls;
}
const serving = (html: string) => serves(() => HttpResponse.html(html));

const FETCH_FAST = { backoffMs: 1, retries: 1 };
/** Deps for a direct ingest() call, with SGC serving this page. */
const deps = (html: string, now = NOW) => {
  serving(html);
  return { db: env.DB, now, fetchOptions: FETCH_FAST };
};

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
afterEach(() => server.resetHandlers());

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
    const calls = serving(FULL);
    const burst = await Promise.all(Array.from({ length: 8 }, () => call("/api/refresh", { method: "POST" })));
    const bodies = (await Promise.all(burst.map((r) => r.json()))) as any[];
    expect(bodies.filter((b) => b.refreshed)).toHaveLength(1);
    expect(calls()).toBe(1);
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
    ["an unparseable page", () => HttpResponse.html("<html>mantenimiento</html>")],
    ["a truncated page", () => HttpResponse.html(FULL.slice(0, 400_000))],
    ["an HTTP error", () => new Response("", { status: 503 })],
    ["a network failure", () => HttpResponse.error()],
  ])("leaves events untouched and records the error on %s", async (_name, respond) => {
    await ingest(deps(FULL), FROM, TO, "manual");
    serves(respond);
    const run = (await ingest({ db: env.DB, now: NOW, fetchOptions: FETCH_FAST }, FROM, TO, "cron"))!;
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
    serves(() => new Response("", { status: 503 }));
    const bad = (await ingestSweep({ db: env.DB, now: NOW, fetchOptions: { backoffMs: 1, retries: 0 } }))!;
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
  it("sends the security headers the static-asset layer cannot reach", async () => {
    // Refusals, API 404s and the catch-all 404 carry them too: the middleware wraps everything.
    for (const res of [await call("/api/status"), await callRaw("/api/status"), await call("/api/nope"), await callRaw("/nope")]) {
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("referrer-policy")).toBe("no-referrer");
      expect(res.headers.get("strict-transport-security")).toBe("max-age=63072000; includeSubDomains; preload");
      // No other site may read an API body as a subresource, or frame a response.
      expect(res.headers.get("cross-origin-resource-policy")).toBe("same-origin");
      expect(res.headers.get("x-frame-options")).toBe("SAMEORIGIN");
      // Nothing here renders markup, so a page-level policy would govern nothing.
      expect(res.headers.get("content-security-policy")).toBeNull();
    }
  });

  it("answers a path that matches no asset with a 404, not with the page", async () => {
    // The asset layer passes these through (not_found_handling: "none"). Answering them with
    // index.html and a 200 instead told crawlers that every typo was a real page.
    const res = await callRaw("/no-such-page");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toMatch(/text\/plain/);
    expect(res.headers.get("cache-control")).toBe("no-store");
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
    expect(await bad.json()).toEqual({ error: "cluster must be shallow or deep" });

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
    const calls = serves(() => new Response("", { status: 503 }));
    const first = (await (await call("/api/refresh", { method: "POST" })).json()) as any;
    expect(first.refreshed).toBe(true);
    expect(first.lastRun.ok).toBe(false);
    const attempts = calls();

    const second = (await (await call("/api/refresh", { method: "POST" })).json()) as any;
    expect(second.refreshed).toBe(false);
    expect(second.retryAfterS).toBeGreaterThan(200);
    expect(calls()).toBe(attempts);
  });

  // One availability rule for both fast lanes. The button used to open its no-wait back-fill
  // lane on "the last run succeeded" alone, which ignores a cooldown SGC asked for, so after
  // a 429 and a later success it reached SGC while the cron's own fast lane was standing down.
  it("makes the refresh button wait out a 429's cooldown even after SGC answers again", async () => {
    const now = Date.now();
    await recordRun(0, { http_status: 429, retry_after_s: 3600 }, new Date(now - 60_000));
    await recordRun(1, {}, new Date(now - 30_000));
    const calls = serving(FULL);

    const res = (await (await call("/api/refresh", { method: "POST" })).json()) as any;
    expect(res.backfill.done).toBe(0); // history incomplete: the fast lane is what would have run
    expect(res.lastRun.ok).toBe(true); // and SGC is answering again, so only the cooldown holds
    expect(res.refreshed).toBe(false);
    expect(res.retryAfterS).toBeGreaterThan(0);
    expect(calls()).toBe(0);
  });

  it("refresh loads missing history first, one chunk per call, and reports progress", async () => {
    const calls = serving(FULL);
    const before = (await (await call("/api/status")).json()) as any;
    expect(before.backfill.done).toBe(0);
    const total = before.backfill.total as number;
    expect(total).toBeGreaterThanOrEqual(6);

    for (let i = 1; i <= total; i++) {
      const res = (await (await call("/api/refresh", { method: "POST" })).json()) as any;
      expect(res.backfill).toEqual({ done: i, total });
      expect(res.lastRun.trigger).toBe("sweep");
    }
    expect(calls()).toBe(total);
  });

  it("refresh queries SGC once, then is rate limited", async () => {
    await completeBackfill();
    const calls = serving(FULL);
    const first = (await (await call("/api/refresh", { method: "POST" })).json()) as any;
    expect(first.refreshed).toBe(true);
    expect(first.lastSuccessfulRun.trigger).toBe("manual");
    expect(calls()).toBe(1);

    const second = (await (await call("/api/refresh", { method: "POST" })).json()) as any;
    expect(second.refreshed).toBe(false);
    expect(second.retryAfterS).toBeGreaterThan(0);
    expect(calls()).toBe(1);
  });

  it("refresh stands down while another run is in flight", async () => {
    const calls = serving(FULL);
    await env.DB.prepare("INSERT INTO ingest_runs (started_at, trigger, window_start, window_end) VALUES (?, 'cron', ?, ?)")
      .bind(new Date().toISOString(), FROM.toISOString(), TO.toISOString()).run();
    const res = (await (await call("/api/refresh", { method: "POST" })).json()) as any;
    expect(res.refreshed).toBe(false);
    expect(calls()).toBe(0);
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
    const calls = serving(FULL);
    const res = await callRaw("/api/refresh", { method: "POST", headers: { "sec-fetch-site": "cross-site" } });
    expect(res.status).toBe(403);
    expect(calls()).toBe(0);
    expect(await runCount()).toBe(0);
  });

  it("accepts a request whose Origin matches, for clients that send no Sec-Fetch-Site", async () => {
    await ingest(deps(FULL), FROM, TO, "manual");
    const ok = await callRaw("/api/events", { headers: { origin: "https://x.test" } });
    expect(ok.status).toBe(200);
    const bad = await callRaw("/api/events", { headers: { origin: "https://evil.test" } });
    expect(bad.status).toBe(403);
  });

  it("names the newest event, and its id, so the page can link its time to SGC", async () => {
    await ingest(deps(FULL), FROM, TO, "manual");
    const status = (await (await call("/api/status")).json()) as any;
    expect(status.newestEventTime).toBe("2026-09-18T22:08:54Z");
    const row = await env.DB.prepare("SELECT id FROM events WHERE time = ?").bind(status.newestEventTime).first<{ id: string }>();
    expect(status.newestEventId).toBe(row!.id);
  });

  // The deploy smoke test and any uptime check call this one, so it must stay open.
  it("leaves /api/health reachable with no same-origin signal", async () => {
    await ingest(deps(FULL), FROM, TO, "manual");
    const res = await callRaw("/api/health");
    expect(res.status).toBe(200);
    // ingestAgeS is what an external alarm reads: it is the only way anything outside can
    // tell a live Worker serving a nine-hour-old catalogue from a healthy one.
    expect(await res.json()).toEqual({ ok: true, totalEvents: 786, ingestAgeS: 0, lastRunOk: true });
  });

  it("reports a stale catalogue on /api/health even though the Worker is fine", async () => {
    // A successful run, long ago, and nothing since: exactly the shape of both real outages.
    await env.DB.prepare(
      `INSERT INTO ingest_runs (started_at, finished_at, trigger, window_start, window_end, ok)
       VALUES (?1, ?1, 'cron', ?1, ?1, 1)`,
    ).bind(new Date(Date.now() - 9 * 3600_000).toISOString()).run();
    const body = (await (await callRaw("/api/health")).json()) as { ok: boolean; ingestAgeS: number };
    expect(body.ok).toBe(true);
    expect(body.ingestAgeS).toBeGreaterThan(8 * 3600);
  });

  it("says so when ingest has never succeeded", async () => {
    expect(await (await callRaw("/api/health")).json()).toMatchObject({ ingestAgeS: null, lastRunOk: null });
  });

  it("returns JSON 404 for unknown API routes", async () => {
    const res = await call("/api/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not found" });
    // A known path with the wrong method is unknown too.
    expect((await call("/api/refresh")).status).toBe(404);
  });

  it("origin checks an unknown API path before answering it", async () => {
    expect((await callRaw("/api/nope")).status).toBe(403);
  });
});

/**
 * Fires the scheduled handler as Cloudflare really does. `scheduledTime` is **not** the round
 * minute in production: this Worker's ticks are dispatched at :45 past, and reading the lane
 * off the nearest *minute* turned every one of them into the minute after — never a multiple
 * of 15, so for a day neither the wide tick nor the sweep ran at all. The offset is the
 * default here so that every lane test below runs against the shape production sends.
 */
async function tick(minute: number, { hour = 12, offsetS = 45 } = {}) {
  // scheduled() awaits its own work, so unlike the refresh route it needs no execution context.
  const at = new Date(Date.UTC(2026, 8, 19, hour, minute) + offsetS * 1000);
  await worker.scheduled!({ cron: "*/15 * * * *", scheduledTime: at.getTime(), noRetry() {} }, env);
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
  it("loads one trailing day on a narrow tick and three on a wide one", async () => {
    // Otherwise the wide tick also pulls a history chunk, and that would be the latest run.
    await completeBackfill();
    serving(FULL);

    await tick(15);
    const fast = await latestRun();
    expect(fast.window_start).toBe(expectedWindowStart(fast.started_at as string, 1));

    await tick(30);
    const wide = await latestRun();
    expect(wide.window_start).toBe(expectedWindowStart(wide.started_at as string, 3));
  });

  // A second cron pattern would land within 120 s of this one, inside IN_FLIGHT_MS, and the
  // two would steal each other's claim. The sweep runs in the wide tick's own invocation.
  it("sweeps on the hour, in the same invocation as the wide tick, and not on other quarters", async () => {
    await completeBackfill();
    serving(FULL);

    await tick(0);
    const triggers = await env.DB.prepare("SELECT trigger FROM ingest_runs WHERE started_at > ? ORDER BY id")
      .bind("2026-09-19T00:00:00.000Z").all<{ trigger: string }>();
    expect(triggers.results.map((r) => r.trigger)).toEqual(["cron", "sweep"]);

    await tick(30, { hour: 13 });
    expect((await latestRun()).trigger).toBe("cron");
  });

  it("still sweeps on every wide tick while history is incomplete", async () => {
    serving(FULL);
    await tick(30);
    expect((await latestRun()).trigger).toBe("sweep");
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

// The rule itself lives in worker/plan.ts and is tested there, without a database. What is
// left here is the wiring: that the rows readHistory reads really do drive the lanes.
describe("fast lane back-off, through the cron", () => {
  it("stands the fast lane down after a failure, and the wide tick's success lets it back in", async () => {
    await completeBackfill();
    const calls = serving(FULL);

    await tick(15);
    expect(calls()).toBe(1);

    await recordRun(0, { http_status: 500 });
    await tick(45);
    expect(calls()).toBe(1);

    await tick(30); // the wide tick keeps probing, whatever SGC has been doing
    expect(calls()).toBe(2);
    await tick(15, { hour: 13 });
    expect(calls()).toBe(3);
  });

  it("keeps the wide tick running while a Retry-After holds the fast lane down", async () => {
    await completeBackfill();
    await recordRun(0, { http_status: 429, retry_after_s: 86_400 });
    const calls = serving(FULL);

    await tick(15);
    expect(calls()).toBe(0);

    await tick(30);
    expect(calls()).toBe(1);
  });
});

/**
 * The failure nothing could see. On 2026-09-20 the Worker was killed mid-ingest on 112
 * consecutive ticks: each had claimed its row and none ever wrote a result. Every reader of
 * the history asks about *finished* runs, so the newest finished row stayed a success for
 * nine hours — the fast lane kept its cadence, the page showed no error, and the catalogue
 * quietly stopped moving. A run past the in-flight window with no result is not in progress.
 */
describe("a run the Worker was killed in the middle of", () => {
  /** A claimed run that never came back, started `agoMs` ago on the real clock. */
  const openRun = (agoMs: number) =>
    env.DB
      .prepare(`INSERT INTO ingest_runs (started_at, trigger, window_start, window_end)
                VALUES (?, 'cron', '2026-09-01T00:00:00.000Z', '2026-09-02T00:00:00.000Z')`)
      .bind(new Date(Date.now() - agoMs).toISOString())
      .run();

  it("is closed as failed once it is past the in-flight window, and says so", async () => {
    await completeBackfill();
    await openRun(10 * 60_000);
    serving(FULL);

    await tick(30); // any tick: readHistory reaps before it reads
    const reaped = (await env.DB.prepare("SELECT * FROM ingest_runs WHERE trigger = 'cron' ORDER BY id LIMIT 1")
      .first<Record<string, unknown>>())!;
    expect(reaped.ok).toBe(0);
    expect(reaped.error).toBe(ABANDONED_ERROR);
    // Dated when it stopped counting as in flight, never later: a row that sat there for
    // hours must not push the visitor's five-minute throttle out by hours with it.
    const finished = Date.parse(reaped.finished_at as string);
    expect(finished).toBeLessThanOrEqual(Date.now() - IN_FLIGHT_MS);
    expect(finished).toBeGreaterThanOrEqual(Date.parse(reaped.started_at as string));
  });

  it("is left alone while it could still be talking to SGC", async () => {
    await completeBackfill();
    await openRun(30_000);
    const calls = serving(FULL);

    await tick(15);
    const row = (await env.DB.prepare("SELECT * FROM ingest_runs WHERE trigger = 'cron' ORDER BY id LIMIT 1")
      .first<Record<string, unknown>>())!;
    expect(row.finished_at).toBeNull();
    // And it still holds the claim, so this tick did not reach SGC either.
    expect(calls()).toBe(0);
  });

  // The whole point of recording it: an invocation that died is a failed query, and the
  // rules that read failures — the fast lane's back-off and the page's alert — must see it.
  it("stands the fast lane down, and the wide tick still lets it back in", async () => {
    await completeBackfill();
    await openRun(10 * 60_000);
    const calls = serving(FULL);

    await tick(15);
    expect(calls()).toBe(0);

    await tick(30);
    expect(calls()).toBe(1);
  });

  it("is what /api/status reports as the last run, with the reason in the technical detail", async () => {
    await completeBackfill();
    await openRun(10 * 60_000);
    serving(FULL);
    await tick(15); // stands down, but still reaps

    const body = (await (await call("/api/status")).json()) as any;
    expect(body.lastRun).toMatchObject({ ok: false, error: ABANDONED_ERROR });
  });

  // ingest_runs grows ~312 rows a day and this question is asked on every tick and every
  // refresh. Unindexed it read the whole table — the fourth hot query over it, and the one
  // 0003 missed. Partial, so the ordinary case reads a near-empty index.
  it("is looked up through the partial index, not a scan of every run ever recorded", async () => {
    const { results } = await env.DB
      .prepare("EXPLAIN QUERY PLAN SELECT 1 AS x FROM ingest_runs WHERE finished_at IS NULL AND started_at > ? LIMIT 1")
      .bind(NOW.toISOString())
      .all<{ detail: string }>();
    expect(results.map((r) => r.detail).join("\n")).toContain("ingest_runs_unfinished");
  });
});

/**
 * The wiring for the refusal back-off. The rule itself lives in worker/plan.ts and is tested
 * there without a database; what is left here is that the rows `sgcHealth` reads really do
 * describe the streak, and that the streak really does slow the probe.
 */
describe("the refusal back-off, through the cron", () => {
  const ago = (min: number) => new Date(Date.now() - min * 60_000);

  it("reads the unbroken run of failures off the finished runs, and forgets it on a success", async () => {
    await recordRun(1, {}, ago(50));
    await recordRun(0, { http_status: 410 }, ago(45));
    await recordRun(0, { http_status: 410 }, ago(40));

    const refused = await sgcHealth(env.DB);
    expect(refused.lastOk).toBe(false);
    expect(refused.failing?.status).toBe(410);
    // The oldest failure still unbroken by a success — not the newest, which is how long
    // SGC has been answering us this way rather than how long ago the last attempt was.
    expect(Date.parse(refused.failing!.since)).toBeCloseTo(ago(45).getTime(), -3);

    await recordRun(1, {}, ago(1));
    expect((await sgcHealth(env.DB)).failing).toBeNull();
  });

  it("stands the wide tick down when the refusal has lasted, and lets the hour's probe through", async () => {
    await completeBackfill();
    const calls = serving(FULL);

    // Refused for 90 minutes, last asked 10 minutes ago: past the grace, inside the hour.
    await recordRun(0, { http_status: 410 }, ago(90));
    await recordRun(0, { http_status: 410 }, ago(10));
    await tick(30);
    expect(calls()).toBe(0);

    // An hour since anything asked: the probe goes, because a probe that stopped could
    // never see SGC come back.
    await recordRun(0, { http_status: 410 }, ago(61));
    await tick(30, { hour: 13 }); // a wide tick off the hour, so the sweep is not in it too
    expect(calls()).toBe(1);
  });

  it("keeps the wide tick at full rate for a plain 500, however long it lasts", async () => {
    await completeBackfill();
    const calls = serving(FULL);
    await recordRun(0, { http_status: 500 }, ago(120));
    await recordRun(0, { http_status: 500 }, ago(5));

    await tick(30);
    expect(calls()).toBe(1);
  });
});

/**
 * `lastRun` is the most frequently asked question here — /api/status calls it twice and the
 * open page re-reads /api/status every minute — and until 0005 it was the one hot query over
 * `ingest_runs` that had never been indexed. 0004's note says to check EXPLAIN QUERY PLAN
 * before adding a fifth; adding one to /api/health is what prompted the check.
 */
describe("the last run is answered from an index", () => {
  const plan = async (sql: string) =>
    (await env.DB.prepare(`EXPLAIN QUERY PLAN ${sql}`).all<{ detail: string }>())
      .results.map((r) => r.detail).join("\n");

  it("walks the index instead of scanning the table", async () => {
    const detail = await plan("SELECT * FROM ingest_runs WHERE finished_at IS NOT NULL ORDER BY id DESC LIMIT 1");
    expect(detail).toContain("ingest_runs_finished");
  });

  // This half used ingest_runs_ok and then materialised every matching row into a temporary
  // b-tree to sort it — ~312 rows a day, so ~28,000 at three months, to answer "what
  // happened last?". It needs its own index rather than sharing the other one: with
  // ingest_runs_ok also present the planner prefers that equality seek and keeps the sort.
  it("sorts nothing to find the last successful run", async () => {
    const detail = await plan("SELECT * FROM ingest_runs WHERE finished_at IS NOT NULL AND ok = 1 ORDER BY id DESC LIMIT 1");
    expect(detail).toContain("ingest_runs_finished_ok");
    expect(detail).not.toContain("TEMP B-TREE");
  });

  it("still answers both correctly", async () => {
    await recordRun(1, {}, new Date(NOW.getTime() - 60_000));
    await recordRun(0, {}, NOW);
    const body = (await (await call("/api/status")).json()) as any;
    expect(body.lastRun.ok).toBe(false);
    expect(body.lastSuccessfulRun.ok).toBe(true);
  });
});

/**
 * What the Worker says about itself while it works.
 *
 * These pin the *fields*, not the wording, because the fields are what a query in the
 * Workers Logs dashboard can group by — and each one below is the answer to a question
 * that took hours to answer without it. See docs/operations.md, "Debugging production".
 */
describe("what a tick writes to the log", () => {
  /** Every console line this block produced, as the single object each one must be. */
  function lines(): () => Record<string, unknown>[] {
    const out: Record<string, unknown>[] = [];
    for (const m of ["debug", "info", "warn", "error"] as const) {
      vi.spyOn(console, m).mockImplementation((...args: unknown[]) => {
        if (args.length === 1 && typeof args[0] === "object" && args[0] !== null) {
          out.push(args[0] as Record<string, unknown>);
        }
      });
    }
    return () => out;
  }
  const withMsg = (all: Record<string, unknown>[], msg: string) => all.filter((l) => l.msg === msg);

  afterEach(() => vi.restoreAllMocks());

  // The line that would have caught the tickMinute fault in one query: for a day every
  // tick took the fast lane, 195 times in a row, and nothing anywhere wrote the lane down.
  it("says which lane the tick chose, and which minute chose it", async () => {
    await completeBackfill();
    serving(FULL);
    const got = lines();

    // The hour's four ticks, each of which should say something different about itself.
    await tick(15);
    expect(withMsg(got(), "tick planned")[0]).toMatchObject({ level: "info", tickMinute: 15, lanes: ["fast"] });

    await tick(30);
    expect(withMsg(got(), "tick planned")[1]).toMatchObject({ tickMinute: 30, lanes: ["wide"] });

    await tick(0);
    expect(withMsg(got(), "tick planned")[2]).toMatchObject({ tickMinute: 0, lanes: ["wide", "sweep"] });
  });

  it("records what the run cost and what it changed", async () => {
    await completeBackfill();
    serving(FULL);
    const got = lines();

    await tick(15);
    const ok = withMsg(got(), "ingest ok")[0]!;
    expect(ok).toMatchObject({ level: "info", lane: "fast", trigger: "cron" });
    expect(ok.runId).toEqual(expect.any(Number));
    expect(ok.durationMs).toEqual(expect.any(Number));
    // Answers "is SGC slow?" and "how big are these responses?", neither of which anything
    // recorded before — the second has been an open audit question with no measurement.
    expect(ok.sgcMs).toEqual(expect.any(Number));
    expect(ok.sgcChars as number).toBeGreaterThan(0);
  });

  it("puts an SGC refusal on the line at error, with its status", async () => {
    await completeBackfill();
    serves(() => new Response("", { status: 410 }));
    const got = lines();

    await tick(30); // the wide tick, which never stands down for SGC's health
    expect(withMsg(got(), "ingest failed")[0]).toMatchObject({ level: "error", httpStatus: 410, lane: "wide" });
  });

  // The one line that says "an invocation of this Worker was killed". It was true 112 times
  // in a row on 2026-09-20 and nothing said so, which is why it is a warn and not an info.
  it("warns when it finds a run the Worker was killed in the middle of", async () => {
    await completeBackfill();
    await env.DB
      .prepare(`INSERT INTO ingest_runs (started_at, trigger, window_start, window_end)
                VALUES (?, 'cron', '2026-09-01T00:00:00.000Z', '2026-09-02T00:00:00.000Z')`)
      .bind(new Date(Date.now() - 10 * 60_000).toISOString())
      .run();
    serving(FULL);
    const got = lines();

    await tick(15);
    expect(withMsg(got(), "reaped abandoned runs: an invocation was killed")[0])
      .toMatchObject({ level: "warn", reaped: 1 });
  });
});

/**
 * The page's own failures were the one part of this system with no record at all. This is
 * not an open endpoint: it sits under /api/*, so the same-origin check and the per-IP rate
 * limit already stand in front of it, and it writes a log line and stores nothing.
 */
describe("POST /api/client-error", () => {
  const report = (body: unknown) =>
    call("/api/client-error", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });

  it("accepts a report from the page and stores nothing", async () => {
    const before = await runCount();
    expect((await report({ message: "TypeError: x is not a function", source: "error" })).status).toBe(204);
    expect(await runCount()).toBe(before);
    expect(await count()).toBe(0);
  });

  it("is refused without a same-origin signal, like every other /api route", async () => {
    expect((await callRaw("/api/client-error", { method: "POST", body: "{}" })).status).toBe(403);
  });

  it("refuses a body that is not a report", async () => {
    expect((await report("not json")).status).toBe(400);
    expect((await report({ stack: "only a stack" })).status).toBe(400);
    expect((await report({ message: "" })).status).toBe(400);
    expect((await call("/api/client-error", { method: "POST" })).status).toBe(400);
  });

  // A log line is a place a reader's browser can put text, so what it may put there is
  // bounded before anything is read, not after.
  it("refuses a body over the cap without buffering it", async () => {
    const res = await report({ message: "x".repeat(8000) });
    expect(res.status).toBe(413);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  // No Content-Length to refuse up front, so the cap has to hold while the stream is read.
  const streamed = (bytes: number) =>
    call("/api/client-error", {
      method: "POST",
      body: new ReadableStream({
        start(ctl) {
          ctl.enqueue(new TextEncoder().encode(JSON.stringify({ message: "x".repeat(bytes) })));
          ctl.close();
        },
      }),
    });

  it("caps a chunked body too", async () => {
    expect((await streamed(8000)).status).toBe(413);
    expect((await streamed(100)).status).toBe(204);
  });

  it("reads only the fields it knows, and drops the rest", async () => {
    const out: Record<string, unknown>[] = [];
    vi.spyOn(console, "warn").mockImplementation((...a: unknown[]) => void out.push(a[0] as Record<string, unknown>));
    await report({ message: "boom", source: "error", path: "/", surprise: "dropped" });
    vi.restoreAllMocks();
    expect(out[0]).toMatchObject({ level: "warn", msg: "page error" });
    expect(out[0]!.page).toEqual({
      message: "boom", source: "error", path: "/", stack: undefined, userAgent: undefined,
    });
  });
});
