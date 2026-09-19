import { describe, expect, it } from "vitest";
import type { IngestRun } from "../api-types.ts";
import { dueNow, REFRESH_MIN_INTERVAL_S, type IngestHistory } from "../plan.ts";

/** A healthy, idle history with the back-fill finished: the ordinary case. */
const history = (over: Partial<IngestHistory> = {}): IngestHistory => ({
  health: { lastOk: true, rateLimit: null },
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
  history({ health: { lastOk: true, rateLimit: { finishedAt: NOW.toISOString(), retryAfterS } } });

describe("cron lanes", () => {
  it("gives the fast lane one trailing day and never lets it retire an event", () => {
    expect(dueNow(cron(5), NOW, history()).steps).toEqual([
      { lane: "trailing", trigger: "cron", days: 1, allowRemovals: false },
    ]);
  });

  // An HTTP status is no weaker a signal than a timeout, so both wait for a success.
  it("stands the fast lane down while the last finished run failed", () => {
    expect(dueNow(cron(5), NOW, history({ health: { lastOk: false, rateLimit: null } })).steps).toEqual([]);
  });

  // Being answered again is not being welcome again: the cooldown outlives the recovery,
  // which is also the only way to observe it — until a run succeeds the rule above applies.
  it("keeps the fast lane down for Retry-After after a 429, then lets it back in", () => {
    const limited = rateLimited(600);
    expect(dueNow(cron(5), at(599), limited).steps).toEqual([]);
    expect(dueNow(cron(5), at(601), limited).steps).toHaveLength(1);
  });

  it("runs the fast lane when no run has ever finished", () => {
    expect(dueNow(cron(5), NOW, history({ health: { lastOk: null, rateLimit: null } })).steps).toHaveLength(1);
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
    expect(dueNow(cron(15), NOW, history({ health: { lastOk: false, rateLimit: null } })).steps).toHaveLength(1);
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
