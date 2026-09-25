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

/** USGS "Did You Feel It?" for the zone's mainshock: what people reported. */
export interface DyfiDigest {
  /** Every response USGS has for the event, anywhere. */
  responses: number;
  /** The 10 km cell that contains Pereira, as DYFI names it; null when nobody in it has answered. */
  pereira: { cell: string; placeName: string; cdi: number; responses: number } | null;
}

/** USGS PAGER for the zone's mainshock: the shaking its model estimates, not what people reported. */
export interface PagerDigest {
  /** PAGER's own city nearest Pereira's point, with its modelled intensity (MMI); null when none is close. */
  pereira: { name: string; mmi: number; distanceKm: number } | null;
}

/** One magnitude threshold of one forecast window, as USGS gives it. */
export interface ForecastBin {
  /** "M or larger". */
  magnitude: number;
  /** Probability of at least one, 0–1. */
  probability: number;
  /** The most likely number of them, and USGS's 95% range for it. */
  median: number;
  p95Min: number;
  p95Max: number;
}

/**
 * USGS's Operational Aftershock Forecast for the zone's mainshock, relayed and never computed here.
 * Part D decides what the page says from it; these are only USGS's figures.
 */
export interface ForecastDigest {
  issuedAt: string;
  /** When USGS says the next update is due; the staleness rule reads this, not `expiresAt`. */
  nextUpdateAt: string | null;
  /** The file's own expiry. A year after issue on 2026-09-24, so no guide to staleness. */
  expiresAt: string | null;
  /** The product's `review-status`: "reviewed" once a USGS seismologist has checked it. */
  reviewStatus: string | null;
  model: {
    b: number;
    mc: number;
    mainshockMag: number;
    regionCenter: { lat: number; lon: number };
    regionRadiusKm: number;
  };
  windows: {
    label: string;
    start: string;
    end: string;
    aboveMainshock: { magnitude: number; probability: number } | null;
    bins: ForecastBin[];
  }[];
}

/** One stored digest of an outside product, with where and when it came from. */
export interface ExternalProduct<D> {
  source: "usgs";
  /** The SGC mainshock it was matched from. Show it only while that is still the zone's mainshock. */
  sgcEventId: string;
  /** The source's own id for the event, e.g. "us6000tjl2". */
  sourceEventId: string;
  productUrl: string;
  /** When the source last updated the product. */
  sourceUpdatedAt: string;
  /** When the daily job last confirmed it was the source's current version. */
  checkedAt: string;
  digest: D;
}

/** `GET /api/context?zone=`: what USGS publishes about the zone's mainshock. null where there is nothing. */
export interface ContextResponse {
  dyfi: ExternalProduct<DyfiDigest> | null;
  pager: ExternalProduct<PagerDigest> | null;
  forecast: ExternalProduct<ForecastDigest> | null;
}
