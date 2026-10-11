import type { ZoneId } from "../core/zones.ts";
import type { IngestRun } from "./api-types.ts";

/**
 * How long a started-but-unfinished run counts as still talking to SGC. It must exceed the
 * longest possible SGC request, which the Worker caps at 45 s with one retry. One definition:
 * the atomic claim and the pre-check the page is answered from must not disagree.
 */
export const IN_FLIGHT_MS = 150_000;

/**
 * The catalogue is synced on demand only (from 2026-10-11): nothing reads SGC on a schedule, and the
 * one way in is a reader pressing "Sincronizar ahora", which is `POST /api/refresh`. This module
 * decides what such a press may do. The cron lanes it used to plan are gone with the cron
 * (docs/ingest.md, "On demand only").
 */

/** The default trailing window, in days back from the start of today (`ingestTrailing`). */
export const TRAILING_DAYS = 3;

/**
 * How far back a sync re-reads once the zone's history is loaded: the trailing window, with removals.
 * Chocó keeps the three days it always had; the Chaparral swarm one, because its days are larger
 * (~130 events a day at its height) and anything older is a sweep chunk's job.
 */
export const SYNC_WINDOW_DAYS: Record<ZoneId, number> = { choco: TRAILING_DAYS, tolima: 1 };

/**
 * The visitor-facing throttle, for both zones: once a zone's history is loaded, a sync sooner than
 * this after its last run stands down. With no cron behind it, this number and the catch-up rule
 * below are all that bound our load on SGC, however many people press.
 */
export const REFRESH_MIN_INTERVAL_S = 900;

/**
 * How often a caught-up sync adds a revision sweep to its trailing read: at most once an hour per zone.
 * A press is the trailing window alone otherwise, so the worst case, someone pressing on both zones at
 * every throttle, is 4 + 1 requests an hour per zone, 10 in all: under the 12 an hour that ran ~20 h
 * before SGC's refusal of 2026-09-20 (docs/sgc-data-source.md). A sweep on every press would have been
 * 16 (code review, 2026-10-11).
 */
const REVISION_SWEEP_EVERY_S = 3600;

/** How long a visitor is asked to wait when another run is already in flight. */
const IN_FLIGHT_RETRY_S = 5;

/** What the finished runs say about SGC's health. */
export interface SgcHealth {
  /**
   * Whether this zone's most recent finished run succeeded; null when none has finished yet. The
   * zone's own, unlike the two fields below: a failure only Chocó meets — a timeout on its wider
   * window, a row the parser refuses — must not hold Chaparral's catch-up.
   */
  lastOk: boolean | null;
  /**
   * The unbroken run of failures at the end of the history, if the newest finished run
   * failed: `since` is when the oldest of them started, `status` what SGC last answered.
   */
  failing: { since: string; status: number | null } | null;
  /** The most recent run SGC rate limited, which holds the catch-up down on its own. */
  rateLimit: { finishedAt: string; retryAfterS: number | null } | null;
}

/**
 * Everything the recorded runs say, read once so one decision is made from one snapshot.
 *
 * Two halves, and which half a field is in is a claim. SGC is one server answering one address,
 * so its **health**, whether anything is **in flight**, and when a request last **left** are
 * about every zone at once: a refusal of Chocó's request is a refusal of Chaparral's, and two
 * zones must never talk to SGC at the same moment. The **last run** and the **back-fill** are
 * one zone's, because they answer "how fresh is this catalogue".
 */
export interface IngestHistory {
  health: SgcHealth;
  /** A run started recently and not yet finished: someone else is already talking to SGC. */
  inFlight: boolean;
  /** When the newest finished run of any zone started: the last time a request left for SGC. */
  lastSent: string | null;
  /** This zone's newest finished run. */
  lastRun: IngestRun | null;
  backfill: { done: number; total: number };
  /** When a sweep of this zone was last attempted, catch-up or revision; null when none ever was. */
  lastSweepAt: string | null;
}

/**
 * The lane is the name of the rule that chose this step, and it is the field the logs and the
 * analytics dataset are grouped by. `wide` re-reads the trailing window with removals; `sweep` reads
 * one history chunk: the oldest not yet loaded while the zone is behind, otherwise the least recently
 * read, for SGC's late revisions. The analytics dataset also holds `fast` from the cron's days.
 */
export type IngestLane = "wide" | "sweep";

export type IngestStep = { lane: "wide"; days: number } | { lane: "sweep" };

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
 * case it exists for, and `Number()` reads "1e9", which would hold the catch-up down for
 * decades. Five minutes is the least we can usefully wait; six hours is the most.
 */
const RATE_LIMIT_MIN_COOLDOWN_S = 300;
const RATE_LIMIT_MAX_COOLDOWN_S = 21_600;

/**
 * Whether SGC is answering well enough for the catch-up — one history chunk per request, with no
 * throttle between them — to go on:
 *
 * - **any** failed run holds it down until one succeeds: a run failing with an HTTP status is no
 *   weaker a signal than one that timed out. The press after the throttle is what tries again.
 * - a 429 or 503 additionally holds it down for `Retry-After` (bounded) or 30 minutes,
 *   even once a later run has succeeded, because being answered is not being welcome.
 */
