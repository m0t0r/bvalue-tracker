import { describe, expect, it } from "vitest";
import { loadError, loadFailed, retryAttempt, retrying, staleSince } from "./load-failed";

const q = { data: undefined, errorUpdatedAt: 0, error: null, failureReason: null, fetchStatus: "idle" as const };

describe("loadFailed", () => {
  it("is false before any answer", () => {
    expect(loadFailed(q)).toBe(false);
  });
  // TanStack Query puts a query with no data back to `pending` for a retry, clearing `isError`;
  // the error's timestamp is what survives, so the alert and its "Reintentando…" stay up.
  it("is true once a load with no data has failed, and while it is retried", () => {
    expect(loadFailed({ ...q, errorUpdatedAt: 1 })).toBe(true);
  });
  it("is false when data is on screen, even if a refetch failed", () => {
    expect(loadFailed({ ...q, data: [], errorUpdatedAt: 1 })).toBe(false);
  });
});

describe("loadError", () => {
  const boom = new Error("HTTP 503");
  it("is the query's error", () => {
    expect(loadError({ ...q, error: boom })).toBe(boom);
  });
  // A retry clears `error` to null for its whole backoff; the detail would read "null".
  it("falls back to the failure the running retry holds", () => {
    expect(loadError({ ...q, failureReason: boom })).toBe(boom);
  });
});

describe("retrying", () => {
  it("is true while the retry fetches", () => {
    expect(retrying({ ...q, fetchStatus: "fetching" })).toBe(true);
  });
  // Offline, TanStack parks the request instead of sending it: the press still took.
  it("is true while the retry waits for the network", () => {
    expect(retrying({ ...q, fetchStatus: "paused" })).toBe(true);
  });
  it("is false when nothing runs", () => {
    expect(retrying(q)).toBe(false);
  });
});

describe("staleSince", () => {
  const ok = { data: [], dataUpdatedAt: 1_000, status: "success" as const, fetchStatus: "idle" as const };
  it("is null while every query is current", () => {
    expect(staleSince([ok, { ...ok, dataUpdatedAt: 2_000 }])).toBeNull();
  });
  // TanStack keeps the data and moves the query to `error` only once its retries are spent, so one
  // dropped request does not flash the notice.
  it("dates the data once a refetch over it has failed", () => {
    expect(staleSince([ok, { ...ok, dataUpdatedAt: 2_000, status: "error" }])).toBe(2_000);
  });
  // Offline, the refetch is parked and never fails: the data is just as old.
  it("dates the data while a refetch waits for the network", () => {
    expect(staleSince([{ ...ok, fetchStatus: "paused" }])).toBe(1_000);
  });
  it("gives the oldest data on screen when several are behind", () => {
    const behind = { ...ok, status: "error" as const };
    expect(
      staleSince([
        { ...behind, dataUpdatedAt: 3_000 },
        { ...behind, dataUpdatedAt: 2_000 },
      ]),
    ).toBe(2_000);
  });
  // A catalogue the page never got is the load error's, not this notice's.
  it("ignores a query with no data", () => {
    expect(staleSince([{ ...ok, data: undefined, dataUpdatedAt: 0, status: "error" }])).toBeNull();
  });
});

describe("retryAttempt", () => {
  const first = { data: undefined, failureCount: 0, errorUpdatedAt: 0 };
  it("is null while the first attempt is out", () => {
    expect(retryAttempt(first)).toBeNull();
  });
  // The page says so from the first failed request rather than after the whole backoff (~7 s).
  it("is the attempt under way once one has failed", () => {
    expect(retryAttempt({ ...first, failureCount: 1 })).toBe(2);
    expect(retryAttempt({ ...first, failureCount: 3 })).toBe(4);
  });
  // After the retries the load error takes over, and its own "Reintentar" says it is at work.
  it("is null once the load has failed for good", () => {
    expect(retryAttempt({ ...first, failureCount: 1, errorUpdatedAt: 1 })).toBeNull();
  });
  it("is null with data on screen", () => {
    expect(retryAttempt({ ...first, data: [], failureCount: 1 })).toBeNull();
  });
});
