import { Hono } from "hono";
import { toCsv } from "../core/csv.ts";
import { computeStats } from "../core/gr.ts";
import { MAINSHOCK_ID } from "../core/seiscomp.ts";
import type { StatusResponse, StoredEvent } from "./api-types.ts";
import { lastRun, runInFlight, toStored, type EventRow } from "./db.ts";
import { backfillProgress, ingestSweep, ingestTrailing } from "./ingest.ts";

const REFRESH_MIN_INTERVAL_S = 300;
const SWEEP_CRON = "5 * * * *";

const app = new Hono<{ Bindings: Env }>();

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

app.get("/api/status", async (c) => c.json(await status(c.env.DB)));

app.get("/api/events", async (c) => {
  const events = await queryEvents(c.env.DB, parseFilter(c.req.query()));
  // Always revalidate: the page refetches right after a refresh and must not get the old body.
  c.header("cache-control", "no-cache");
  return c.json(events);
});

app.get("/api/events.csv", async (c) => {
  const events = await queryEvents(c.env.DB, parseFilter(c.req.query()));
  return c.body(toCsv(events), 200, {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": 'attachment; filename="sgc-choco-events.csv"',
  });
});

app.get("/api/stats", async (c) => {
  const q = c.req.query();
  const events = await queryEvents(c.env.DB, parseFilter(q));
  const given = q.mc !== undefined && Number.isFinite(Number(q.mc)) ? Number(q.mc) : null;
  c.header("cache-control", "no-cache");
  return c.json(computeStats(events, given));
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

  const work = progress.done < progress.total ? ingestSweep({ db }) : ingestTrailing({ db }, "manual");
  // Keep the ingest alive if the visitor closes the tab mid-request.
  c.executionCtx.waitUntil(work);
  await work;
  return c.json({ ...(await status(db)), refreshed: true } satisfies StatusResponse);
});

app.all("/api/*", (c) => c.json({ error: "not found" }, 404));

app.onError((err, c) => {
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
