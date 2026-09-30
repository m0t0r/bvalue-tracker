import { contextPath, eventsPath, statusPath } from "../../core/page-data";
import type { ZoneId } from "../../core/zones";
import { remember } from "./local-first";
import { whenActivated } from "./prerender";
import type { ContextResponse, SeaForecast, StatusResponse, StoredEvent } from "../../worker/api-types";

export type { ContextResponse, IngestRun, StatusResponse, StoredEvent } from "../../worker/api-types";

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
  // PROTOTYPE: keep the answer for the next page load (`local-first.ts`).
  const text = await res.text();
  if (!init) remember(path, text);
  return JSON.parse(text) as T;
}

/** PROTOTYPE: any GET by path, for the monitor's warm-up of what /insights needs. */
export const getPath = (path: string) => json<unknown>(path);

/**
 * TanStack Query's default of three retries, minus the answers a retry cannot change. A 4xx is
 * the Worker refusing this request — the same-origin check, the rate limit (which asks for 60 s,
 * not the 1, 2 and 4 s the backoff would wait) or a bad parameter — so retrying only delays the
 * error by ~7 s. A network failure or a 5xx may be transient and still gets its retries.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof HttpError && error.status >= 400 && error.status < 500) return false;
  return failureCount < MAX_RETRIES;
}

/** Retries after the first attempt; the page counts attempts out of `MAX_RETRIES + 1`. */
export const MAX_RETRIES = 3;

// The paths come from `core/page-data.ts`, which also writes the pages' preload tags: a preloaded
// response is handed over only to a request for exactly the same URL.
export const getEvents = (zone: ZoneId) => json<StoredEvent[]>(eventsPath(zone));
export const getContext = (zone: ZoneId) => json<ContextResponse>(contextPath(zone));
export const getStatus = (zone: ZoneId) => json<StatusResponse>(statusPath(zone));
/** The 3D block's sea-state forecast; null before the daily job's first run. Not preloaded: only the 3D tab asks. */
export const getSea = () => json<SeaForecast | null>("/api/sea");
/**
 * The one request that reaches SGC. From a prerendered page it waits until the reader opens it, whoever
 * asks: the reader may have pressed the link and slid off it (`src/lib/prerender.ts`).
 */
export const postRefresh = async (zone: ZoneId) => {
  await whenActivated();
  return json<StatusResponse>(`/api/refresh?zone=${zone}`, { method: "POST" });
};
