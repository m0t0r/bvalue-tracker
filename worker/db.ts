import type { SeismicEvent } from "../core/types.ts";
import type { IngestRun, StoredEvent } from "./api-types.ts";
import { IN_FLIGHT_MS, type SgcHealth } from "./plan.ts";

export interface EventRow {
  id: string; time: string; lat: number; lon: number; depth_km: number; mag: number; mag_type: string;
  phases: number | null; rms_s: number | null; gap_deg: number | null;
  err_lat_km: number | null; err_lon_km: number | null; err_depth_km: number | null;
  region: string; status: string; solution_stamp: string | null;
  first_seen_at: string; updated_at: string; removed_at: string | null;
}

export interface RunRow {
  id: number; started_at: string; finished_at: string | null; trigger: string;
  window_start: string; window_end: string; ok: number;
  fetched: number | null; inserted: number | null; updated: number | null; removed: number | null; error: string | null;
  http_status: number | null; retry_after_s: number | null;
}

export function toStored(r: EventRow): StoredEvent {
  return {
    id: r.id, time: r.time, lat: r.lat, lon: r.lon, depthKm: r.depth_km, mag: r.mag, magType: r.mag_type,
    phases: r.phases, rmsS: r.rms_s, gapDeg: r.gap_deg,
    errLatKm: r.err_lat_km, errLonKm: r.err_lon_km, errDepthKm: r.err_depth_km,
    region: r.region, status: r.status, solutionStamp: r.solution_stamp,
    firstSeenAt: r.first_seen_at, updatedAt: r.updated_at, removedAt: r.removed_at,
  };
}

export function toRun(r: RunRow): IngestRun {
  return {
    id: r.id, startedAt: r.started_at, finishedAt: r.finished_at, trigger: r.trigger as IngestRun["trigger"],
    windowStart: r.window_start, windowEnd: r.window_end, ok: r.ok === 1,
    fetched: r.fetched, inserted: r.inserted, updated: r.updated, removed: r.removed, error: r.error,
  };
}

const DATA_FIELDS = [
  "time", "lat", "lon", "depthKm", "mag", "magType", "phases", "rmsS", "gapDeg",
  "errLatKm", "errLonKm", "errDepthKm", "region", "status", "solutionStamp",
] as const satisfies readonly (keyof SeismicEvent)[];

export function sameData(a: SeismicEvent, b: SeismicEvent): boolean {
  return DATA_FIELDS.every((f) => a[f] === b[f]);
}

export async function eventsBetween(db: D1Database, from: string, to: string): Promise<StoredEvent[]> {
  const { results } = await db
    .prepare("SELECT * FROM events WHERE time >= ? AND time < ? ORDER BY time")
    .bind(from, to)
    .all<EventRow>();
  return results.map(toStored);
}

export function insertStmt(db: D1Database, e: SeismicEvent, now: string): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO events (id, time, lat, lon, depth_km, mag, mag_type, phases, rms_s, gap_deg,
         err_lat_km, err_lon_km, err_depth_km, region, status, solution_stamp, first_seen_at, updated_at, removed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
       -- Two runs can overlap (cron + a visitor's refresh); the loser must update, not fail.
       ON CONFLICT(id) DO UPDATE SET
         time = excluded.time, lat = excluded.lat, lon = excluded.lon, depth_km = excluded.depth_km,
         mag = excluded.mag, mag_type = excluded.mag_type, phases = excluded.phases, rms_s = excluded.rms_s,
         gap_deg = excluded.gap_deg, err_lat_km = excluded.err_lat_km, err_lon_km = excluded.err_lon_km,
         err_depth_km = excluded.err_depth_km, region = excluded.region, status = excluded.status,
         solution_stamp = excluded.solution_stamp, updated_at = excluded.updated_at, removed_at = NULL`,
    )
    .bind(e.id, e.time, e.lat, e.lon, e.depthKm, e.mag, e.magType, e.phases, e.rmsS, e.gapDeg,
      e.errLatKm, e.errLonKm, e.errDepthKm, e.region, e.status, e.solutionStamp, now, now);
}

export function updateStmt(db: D1Database, e: SeismicEvent, now: string): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE events SET time = ?, lat = ?, lon = ?, depth_km = ?, mag = ?, mag_type = ?, phases = ?, rms_s = ?,
         gap_deg = ?, err_lat_km = ?, err_lon_km = ?, err_depth_km = ?, region = ?, status = ?, solution_stamp = ?,
         updated_at = ?, removed_at = NULL
       WHERE id = ?`,
    )
    .bind(e.time, e.lat, e.lon, e.depthKm, e.mag, e.magType, e.phases, e.rmsS, e.gapDeg,
      e.errLatKm, e.errLonKm, e.errDepthKm, e.region, e.status, e.solutionStamp, now, e.id);
}

