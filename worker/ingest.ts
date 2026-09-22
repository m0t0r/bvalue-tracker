import { CHOCO_SWARM_BBOX, MAINSHOCK_DATE, fetchCatalog, sgcHttpError, type FetchOptions, type RefusalEvidence } from "../core/seiscomp.ts";
import { recordRun } from "./analytics.ts";
import type { IngestRun } from "./api-types.ts";
import { claimIngestRun, eventsBetween, existingIds, insertStmt, lastRun, reapAbandonedRuns, runBatched, runInFlight, sameData, sgcHealth, toRun, updateStmt, type RunRow } from "./db.ts";
import { silentLogger, type Logger } from "./log.ts";
import { IN_FLIGHT_MS, TRAILING_DAYS, type IngestHistory, type IngestLane, type IngestPlan } from "./plan.ts";

const DAY_MS = 86_400_000;
export const SWEEP_CHUNK_DAYS = 7;
/** A successful response may not retire more than this share of a window's known events. */
const MAX_REMOVAL_SHARE = 0.2;

export interface IngestDeps {
  db: D1Database;
  now?: Date;
  fetchOptions?: FetchOptions;
  /** Guard widths for the atomic claim. A visitor's refresh also passes minIntervalS. */
  guard?: { inFlightMs?: number; minIntervalS?: number | null };
  /**
   * Where this invocation says what it did. Defaults to silence so a caller that has no
   * invocation to hang a log off — a test calling ingest() directly — needs no ceremony.
   */
  log?: Logger;
  /** The 3-month record of ingest runs. Absent in local dev and in tests. */
  analytics?: AnalyticsEngineDataset;
}

export interface IngestOptions {
  /**
   * Whether a response that lacks a known event may retire it. Off for the fast lane:
   * its window holds only a handful of events, too few for MAX_REMOVAL_SHARE to engage,
   * so one short response could retire real ones. The wide tick and the sweep still do it.
   */
  allowRemovals?: boolean;
  /** Which rule chose this run. Carried into the log line and the analytics point. */
  lane?: IngestLane;
}

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
  const lane = opts.lane ?? (trigger === "sweep" ? "sweep" : "wide");
  const log = (deps.log ?? silentLogger).child({ lane, trigger });
  // Wall time, not CPU: in workerd the clock only advances across I/O, so this measures
  // how long SGC and D1 held the invocation. What the invocation *burned* is
  // $workers.cpuTimeMs in Workers Logs, which the runtime alone can see.
  const startedMs = Date.now();

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
  if (runId === null) {
    // Not a failure: another run holds the claim and this one must stand down. Worth a line
    // anyway — a burst of these is how contention between the cron and the button looks.
    log.debug({ windowStart: from, windowEnd: to }, "ingest stood down: claim held");
    return null;
  }

  /**
   * The one place a run ends. Every outcome goes through here, so the D1 row, the log line
   * and the 3-month analytics point can never tell three different stories.
   */
  const finish = async (
    fields: Record<string, number | string | null>,
    sgc: { ms: number | null; chars: number | null; refusal?: RefusalEvidence | null } = { ms: null, chars: null },
  ) => {
    const cols = Object.keys(fields);
    await db
      .prepare(`UPDATE ingest_runs SET finished_at = ?, ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`)
      .bind(new Date().toISOString(), ...Object.values(fields), runId)
      .run();
    const row = await db.prepare("SELECT * FROM ingest_runs WHERE id = ?").bind(runId).first<RunRow>();
    const run = toRun(row!);

    const httpStatus = row!.http_status;
    const retryAfterS = row!.retry_after_s;
    const durationMs = Date.now() - startedMs;
    const line = {
      runId,
      windowStart: from,
      windowEnd: to,
      fetched: run.fetched,
      inserted: run.inserted,
      updated: run.updated,
      removed: run.removed,
      durationMs,
      sgcMs: sgc.ms,
      sgcChars: sgc.chars,
      httpStatus,
      retryAfterS,
      ...(run.error === null ? {} : { error: run.error }),
      // Who wrote the refusal: the log's alone, like the stack. Never the D1 row the page reads.
      ...(sgc.refusal ? { sgcHeaders: sgc.refusal.headers, sgcBody: sgc.refusal.body } : {}),
    };
    // A note on a successful run (a skipped removal, an unparsable row) is not an error but
    // must not read as an ordinary success either: it is the shape the 2026-09-19 "one bad
    // row froze the window" fault had.
    if (!run.ok) log.error(line, "ingest failed");
    else if (run.error !== null) log.warn(line, "ingest ok with a note");
    else log.info(line, "ingest ok");

    recordRun(deps.analytics, run, { lane, durationMs, sgcMs: sgc.ms, httpStatus, retryAfterS }, log);
    return run;
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
    return await finish(
      { ok: 1, fetched: page.events.length, inserted, updated, removed, error: note },
      { ms: page.cost.fetchMs, chars: page.cost.chars },
    );
  } catch (err) {
    const e = err as Error;
    const cause = e.cause ? ` (${String(e.cause)})` : "";
    const http = sgcHttpError(err);
    // The stack goes in the log, never in the D1 `error` column: that column is read back
    // by the page, and a visitor is never shown a stack (docs/ingest.md, "Concurrency and failure
    // lessons"). The two are deliberately different widths of the same fact.
    log.debug({ err: e, attempt: "ingest" }, "ingest threw");
    return await finish({
      ok: 0,
      error: `${e.message}${cause}`.slice(0, 500),
      http_status: http?.status ?? null,
      retry_after_s: http?.retryAfterS ?? null,
    }, { ms: null, chars: null, refusal: http?.evidence ?? null });
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
  return ingest(deps, next.start, next.end, "sweep", { lane: "sweep" });
}

