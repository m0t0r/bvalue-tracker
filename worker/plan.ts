import type { IngestRun } from "./api-types.ts";

/**
 * How long a started-but-unfinished run counts as still talking to SGC. It must exceed the
 * longest possible SGC request, which the Worker caps at 45 s with one retry. One definition:
 * the atomic claim and the pre-check the page is answered from must not disagree.
 */
export const IN_FLIGHT_MS = 150_000;

/**
 * The one cron pattern, in milliseconds. **It must equal the cron in `wrangler.jsonc`**, or
 * `tickMinute` snaps to a grid the ticks never land on. `WIDE_TICK_EVERY_MIN` must be a
 * whole multiple of it, or a lane becomes unreachable — which is how the wide tick and the
 * sweep went a day without running. The budget test in `worker/test/plan.test.ts` walks a
 * real hour of ticks and holds all three to one number.
 */
const TICK_MS = 900_000;

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
 * Every second tick loads the full trailing window instead of the narrow one: two of the
 * hour's four, so removals happen twice an hour. A whole multiple of the tick, or the lane
 * it names can never come up.
 */
export const WIDE_TICK_EVERY_MIN = 30;
export const TRAILING_DAYS = 3;
/**
 * The fast lane's window. SGC publishes an event 2–5 minutes after it happens, so a
 * single day is more than enough to catch everything new while keeping each of the
 * extra requests small. Anything older is the wide tick's and the sweep's job.
 */
const TRAILING_FAST_DAYS = 1;

/**
 * The visitor-facing throttle. It counts *any* run, cron included, and **it is the cron's
 * own period** so that a press almost always coincides with a tick that was going to happen
 * anyway. That is what makes "visitors do not add to the budget" true rather than hopeful:
 * drop it below the cron and a reader with a fast finger adds requests we did not count.
 * This number, not how many people have the page open, is what bounds our load on SGC.
 */
export const REFRESH_MIN_INTERVAL_S = 900;
/** How long a visitor is asked to wait when another run is already in flight. */
const IN_FLIGHT_RETRY_S = 5;

/** What the finished runs say about SGC's health. Drives the fast lane's back-off. */
export interface SgcHealth {
  /** Whether the most recent finished run succeeded; null when none has finished yet. */
  lastOk: boolean | null;
  /**
   * The unbroken run of failures at the end of the history, if the newest finished run
   * failed: `since` is when the oldest of them started, `status` what SGC last answered.
   */
  failing: { since: string; status: number | null } | null;
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
 * - **any** failed run holds them down until one succeeds. The wide tick keeps probing on its
 *   own interval, so that is what lets them back in — a run failing with an HTTP status is no
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
 * Statuses that mean SGC is refusing *us*, rather than failing. A 5xx is their bad day and
 * a 404 could be one wrong URL, but these are a door held shut: the same request will be
 * refused again, and asking four times an hour for a week is both pointless and the sort of
 * thing that gets a door held shut in the first place. 429 and 503 are not here — they have
 * their own cooldown above, and SGC names its own wait for them.
 */
const REFUSAL_STATUSES = new Set([401, 403, 410, 451]);
/**
 * How long a refusal has to persist before we believe it: **two wide ticks**, so one of them
 * still goes at full rate and a 410 from a proxy having a moment costs one tick, not an hour.
 * It is derived, not written down, because writing it down is how it broke: at 1800 s against
 * 30-minute wide ticks the first tick after a failure landed exactly *on* the boundary, the
 * grace was unreachable, and a single 410 bought 90 minutes of silence — the freeze this whole
 * rule exists to prevent. `plan.test.ts` walks that timeline tick by tick.
 */
const REFUSAL_GRACE_S = 2 * WIDE_TICK_EVERY_MIN * 60;
/** What the probe drops to once we believe it: one an hour instead of two. */
const REFUSED_PROBE_INTERVAL_S = 3600;

/**
 * Whether SGC has been refusing us long enough that we should stop asking at full rate.
 *
 * This is the one rule that slows the **wide** tick, which otherwise never stands down
 * because it is what probes SGC while the fast lane waits. That is still true — the probe
 * does not stop, it thins out. Production met this on 2026-09-20: SGC answered 410 Gone to
 * the Worker while answering the same request normally from another network, and nothing in
 * the back-off covered a 4xx, so the wide tick would have knocked on a closed door 96 times
 * a day indefinitely.
 */
export function sgcRefusing(health: SgcHealth, now: Date): boolean {
  if (health.failing === null || health.failing.status === null) return false;
  if (!REFUSAL_STATUSES.has(health.failing.status)) return false;
  return now.getTime() - Date.parse(health.failing.since) >= REFUSAL_GRACE_S * 1000;
}

/**
 * Seconds since anything last *asked* SGC — measured from when the run started, not when it
 * finished. What these intervals ration is requests leaving, and a request leaves at the
 * start. Measured from `finished_at`, a run's own 1–13 s pushed every comparison just past
 * its interval, so the tick an hour later missed the hourly probe by three seconds and the
 * wait silently became an hour and a half.
 */
function sinceLastRunS(history: IngestHistory, now: Date): number {
  const last = history.lastRun;
  if (last === null) return Infinity;
  return (now.getTime() - Date.parse(last.startedAt)) / 1000;
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

  // The wide tick never stands down for a failure: it is what probes SGC while the fast lane
  // waits, and so what lets the fast lane back in. A refusal is the one thing that slows it,
  // and even then only to hourly — a probe that stopped could never see SGC come back.
  if (sgcRefusing(history.health, now) && sinceLastRunS(history, now) < REFUSED_PROBE_INTERVAL_S) {
    return { steps: [], retryAfterS: null, minIntervalS: null };
  }

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

  const sinceLastS = sinceLastRunS(history, now);
  // While SGC is refusing us the button waits as long as the cron does. A press is the same
  // request from the same address, so letting it through on the ordinary throttle would undo
  // the back-off above — and this rule belongs here, once, not restated at a caller.
  const waitS = sgcRefusing(history.health, now) ? REFUSED_PROBE_INTERVAL_S : REFRESH_MIN_INTERVAL_S;
  if (!fastLane && sinceLastS < waitS) {
    return { steps: [], retryAfterS: Math.ceil(waitS - sinceLastS), minIntervalS: null };
  }

  // A closed fast lane costs the wait, not the chunk: the sweep is what probes SGC while
  // the lane is shut, and so what lets it open again.
  const step: IngestStep = incomplete
    ? { lane: "sweep" }
    : { lane: "trailing", trigger: "manual", days: TRAILING_DAYS, allowRemovals: true };
  return { steps: [step], retryAfterS: null, minIntervalS: fastLane ? null : waitS };
}
