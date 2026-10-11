import { describe, expect, it } from "vitest";
import type { IngestRun } from "../api-types.ts";
import { dueNow, REFRESH_MIN_INTERVAL_S, type IngestHistory, type SgcHealth } from "../plan.ts";

/** SGC answering normally. Every field is named, so a new rule cannot default itself in. */
const healthy = (over: Partial<SgcHealth> = {}): SgcHealth => ({
  lastOk: true,
  failing: null,
  rateLimit: null,
  ...over,
});

/** The newest finished run failed, and the ones before it, since `since`. */
const failingSince = (since: Date, status: number | null) =>
  healthy({ lastOk: false, failing: { since: since.toISOString(), status } });

/** A healthy, idle history with the zone caught up: the ordinary case. */
const history = (over: Partial<IngestHistory> = {}): IngestHistory => ({
  health: healthy(),
  inFlight: false,
  lastSent: null,
  lastRun: null,
  backfill: { done: 6, total: 6 },
  lastSweepAt: null,
  ...over,
});

/** Every day without a sync adds a history chunk not yet loaded: the zone is behind. */
const BEHIND = { backfill: { done: 2, total: 6 } };

const NOW = new Date("2026-09-19T12:05:00Z");

/** Chaparral's sync, which most rules are checked on; what differs for Chocó is at the end. */
const chaparral = (now: Date, h: IngestHistory) => dueNow(now, h, "tolima");

/** A finished, successful run — all the plan reads of it is when it started. */
const finishedAt = (d: Date): IngestRun => ({
  id: 1,
  startedAt: d.toISOString(),
  finishedAt: d.toISOString(),
  trigger: "manual",
  windowStart: d.toISOString(),
  windowEnd: d.toISOString(),
  ok: true,
  fetched: 0,
  inserted: 0,
  updated: 0,
  removed: 0,
  error: null,
});

const at = (s: number) => new Date(NOW.getTime() + s * 1000);

/** SGC refused us at NOW, then answered a minute later: only the cooldown can still hold. */
const rateLimited = (retryAfterS: number | null) =>
  history({
    ...BEHIND,
    health: healthy({ rateLimit: { finishedAt: NOW.toISOString(), retryAfterS } }),
    lastRun: finishedAt(NOW),
  });

/** What a caught-up Chaparral sync runs: its trailing day with removals, then one revision chunk. */
const CAUGHT_UP = [{ lane: "wide", days: 1 }, { lane: "sweep" }];

describe("a sync while the zone is caught up", () => {
  // The claim inside ingest() is the guard that actually holds; this one is here to answer
  // with a useful retryAfterS instead of a silent stand-down.
  it("stands down while another run is already talking to SGC", () => {
    const plan = chaparral(NOW, history({ inFlight: true }));
    expect(plan.steps).toEqual([]);
    expect(plan.retryAfterS).toBe(5);
  });

  it("re-reads the trailing window, then one older chunk for SGC's late revisions", () => {
    expect(chaparral(NOW, history()).steps).toEqual(CAUGHT_UP);
  });

  // With no cron behind it, this number is what bounds our load on SGC, however many people press.
  // Written off REFRESH_MIN_INTERVAL_S, not off the number it happens to hold.
  it("counts down the throttle since the zone's last run", () => {
    const plan = chaparral(at(120), history({ lastRun: finishedAt(NOW) }));
    expect(plan.steps).toEqual([]);
    expect(plan.retryAfterS).toBe(REFRESH_MIN_INTERVAL_S - 120);
  });

  it("goes once the wait has elapsed, and keeps the throttle on the claim", () => {
    const plan = chaparral(at(REFRESH_MIN_INTERVAL_S + 1), history({ lastRun: finishedAt(NOW) }));
    expect(plan.steps).toEqual(CAUGHT_UP);
    expect(plan.minIntervalS).toBe(REFRESH_MIN_INTERVAL_S);
  });

  // A failed run is what the throttle waits out; the press after it is what tries again.
  it("waits the same throttle after a failure, and then tries again", () => {
    const failed = history({ health: failingSince(NOW, 500), lastRun: { ...finishedAt(NOW), ok: false } });
    expect(chaparral(at(60), failed).steps).toEqual([]);
    expect(chaparral(at(REFRESH_MIN_INTERVAL_S + 1), failed).steps).toEqual(CAUGHT_UP);
  });
});

