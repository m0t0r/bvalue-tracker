import { Hono, type Context } from "hono";
import { toCsv, windowsToCsv, type CsvLang } from "../core/csv.ts";
import { clusterOf, computeClusterStats, type Cluster } from "../core/clusters.ts";
import { computeStats, type CatalogStats } from "../core/gr.ts";
import { MAINSHOCK_ID } from "../core/seiscomp.ts";
import type { StatusResponse, StoredEvent } from "./api-types.ts";
import { lastRun, runInFlight, toStored, type EventRow } from "./db.ts";
import { backfillProgress, ingestSweep, ingestTrailing } from "./ingest.ts";

const REFRESH_MIN_INTERVAL_S = 300;
const SWEEP_CRON = "5 * * * *";

const app = new Hono<{ Bindings: Env }>();

/**
 * The page's own fetches carry Sec-Fetch-Site: same-origin; a cross-site page's do not.
 * A caller that sends neither Sec-Fetch-Site nor Origin (curl, a script) has no positive
 * same-origin signal and is refused: that is the point, since the catalogue routes are
 * what we are keeping off direct callers. Headers are forgeable and this is not an
 * authentication boundary; it keeps the raw data out of casual reach, nothing more.
 */
function isSameOrigin(c: Context<{ Bindings: Env }>): boolean {
  const site = c.req.header("sec-fetch-site");
  if (site !== undefined) return site === "same-origin";
  const origin = c.req.header("origin");
  if (origin === undefined) return false;
  try {
    return new URL(origin).origin === new URL(c.req.url).origin;
  } catch {
    return false;
  }
}

/**
 * The page's own security headers come from public/_headers, which is the static-asset
 * layer; /api/* runs worker-first and never passes through it. These are the three that
 * mean anything for a JSON or CSV response: no MIME sniffing, no Referer sent onward,
 * and the same HSTS promise the page makes — a host makes it once, for every response.
 */
app.use("/api/*", async (c, next) => {
  await next();
  c.header("x-content-type-options", "nosniff");
  c.header("referrer-policy", "no-referrer");
  c.header("strict-transport-security", "max-age=63072000; includeSubDomains; preload");
});

/**
 * Rate limit first, then the origin check: a caller that ignores both still cannot
 * spend more than its share of D1 reads and Worker CPU. Every read route does a
 * full-table scan and /api/stats recomputes the whole fit, so volume is the cost.
 *
 * /api/health stays open on purpose: it is the deploy smoke test's target and carries
 * no catalogue data. Everything else under /api/ is for the page itself.
 */
app.use("/api/*", async (c, next) => {
  const key = c.req.header("cf-connecting-ip") ?? "unknown";
  const { success } = await c.env.API_RATE_LIMIT.limit({ key });
  if (!success) {
    c.header("cache-control", "no-store");
    c.header("retry-after", "60");
    return c.json({ error: "rate limited" }, 429);
  }
  if (c.req.path === "/api/health" || isSameOrigin(c)) return next();
  c.header("cache-control", "no-store");
  return c.json({ error: "forbidden" }, 403);
});

/** Liveness for CI and uptime checks: the Worker answered and D1 is readable. */
app.get("/api/health", async (c) => {
  const agg = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM events").first<{ n: number }>();
  c.header("cache-control", "no-store");
  return c.json({ ok: true, totalEvents: agg?.n ?? 0 });
});

