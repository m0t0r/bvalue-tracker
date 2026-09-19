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

export interface CatalogPage {
  /** The "Total de registros" figure the server reported. */
  reportedTotal: number;
  /** Rows the server repeated for an id already seen; removed from `events`. */
  duplicatesDropped: number;
  events: SeismicEvent[];
}
