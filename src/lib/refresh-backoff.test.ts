import { describe, expect, it } from "vitest";
import { recordFailure, retryAt } from "./refresh-backoff";

/**
 * The waits a reader meets who presses as soon as the button lets them and fails every time, as the
 * status bar keeps them: each failure recorded with `recordFailure`, the button resting until `retryAt`.
 */
function pressThroughOutage(presses: number) {
  let failures: number[] = [];
  let at = 1_000;
  const waits: number[] = [];
  for (let i = 0; i < presses; i++) {
    failures = recordFailure(failures, at);
    const until = retryAt(failures)!;
    waits.push(until - at);
    at = until;
  }
  return { waits, failures };
}

describe("the wait after a failed press", () => {
  it("doubles from 5 s with each failure in a row", () => {
    expect(pressThroughOutage(4).waits).toEqual([5_000, 10_000, 20_000, 40_000]);
  });

  it("stops at a minute, the status poll's own interval, however many fail in a row", () => {
    expect(pressThroughOutage(12).waits.slice(4)).toEqual(Array(8).fill(60_000));
  });

  // The status bar holds the list in state for as long as the tab is open.
  it("remembers no more failures than it takes to reach the longest wait", () => {
    // The fifth failure in a row is the first to wait the full minute.
    expect(pressThroughOutage(40).failures).toHaveLength(pressThroughOutage(5).failures.length);
  });
});

describe("retryAt", () => {
  it("is null before any press has failed", () => {
    expect(retryAt([])).toBeNull();
  });

  it("is the last failure plus the wait for how many there have been in a row", () => {
    expect(retryAt([1_000])).toBe(6_000);
    expect(retryAt([1_000, 7_000, 18_000])).toBe(38_000);
  });

  // A status answer is not counted: GET /api/status can answer from D1 while POST /api/refresh fails
  // (code review, 2026-09-29). What ends a run of failures is time: a press more than two minutes
  // after the last failure starts again from 5 s, so a tab left open overnight does not.
  it("starts a new run after two quiet minutes", () => {
    expect(retryAt([1_000, 7_000, 7_000 + 120_001])).toBe(7_000 + 120_001 + 5_000);
    expect(retryAt([1_000, 7_000, 7_000 + 120_000])).toBe(7_000 + 120_000 + 20_000);
  });
});