interface EventFilter {
  from?: string;
  to?: string;
  minMag?: number;
  status?: "manual" | "automatic";
  includeRemoved: boolean;
  excludeMainshock: boolean;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const isoDate = (s: string | undefined) => (s && !Number.isNaN(Date.parse(s)) ? new Date(s).toISOString() : undefined);
/** `to` is inclusive: a bare date means "through the end of that day", as in the page's filter. */
const isoDateTo = (s: string | undefined) =>
  s && DATE_ONLY.test(s) ? new Date(Date.parse(`${s}T00:00:00Z`) + 86_400_000).toISOString() : isoDate(s);

function parseFilter(q: Record<string, string>): EventFilter {
  const minMag = q.minMag !== undefined ? Number(q.minMag) : undefined;
  return {
    from: isoDate(q.from),
    to: isoDateTo(q.to),
    minMag: minMag !== undefined && Number.isFinite(minMag) ? Math.min(Math.max(minMag, 0), 10) : undefined,
    status: q.status === "manual" || q.status === "automatic" ? q.status : undefined,
    includeRemoved: q.includeRemoved === "1",
    excludeMainshock: q.excludeMainshock === "1",
  };
}

async function queryEvents(db: D1Database, f: EventFilter): Promise<StoredEvent[]> {
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (!f.includeRemoved) where.push("removed_at IS NULL");
  if (f.from) { where.push("time >= ?"); args.push(f.from); }
  if (f.to) { where.push("time < ?"); args.push(f.to); }
  if (f.minMag !== undefined) { where.push("mag >= ?"); args.push(f.minMag); }
  if (f.status) { where.push("status = ?"); args.push(f.status); }
  const sql = `SELECT * FROM events ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY time`;
  const { results } = await db.prepare(sql).bind(...args).all<EventRow>();
  const events = results.map(toStored);
  return f.excludeMainshock ? events.filter((e) => e.id !== MAINSHOCK_ID) : events;
}

async function status(db: D1Database): Promise<StatusResponse> {
  const agg = await db
    .prepare("SELECT COUNT(*) AS n, MAX(time) AS newest FROM events WHERE removed_at IS NULL")
    .first<{ n: number; newest: string | null }>();
  return {
    totalEvents: agg?.n ?? 0,
    newestEventTime: agg?.newest ?? null,
    lastRun: await lastRun(db, false),
    lastSuccessfulRun: await lastRun(db, true),
    backfill: await backfillProgress(db, new Date()),
  };
}

app.get("/api/status", async (c) => {
  c.header("cache-control", "no-cache");
  return c.json(await status(c.env.DB));
});

/** `cluster=shallow|deep` narrows a response to one depth cluster. Anything else is refused rather than silently ignored. */
class BadCluster extends Error {}
function parseCluster(q: Record<string, string>): Cluster | null {
  if (q.cluster === undefined || q.cluster === "") return null;
  if (q.cluster === "shallow" || q.cluster === "deep") return q.cluster;
  throw new BadCluster();
}
const ofCluster = (events: StoredEvent[], cluster: Cluster | null) =>
  cluster === null ? events : events.filter((e) => clusterOf(e) === cluster);

app.get("/api/events", async (c) => {
  const q = c.req.query();
  const events = ofCluster(await queryEvents(c.env.DB, parseFilter(q)), parseCluster(q));
  // Always revalidate: the page refetches right after a refresh and must not get the old body.
  c.header("cache-control", "no-cache");
  return c.json(events);
});

// CSV headers stay in the stable machine form unless a reader asks for Spanish with ?lang=es.
const csvLang = (q: Record<string, string>): CsvLang => (q.lang === "es" ? "es" : "en");

app.get("/api/events.csv", async (c) => {
  const q = c.req.query();
  const events = ofCluster(await queryEvents(c.env.DB, parseFilter(q)), parseCluster(q));
  return c.body(toCsv(events, csvLang(q)), 200, {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": 'attachment; filename="sgc-choco-events.csv"',
    "cache-control": "no-cache",
  });
});

const givenMc = (q: Record<string, string>): number | null =>
  q.mc !== undefined && Number.isFinite(Number(q.mc)) ? Number(q.mc) : null;

/**
 * A cluster's statistics come from computeClusterStats, never from computeStats on the cluster's own
 * events: that would give the cluster its own Mc, and the page, which shares one Mc, would disagree.
 */
async function statsFor(db: D1Database, q: Record<string, string>): Promise<CatalogStats> {
  const cluster = parseCluster(q);
  const events = await queryEvents(db, parseFilter(q));
  return cluster === null ? computeStats(events, givenMc(q)) : computeClusterStats(events, givenMc(q))[cluster].stats;
}

app.get("/api/stats", async (c) => {
  const stats = await statsFor(c.env.DB, c.req.query());
  c.header("cache-control", "no-cache");
  return c.json(stats);
});

app.get("/api/b-windows.csv", async (c) => {
  const q = c.req.query();
  return c.body(windowsToCsv((await statsFor(c.env.DB, q)).windows, csvLang(q)), 200, {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": 'attachment; filename="sgc-choco-b-windows.csv"',
    "cache-control": "no-cache",
  });
});

app.post("/api/refresh", async (c) => {
  const db = c.env.DB;
  const now = new Date();
  const standDown = async (retryAfterS: number) =>
    c.json({ ...(await status(db)), refreshed: false, retryAfterS } satisfies StatusResponse);

  if (await runInFlight(db, now)) return standDown(5);

  const last = await lastRun(db, false);
  const sinceLastS = last ? (now.getTime() - Date.parse(last.finishedAt ?? last.startedAt)) / 1000 : Infinity;
  const progress = await backfillProgress(db, now);
  // Missing history loads without the usual wait, but only while SGC is answering:
  // after a failed run everyone waits, so a broken SGC is never hammered.
  const fastLane = progress.done < progress.total && (last === null || last.ok);
  if (!fastLane && sinceLastS < REFRESH_MIN_INTERVAL_S) return standDown(Math.ceil(REFRESH_MIN_INTERVAL_S - sinceLastS));

  // The checks above answer with a useful retryAfterS; this guard is the one that
  // actually holds, because the claim inside ingest() is atomic.
  const deps = { db, guard: { minIntervalS: fastLane ? null : REFRESH_MIN_INTERVAL_S } };
  const work = progress.done < progress.total ? ingestSweep(deps) : ingestTrailing(deps, "manual");
  // Keep the ingest alive if the visitor closes the tab mid-request.
  c.executionCtx.waitUntil(work);
  // null means a concurrent caller won the claim, so nothing was sent to SGC.
  if ((await work) === null) return standDown(5);
  return c.json({ ...(await status(db)), refreshed: true } satisfies StatusResponse);
});

app.all("/api/*", (c) => c.json({ error: "not found" }, 404));

app.onError((err, c) => {
  if (err instanceof BadCluster) {
    c.header("cache-control", "no-store");
    return c.json({ error: "cluster must be shallow or deep" }, 400);
  }
  console.error(err);
  c.header("cache-control", "no-store");
  return c.json({ error: "internal error" }, 500);
});

export default {
  fetch: app.fetch,
  async scheduled(controller, env) {
    const deps = { db: env.DB };
    if (controller.cron === SWEEP_CRON) {
      await ingestSweep(deps);
      return;
    }
    await ingestTrailing(deps, "cron");
    // Fresh database: fill history one chunk per tick instead of waiting for the hourly sweep.
    const progress = await backfillProgress(env.DB, new Date());
    if (progress.done < progress.total) await ingestSweep(deps);
  },
} satisfies ExportedHandler<Env>;
