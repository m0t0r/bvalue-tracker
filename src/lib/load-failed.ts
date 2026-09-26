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
