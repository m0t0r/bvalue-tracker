import { describe, expect, it } from "vitest";
import { cooldownMs, recordFailure, retryAt } from "./refresh-backoff";

describe("cooldownMs", () => {
  it("is nothing before a press has failed", () => {
    expect(cooldownMs(0)).toBe(0);
  });

  it("doubles from 5 s with each failure in a row", () => {
    expect([1, 2, 3, 4].map(cooldownMs)).toEqual([5_000, 10_000, 20_000, 40_000]);
  });

  it("stops at a minute, the status poll's own interval", () => {
    expect(cooldownMs(5)).toBe(60_000);
    expect(cooldownMs(50)).toBe(60_000);
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

describe("recordFailure", () => {
  it("adds the failure's time", () => {
    expect(recordFailure([], 42)).toEqual([42]);
  });

  // The wait stops growing at the fifth failure, so no more are ever needed.
  it("keeps the last five", () => {
    expect(recordFailure([1, 2, 3, 4, 5], 6)).toEqual([2, 3, 4, 5, 6]);
  });
});
