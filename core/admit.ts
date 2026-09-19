import type { SeismicEvent } from "./types.ts";

/**
 * A record that cannot be an event. `field` is the one that failed, and the message is the
 * field clause alone — each door prefixes its own locator (a table row, a line in a file).
 */
export class EventRejected extends Error {
  constructor(readonly field: string, reason: string) {
    super(`${field} ${reason}`);
    this.name = "EventRejected";
  }
}

/**
 * SeisComP public event ids, e.g. "SGC2026pqqmro". Bounded here rather than at whichever
 * regex happened to extract one, so the page's outbound link to SGC cannot become a
 * `javascript:` URL however the id reached us.
 */
const EVENT_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** A UTC instant, which is what both doors produce and what toCsv writes back. */
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

/**
 * Finite is not enough. An absurd but numeric magnitude would be stored verbatim and then
 * size the bin array in `fmd`, throwing `RangeError` on every `/api/stats` call, so every
 * value that reaches the statistics is bounded to what the quantity can physically be.
 * Out of range means the row is wrong, not that the world is.
 */
const BOUNDS = {
  lat: [-90, 90],
  lon: [-180, 180],
  depthKm: [-10, 1000],
  mag: [-2, 10],
} as const satisfies Record<string, readonly [number, number]>;

/** Blank, absent or unreadable is an absent figure, not a wrong one: SGC leaves these empty. */
function finite(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = String(v).trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function textOf(v: unknown, field: string): string {
  if (typeof v === "string") return v;
  if (v === null || v === undefined) throw new EventRejected(field, "is missing");
  return String(v);
}

function eventId(v: unknown): string {
  const s = textOf(v, "id").trim();
  if (!EVENT_ID.test(s)) throw new EventRejected("id", `is not an SGC event id: ${JSON.stringify(s)}`);
  return s;
}

function instant(v: unknown, field: string): string {
  const s = textOf(v, field).trim();
  if (s === "") throw new EventRejected(field, "is missing");
  // Date rolls an impossible day over rather than refusing it ("2026-02-30" becomes
  // 2 March), so the only way to reject one is to read the instant back out.
  const at = new Date(s);
  if (!INSTANT.test(s) || Number.isNaN(at.getTime()) || at.toISOString().slice(0, 19) !== s.slice(0, 19)) {
    throw new EventRejected(field, `is not a UTC instant: ${JSON.stringify(s)}`);
  }
  return s;
}

/** The solution stamp is a change marker SGC does not always give; absent is not wrong. */
function optionalInstant(v: unknown, field: string): string | null {
  return v === null || v === undefined || v === "" ? null : instant(v, field);
}

function bounded(v: unknown, field: keyof typeof BOUNDS): number {
  const n = finite(v);
  if (n === null) throw new EventRejected(field, `is not numeric: ${JSON.stringify(v ?? "")}`);
  const [lo, hi] = BOUNDS[field];
  if (n < lo || n > hi) throw new EventRejected(field, `out of range [${lo}, ${hi}]: ${n}`);
  return n;
}

/**
 * The one gate every event passes through on its way into core, whatever door it arrived by:
 * the SGC HTML parser, or a CSV a person has edited. Producers keep their own job — reading
 * the page's shape, splitting CSV lines — and hand the raw cells here. Strings are coerced,
 * and the literal below is the single description of the record, so anything else the caller
 * passes is dropped and a field added to `SeismicEvent` cannot be forgotten.
 *
 * Throws `EventRejected` on the first field it cannot admit.
 */
export function admitEvent(raw: Record<string, unknown>): SeismicEvent {
  return {
    id: eventId(raw.id),
    time: instant(raw.time, "time"),
    lat: bounded(raw.lat, "lat"),
    lon: bounded(raw.lon, "lon"),
    depthKm: bounded(raw.depthKm, "depthKm"),
    mag: bounded(raw.mag, "mag"),
    magType: textOf(raw.magType, "magType"),
    // The solution-quality columns are not bounded: they reach no array size, and SGC
    // leaves them blank often enough that a missing one must not cost us the event.
    phases: finite(raw.phases),
    rmsS: finite(raw.rmsS),
    gapDeg: finite(raw.gapDeg),
    errLatKm: finite(raw.errLatKm),
    errLonKm: finite(raw.errLonKm),
    errDepthKm: finite(raw.errDepthKm),
    region: textOf(raw.region, "region"),
    status: textOf(raw.status, "status"),
    solutionStamp: optionalInstant(raw.solutionStamp, "solutionStamp"),
  };
}
