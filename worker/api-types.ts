import type { SeismicEvent } from "../core/types.ts";
import type { ZoneId } from "../core/zones.ts";

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
  /** The same event's id, so the page can link its time to SGC's own page for it. */
  newestEventId: string | null;
  lastRun: IngestRun | null;
  lastSuccessfulRun: IngestRun | null;
  /** 7-day history chunks loaded so far. Statistics are not representative until done === total. */
  backfill: { done: number; total: number };
  /** Present on POST /api/refresh: whether SGC was actually queried. */
  refreshed?: boolean;
  /** Seconds until a manual refresh will query SGC again. */
  retryAfterS?: number;
}

/** One zone's line in `GET /api/health`. */
export interface ZoneHealth {
  totalEvents: number;
  /** Seconds since this zone's ingest last succeeded. null when it never has. */
  ingestAgeS: number | null;
  /** Whether this zone's most recent finished run succeeded. null when none has. */
  lastRunOk: boolean | null;
}

/** `GET /api/health`: open to anyone, and carrying no catalogue data. */
export interface HealthResponse {
  ok: true;
  totalEvents: number;
  /** The stalest zone's `ingestAgeS`, and null while any zone has never succeeded. */
  ingestAgeS: number | null;
  lastRunOk: boolean | null;
  zones: Record<ZoneId, ZoneHealth>;
}
