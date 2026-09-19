import { CHOCO_SWARM_BBOX, MAINSHOCK_DATE, fetchCatalog, sgcHttpError, type FetchOptions } from "../core/seiscomp.ts";
import type { IngestRun } from "./api-types.ts";
import { claimIngestRun, eventsBetween, existingIds, insertStmt, lastFinishedHealth, runBatched, sameData, toRun, updateStmt, type RunRow } from "./db.ts";

const DAY_MS = 86_400_000;
export const TRAILING_DAYS = 3;
/**
 * The fast lane's window. SGC publishes an event 2–5 minutes after it happens, so a
 * single day is more than enough to catch everything new while keeping each of the
 * extra requests small. Anything older is the wide tick's and the sweep's job.
 */
export const TRAILING_FAST_DAYS = 1;
export const SWEEP_CHUNK_DAYS = 7;
/** A successful response may not retire more than this share of a window's known events. */
const MAX_REMOVAL_SHARE = 0.2;

export interface IngestDeps {
  db: D1Database;
  now?: Date;
  fetchOptions?: FetchOptions;
  /** Guard widths for the atomic claim. A visitor's refresh also passes minIntervalS. */
  guard?: { inFlightMs?: number; minIntervalS?: number | null };
}

export interface IngestOptions {
  /**
   * Whether a response that lacks a known event may retire it. Off for the fast lane:
   * its window holds only a handful of events, too few for MAX_REMOVAL_SHARE to engage,
   * so one short response could retire real ones. The wide tick and the sweep still do it.
   */
  allowRemovals?: boolean;
}

/** How much of a window may be unparsable before the whole response is distrusted. */
const MAX_SKIPPED_SHARE = 0.1;
export const IN_FLIGHT_MS = 150_000;

const startOfUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/**
 * One SGC request must fit well inside the in-flight window used by POST /api/refresh,
 * so a slow SGC cannot cause several Workers to queue up against it.
 */
const WORKER_FETCH: FetchOptions = { timeoutMs: 45_000, retries: 1 };

/**
 * Bring D1 in line with SGC for [windowStart, windowEnd).
 * A fetch or parse failure is recorded and leaves `events` untouched. If D1 itself
 * fails part-way, some upserts may already be applied; that is safe, because they
 * are idempotent and correct, removals are written last, and the next run finishes the job.
 *
 * Returns null when another run already holds the claim, so nothing was attempted.
 */
export async function ingest(
  deps: IngestDeps, windowStart: Date, windowEnd: Date, trigger: IngestRun["trigger"], opts: IngestOptions = {},
): Promise<IngestRun | null> {
  const { db, fetchOptions } = deps;
  const nowIso = (deps.now ?? new Date()).toISOString();
  const from = windowStart.toISOString();
  const to = windowEnd.toISOString();

  // Claiming and opening the run is one atomic statement: two callers racing here
  // must not both end up talking to SGC.
  const nowMs = Date.parse(nowIso);
  const minIntervalS = deps.guard?.minIntervalS ?? null;
  const runId = await claimIngestRun(db, {
    startedAt: nowIso,
    trigger,
    windowStart: from,
    windowEnd: to,
    inFlightSince: new Date(nowMs - (deps.guard?.inFlightMs ?? IN_FLIGHT_MS)).toISOString(),
    finishedSince: minIntervalS === null ? null : new Date(nowMs - minIntervalS * 1000).toISOString(),
  });
  if (runId === null) return null;

  const finish = async (fields: Record<string, number | string | null>) => {
    const cols = Object.keys(fields);
    await db
      .prepare(`UPDATE ingest_runs SET finished_at = ?, ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`)
      .bind(new Date().toISOString(), ...Object.values(fields), runId)
      .run();
    const row = await db.prepare("SELECT * FROM ingest_runs WHERE id = ?").bind(runId).first<RunRow>();
    return toRun(row!);
  };

  try {
    // The form filters by date only and its timezone is unverified, so ask for a day more on each side.
    const page = await fetchCatalog(
      { start: new Date(windowStart.getTime() - DAY_MS), end: new Date(windowEnd.getTime() + DAY_MS), bbox: CHOCO_SWARM_BBOX },
      { ...WORKER_FETCH, ...fetchOptions },
    );

    const widenedFrom = new Date(startOfUtcDay(windowStart).getTime() - 2 * DAY_MS).toISOString();
    const widenedTo = new Date(windowEnd.getTime() + 3 * DAY_MS).toISOString();
    const known = new Map((await eventsBetween(db, widenedFrom, widenedTo)).map((e) => [e.id, e]));

    // Origin time can move on revision, so an id may already exist outside the window we loaded.
    const elsewhere = await existingIds(db, page.events.filter((e) => !known.has(e.id)).map((e) => e.id));

    const stmts: D1PreparedStatement[] = [];
    let inserted = 0, updated = 0;
    const seen = new Set<string>();
    for (const e of page.events) {
      seen.add(e.id);
      const prev = known.get(e.id);
      if (!prev && !elsewhere.has(e.id)) { stmts.push(insertStmt(db, e, nowIso)); inserted++; }
      else if (!prev || prev.removedAt !== null || !sameData(prev, e)) { stmts.push(updateStmt(db, e, nowIso)); updated++; }
    }

    const inWindow = opts.allowRemovals === false
      ? []
      : [...known.values()].filter((e) => e.time >= from && e.time < to && e.removedAt === null);
    const gone = inWindow.filter((e) => !seen.has(e.id));
    let removed = 0;
    let note: string | null = null;
    if (gone.length > 0 && inWindow.length >= 10 && gone.length / inWindow.length > MAX_REMOVAL_SHARE) {
      note = `removal skipped: response lacks ${gone.length} of ${inWindow.length} known events in window`;
    } else {
      for (const e of gone) stmts.push(db.prepare("UPDATE events SET removed_at = ? WHERE id = ?").bind(nowIso, e.id));
      removed = gone.length;
    }

    if (page.skippedRows.length > 0) {
      const skipNote = `skipped ${page.skippedRows.length} unparsable row(s): ${page.skippedRows[0]!.reason}`;
      note = note ? `${note}; ${skipNote}` : skipNote;
    }

    await runBatched(db, stmts);
    return await finish({ ok: 1, fetched: page.events.length, inserted, updated, removed, error: note });
  } catch (err) {
    const e = err as Error;
    const cause = e.cause ? ` (${String(e.cause)})` : "";
    const http = sgcHttpError(err);
    return await finish({
      ok: 0,
      error: `${e.message}${cause}`.slice(0, 500),
      http_status: http?.status ?? null,
      retry_after_s: http?.retryAfterS ?? null,
    });
  }
}