export function sgcUnwell(health: SgcHealth, now: Date): boolean {
  return health.lastOk === false || cooldownLeftS(health, now) > 0;
}

/**
 * Seconds left of the cooldown the last 429 or 503 asked for (bounded), or 0. A press waits for it as
 * well as for the throttle: with no cron, nothing else honours a `Retry-After` longer than the throttle
 * (code review).
 */
function cooldownLeftS(health: SgcHealth, now: Date): number {
  if (health.rateLimit === null) return 0;
  const asked = health.rateLimit.retryAfterS ?? RATE_LIMIT_COOLDOWN_S;
  const cooldownS = Math.min(Math.max(asked, RATE_LIMIT_MIN_COOLDOWN_S), RATE_LIMIT_MAX_COOLDOWN_S);
  return Math.max(0, cooldownS - (now.getTime() - Date.parse(health.rateLimit.finishedAt)) / 1000);
}

/**
 * Statuses that mean SGC is refusing *us*, rather than failing. A 5xx is their bad day and
 * a 404 could be one wrong URL, but these are a door held shut: the same request will be
 * refused again. 429 and 503 are not here — they have their own cooldown above, and SGC names
 * its own wait for them.
 */
const REFUSAL_STATUSES = new Set([401, 403, 410, 451]);
/**
 * How long a refusal has to persist before we believe it: an hour, so one 410 from a proxy having a
 * moment costs a press the ordinary throttle, not an hour.
 */
const REFUSAL_GRACE_S = 3600;
/** How long a sync waits once we believe it, counted from the last request of any zone. */
const REFUSED_RETRY_S = 3600;

/**
 * Whether SGC has been refusing us long enough that a press should wait an hour rather than the
 * ordinary throttle. Production met this on 2026-09-20: SGC answered 410 Gone to the Worker while
 * answering the same request normally from another network.
 */
export function sgcRefusing(health: SgcHealth, now: Date): boolean {
  if (health.failing === null || health.failing.status === null) return false;
  if (!REFUSAL_STATUSES.has(health.failing.status)) return false;
  return now.getTime() - Date.parse(health.failing.since) >= REFUSAL_GRACE_S * 1000;
}

/**
 * Seconds since anything last *asked* SGC — measured from when the run started, not when it
 * finished. What these intervals ration is requests leaving, and a request leaves at the start.
 */
function sinceS(startedAt: string | null | undefined, now: Date): number {
  if (startedAt == null) return Infinity;
  return (now.getTime() - Date.parse(startedAt)) / 1000;
}

/**
 * What one press of "Sincronizar ahora" may do, given one reading of the run history. Pure, so every
 * rule can be checked without a database; `POST /api/refresh` asks once and runs the plan with
 * `runPlan`.
 *
 * - **Behind** (history chunks not yet loaded: every day without a sync adds one): one chunk per
 *   request, oldest first, with no throttle while SGC is answering. The page asks again until the
 *   zone has caught up, one request at a time.
 * - **Caught up**: the trailing window with removals, at most once per `REFRESH_MIN_INTERVAL_S` counted
 *   from the zone's last run, then, if no sweep of the zone has run for an hour, one older chunk for
 *   SGC's late revisions.
 * - While SGC is failing the catch-up closes and every press waits the throttle; once it has refused
 *   us for an hour, an hour from the last request of any zone; and after a 429 or 503, whatever is
 *   left of its cooldown, if that is longer. A closed catch-up costs the wait, not the chunk.
 */
export function dueNow(now: Date, history: IngestHistory, zone: ZoneId): IngestPlan {
  if (history.inFlight) return { steps: [], retryAfterS: IN_FLIGHT_RETRY_S, minIntervalS: null };

  const behind = history.backfill.done < history.backfill.total;
  const catchUp = behind && !sgcUnwell(history.health, now);

  // While SGC is refusing us, the wait is counted from the last request of any zone: it is one door.
  // The ordinary throttle is counted from this zone's own last run, because it is about this
  // catalogue's freshness.
  const refusing = sgcRefusing(history.health, now);
  const sinceLastS = refusing ? sinceS(history.lastSent, now) : sinceS(history.lastRun?.startedAt, now);
  const waitS = refusing ? REFUSED_RETRY_S : REFRESH_MIN_INTERVAL_S;
  const leftS = Math.max(waitS - sinceLastS, cooldownLeftS(history.health, now));
  if (!catchUp && leftS > 0) return { steps: [], retryAfterS: Math.ceil(leftS), minIntervalS: null };

  const revision = sinceS(history.lastSweepAt, now) >= REVISION_SWEEP_EVERY_S;
  const steps: IngestStep[] = behind
    ? [{ lane: "sweep" }]
    : [{ lane: "wide", days: SYNC_WINDOW_DAYS[zone] }, ...(revision ? [{ lane: "sweep" } as const] : [])];
  return { steps, retryAfterS: null, minIntervalS: catchUp ? null : waitS };
}
