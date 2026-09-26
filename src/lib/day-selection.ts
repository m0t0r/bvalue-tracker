/**
 * The days the "Eventos por día" bars have selected, which narrow the catalogue table and nothing
 * else: a b-value, a map or a chart of one day's events would read noise as a finding, so the
 * selection is not part of the page's scope (`scope.ts`) and names no chip.
 */
import { useMemo, useState } from "react";
import { eventsInDays, type DayRange } from "@/lib/daily-counts";

/** A press on one day: that day alone, or nothing when it was already the selection. */
export const pickDay = (current: DayRange | null, day: number): DayRange | null =>
  current && current.from === day && current.to === day ? null : { from: day, to: day };

/** A drag, or a shift-press, from `anchor` to `day`, in either direction. */
export const spanDays = (anchor: number, day: number): DayRange => ({
  from: Math.min(anchor, day),
  to: Math.max(anchor, day),
});

/**
 * One zone's selection over the events the page shows. A selection the filters have emptied is let
 * go of, rather than kept to return when they change back: a table saying "0 events on 12 Sept"
 * under a chart with no bar there would be a state the reader never chose.
 */
export function useDaySelection<E extends { time: string }>(events: E[]) {
  const [days, setDays] = useState<DayRange | null>(null);
  const selected = useMemo(() => (days ? eventsInDays(events, days) : events), [events, days]);
  if (days && selected.length === 0) setDays(null);
  return { days, setDays, events: selected };
}
