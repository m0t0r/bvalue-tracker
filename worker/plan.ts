import type { IngestRun } from "./api-types.ts";

/**
 * How long a started-but-unfinished run counts as still talking to SGC. It must exceed the
 * longest possible SGC request, which the Worker caps at 45 s with one retry. One definition:
 * the atomic claim and the pre-check the page is answered from must not disagree.
 */
export const IN_FLIGHT_MS = 150_000;

/** The one cron pattern, in milliseconds. See `triggers` in wrangler.jsonc. */
const TICK_MS = 300_000;

/**
 * Which tick this is, as a minute of the hour — snapped to the nearest scheduled tick,
 * never to the nearest minute.
 *
 * `scheduledTime` is not the round minute. Production dispatches this Worker's five-minute
 * cron at **:45 past**, and rounding that to the nearest minute reads it as the minute after —
 * which for a five-minute cron is never a multiple of 15. So from the moment the
 * five-minute cadence was deployed (2026-09-19) until this was found (2026-09-20), every
 * single tick took the fast lane: no removals were ever applied, no sweep ever ran, and —
 * worst of it — nothing was left that ignores SGC's health, so the first failed run stood
 * the only remaining lane down and the Worker stopped talking to SGC altogether. A 410 from
 * SGC froze the page until a visitor pressed the button.
 *
 * Snapping to the tick gives 2.5 minutes of slack either side of the dispatch time instead
 * of 30 seconds, so the lane a tick belongs to no longer depends on how punctual the
 * dispatch was.
 */
export const tickMinute = (scheduledTime: number) => ((Math.round(scheduledTime / TICK_MS) * TICK_MS) / 60_000) % 60;

/**
 * Every fifteenth minute the five-minute tick loads the full trailing window instead.
 * Exported because it is also the number the page's failed-ingest alert quotes: once a run
 * has failed the fast lane stands down, so the wide tick is the only lane still asking SGC.
 */
export const WIDE_TICK_EVERY_MIN = 15;
export const TRAILING_DAYS = 3;
/**
 * The fast lane's window. SGC publishes an event 2–5 minutes after it happens, so a
 * single day is more than enough to catch everything new while keeping each of the
 * extra requests small. Anything older is the wide tick's and the sweep's job.
 */
const TRAILING_FAST_DAYS = 1;

/**
 * The visitor-facing throttle. It counts *any* run, cron included, so with a 5-minute
 * cron a manual press almost always stands down — which is the point: this number, not
 * the number of people with the page open, is what bounds our load on SGC.
 */
export const REFRESH_MIN_INTERVAL_S = 300;
/** How long a visitor is asked to wait when another run is already in flight. */
const IN_FLIGHT_RETRY_S = 5;

/** What the finished runs say about SGC's health. Drives the fast lane's back-off. */
export interface SgcHealth {
  /** Whether the most recent finished run succeeded; null when none has finished yet. */
  lastOk: boolean | null;
  /** The most recent run SGC rate limited, which holds the fast lane down on its own. */
  rateLimit: { finishedAt: string; retryAfterS: number | null } | null;
}

/** Everything the recorded runs say, read once so one decision is made from one snapshot. */
export interface IngestHistory {
  health: SgcHealth;
  /** A run started recently and not yet finished: someone else is already talking to SGC. */
  inFlight: boolean;
  lastRun: IngestRun | null;
  backfill: { done: number; total: number };
}

export type IngestStep =
  | { lane: "trailing"; trigger: IngestRun["trigger"]; days: number; allowRemovals: boolean }
  | { lane: "sweep" };

/** Who is asking. The cron carries the tick's own minute; a visitor's press carries nothing. */
export type Caller = { kind: "cron"; scheduledTime: number } | { kind: "manual" };

export interface IngestPlan {
  /** What to ingest, in order. Empty means stand down. */
  steps: IngestStep[];
  /** Seconds until asking again is worth anything. Only meaningful when `steps` is empty. */
  retryAfterS: number | null;
  /**
   * The claim's own throttle: refuse the first step if any run finished within this many
   * seconds. null leaves the claim to the in-flight guard alone. It is what actually holds —
   * `retryAfterS` above is only how the page is told to wait.
   */
  minIntervalS: number | null;
}

/** No cooldown was given, so sit out long enough that a limit we cannot see has reset. */
const RATE_LIMIT_COOLDOWN_S = 1800;
/**
 * Bounds on a cooldown SGC asks for. Both ends are load-bearing: `Retry-After: 0` — which
 * an elapsed HTTP date parses to — would otherwise switch the back-off off in exactly the
 * case it exists for, and `Number()` reads "1e9", which would hold the lane down for
 * decades. One missed tick is the least we can usefully wait; six hours is the most.
 */
