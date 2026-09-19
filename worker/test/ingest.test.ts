import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FULL from "../../test/fixtures/seiscomp-2026-08-10_2026-09-18.html?raw";
import worker from "../index.ts";
import { ingest, ingestSweep, sweepChunks } from "../ingest.ts";

// The fixture covers 2026-08-10 .. 2026-09-18 22:08 UTC.
const FROM = new Date("2026-08-10T00:00:00Z");
const TO = new Date("2026-09-19T00:00:00Z");
const NOW = new Date("2026-09-18T23:00:00Z");

const serve = (html: string) => (async () => new Response(html, { status: 200 })) as unknown as typeof fetch;
const deps = (html: string, now = NOW) => ({ db: env.DB, now, fetchOptions: { fetchImpl: serve(html), backoffMs: 1, retries: 1 } });

const count = async (where = "1=1") =>
  (await env.DB.prepare(`SELECT COUNT(*) AS n FROM events WHERE ${where}`).first<{ n: number }>())!.n;

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

async function call(path: string, init?: RequestInit) {
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

  it("survives two overlapping runs of the same window", async () => {
    const runs = await Promise.all([ingest(deps(FULL), FROM, TO, "cron"), ingest(deps(FULL), FROM, TO, "manual")]);
    expect(runs.map((r) => r.ok)).toEqual([true, true]);
    expect(runs.map((r) => r.error)).toEqual([null, null]);
    expect(await count()).toBe(786);
  });

  it("does not remove events outside the requested window", async () => {
    await ingest(deps(FULL), FROM, TO, "manual");
    // A response for a late window legitimately lacks the early events.
    const run = await ingest(deps(dropRows(FULL, 0)), new Date("2026-09-15T00:00:00Z"), TO, "manual");
    expect(run.removed).toBe(0);
  });

  it("refuses a response that would retire more than 20% of a window", async () => {
    await ingest(deps(FULL), FROM, TO, "manual");
    const run = await ingest(deps(dropRows(FULL, 300)), FROM, TO, "manual");
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
    const run = await ingest(bad, FROM, TO, "cron");
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
    const bad = await ingestSweep(failing);
    expect(bad.ok).toBe(false);
    const next = await ingestSweep(deps(FULL, new Date(NOW.getTime() + 60_000)));
    expect(next.windowStart).not.toBe(bad.windowStart);
  });

  it("visits never-swept chunks first, then the least recently swept", async () => {
    const seen: string[] = [];
    for (let i = 0; i < 7; i++) {
      const run = await ingestSweep(deps(FULL, new Date(NOW.getTime() + i * 60_000)));
      seen.push(run.windowStart);
    }
    expect(new Set(seen.slice(0, 6)).size).toBe(6);
    expect(seen[6]).toBe(seen[0]);
  });
});

describe("API", () => {
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
    const res = await worker.fetch(new Request("https://x.test/api/events"), broken, {} as ExecutionContext);
    expect(res.status).toBe(500);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ error: "internal error" });
  });

  it("returns JSON 404 for unknown API routes", async () => {
    expect((await call("/api/nope")).status).toBe(404);
  });
});
