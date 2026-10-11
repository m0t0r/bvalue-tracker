import { describe, expect, it, vi } from "vitest";
import type { IngestRun, StatusResponse } from "@/lib/api";
import { SGC_REQUEST_GAP_S } from "../../worker/plan.ts";
import { IN_FLIGHT_WAIT_MAX_S, MAX_SYNC_STEPS, MAX_SYNC_WAITS, syncZone } from "./sync";

const GAP_MS = SGC_REQUEST_GAP_S * 1000;

const run = (ok: boolean): IngestRun => ({
  id: 1,
  startedAt: "2026-10-11T12:00:00.000Z",
  finishedAt: "2026-10-11T12:00:02.000Z",
  trigger: "sweep",
  windowStart: "2026-10-01T00:00:00.000Z",
  windowEnd: "2026-10-02T00:00:00.000Z",
  ok,
  fetched: 10,
  inserted: 10,
  updated: 0,
  removed: 0,
  error: ok ? null : "SGC answered HTTP 503",
});

/** A Worker answer: `done` of 22 chunks, whether it reached SGC, and how it went. */
const answer = (done: number, over: Partial<StatusResponse> = {}): StatusResponse => ({
  totalEvents: 600,
  newestEvent: null,
  lastRun: run(true),
  lastSuccessfulRun: run(true),
  backfill: { done, total: 22, gaps: 0 },
  syncedThrough: "2026-10-11T12:00:02.000Z",
  refreshed: true,
  ...over,
});

/** Drives `syncZone` against a scripted list of answers, and records what it did. */
async function press(pending: number, answers: StatusResponse[]) {
  const queue = [...answers];
  const posts: boolean[] = [];
  const steps: string[] = [];
  const waits: number[] = [];
  const out = await syncZone(pending, {
    post: async (first) => {
      posts.push(first);
      const next = queue.shift();
      if (next === undefined) throw new Error("asked once too often");
      return next;
    },
    answer: vi.fn(),
    step: (i, n) => steps.push(`${i}/${n}`),
    sleep: async (ms) => void waits.push(ms),
  });
  return { ...out, posts, steps, waits };
}

describe("one press of Sincronizar ahora", () => {
  it("is one request once the zone is caught up, and asks for USGS and the sea on it", async () => {
    const r = await press(0, [answer(22)]);
    expect(r.posts).toEqual([true]);
    expect(r.steps).toEqual([]);
    expect(r.progressed).toBe(true);
  });

  it("catches up one chunk per request, saying which, and asks for the context on the first only", async () => {
    const r = await press(3, [answer(20), answer(21), answer(22)]);
    expect(r.posts).toEqual([true, false, false]);
    expect(r.steps).toEqual(["1/3", "2/3", "3/3"]);
    expect(r.res.backfill.done).toBe(22);
  });

  // A day can roll over mid-press, or the press can start from a status a poll behind: the count grows
  // rather than running past its own end.
  it("grows the count when the Worker reports more missing than the page knew of", async () => {
    const r = await press(1, [answer(19), answer(20), answer(21), answer(22)]);
    expect(r.steps).toEqual(["1/1", "2/4", "3/4", "4/4"]);
  });

  it(`stops at ${MAX_SYNC_STEPS} requests however much is missing`, async () => {
    const answers = Array.from({ length: MAX_SYNC_STEPS + 5 }, () =>
      answer(0, { backfill: { done: 0, total: 99, gaps: 0 } }),
    );
    const r = await press(99, answers);
    expect(r.posts).toHaveLength(MAX_SYNC_STEPS);
    expect(r.progressed).toBe(true);
  });

  // SGC failing is a 200 with a failed run: asking again at once would only add to it.
  it("stops at the first failed run", async () => {
    const r = await press(5, [answer(18), answer(18, { lastRun: run(false) }), answer(19)]);
    expect(r.posts).toHaveLength(2);
    expect(r.res.lastRun?.ok).toBe(false);
  });

  it("waits out another reader's run in flight, then goes on", async () => {
    const r = await press(2, [answer(20, { refreshed: false, retryAfterS: 5 }), answer(21), answer(22)]);
    expect(r.waits).toEqual([5000, GAP_MS]);
    expect(r.posts).toHaveLength(3);
    expect(r.progressed).toBe(true);
  });

  // Never parallel, and not back to back either: the Worker holds the same gap, so pacing here only
  // spares it the stand-downs (owner's request, 2026-10-11).
  it("waits the gap between requests before every chunk after the first", async () => {
    const r = await press(3, [answer(20), answer(21), answer(22)]);
    expect(r.waits).toEqual([GAP_MS, GAP_MS]);
  });

  it("counts only chunks against the cap, not the stand-downs it waits out", async () => {
    const short = answer(0, { refreshed: false, retryAfterS: 5, backfill: { done: 0, total: 99, gaps: 0 } });
    const chunk = answer(0, { backfill: { done: 0, total: 99, gaps: 0 } });
    const answers = [chunk, short, ...Array.from({ length: MAX_SYNC_STEPS + 5 }, () => chunk)];
    const r = await press(99, answers);
    expect(r.posts).toHaveLength(MAX_SYNC_STEPS + 1);
  });

  it(`gives up after ${MAX_SYNC_WAITS} stand-downs: another reader is syncing too`, async () => {
    const short = answer(20, { refreshed: false, retryAfterS: 5 });
    const r = await press(
      2,
      Array.from({ length: MAX_SYNC_WAITS + 5 }, () => short),
    );
    expect(r.posts).toHaveLength(MAX_SYNC_WAITS + 1);
    expect(r.progressed).toBe(false);
  });

  // The throttle, a refusal's hour or a 429's cooldown: the press ends and the line gives the wait.
  it("ends on any longer wait, without sleeping through it", async () => {
    const r = await press(0, [answer(22, { refreshed: false, retryAfterS: IN_FLIGHT_WAIT_MAX_S + 1 })]);
    expect(r.posts).toHaveLength(1);
    expect(r.waits).toEqual([]);
    expect(r.progressed).toBe(false);
  });

  it("still says it reached SGC when a cooldown turns it away part-way", async () => {
    const r = await press(4, [answer(19), answer(19, { refreshed: false, retryAfterS: 1800 })]);
    expect(r.progressed).toBe(true);
    expect(r.res.refreshed).toBe(false);
  });
});