export interface TrailingOptions extends IngestOptions {
  /** How many days back from the start of today the window reaches. */
  days?: number;
}

export function ingestTrailing(
  deps: IngestDeps, trigger: IngestRun["trigger"], opts: TrailingOptions = {},
): Promise<IngestRun | null> {
  const now = deps.now ?? new Date();
  const days = opts.days ?? TRAILING_DAYS;
  return ingest(deps, new Date(startOfUtcDay(now).getTime() - days * DAY_MS), new Date(now.getTime() + DAY_MS), trigger, opts);
}

/** No cooldown was given, so sit out long enough that a limit we cannot see has reset. */
export const RATE_LIMIT_COOLDOWN_S = 1800;

/**
 * Whether the fast lane should stand down. It runs only while SGC is answering: after any
 * failed run it waits for the next wide tick, and after a 429 or 503 it waits out
 * `Retry-After` (or 30 minutes). A rate limit we have never seen would therefore throttle
 * us back to the old cadence or slower on its own, with nobody deploying a fix.
 */
export async function fastLaneBlocked(db: D1Database, now: Date): Promise<boolean> {
  const health = await lastFinishedHealth(db, now);
  if (health === null || health.ok) return false;
  if (health.httpStatus === null) return true;
  const cooldownS = health.retryAfterS ?? RATE_LIMIT_COOLDOWN_S;
  return now.getTime() - Date.parse(health.finishedAt) < cooldownS * 1000;
}

/** 7-day windows covering mainshock day → now. */
export function sweepChunks(now: Date): { start: Date; end: Date }[] {
  const out: { start: Date; end: Date }[] = [];
  for (let t = MAINSHOCK_DATE.getTime(); t < now.getTime(); t += SWEEP_CHUNK_DAYS * DAY_MS) {
    out.push({ start: new Date(t), end: new Date(Math.min(t + SWEEP_CHUNK_DAYS * DAY_MS, now.getTime() + DAY_MS)) });
  }
  return out;
}

/**
 * Re-check one older chunk per call, least recently attempted first, so late
 * revisions are picked up while every invocation stays small.
 */
export async function ingestSweep(deps: IngestDeps): Promise<IngestRun | null> {
  const now = deps.now ?? new Date();
  const { results } = await deps.db
    // Ordered by last ATTEMPT, not last success: a chunk that keeps failing goes to the back
    // of the queue instead of being retried forever while every other chunk starves.
    .prepare("SELECT window_start AS s, MAX(started_at) AS last FROM ingest_runs WHERE trigger = 'sweep' GROUP BY window_start")
    .all<{ s: string; last: string }>();
  const last = new Map(results.map((r) => [r.s, r.last]));
  const chunks = sweepChunks(now);
  chunks.sort((a, b) => (last.get(a.start.toISOString()) ?? "").localeCompare(last.get(b.start.toISOString()) ?? ""));
  const next = chunks[0]!;
  return ingest(deps, next.start, next.end, "sweep");
}

export async function backfillProgress(db: D1Database, now: Date): Promise<{ done: number; total: number }> {
  const starts = sweepChunks(now).map((c) => c.start.toISOString());
  const { results } = await db
    .prepare("SELECT DISTINCT window_start AS s FROM ingest_runs WHERE trigger = 'sweep' AND ok = 1")
    .all<{ s: string }>();
  const swept = new Set(results.map((r) => r.s));
  return { done: starts.filter((s) => swept.has(s)).length, total: starts.length };
}
