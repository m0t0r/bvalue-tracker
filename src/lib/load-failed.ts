/**
 * Whether the page should show its load error for a query: it has failed at least once and has
 * never had data. Not `isError`: TanStack Query puts a query with no data back to `pending` for a
 * retry, so the alert would vanish into the skeleton for the whole backoff. `errorUpdatedAt`
 * survives the retry. A query with data keeps showing it when a refetch fails (docs/frontend.md).
 */
export function loadFailed(query: { data: unknown; errorUpdatedAt: number }): boolean {
  return query.data === undefined && query.errorUpdatedAt > 0;
}

/** What went wrong, for the technical detail. A retry clears `error` to null for its whole backoff. */
export function loadError(query: { error: unknown; failureReason: unknown }): unknown {
  return query.error ?? query.failureReason;
}

/**
 * Whether a retry the reader asked for is under way. Offline, TanStack Query parks the request
 * (`paused`) instead of sending it, and `isFetching` stays false: the press would look ignored.
 */
export function retrying(query: { fetchStatus: "fetching" | "paused" | "idle" }): boolean {
  return query.fetchStatus !== "idle";
}

/**
 * When the oldest data on screen was fetched, if a refetch over it has failed (or waits offline),
 * else null. A failed refetch keeps what the page shows (`loadFailed`), and this is what says so:
 * without it the page kept saying it updates itself while nothing reached it (docs/frontend.md).
 * `status` turns to `error` only after the query's retries, so a single dropped request never shows.
 */
export function staleSince(
  queries: {
    data: unknown;
    dataUpdatedAt: number;
    status: "pending" | "error" | "success";
    fetchStatus: "fetching" | "paused" | "idle";
  }[],
): number | null {
  const behind = queries.filter((q) => q.data !== undefined && (q.status === "error" || q.fetchStatus === "paused"));
  return behind.length === 0 ? null : Math.min(...behind.map((q) => q.dataUpdatedAt));
}
