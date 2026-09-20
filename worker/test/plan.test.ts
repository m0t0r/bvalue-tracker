import { describe, expect, it } from "vitest";
import type { IngestRun } from "../api-types.ts";
import { dueNow, REFRESH_MIN_INTERVAL_S, TRAILING_DAYS, type IngestHistory, type IngestPlan, type SgcHealth } from "../plan.ts";

/** SGC answering normally. Every field is named, so a new rule cannot default itself in. */
const healthy = (over: Partial<SgcHealth> = {}): SgcHealth => ({ lastOk: true, failing: null, rateLimit: null, ...over });

/** The newest finished run failed, and the ones before it, since `since`. */
const failingSince = (since: Date, status: number | null) =>
  healthy({ lastOk: false, failing: { since: since.toISOString(), status } });

/** A healthy, idle history with the back-fill finished: the ordinary case. */
const history = (over: Partial<IngestHistory> = {}): IngestHistory => ({
  health: healthy(),
  inFlight: false,
  lastRun: null,
  backfill: { done: 6, total: 6 },
  ...over,
});

const NOW = new Date("2026-09-19T12:05:00Z");
const cron = (minute: number) => ({ kind: "cron" as const, scheduledTime: Date.UTC(2026, 8, 19, 12, minute) });
const MANUAL = { kind: "manual" } as const;

/** A finished, successful run — all the plan reads of it is when it ended. */
const finishedAt = (d: Date): IngestRun => ({
  id: 1, startedAt: d.toISOString(), finishedAt: d.toISOString(), trigger: "cron",
  windowStart: d.toISOString(), windowEnd: d.toISOString(), ok: true,
  fetched: 0, inserted: 0, updated: 0, removed: 0, error: null,
});

const at = (s: number) => new Date(NOW.getTime() + s * 1000);

/** SGC refused us at NOW, then answered a minute later: only the cooldown can still hold. */
const rateLimited = (retryAfterS: number | null) =>
  history({ health: healthy({ rateLimit: { finishedAt: NOW.toISOString(), retryAfterS } }) });