describe("a sync while the zone is behind", () => {
  // The page asks again until the zone has caught up, one request at a time.
  it("loads one missing history chunk per request, without the usual wait", () => {
    const plan = chaparral(at(1), history({ ...BEHIND, lastRun: finishedAt(NOW) }));
    expect(plan.steps).toEqual([{ lane: "sweep" }]);
    expect(plan.minIntervalS).toBeNull();
  });

  it("still stands down while another run is in flight", () => {
    expect(chaparral(NOW, history({ ...BEHIND, inFlight: true })).steps).toEqual([]);
  });

  it("loads a chunk when no run has ever finished", () => {
    expect(chaparral(NOW, history({ ...BEHIND, health: healthy({ lastOk: null }) })).steps).toEqual([
      { lane: "sweep" },
    ]);
  });

  // An HTTP status is no weaker a signal than a timeout, so both close the catch-up until a success.
  it("closes the catch-up while the last finished run failed, and costs the wait, not the chunk", () => {
    const failed = history({
      ...BEHIND,
      health: failingSince(NOW, 500),
      lastRun: { ...finishedAt(NOW), ok: false },
    });
    const during = chaparral(at(1), failed);
    expect(during.steps).toEqual([]);
    expect(during.retryAfterS).toBe(REFRESH_MIN_INTERVAL_S - 1);

    const after = chaparral(at(REFRESH_MIN_INTERVAL_S + 1), failed);
    expect(after.steps).toEqual([{ lane: "sweep" }]);
    expect(after.minIntervalS).toBe(REFRESH_MIN_INTERVAL_S);
  });

  // The button used to open its no-wait back-fill lane on "the last run succeeded" alone, which
  // ignores the cooldown a 429 or 503 asks for. Being answered again is not being welcome again.
  it("closes the catch-up during a cooldown, even once SGC is answering again", () => {
    // The cooldown has to outlast the throttle, or the second half below measures the throttle
    // expiring rather than the cooldown still holding the catch-up shut.
    const cooldownS = REFRESH_MIN_INTERVAL_S * 4;
    const limited = rateLimited(cooldownS);
    expect(limited.health.lastOk).toBe(true); // a later run succeeded: only the cooldown holds

    const during = chaparral(at(1), limited);
    expect(during.steps).toEqual([]);
    expect(during.retryAfterS).toBe(cooldownS - 1);

    // With no cron, the press is all that is left to honour a Retry-After longer than the throttle
    // (code review): past the throttle, the cooldown still holds.
    expect(chaparral(at(REFRESH_MIN_INTERVAL_S + 1), limited).steps).toEqual([]);

    // The wait is all it costs: once the cooldown is over, SGC is well again and the catch-up reopens.
    const after = chaparral(at(cooldownS + 1), limited);
    expect(after.steps).toEqual([{ lane: "sweep" }]);
    expect(after.minIntervalS).toBeNull();
  });

  it("holds a caught-up press to a cooldown longer than the throttle as well", () => {
    const limited = { ...rateLimited(7200), backfill: { done: 6, total: 6 } };
    const during = chaparral(at(REFRESH_MIN_INTERVAL_S + 1), limited);
    expect(during.steps).toEqual([]);
    expect(during.retryAfterS).toBe(7200 - REFRESH_MIN_INTERVAL_S - 1);
    expect(chaparral(at(7201), limited).steps).toHaveLength(2);
  });

  it("opens the catch-up again once Retry-After has passed", () => {
    const limited = rateLimited(600);
    expect(chaparral(at(599), limited).steps).toEqual([]);
    expect(chaparral(at(601), limited).steps).toEqual([{ lane: "sweep" }]);
  });

  // The clamp's floor is load-bearing: Retry-After: 0 — which an already-elapsed HTTP date parses to,
  // and clock skew makes reachable — must not open the catch-up in the one case the cooldown exists
  // for.
  it("holds a five-minute floor when the server asks for no wait at all", () => {
    const limited = rateLimited(0);
    expect(chaparral(at(299), limited).steps).toEqual([]);
    expect(chaparral(at(301), limited).steps).toEqual([{ lane: "sweep" }]);
    expect(chaparral(at(301), limited).minIntervalS).toBeNull();
  });
});

/**
 * A caught-up press reads the trailing window, and adds a revision sweep only when the zone has had no
 * sweep for an hour: the worst case is then 5 requests an hour per zone, 10 for both, under the 12 an
 * hour that preceded SGC's refusal of 2026-09-20 (code review, 2026-10-11).
 */
describe("the hourly revision sweep", () => {
  const at = (s: number) => new Date(NOW.getTime() + s * 1000);
  const caughtUp = (sweepAgoS: number | null) =>
    history({
      lastRun: finishedAt(at(-REFRESH_MIN_INTERVAL_S - 1)),
      lastSweepAt: sweepAgoS === null ? null : at(-sweepAgoS).toISOString(),
    });

  it("reads the trailing window alone when a sweep ran within the hour", () => {
    expect(dueNow(NOW, caughtUp(1800), "tolima").steps).toEqual([{ lane: "wide", days: 1 }]);
  });

  it("adds the sweep once the last one is an hour old, or when there never was one", () => {
    expect(dueNow(NOW, caughtUp(3600), "tolima").steps).toEqual([{ lane: "wide", days: 1 }, { lane: "sweep" }]);
    expect(dueNow(NOW, caughtUp(null), "choco").steps).toEqual([{ lane: "wide", days: 3 }, { lane: "sweep" }]);
  });

  // Behind, every request is a sweep whatever the hour says: the catch-up is what loads the history.
  it("does not hold the catch-up to the hour", () => {
    const h = { ...caughtUp(60), ...BEHIND };
    expect(dueNow(NOW, h, "tolima").steps).toEqual([{ lane: "sweep" }]);
  });
});