/** Which of these ids already exist, in as few queries as D1's bound-parameter limit allows. */
export async function existingIds(db: D1Database, ids: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90);
    const { results } = await db
      .prepare(`SELECT id FROM events WHERE id IN (${chunk.map(() => "?").join(",")})`)
      .bind(...chunk)
      .all<{ id: string }>();
    for (const r of results) found.add(r.id);
  }
  return found;
}

/** D1 batches are transactional; keep each one modest in size. */
export async function runBatched(db: D1Database, stmts: D1PreparedStatement[], size = 50): Promise<void> {
  for (let i = 0; i < stmts.length; i += size) await db.batch(stmts.slice(i, i + size));
}

export interface IngestClaim {
  startedAt: string;
  trigger: IngestRun["trigger"];
  windowStart: string;
  windowEnd: string;
  /** Treat a run started after this instant, and not yet finished, as still in flight. */
  inFlightSince: string;
  /** If set, refuse when a run finished after this instant (the visitor-facing throttle). */
  finishedSince: string | null;
}

/**
 * Claim the right to talk to SGC and open the run row in ONE statement.
 *
 * The guards used to be separate SELECTs followed by an INSERT, so two requests whose
 * reads landed before either insert both passed and both queried SGC. SQLite evaluates
 * this insert-with-NOT-EXISTS atomically, so exactly one concurrent caller gets a row.
 * Returns null when another run holds the claim: the caller must stand down, not proceed.
 */
export async function claimIngestRun(db: D1Database, c: IngestClaim): Promise<number | null> {
  const row = await db
    .prepare(
      `INSERT INTO ingest_runs (started_at, trigger, window_start, window_end)
       SELECT ?1, ?2, ?3, ?4
       WHERE NOT EXISTS (
               SELECT 1 FROM ingest_runs WHERE finished_at IS NULL AND started_at > ?5
             )
         AND (?6 IS NULL OR NOT EXISTS (
               SELECT 1 FROM ingest_runs WHERE finished_at IS NOT NULL AND finished_at > ?6
             ))
       RETURNING id`,
    )
    .bind(c.startedAt, c.trigger, c.windowStart, c.windowEnd, c.inFlightSince, c.finishedSince)
    .first<{ id: number }>();
  return row?.id ?? null;
}

/** A run that started recently and has not finished: someone else is already talking to SGC. */
export async function runInFlight(db: D1Database, now: Date, withinMs = IN_FLIGHT_MS): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS x FROM ingest_runs WHERE finished_at IS NULL AND started_at > ? LIMIT 1")
    .bind(new Date(now.getTime() - withinMs).toISOString())
    .first();
  return row !== null;
}

/** What a run says when the Worker never got to write its own result. */
export const ABANDONED_ERROR = "run abandoned: the Worker recorded no result";