export async function backfillProgress(db: D1Database, now: Date): Promise<{ done: number; total: number }> {
  const starts = sweepChunks(now).map((c) => c.start.toISOString());
  const { results } = await db
    .prepare("SELECT DISTINCT window_start AS s FROM ingest_runs WHERE trigger = 'sweep' AND ok = 1")
    .all<{ s: string }>();
  const swept = new Set(results.map((r) => r.s));
  return { done: starts.filter((s) => swept.has(s)).length, total: starts.length };
}

/**
 * Everything the recorded runs say, in one snapshot, so the plan is decided from one
 * reading of the table rather than from four that can disagree mid-tick.
 */
export async function readHistory(db: D1Database, now: Date, log: Logger = silentLogger): Promise<IngestHistory> {
  // First close the books on any run the Worker was killed in the middle of. Everything
  // below reads finished runs, so until this happens a killed run is invisible: it is
  // neither the last run nor a failure, and the fast lane goes on as if SGC were fine.
  const reaped = await reapAbandonedRuns(db, now);
  // The one signal that says "an invocation of this Worker was killed". On 2026-09-20 it
  // was true 112 times in a row and nothing anywhere said so. It is a warn, not an info,
  // because a non-zero count is never normal: ingest() records its own failures, so a row
  // left open means the invocation died — out of memory, out of CPU, or evicted mid-fetch.
  // This is the line to alert on, and the line to look for first in any stale-data report.
  if (reaped > 0) log.warn({ reaped }, "reaped abandoned runs: an invocation was killed");
  return {
    health: await sgcHealth(db),
    inFlight: await runInFlight(db, now),
    lastRun: await lastRun(db, false),
    backfill: await backfillProgress(db, now),
  };
}

/**
 * Carry out a plan, in order. Returns the first step's outcome — the one that decides
 * whether SGC was reached at all — or null when another run held the claim, so nothing
 * was sent. An empty plan is a stand-down and returns null without touching D1.
 */
export async function runPlan(deps: IngestDeps, plan: IngestPlan): Promise<IngestRun | null> {
  let first: IngestRun | null = null;
  for (const [i, step] of plan.steps.entries()) {
    // The throttle guards the opening step only: a plan's own first run must not be what
    // refuses its second (the wide tick's sweep).
    const d: IngestDeps = { ...deps, guard: { ...deps.guard, minIntervalS: i === 0 ? plan.minIntervalS : null } };
    const run = step.lane === "sweep"
      ? await ingestSweep(d)
      : await ingestTrailing(d, step.trigger, { days: step.days, allowRemovals: step.allowRemovals, lane: step.lane });
    if (i === 0) first = run;
  }
  return first;
}
