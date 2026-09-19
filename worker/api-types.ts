import type { SeismicEvent } from "../core/types.ts";

export interface StoredEvent extends SeismicEvent {
  firstSeenAt: string;
  updatedAt: string;
  removedAt: string | null;
}

export interface IngestRun {
  id: number;
  startedAt: string;
  finishedAt: string | null;
  trigger: "cron" | "sweep" | "manual";
  windowStart: string;
  windowEnd: string;
  ok: boolean;
  fetched: number | null;
  inserted: number | null;
  updated: number | null;
  removed: number | null;
  error: string | null;
}

export interface StatusResponse {
  totalEvents: number;
  newestEventTime: string | null;
  lastRun: IngestRun | null;
  lastSuccessfulRun: IngestRun | null;
  /** 7-day history chunks loaded so far. Statistics are not representative until done === total. */
  backfill: { done: number; total: number };
  /** Present on POST /api/refresh: whether SGC was actually queried. */
  refreshed?: boolean;
  /** Seconds until a manual refresh will query SGC again. */
  retryAfterS?: number;
}
