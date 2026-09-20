export interface BBox {
  lonMin: number;
  lonMax: number;
  latMin: number;
  latMax: number;
}

export interface CatalogQuery {
  /** Inclusive, date-only (the form has no time-of-day filter). */
  start: Date;
  /** Inclusive, date-only. */
  end: Date;
  bbox: BBox;
  magMin?: number;
  magMax?: number;
}

export interface SeismicEvent {
  /** SeisComP public event id, e.g. "SGC2026pqqmro". Stable across revisions. */
  id: string;
  /** Origin time, ISO 8601 UTC. */
  time: string;
  lat: number;
  lon: number;
  depthKm: number;
  mag: number;
  /** e.g. "MLr_1", "MLv", "Mw", "M". */
  magType: string;
  phases: number | null;
  rmsS: number | null;
  gapDeg: number | null;
  errLatKm: number | null;
  errLonKm: number | null;
  errDepthKm: number | null;
  region: string;
  /** "manual" (analyst reviewed) or "automatic". */
  status: string;
  /**
   * `date` parameter of the row's phases link, ISO 8601. It is later than the
   * origin time and looks like the solution's last-modified stamp; its exact
   * meaning and timezone are NOT confirmed. Useful only as a change marker.
   */
  solutionStamp: string | null;
}

/**
 * What one catalogue response cost to obtain. Recorded because none of it was visible
 * from outside: a hanging SGC request and a fast one that returned nothing look the same
 * in `ingest_runs`, and "SGC responses are buffered with no byte cap" has been an open
 * security question since the 2026-09-19 audit with no measurement behind it.
 *
 * There is deliberately **no parse time here**. In workerd `Date.now()` does not advance
 * between I/O operations, so any span that contains no await reads as 0 ms — timing a
 * synchronous parse inside the Worker can only ever produce a zero. CPU time comes from
 * `$workers.cpuTimeMs` in Workers Logs instead; see `pnpm logs cpu`.
 */
export interface CatalogCost {
  /** Bytes of HTML the response held. */
  bytes: number;
  /** Time on the network, ms. null when a page was parsed from a string we already had. */
  fetchMs: number | null;
  /** How many requests it took, including the retry. null when nothing was fetched. */
  attempts: number | null;
}

export interface CatalogPage {
  /** The "Total de registros" figure the server reported. */
  reportedTotal: number;
  /** Rows the server repeated for an id already seen; removed from `events`. */
  duplicatesDropped: number;
  /** Rows that could not be parsed and were skipped, rather than failing the whole page. */
  skippedRows: { row: number; reason: string }[];
  events: SeismicEvent[];
  cost: CatalogCost;
}
