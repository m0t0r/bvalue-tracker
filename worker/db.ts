import type { SeismicEvent } from "../core/types.ts";
import type { IngestRun, StoredEvent } from "./api-types.ts";

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
export async function runInFlight(db: D1Database, now: Date, withinMs = 150_000): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS x FROM ingest_runs WHERE finished_at IS NULL AND started_at > ? LIMIT 1")
    .bind(new Date(now.getTime() - withinMs).toISOString())
    .first();
  return row !== null;
}

export async function lastRun(db: D1Database, onlyOk: boolean): Promise<IngestRun | null> {
  const row = await db
    // Unfinished runs are in progress, not failed; they never count as the "last run".
    .prepare(`SELECT * FROM ingest_runs WHERE finished_at IS NOT NULL ${onlyOk ? "AND ok = 1" : ""} ORDER BY id DESC LIMIT 1`)
    .first<RunRow>();
  return row ? toRun(row) : null;
}