const RATE_LIMIT_MIN_COOLDOWN_S = 300;
const RATE_LIMIT_MAX_COOLDOWN_S = 21_600;

/**
 * Whether SGC is answering well enough for a fast lane to open. There is one rule and both
 * fast lanes — the cron's narrow tick and the back-fill's no-wait refresh — read it here:
 *
 * - **any** failed run holds them down until one succeeds. The wide tick keeps probing every
 *   15 minutes, so that is what lets them back in — a run failing with an HTTP status is no
 *   weaker a signal than one that timed out.
 * - a 429 or 503 additionally holds them down for `Retry-After` (bounded) or 30 minutes,
 *   even once a later run has succeeded, because being answered is not being welcome.
 *
 * So a rate limit we have never seen would throttle us back to the old cadence or slower
 * on its own, with nobody deploying a fix.
 */
export function sgcUnwell(health: SgcHealth, now: Date): boolean {
  if (health.lastOk === false) return true;
  if (health.rateLimit === null) return false;
  const asked = health.rateLimit.retryAfterS ?? RATE_LIMIT_COOLDOWN_S;
  const cooldownS = Math.min(Math.max(asked, RATE_LIMIT_MIN_COOLDOWN_S), RATE_LIMIT_MAX_COOLDOWN_S);
  return now.getTime() - Date.parse(health.rateLimit.finishedAt) < cooldownS * 1000;
}

/**
 * What ingest is due, for whoever is asking, given one reading of the run history. Pure, so
 * every lane rule can be checked without a database. Both callers ask once and then execute
 * the plan with `runPlan`; neither restates a rule that lives here.
 */
export function dueNow(caller: Caller, now: Date, history: IngestHistory): IngestPlan {
  if (caller.kind === "manual") return refreshPlan(now, history);

  const minute = tickMinute(caller.scheduledTime);

  if (minute % WIDE_TICK_EVERY_MIN !== 0) {
    // The fast lane: a narrow window, no removals, and nothing at all while SGC is unwell.
    // The real clock, not the scheduled minute: a failure recorded seconds ago still counts.
    if (sgcUnwell(history.health, now)) return { steps: [], retryAfterS: null, minIntervalS: null };
    return {
      steps: [{ lane: "trailing", trigger: "cron", days: TRAILING_FAST_DAYS, allowRemovals: false }],
      retryAfterS: null,
      minIntervalS: null,
    };
  }

  // The wide tick never stands down for SGC's health: it is what probes SGC while the fast
  // lane waits, and so what lets the fast lane back in.
  const steps: IngestStep[] = [{ lane: "trailing", trigger: "cron", days: TRAILING_DAYS, allowRemovals: true }];
  // One older 7-day chunk on the hour, to catch late revisions — and on every wide tick
  // while history is still incomplete, rather than waiting an hour per week of back-fill.
  if (history.backfill.done < history.backfill.total || minute === 0) steps.push({ lane: "sweep" });
  return { steps, retryAfterS: null, minIntervalS: null };
}

function refreshPlan(now: Date, history: IngestHistory): IngestPlan {
  if (history.inFlight) return { steps: [], retryAfterS: IN_FLIGHT_RETRY_S, minIntervalS: null };

  const incomplete = history.backfill.done < history.backfill.total;
  // Missing history loads without the usual wait, but only while SGC is answering — the same
  // rule the cron's fast lane reads, so a cooldown cannot hold one lane down and not the other.
  const fastLane = incomplete && !sgcUnwell(history.health, now);

  const last = history.lastRun;
  const sinceLastS = last === null ? Infinity : (now.getTime() - Date.parse(last.finishedAt ?? last.startedAt)) / 1000;
  if (!fastLane && sinceLastS < REFRESH_MIN_INTERVAL_S) {
    return { steps: [], retryAfterS: Math.ceil(REFRESH_MIN_INTERVAL_S - sinceLastS), minIntervalS: null };
  }

  // A closed fast lane costs the wait, not the chunk: the sweep is what probes SGC while
  // the lane is shut, and so what lets it open again.
  const step: IngestStep = incomplete
    ? { lane: "sweep" }
    : { lane: "trailing", trigger: "manual", days: TRAILING_DAYS, allowRemovals: true };
  return { steps: [step], retryAfterS: null, minIntervalS: fastLane ? null : REFRESH_MIN_INTERVAL_S };
}
