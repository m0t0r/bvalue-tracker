/**
 * Pure helpers both tabs use, so a figure is computed and written the same way wherever it
 * appears. The claims themselves are in `claims.ts`; this is the arithmetic and formatting around
 * them.
 */
import { median } from "d3-array";
import { fmtNum } from "@/lib/format";
import type { QuakeLike } from "./claims";

export { median };

const HOUR = 3_600_000;
/**
 * Groups thousands ("125 900") the same way in both languages, where a point or a comma would read as a
 * decimal separator in one of them. Narrow, and no-break: a thin space (U+2009) may break.
 */
const GROUP = "\u202F";
/**
 * Between a figure and its unit: a no-break space, so "~120 km" never parts at a line break (a thin
 * space broke it at 320 px). Full width: in Geist a narrow one reads as no space at all at 30 px.
 */
const UNIT = "\u00A0";

/** A whole number, thousands grouped with a narrow no-break space from five digits on, with a true minus. */
export const fmtInt = (v: number) => {
  const s = Math.round(Math.abs(v)).toString();
  const grouped = s.length > 4 ? s.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP) : s;
  return v < 0 ? `−${grouped}` : grouped;
};
/** A figure to `d` decimals, decimal point in both languages, with a true minus. */
export const fmt = (v: number, d = 0) => (d === 0 ? fmtInt(v) : fmtNum(v, d));
/** "124 km" */
export const fmtKm = (v: number, d = 0) => `${fmt(v, d)}${UNIT}km`;
/** "M4.5" */
export const fmtMag = (m: number) => `M${m.toFixed(1)}`;
/** A whole percentage: "96 %" in Spanish, which spaces the sign, and "96%" in English. */
export const fmtPct = (v: number, lang: "es" | "en") => (lang === "es" ? `${fmtInt(v)}${UNIT}%` : `${fmtInt(v)}%`);

/** `v` rounded to `sig` significant figures, for "about 126 000 times". Zero stays zero. */
export const roundSig = (v: number, sig = 2) => {
  if (v === 0 || !Number.isFinite(v)) return v;
  const p = 10 ** (Math.floor(Math.log10(Math.abs(v))) - sig + 1);
  return Math.round(v / p) * p;
};

/**
 * "How many times" as an energy ratio: two significant figures, and a decimal below 3, so a gap of one
 * tenth (1.41) reads "1.4" rather than "1", while "2.0" stays "2" and 7.9 is "8".
 */
export const fmtTimes = (v: number) => {
  const r = roundSig(v);
  return r < 3 && !Number.isInteger(r) ? fmt(r, 1) : fmt(r);
};

/**
 * An event's horizontal location error in km: SGC's latitude and longitude errors taken together
 * (their hypotenuse). The one measure the page uses, so the `drift` claim, the error circles and the
 * captions can never quote two different "typical errors".
 */
export const horizontalErrorKm = (e: QuakeLike): number | null =>
  e.errLatKm != null && e.errLonKm != null ? Math.hypot(e.errLatKm, e.errLonKm) : null;

/** The median of `horizontalErrorKm` over some events; undefined when none carries one. */
export const medianHorizontalErrorKm = (events: readonly QuakeLike[]) =>
  median(events.flatMap((e) => (horizontalErrorKm(e) === null ? [] : [horizontalErrorKm(e)!])));

/**
 * The depths the most events land on exactly (to 0.1 km), most common first, ties to the shallower:
 * the sign that the catalogue's depths are snapped rather than free.
 */
export function commonDepths(events: readonly { depthKm: number }[], top = 3) {
  const counts = new Map<number, number>();
  for (const e of events) {
    const d = Math.round(e.depthKm * 10) / 10;
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, top)
    .map(([depthKm, count]) => ({ depthKm, count }));
}

export interface TimeWindow<E> {
  /** When the window begins, ms. */
  start: number;
  events: E[];
  /** The median epicentre of its events. */
  centre: { lat: number; lon: number };
}

/**
 * Events in consecutive windows of `hours` from the first one (time order assumed), in one pass.
 * Windows with fewer than `minEvents` are left out: at the catalogue's edge they are a handful of
 * unreviewed solutions. For drawing the swarm's track; whether it moved is the `drift` claim's call.
 */
export function timeWindows<E extends QuakeLike>(events: readonly E[], hours = 12, minEvents = 20): TimeWindow<E>[] {
  if (events.length === 0) return [];
  const t0 = Date.parse(events[0]!.time);
  const buckets = new Map<number, E[]>();
  for (const e of events) {
    const i = Math.floor((Date.parse(e.time) - t0) / (hours * HOUR));
    const b = buckets.get(i);
    if (b) b.push(e);
    else buckets.set(i, [e]);
  }
  return [...buckets.entries()]
    .filter(([, es]) => es.length >= minEvents)
    .sort(([a], [b]) => a - b)
    .map(([i, es]) => ({
      start: t0 + i * hours * HOUR,
      events: es,
      centre: { lat: median(es, (e) => e.lat)!, lon: median(es, (e) => e.lon)! },
    }));
}
