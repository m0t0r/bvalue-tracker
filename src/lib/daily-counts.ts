import { clusterOf } from "../../core/clusters";
import { dayStart } from "./format";

/** A Colombian day in ms: there is no daylight saving, so every day is this long. */
export const DAY = 86_400_000;

export interface DayCount {
  /** The instant the Colombian calendar day begins. */
  start: number;
  shallow: number;
  deep: number;
  total: number;
}

export interface DailyCounts {
  /** One entry per Colombian day from the first event's to the last's, gaps included. Empty for no events. */
  days: readonly DayCount[];
  /** The busiest day's total. */
  maxTotal: number;
  /** The most one cluster had on any one day. */
  maxCluster: number;
}

/** Events per Colombian calendar day, split by depth cluster. Input order does not matter. */
export function dailyCounts(events: readonly { time: string; depthKm: number }[]): DailyCounts {
  let lo = Infinity,
    hi = -Infinity;
  for (const e of events) {
    const d = dayStart(e.time);
    if (d < lo) lo = d;
    if (d > hi) hi = d;
  }
  if (events.length === 0) return { days: [], maxTotal: 0, maxCluster: 0 };

  const days: DayCount[] = [];
  for (let d = lo; d <= hi; d += DAY) days.push({ start: d, shallow: 0, deep: 0, total: 0 });
  for (const e of events) {
    // A time `Date.parse` cannot read gives NaN, which claimed no slot in the pass above. Leave the
    // event out of the histogram rather than throwing: this runs inside a render, and the D1 read
    // path is deliberately outside the admission gate, so one bad row must not blank the page.
    const day = days[Math.round((dayStart(e.time) - lo) / DAY)];
    if (!day) continue;
    day[clusterOf(e)]++;
    day.total++;
  }

  let maxTotal = 0,
    maxCluster = 0;
  for (const d of days) {
    if (d.total > maxTotal) maxTotal = d.total;
    if (d.shallow > maxCluster) maxCluster = d.shallow;
    if (d.deep > maxCluster) maxCluster = d.deep;
  }
  return { days, maxTotal, maxCluster };
}

/** An inclusive range of Colombian days, each given by the instant it begins (`DayCount.start`). */
export interface DayRange {
  from: number;
  to: number;
}

/**
 * The events of a range of Colombian days, by the same day rule as `dailyCounts`, so a bar and the
 * table it narrows always agree on which day an event belongs to. An unreadable time matches no day.
 */
export function eventsInDays<E extends { time: string }>(events: readonly E[], range: DayRange): E[] {
  return events.filter((e) => {
    const d = dayStart(e.time);
    return d >= range.from && d <= range.to;
  });
}
