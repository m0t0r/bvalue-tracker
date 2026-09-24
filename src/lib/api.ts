import type { ZoneId } from "../../core/zones";
import type { StatusResponse, StoredEvent } from "../../worker/api-types";

export type { IngestRun, StatusResponse, StoredEvent } from "../../worker/api-types";

/** A response the Worker answered with an error status, as opposed to a request that never got one. */
export class HttpError extends Error {
  constructor(
    path: string,
    readonly status: number,
  ) {
    super(`${path}: HTTP ${status}`);
  }
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) throw new HttpError(path, res.status);
  return (await res.json()) as T;
}

/**
 * TanStack Query's default of three retries, minus the answers a retry cannot change. A 4xx is
 * the Worker refusing this request — the same-origin check, the rate limit (which asks for 60 s,
 * not the 1, 2 and 4 s the backoff would wait) or a bad parameter — so retrying only delays the
 * error by ~7 s. A network failure or a 5xx may be transient and still gets its retries.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof HttpError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 3;
}

export const getEvents = (zone: ZoneId) => json<StoredEvent[]>(`/api/events?zone=${zone}`);
export const getStatus = (zone: ZoneId) => json<StatusResponse>(`/api/status?zone=${zone}`);
export const postRefresh = (zone: ZoneId) => json<StatusResponse>(`/api/refresh?zone=${zone}`, { method: "POST" });
