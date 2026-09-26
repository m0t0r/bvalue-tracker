import { describe, expect, it } from "vitest";
import { loadError, loadFailed, retrying } from "./load-failed";

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
