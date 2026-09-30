/** The pure parts of "Magnitud en el tiempo" and its daily bars: scales' ticks, label choice, bar widths. */
import { DAY } from "@/lib/daily-counts";

/** The daily counts' axis: a round step that gives at most four intervals, and the ticks on it. */
export function countAxis(max: number): { domain: [number, number]; ticks: number[] } {
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find((s) => max / s <= 4) ?? 2000;
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  return { domain: [0, top], ticks };
}

/**
 * A y tick's number as the pinned axis writes it. The column has room for three digits, so a thousand
 * and over is written in thousands ("1k", "1.5k"): whole, its first digit was cut by the column's edge.
 */
export const tickLabel = (v: number): string => (v >= 1000 ? `${v / 1000}k` : String(v));

/** The starts of the days a date label may sit on: every `everyDays` from the first day to the end of the last. */
export function dayTicks([from, to]: readonly [number, number], everyDays: number): number[] {
  const out: number[] = [];
  for (let d = from; d <= to; d += Math.max(1, everyDays) * DAY) out.push(d);
  return out;
}

/**
 * Which date labels are drawn. From the last candidate back, one is kept when its label, centred on
 * its own day, lies wholly between `start` and `end` and clears the label kept after it by `gap`.
 *
 * Recharts' rule (`preserveEndTicks`) differs in one thing: it pulled the last label inside when it
 * crossed the edge and drew it there. On a scrolling chart that was the end of the last day, drawn
 * ~10 px before its place, and it took the room of the last regular label ("21 sept" on Chocó's).
 */
export function ownPlaceLabels(
  candidates: readonly number[],
  {
    x,
    width,
    start,
    end,
    gap,
  }: {
    /** Where a candidate sits, in px. */
    x: (v: number) => number;
    /** How wide its label is, in px. */
    width: (v: number) => number;
    start: number;
    end: number;
    /** The least room between two labels. */
    gap: number;
  },
): number[] {
  const kept: number[] = [];
  let room = end;
  for (let i = candidates.length - 1; i >= 0; i--) {
    const v = candidates[i]!;
    const at = x(v);
    if (at < start || at > room) continue;
    const half = width(v) / 2;
    if (at - half < start || at + half > room) continue;
    kept.unshift(v);
    room = at - half - gap;
  }
  return kept;
}

/**
 * A day's bar inside its `band` of px: 2 px clear on each side and a whole number of pixels wide, as
 * Recharts drew it (`barCategoryGap={2}`). Where a day is too narrow for that, the bar keeps half the
 * day rather than the zero or negative width Recharts' rule gives.
 */
export function dayBar(band: number): { offset: number; width: number } {
  const inner = band - 4;
  if (inner > 1) return { offset: 2, width: Math.round(inner) };
  const width = Math.max(band / 2, 0.5);
  return { offset: (band - width) / 2, width };
}

/**
 * The part of a chosen range of days that is on the axis, or null when none is. Recharts discarded a
 * reference area that reached past the axis, so a choice the date filter then cut into lost its band.
 */
export function bandOnAxis(
  days: { from: number; to: number },
  [lo, hi]: readonly [number, number],
): [number, number] | null {
  const from = Math.max(days.from, lo);
  const to = Math.min(days.to + DAY, hi);
  return to > from ? [from, to] : null;
}