describe("cron lanes", () => {
  it("gives the fast lane one trailing day and never lets it retire an event", () => {
    expect(dueNow(cron(5), NOW, history()).steps).toEqual([
      { lane: "trailing", trigger: "cron", days: 1, allowRemovals: false },
    ]);
  });

  // An HTTP status is no weaker a signal than a timeout, so both wait for a success.
  it("stands the fast lane down while the last finished run failed", () => {
    expect(dueNow(cron(5), NOW, history({ health: healthy({ lastOk: false, failing: { since: NOW.toISOString(), status: 500 } }) })).steps).toEqual([]);
  });

  // Being answered again is not being welcome again: the cooldown outlives the recovery,
  // which is also the only way to observe it — until a run succeeds the rule above applies.
  it("keeps the fast lane down for Retry-After after a 429, then lets it back in", () => {
    const limited = rateLimited(600);
    expect(dueNow(cron(5), at(599), limited).steps).toEqual([]);
    expect(dueNow(cron(5), at(601), limited).steps).toHaveLength(1);
  });

  it("runs the fast lane when no run has ever finished", () => {
    expect(dueNow(cron(5), NOW, history({ health: healthy({ lastOk: null }) })).steps).toHaveLength(1);
  });

  // Both ends of the clamp are load-bearing. Retry-After: 0 — which an already-elapsed HTTP
  // date parses to, and clock skew makes reachable — must not switch the back-off off in the
  // one case it exists for; and Number() happily reads "1e9".
  it.each([
    ["falls back to thirty minutes when the server named no cooldown", null, 1800],
    ["holds a five-minute floor when the server asks for no wait at all", 0, 300],
    ["caps an absurd Retry-After at six hours", 1e9, 21_600],
  ])("%s", (_name, retryAfterS, waitS) => {
    const limited = rateLimited(retryAfterS);
    expect(dueNow(cron(5), at(waitS - 1), limited).steps).toEqual([]);
    expect(dueNow(cron(5), at(waitS + 1), limited).steps).toHaveLength(1);
  });

  it("gives the wide tick three trailing days, with removals", () => {
    expect(dueNow(cron(15), NOW, history()).steps).toEqual([
      { lane: "trailing", trigger: "cron", days: 3, allowRemovals: true },
    ]);
  });

  // The wide tick is what probes SGC while the fast lane waits, so it is what lets it back in.
  it("keeps the wide tick running while the fast lane is standing down", () => {
    expect(dueNow(cron(15), NOW, history({ health: healthy({ lastOk: false, failing: { since: NOW.toISOString(), status: 500 } }) })).steps).toHaveLength(1);
  });

  it("adds one history chunk on the hour, and on no other quarter", () => {
    expect(dueNow(cron(0), NOW, history()).steps.at(-1)).toEqual({ lane: "sweep" });
    expect(dueNow(cron(30), NOW, history()).steps.at(-1)).not.toEqual({ lane: "sweep" });
  });

  // Rather than waiting an hour per week of back-fill.
  it("adds a history chunk to every wide tick while the back-fill is unfinished", () => {
    const partial = history({ backfill: { done: 2, total: 6 } });
    expect(dueNow(cron(30), NOW, partial).steps.at(-1)).toEqual({ lane: "sweep" });
  });

  // A boundary landing at :14:59.9 must not read as minute 14 and quietly demote the wide
  // tick to a fast one, which would skip that tick's removals and its back-fill chunk.
  it("reads a tick that landed a tenth of a second early as the minute it was meant for", () => {
    const early = { kind: "cron" as const, scheduledTime: Date.UTC(2026, 8, 19, 12, 15) - 100 };
    expect(dueNow(early, NOW, history()).steps).toEqual([
      { lane: "trailing", trigger: "cron", days: 3, allowRemovals: true },
    ]);
  });

  /**
   * The lane is snapped to the nearest *tick*, not the nearest minute, and this is why.
   * Production dispatches this cron at :45 past, which rounded to the nearest minute reads
   * as the minute after — and for a five-minute cron the minute after is never a multiple
   * of 15. Every tick of 2026-09-19..20 therefore took the fast lane: no removals, no
   * sweep, and no lane left that ignores SGC's health, so one 410 stopped the Worker
   * talking to SGC at all. Each offset below is a dispatch time, in seconds from the tick.
   */
  describe.each([0, 45, 149, -149])("dispatched %i s from the tick", (offsetS) => {
    const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
    const plansFor = (h: IngestHistory) =>
      MINUTES.map((m) => dueNow({ kind: "cron", scheduledTime: Date.UTC(2026, 8, 19, 12, m) + offsetS * 1000 }, NOW, h));
    const isWide = (p: IngestPlan) => p.steps.some((s) => s.lane === "trailing" && s.days === TRAILING_DAYS);
    const hasSweep = (p: IngestPlan) => p.steps.some((s) => s.lane === "sweep");

    it("puts four wide ticks on the quarters and one sweep on the hour", () => {
      const hour = plansFor(history());
      expect(hour.map(isWide)).toEqual([true, false, false, true, false, false, true, false, false, true, false, false]);
      expect(hour.filter(hasSweep)).toHaveLength(1);
      expect(hasSweep(hour[0]!)).toBe(true);
    });

    // The one that turned a 410 from a blip into an outage with no way out: with every tick
    // on the fast lane, the first failure stood down the only lane there was.
    it("leaves four lanes an hour that probe SGC while the fast lane is standing down", () => {
      const ill = plansFor(history({ health: healthy({ lastOk: false, failing: { since: NOW.toISOString(), status: 500 } }) }));
      expect(ill.filter((p) => p.steps.length > 0)).toHaveLength(4);
    });
  });
});

/**
 * SGC answered 410 Gone to the Worker for hours on 2026-09-20 while answering the same
 * request normally from another network — a door held shut, not a bad day. Nothing in the
 * back-off covered a 4xx: `sgcUnwell` only gates the fast lane, and the wide tick never
 * stands down, so the probe would have knocked four times an hour indefinitely. It thins to
 * hourly now; it never stops, because a probe that stopped could not see SGC come back.
 */
