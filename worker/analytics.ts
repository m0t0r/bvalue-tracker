import type { IngestRun } from "./api-types.ts";
import type { Logger } from "./log.ts";

/**
 * The ingest history that outlives the log window.
 *
 * Workers Logs on the free plan keeps **3 days**. That is shorter than this project's
 * slowest real fault: the 2026-09-20 outage ran 02:50–12:05 UTC and was only diagnosed
 * afterwards, with the logs already expiring. Workers Analytics Engine keeps **3 months**
 * and is free (100,000 data points written and 10,000 read queries per day; currently
 * unbilled). One point per ingest run is ~350 a day — about a third of one percent of the
 * allowance — so every run this Worker has ever made stays queryable for a season.
 *
 * `ingest_runs` in D1 already holds the same outcomes, and deliberately keeps doing so:
 * it is what the page and the lane rules read, synchronously and transactionally. This is
 * the other half — a column store the SQL API can aggregate over without spending the
 * Worker's D1 row budget on questions nobody is asking in a request.
 *
 * **The field positions are the schema.** Analytics Engine has no column names: a query
 * says `blob2`, `double5`. Inserting a field in the middle silently re-labels every point
 * written before the deploy, and there is no migration that can fix it afterwards. So:
 * **only ever append**, and when a field dies, leave its slot empty rather than closing
 * the gap. The two tables below are the whole contract; keep them in step with the code.
 *
 * | blob | meaning                                        |
 * |------|------------------------------------------------|
 * | 1    | trigger: cron \| sweep \| manual               |
 * | 2    | lane: fast \| wide \| sweep \| manual          |
 * | 3    | outcome: ok \| fail                            |
 * | 4    | error message, empty when ok                   |
 * | 5    | window start, ISO                              |
 * | 6    | window end, ISO                                |
 * | 7    | zone: choco \| tolima (empty before 2026-09-23, which was all choco) |
 *
 * | double | meaning                                      |
 * |--------|----------------------------------------------|
 * | 1      | ok: 1 or 0                                   |
 * | 2      | events the response held                     |
 * | 3      | inserted                                     |
 * | 4      | updated                                      |
 * | 5      | removed                                      |
 * | 6      | whole run, ms                                |
 * | 7      | the SGC request alone, ms                    |
 * | 8      | HTTP status from SGC, 0 when there was none  |
 * | 9      | Retry-After SGC asked for, seconds, 0 if none|
 */

/** Blobs are capped at 16 KB per point in total; an SGC error can quote a whole page. */
const MAX_BLOB = 512;

const blob = (s: string | null | undefined) => (s ?? "").slice(0, MAX_BLOB);

export interface RunMetrics {
  lane: string;
  zone: string;
  /** Wall time for the whole run, including D1. */
  durationMs: number;
  /** Wall time for the SGC request alone — the number that identifies a hanging fetch. */
  sgcMs: number | null;
  httpStatus: number | null;
  retryAfterS: number | null;
}

/**
 * Record one finished ingest run.
 *
 * The binding is optional because `wrangler dev` and the test pool do not always provide
 * one, and a missing analytics dataset must never be what stops an ingest: this is a
 * record *of* the work, not part of it. `writeDataPoint` does not return a promise and
 * does not block the invocation, so it costs the run nothing it can notice.
 */
export function recordRun(
  dataset: AnalyticsEngineDataset | undefined,
  run: IngestRun,
  m: RunMetrics,
  log: Logger,
): void {
  if (dataset === undefined) return;
  try {
    dataset.writeDataPoint({
      // The index is the sampling key. Trigger, so that if sampling ever engages it keeps
      // each lane's own shape rather than drowning the rare manual runs in cron ticks.
      indexes: [blob(run.trigger)],
      blobs: [
        blob(run.trigger),
        blob(m.lane),
        run.ok ? "ok" : "fail",
        blob(run.error),
        blob(run.windowStart),
        blob(run.windowEnd),
        blob(m.zone),
      ],
      doubles: [
        run.ok ? 1 : 0,
        run.fetched ?? 0,
        run.inserted ?? 0,
        run.updated ?? 0,
        run.removed ?? 0,
        m.durationMs,
        m.sgcMs ?? 0,
        m.httpStatus ?? 0,
        m.retryAfterS ?? 0,
      ],
    });
  } catch (err) {
    // Never let the record of the work fail the work.
    log.warn({ err }, "analytics write failed");
  }
}
