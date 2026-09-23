import { describe, expect, it } from "vitest";
import type { IngestRun } from "../api-types.ts";
import {
  CADENCE,
  dueNow,
  REFRESH_MIN_INTERVAL_S,
  TRAILING_DAYS,
  type IngestHistory,
  type IngestPlan,
  type SgcHealth,
} from "../plan.ts";

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

/** A healthy, idle history with the back-fill finished: the ordinary case. */
const history = (over: Partial<IngestHistory> = {}): IngestHistory => ({
  health: healthy(),
  inFlight: false,
  lastSent: null,
  lastRun: null,
  backfill: { done: 6, total: 6 },
  ...over,
});

const NOW = new Date("2026-09-19T12:05:00Z");
const cron = (minute: number) => ({ kind: "cron" as const, scheduledTime: Date.UTC(2026, 8, 19, 12, minute) });
const MANUAL = { kind: "manual" } as const;

/** A finished, successful run — all the plan reads of it is when it ended. */
const finishedAt = (d: Date): IngestRun => ({
  id: 1,
  startedAt: d.toISOString(),
  finishedAt: d.toISOString(),
  trigger: "cron",
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
  history({ health: healthy({ rateLimit: { finishedAt: NOW.toISOString(), retryAfterS } }) });

describe("cron lanes", () => {
  it("gives the fast lane one trailing day and never lets it retire an event", () => {
    expect(dueNow(cron(15), NOW, history()).steps).toEqual([
      { lane: "fast", trigger: "cron", days: 1, allowRemovals: false },
    ]);
  });

  // An HTTP status is no weaker a signal than a timeout, so both wait for a success.
  it("stands the fast lane down while the last finished run failed", () => {
    expect(
      dueNow(
        cron(15),
        NOW,
        history({ health: healthy({ lastOk: false, failing: { since: NOW.toISOString(), status: 500 } }) }),
      ).steps,
    ).toEqual([]);
  });

  // Being answered again is not being welcome again: the cooldown outlives the recovery,
  // which is also the only way to observe it — until a run succeeds the rule above applies.
  it("keeps the fast lane down for Retry-After after a 429, then lets it back in", () => {
    const limited = rateLimited(600);
    expect(dueNow(cron(15), at(599), limited).steps).toEqual([]);
    expect(dueNow(cron(15), at(601), limited).steps).toHaveLength(1);
  });

  it("runs the fast lane when no run has ever finished", () => {
    expect(dueNow(cron(15), NOW, history({ health: healthy({ lastOk: null }) })).steps).toHaveLength(1);
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
    expect(dueNow(cron(15), at(waitS - 1), limited).steps).toEqual([]);
    expect(dueNow(cron(15), at(waitS + 1), limited).steps).toHaveLength(1);
  });

  it("gives the wide tick three trailing days, with removals", () => {
    expect(dueNow(cron(30), NOW, history()).steps).toEqual([
      { lane: "wide", trigger: "cron", days: 3, allowRemovals: true },
    ]);
  });

  // The wide tick is what probes SGC while the fast lane waits, so it is what lets it back in.
  it("keeps the wide tick running while the fast lane is standing down", () => {
    expect(
      dueNow(
        cron(30),
        NOW,
        history({ health: healthy({ lastOk: false, failing: { since: NOW.toISOString(), status: 500 } }) }),
      ).steps,
    ).toHaveLength(1);
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
    const early = { kind: "cron" as const, scheduledTime: Date.UTC(2026, 8, 19, 12, 30) - 100 };
    expect(dueNow(early, NOW, history()).steps).toEqual([
      { lane: "wide", trigger: "cron", days: 3, allowRemovals: true },
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
  describe.each([0, 45, 449, -449])("dispatched %i s from the tick", (offsetS) => {
    const MINUTES = [0, 15, 30, 45];
    const plansFor = (h: IngestHistory) =>
      MINUTES.map((m) =>
        dueNow({ kind: "cron", scheduledTime: Date.UTC(2026, 8, 19, 12, m) + offsetS * 1000 }, NOW, h),
      );
    const isWide = (p: IngestPlan) => p.steps.some((s) => s.lane === "wide" && s.days === TRAILING_DAYS);
    const hasSweep = (p: IngestPlan) => p.steps.some((s) => s.lane === "sweep");

    it("alternates wide and narrow, and sweeps on the hour", () => {
      const hour = plansFor(history());
      expect(hour.map(isWide)).toEqual([true, false, true, false]);
      expect(hour.filter(hasSweep)).toHaveLength(1);
      expect(hasSweep(hour[0]!)).toBe(true);
    });

    // The one that turned a 410 from a blip into an outage with no way out: with every tick
    // on the fast lane, the first failure stood down the only lane there was.
    it("leaves lanes an hour that probe SGC while the fast lane is standing down", () => {
      const ill = plansFor(
        history({ health: healthy({ lastOk: false, failing: { since: NOW.toISOString(), status: 500 } }) }),
      );
      expect(ill.filter((p) => p.steps.length > 0)).toHaveLength(2);
    });

    /**
     * The budget, as a number rather than a paragraph in docs/sgc-data-source.md. Three constants decide
     * it — the cron in wrangler.jsonc, TICK_MS, and WIDE_TICK_EVERY_MIN — and when they
     * disagreed the hour quietly became twelve requests with no removals and no sweep for a
     * day. This counts what an hour of ticks actually sends: 4 trailing + 1 sweep = 120/day,
     * which is the figure the documented budget is derived from.
     *
     * Split by lane rather than counting "not the sweep": the day that went wrong had the
     * right *number* of requests and the wrong lanes, so a total alone would have passed.
     */
    it("sends five requests an hour, which is the budget the docs quote", () => {
      const sent = plansFor(history()).flatMap((p) => p.steps);
      expect(sent).toHaveLength(5);
      expect(sent.filter((s) => s.lane === "sweep")).toHaveLength(1);
      expect(sent.filter((s) => s.lane === "wide")).toHaveLength(2);
      expect(sent.filter((s) => s.lane === "fast")).toHaveLength(2);
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
  /** Refused since `sinceS` ago, last asked `lastS` ago — by this zone, as the only one asking. */
  const refused = (sinceS: number, lastS: number, status = 410) =>
    history({
      health: failingSince(ago(sinceS), status),
      lastSent: ago(lastS).toISOString(),
      lastRun: finishedAt(ago(lastS)),
    });

  it("keeps the wide tick at full rate while the refusal is still young", () => {
    // One 410 can be a proxy having a moment; an hour of staleness is too much to spend on it.
    expect(dueNow(cron(30), NOW, refused(600, 300)).steps).toHaveLength(1);
  });

  /**
   * The grace period read as a timeline, because reading it as a number hid a 90-minute
   * freeze. One 410 lands on a wide tick and nothing runs after it, so `failing.since` and
   * `lastRun` both stay at that instant while the ticks go by. What must not happen is what
   * happened with `REFUSAL_GRACE_S` written as a literal 1800 against 30-minute ticks: the
   * next wide tick landed exactly *on* the boundary, `sgcRefusing` was already true, the
   * hourly wait started immediately, and a run duration pushed the probe past the following
   * tick as well — first contact at +90, from a single transient answer.
   */
  it("lets the next wide tick through after a single 410, and probes hourly after that", () => {
    const T = Date.UTC(2026, 8, 19, 12, 0);
    const oneFailure = history({
      health: failingSince(new Date(T), 410),
      lastSent: new Date(T).toISOString(),
      lastRun: { ...finishedAt(new Date(T)), ok: false },
    });
    const at = (min: number) =>
      dueNow({ kind: "cron", scheduledTime: T + min * 60_000 }, new Date(T + min * 60_000), oneFailure).steps.length >
      0;

    expect(at(15)).toBe(false); // narrow lane: down on the failure alone, as it always was
    expect(at(30)).toBe(true); // the wide tick still goes — this is the grace
    expect(at(45)).toBe(false);
    expect(at(60)).toBe(true); // refusal believed from +60; the hourly probe lands on its tick
  });

  it("drops the wide tick to hourly once the refusal has persisted", () => {
    expect(dueNow(cron(30), NOW, refused(3600, 300)).steps).toEqual([]);
    expect(dueNow(cron(30), NOW, refused(3600, 900)).steps).toEqual([]);
  });

  it("never stops probing: the hour's tick still goes", () => {
    const plan = dueNow(cron(30), NOW, refused(7200, 3601));
    expect(plan.steps).toEqual([{ lane: "wide", trigger: "cron", days: TRAILING_DAYS, allowRemovals: true }]);
  });

  // A 5xx is their bad day, not a door: the probe is what recovers from it, at full rate.
  it.each([500, 502, 504])("leaves the wide tick alone for a run of HTTP %i", (status) => {
    expect(dueNow(cron(30), NOW, refused(7200, 300, status)).steps).toHaveLength(1);
  });

  // 429 and 503 have their own cooldown, which SGC itself names; they must not be pulled
  // into a rule that would ignore Retry-After.
  it.each([429, 503])("leaves HTTP %i to the Retry-After cooldown", (status) => {
    expect(dueNow(cron(30), NOW, refused(7200, 300, status)).steps).toHaveLength(1);
  });

  it("does not slow anything on a failure with no status at all", () => {
    // A timeout, or a run the Worker was killed in the middle of: no door, just silence.
    expect(dueNow(cron(30), NOW, refused(7200, 300, null as unknown as number)).steps).toHaveLength(1);
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
    expect(plan.steps).toEqual([{ lane: "wide", trigger: "manual", days: TRAILING_DAYS, allowRemovals: true }]);
    expect(plan.minIntervalS).toBe(3600);
  });

  // The fast lane was already down on `lastOk === false`; this must not quietly open it.
  it("keeps the fast lane shut throughout", () => {
    expect(dueNow(cron(15), NOW, refused(7200, 3601)).steps).toEqual([]);
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
  // Written off REFRESH_MIN_INTERVAL_S, not off the number it happens to hold: the throttle
  // is tied to the cron's period and has moved once already.
  it("counts down the throttle since the last run, whoever started it", () => {
    const plan = dueNow(MANUAL, at(120), history({ lastRun: finishedAt(NOW) }));
    expect(plan.steps).toEqual([]);
    expect(plan.retryAfterS).toBe(REFRESH_MIN_INTERVAL_S - 120);
  });

  it("re-reads the trailing window once the wait has elapsed, and keeps the throttle on the claim", () => {
    const plan = dueNow(MANUAL, at(REFRESH_MIN_INTERVAL_S + 1), history({ lastRun: finishedAt(NOW) }));
    expect(plan.steps).toEqual([{ lane: "wide", trigger: "manual", days: 3, allowRemovals: true }]);
    expect(plan.minIntervalS).toBe(REFRESH_MIN_INTERVAL_S);
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
    // The cooldown has to outlast the throttle, or the second half below measures the
    // throttle expiring rather than the cooldown still holding the fast lane shut.
    const limited = {
      ...rateLimited(REFRESH_MIN_INTERVAL_S * 4),
      backfill: { done: 2, total: 6 },
      lastRun: finishedAt(NOW),
    };
    expect(limited.health.lastOk).toBe(true); // a later run succeeded: only the cooldown holds

    const during = dueNow(MANUAL, at(1), limited);
    expect(during.steps).toEqual([]);
    expect(during.retryAfterS).toBe(REFRESH_MIN_INTERVAL_S - 1);

    // The wait is all it costs. The sweep is what lets the fast lane back in, so it still runs.
    const after = dueNow(MANUAL, at(REFRESH_MIN_INTERVAL_S + 1), limited);
    expect(after.steps).toEqual([{ lane: "sweep" }]);
    expect(after.minIntervalS).toBe(REFRESH_MIN_INTERVAL_S);
  });
});

/**
 * The second zone. Chaparral runs on the wide ticks only, so adding it costs two trailing
 * requests and one sweep an hour instead of five: SGC refused us on 2026-09-20 after ~20 hours
 * at twelve an hour, and two zones on every lane would have put us back at ten.
 */
describe("the Tolima zone", () => {
  const tolima = (caller: Parameters<typeof dueNow>[0], h = history(), now = NOW) => dueNow(caller, now, h, "tolima");

  it("sits out the ticks between the wide ones", () => {
    expect(tolima(cron(15)).steps).toEqual([]);
    expect(tolima(cron(45)).steps).toEqual([]);
  });

  // A swarm's day holds far more than the ten events MAX_REMOVAL_SHARE needs to engage, which
  // is the only reason the fast lane may not retire anything.
  it("re-reads one trailing day on the wide tick, with removals", () => {
    expect(tolima(cron(30)).steps).toEqual([{ lane: "wide", trigger: "cron", days: 1, allowRemovals: true }]);
  });

  it("sweeps on the hour, like Chocó", () => {
    expect(tolima(cron(0)).steps.at(-1)).toEqual({ lane: "sweep" });
  });

  describe.each([0, 45, 449, -449])("dispatched %i s from the tick", (offsetS) => {
    const hour = (zone: "choco" | "tolima") =>
      [0, 15, 30, 45].flatMap(
        (m) =>
          dueNow({ kind: "cron", scheduledTime: Date.UTC(2026, 8, 19, 12, m) + offsetS * 1000 }, NOW, history(), zone)
            .steps,
      );

    // The budget docs/sgc-data-source.md quotes: 5 + 3 = 8 requests an hour, ~192 a day.
    it("sends three requests an hour, and the two zones eight", () => {
      expect(hour("tolima")).toHaveLength(3);
      expect(hour("tolima").filter((s) => s.lane === "sweep")).toHaveLength(1);
      expect(hour("choco").length + hour("tolima").length).toBe(8);
    });
  });

  // Its throttle is its own period, so a press lands on a run that was happening anyway.
  it("holds the button to its own thirty minutes, counted from its own last run", () => {
    const wait = CADENCE.tolima.refreshMinIntervalS;
    expect(wait).toBe(1800);
    const h = history({ lastRun: finishedAt(NOW), lastSent: NOW.toISOString() });
    expect(tolima(MANUAL, h, at(wait - 60)).retryAfterS).toBe(60);
    expect(tolima(MANUAL, h, at(wait + 1)).steps).toEqual([
      { lane: "wide", trigger: "manual", days: 1, allowRemovals: true },
    ]);
  });

  /**
   * Both zones probed the tick the refusal was still in its grace, Chaparral seconds after Chocó,
   * so the newest request is a few seconds past the tick. Counted exactly, the next hour's probe
   * then lands seconds short of 3600 and stands down, and the first contact slips to +120 — the
   * 90-minute freeze the single-zone timeline above guards against, back through the second zone.
   */
  it("still probes on the hour when the other zone's request left seconds after the tick", () => {
    const T = Date.UTC(2026, 8, 19, 12, 0);
    const bothProbed = history({
      health: failingSince(new Date(T), 410),
      lastSent: new Date(T + 30 * 60_000 + 8_000).toISOString(),
      lastRun: { ...finishedAt(new Date(T + 30 * 60_000)), ok: false },
    });
    const at = (min: number) =>
      dueNow({ kind: "cron", scheduledTime: T + min * 60_000 }, new Date(T + min * 60_000), bothProbed).steps.length >
      0;
    expect(at(60)).toBe(false);
    expect(at(90)).toBe(true);
  });

  // Another zone having just run says nothing about how fresh this catalogue is.
  it("does not stand the button down because the other zone ran a moment ago", () => {
    const h = history({ lastRun: finishedAt(at(-3600)), lastSent: at(-60).toISOString() });
    expect(tolima(MANUAL, h).steps).toHaveLength(1);
  });

  // But SGC is one door: while it refuses us, one knock an hour is the whole budget, whoever
  // knocked. Chocó's probe at the top of the hour stands Chaparral's down.
  it("counts the refusal's hour from the last request of any zone", () => {
    const refused = history({
      health: failingSince(at(-7200), 410),
      lastSent: at(-60).toISOString(),
      lastRun: finishedAt(at(-3700)),
    });
    expect(tolima(cron(30), refused).steps).toEqual([]);
    expect(tolima(MANUAL, refused).steps).toEqual([]);
  });
});