/**
 * Close the books on runs that started, stopped counting as in flight, and never wrote a
 * result. `ingest()` records its own failures, so a row left open is not a failure it saw:
 * the invocation itself was killed — out of memory, out of CPU, or evicted mid-fetch.
 *
 * Every reader of the history asks about *finished* runs, which is right, so nothing saw
 * those runs at all: the newest finished row stayed the last success, `sgcUnwell` stayed
 * false, the fast lane kept its 5-minute cadence, and the page showed no error while the
 * catalogue went nine hours stale (2026-09-20, 112 runs). Marking them failed here, once,
 * is what lets the health rule, the page's alert and the sweep's ordering see them without
 * any of the three learning a second rule.
 *
 * `finished_at` is the instant the run stopped counting as in flight, not now: it is the
 * last moment anything could still have been true of it, and dating it later would push the
 * visitor's throttle out by however long the row sat there.
 */
export async function reapAbandonedRuns(db: D1Database, now: Date, withinMs = IN_FLIGHT_MS): Promise<number> {
  const cutoff = new Date(now.getTime() - withinMs).toISOString();
  const { meta } = await db
    .prepare("UPDATE ingest_runs SET finished_at = ?1, ok = 0, error = ?2 WHERE finished_at IS NULL AND started_at <= ?1")
    .bind(cutoff, ABANDONED_ERROR)
    .run();
  return meta.changes ?? 0;
}

/**
 * How many finished runs the health rule looks back over. An hour of ticks: long enough to
 * tell one bad answer from SGC refusing us, and **bounded**, so this read does not grow with
 * a table that gains ~312 rows a day. A streak longer than the window still reads as a
 * streak — `failing.since` is then simply the oldest run in view, which only makes the
 * back-off it feeds more cautious, never less.
 */
const HEALTH_WINDOW_RUNS = 12;

/**
 * Deliberately narrower than `lastRun`: the back-off needs the HTTP status, and the status
 * API has no business carrying it. Every part reads the newest rows by id and none filters
 * on a caller's clock — a run that finished a moment ago must not be invisible to the guard.
 */
export async function sgcHealth(db: D1Database): Promise<SgcHealth> {
  // The tail of the history, newest first: `ok` answers the fast lane's rule and the
  // unbroken run of failures at the front answers "is SGC refusing us, or was that one
  // bad answer". Walked backwards off the primary key, so it reads twelve rows, not the table.
  const { results: recent } = await db
    .prepare(`SELECT ok, http_status, started_at FROM ingest_runs
              WHERE finished_at IS NOT NULL ORDER BY id DESC LIMIT ${HEALTH_WINDOW_RUNS}`)
    .all<{ ok: number; http_status: number | null; started_at: string }>();
  const last = recent[0] ?? null;
  const streak = [];
  for (const r of recent) {
    if (r.ok === 1) break;
    streak.push(r);
  }
  const limited = await db
    // The IN list matches the partial index ingest_runs_rate_limited exactly; keep them
    // together. finished_at is never null for these rows, but saying so keeps Date.parse
    // below off a NaN path rather than relying on finish() being the only writer.
    .prepare(`SELECT finished_at, retry_after_s FROM ingest_runs
              WHERE http_status IN (429, 503) AND finished_at IS NOT NULL ORDER BY id DESC LIMIT 1`)
    .first<{ finished_at: string; retry_after_s: number | null }>();
  return {
    lastOk: last === null ? null : last.ok === 1,
    // The status is the newest failure's; `since` is the oldest failure still unbroken by a
    // success, which is how long SGC has been answering us this way.
    failing: streak.length === 0
      ? null
      : { since: streak[streak.length - 1]!.started_at, status: streak[0]!.http_status },
    rateLimit: limited === null ? null : { finishedAt: limited.finished_at, retryAfterS: limited.retry_after_s },
  };
}

export async function lastRun(db: D1Database, onlyOk: boolean): Promise<IngestRun | null> {
  const row = await db
    // Unfinished runs are in progress, not failed; they never count as the "last run".
    .prepare(`SELECT * FROM ingest_runs WHERE finished_at IS NOT NULL ${onlyOk ? "AND ok = 1" : ""} ORDER BY id DESC LIMIT 1`)
    .first<RunRow>();
  return row ? toRun(row) : null;
}