/**
 * SGC answered 410 Gone to the Worker for hours on 2026-09-20 while answering the same request
 * normally from another network — a door held shut, not a bad day. A press is the same request
 * from the same address, so once the refusal has lasted it waits an hour, not the throttle.
 */
describe("while SGC is refusing us", () => {
  const ago = (s: number) => new Date(NOW.getTime() - s * 1000);
  /** Refused since `sinceS` ago, last asked `lastS` ago — by this zone, as the only one asking. */
  const refused = (sinceS: number, lastS: number, status: number | null = 410) =>
    history({
      health: failingSince(ago(sinceS), status),
      lastSent: ago(lastS).toISOString(),
      lastRun: { ...finishedAt(ago(lastS)), ok: false },
    });

  // One 410 can be a proxy having a moment; an hour of waiting is too much to spend on it.
  it("waits only the ordinary throttle while the refusal is still young", () => {
    expect(chaparral(NOW, refused(1200, REFRESH_MIN_INTERVAL_S + 1)).steps).toEqual(CAUGHT_UP);
    expect(chaparral(NOW, refused(1200, 600)).retryAfterS).toBe(REFRESH_MIN_INTERVAL_S - 600);
  });

  it("waits an hour from the last request once the refusal has lasted an hour, and says how long is left", () => {
    const plan = chaparral(NOW, refused(3600, 600));
    expect(plan.steps).toEqual([]);
    expect(plan.retryAfterS).toBe(3000);
  });

  it("lets the press through once that hour has passed, and holds the claim to it", () => {
    const plan = chaparral(NOW, refused(7200, 3601));
    expect(plan.steps).toEqual(CAUGHT_UP);
    expect(plan.minIntervalS).toBe(3600);
  });

  it("holds a zone that is behind to the same hour", () => {
    const behind = { ...refused(3600, 600), ...BEHIND };
    expect(chaparral(NOW, behind).retryAfterS).toBe(3000);
    expect(chaparral(NOW, { ...refused(7200, 3601), ...BEHIND }).steps).toEqual([{ lane: "sweep" }]);
  });

  // A 5xx is their bad day, not a door; 429 and 503 have their own cooldown, which SGC itself names;
  // a timeout or a killed run has no status at all. None of them is held to the hour.
  it.each([500, 502, 504, 429, 503, null])("waits only the throttle for a long run of HTTP %s", (status) => {
    expect(chaparral(NOW, refused(7200, 600, status)).retryAfterS).toBe(REFRESH_MIN_INTERVAL_S - 600);
  });
});

describe("the Chocó zone", () => {
  const choco = (h = history(), now = NOW) => dueNow(now, h, "choco");

  it("re-reads its three trailing days when caught up, then one older chunk", () => {
    expect(choco().steps).toEqual([{ lane: "wide", days: 3 }, { lane: "sweep" }]);
  });

  it("holds the button to the same fifteen minutes, counted from its own last run", () => {
    const h = history({ lastRun: finishedAt(NOW), lastSent: NOW.toISOString() });
    expect(choco(h, at(REFRESH_MIN_INTERVAL_S - 60)).retryAfterS).toBe(60);
    expect(choco(h, at(REFRESH_MIN_INTERVAL_S + 1)).steps).toEqual([{ lane: "wide", days: 3 }, { lane: "sweep" }]);
  });

  // Another zone having just synced says nothing about how fresh this catalogue is.
  it("does not stand the button down because the other zone ran a moment ago", () => {
    const h = history({ lastRun: finishedAt(at(-3600)), lastSent: at(-60).toISOString() });
    expect(choco(h).steps).toHaveLength(2);
  });

  // But SGC is one door: while it refuses us, one knock an hour is the whole budget, whoever knocked.
  it("counts the refusal's hour from the last request of any zone", () => {
    const refused = history({
      health: failingSince(at(-7200), 410),
      lastSent: at(-60).toISOString(),
      lastRun: { ...finishedAt(at(-3700)), ok: false },
    });
    const plan = choco(refused);
    expect(plan.steps).toEqual([]);
    expect(plan.retryAfterS).toBe(3540);
  });
});