describe("while SGC is refusing us", () => {
  const ago = (s: number) => new Date(NOW.getTime() - s * 1000);
  /** Refused since `sinceS` ago, last asked `lastS` ago. */
  const refused = (sinceS: number, lastS: number, status = 410) =>
    history({ health: failingSince(ago(sinceS), status), lastRun: finishedAt(ago(lastS)) });

  it("keeps the wide tick at full rate while the refusal is still young", () => {
    // One 410 can be a proxy having a moment; an hour of staleness is too much to spend on it.
    expect(dueNow(cron(15), NOW, refused(600, 300)).steps).toHaveLength(1);
  });

  it("drops the wide tick to hourly once the refusal has persisted", () => {
    expect(dueNow(cron(15), NOW, refused(3600, 300)).steps).toEqual([]);
    expect(dueNow(cron(30), NOW, refused(3600, 900)).steps).toEqual([]);
  });

  it("never stops probing: the hour's tick still goes", () => {
    const plan = dueNow(cron(15), NOW, refused(7200, 3601));
    expect(plan.steps).toEqual([{ lane: "trailing", trigger: "cron", days: TRAILING_DAYS, allowRemovals: true }]);
  });

  // A 5xx is their bad day, not a door: the probe is what recovers from it, at full rate.
  it.each([500, 502, 504])("leaves the wide tick alone for a run of HTTP %i", (status) => {
    expect(dueNow(cron(15), NOW, refused(7200, 300, status)).steps).toHaveLength(1);
  });

  // 429 and 503 have their own cooldown, which SGC itself names; they must not be pulled
  // into a rule that would ignore Retry-After.
  it.each([429, 503])("leaves HTTP %i to the Retry-After cooldown", (status) => {
    expect(dueNow(cron(15), NOW, refused(7200, 300, status)).steps).toHaveLength(1);
  });

  it("does not slow anything on a failure with no status at all", () => {
    // A timeout, or a run the Worker was killed in the middle of: no door, just silence.
    expect(dueNow(cron(15), NOW, refused(7200, 300, null as unknown as number)).steps).toHaveLength(1);
  });

  // The rule lives once, in this module. The button is the same request from the same
  // address, so letting it through twelve times an hour would undo the back-off.
  it("makes the button wait the same hour, and says how long is left", () => {
    const plan = dueNow(MANUAL, NOW, refused(3600, 600));
    expect(plan.steps).toEqual([]);
    expect(plan.retryAfterS).toBe(3000);
  });

  it("lets the button through once that hour has passed, and holds the claim to it", () => {
    const plan = dueNow(MANUAL, NOW, refused(7200, 3601));
    expect(plan.steps).toEqual([{ lane: "trailing", trigger: "manual", days: TRAILING_DAYS, allowRemovals: true }]);
    expect(plan.minIntervalS).toBe(3600);
  });

  // The fast lane was already down on `lastOk === false`; this must not quietly open it.
  it("keeps the fast lane shut throughout", () => {
    expect(dueNow(cron(5), NOW, refused(7200, 3601)).steps).toEqual([]);
  });
});

describe("the visitor's refresh", () => {
  // The claim inside ingest() is the guard that actually holds; this one is here to answer
  // with a useful retryAfterS instead of a silent stand-down.
  it("stands down while another run is already talking to SGC", () => {
    const plan = dueNow(MANUAL, NOW, history({ inFlight: true }));
    expect(plan.steps).toEqual([]);
    expect(plan.retryAfterS).toBe(5);
  });

  // The throttle counts *any* run, cron included: that number, not the number of people
  // with the page open, is what bounds our load on SGC.
  it("counts down the five minutes since the last run, whoever started it", () => {
    const plan = dueNow(MANUAL, at(120), history({ lastRun: finishedAt(NOW) }));
    expect(plan.steps).toEqual([]);
    expect(plan.retryAfterS).toBe(180);
  });

  it("re-reads the trailing window once the wait has elapsed, and keeps the throttle on the claim", () => {
    const plan = dueNow(MANUAL, at(301), history({ lastRun: finishedAt(NOW) }));
    expect(plan.steps).toEqual([{ lane: "trailing", trigger: "manual", days: 3, allowRemovals: true }]);
    expect(plan.minIntervalS).toBe(300);
  });

  it("loads one missing history chunk per press, without the usual wait", () => {
    const plan = dueNow(MANUAL, at(1), history({ backfill: { done: 2, total: 6 }, lastRun: finishedAt(NOW) }));
    expect(plan.steps).toEqual([{ lane: "sweep" }]);
    expect(plan.minIntervalS).toBeNull();
  });

  // The divergence candidate 02 was opened for: /api/refresh used to open its back-fill fast
  // lane on "the last run succeeded" alone, which ignores the cooldown a 429 or 503 asks for.
  // After a rate limit and a later success it reached SGC with no wait while the cron's own
  // fast lane was standing down. Both now read sgcUnwell, so the button falls back to the
  // ordinary five minutes — the lane is closed, the button is not.
  it("closes the back-fill fast lane during a cooldown, even once SGC is answering again", () => {
    const limited = { ...rateLimited(600), backfill: { done: 2, total: 6 }, lastRun: finishedAt(NOW) };
    expect(limited.health.lastOk).toBe(true); // a later run succeeded: only the cooldown holds

    const during = dueNow(MANUAL, at(1), limited);
    expect(during.steps).toEqual([]);
    expect(during.retryAfterS).toBe(REFRESH_MIN_INTERVAL_S - 1);

    // The wait is all it costs. The sweep is what lets the fast lane back in, so it still runs.
    const after = dueNow(MANUAL, at(301), limited);
    expect(after.steps).toEqual([{ lane: "sweep" }]);
    expect(after.minIntervalS).toBe(REFRESH_MIN_INTERVAL_S);
  });
});
