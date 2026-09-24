import type { StoredEvent } from "@/lib/api";
import { dayBounds, fmtDay } from "@/lib/format";
import type { Dict } from "@/lib/i18n";
import type { Cluster } from "../../core/clusters";
import { ZONES, type ZoneId } from "../../core/zones";

/**
 * The settings that decide which events are counted. Mc is deliberately not one of them: it moves
 * the fit, never the selection, and `applyFilters` takes this narrower type so that it cannot.
 * That is what lets the page keep one array of events across a drag of the Mc slider, instead of
 * handing the map, the table and the magnitude chart a new one to redraw on every step.
 */
export interface EventFilters {
  from: string;
  to: string;
  minMag: number;
  manualOnly: boolean;
  excludeMainshock: boolean;
}

export interface Filters extends EventFilters {
  /** null = use the maximum-curvature estimate. */
  mc: number | null;
}

/**
 * An untouched page: the whole sequence, from the day it began. The zone decides that day, and
 * nothing else — a page nobody has touched must produce no chips on either tab.
 */
export const defaultFilters = (zone: ZoneId): Filters => ({
  from: ZONES[zone].start.toISOString().slice(0, 10),
  to: "",
  minMag: 0,
  manualOnly: false,
  excludeMainshock: false,
  mc: null,
});

/** Chocó's defaults, which were the only ones before there were two zones. */
export const DEFAULT_FILTERS: Filters = defaultFilters("choco");

/**
 * `mainshockId` is the zone's detected mainshock (`core/mainshock.ts`), found over its whole
 * catalogue by the caller: `excludeMainshock` removes that one event, and nothing when there is none.
 */
export function applyFilters(
  events: readonly StoredEvent[],
  f: EventFilters,
  mainshockId: string | null,
): StoredEvent[] {
  // The date fields are Colombian calendar days, like every other date on the page.
  const from = f.from ? dayBounds(f.from)[0] : "";
  const to = f.to ? dayBounds(f.to)[1] : "9999";
  return events.filter(
    (e) =>
      e.time >= from &&
      e.time <= to &&
      e.mag >= f.minMag &&
      (!f.manualOnly || e.status === "manual") &&
      (!f.excludeMainshock || e.id !== mainshockId),
  );
}

export type ClusterChoice = "all" | Cluster;

export interface FilterChip {
  /** Stable across languages, so a test and a React key can both use it. */
  key: "cluster" | "dates" | "minMag" | "manualOnly" | "excludeMainshock" | "mc";
  label: string;
  /** Set on the one chip that carries a colour on this page: the cluster's own. */
  cluster?: Cluster;
}

/**
 * Every filter the page is currently narrowed by, in the order the reader meets the controls.
 *
 * A setting earns a chip only where it differs from the zone's defaults, so a page nobody has touched
 * produces none and the scope bar stays away. Mc is in here although it selects no events: it moves
 * the b-value and the frequency–magnitude chart, and a Mc left on by hand is exactly the kind of
 * setting a reader forgets they changed.
 *
 * "Sin el sismo principal" is named only while there is a mainshock for it to leave out: with none
 * the setting selects nothing, and a chip would claim an exclusion that is not happening.
 */
export function activeFilterChips(
  f: Filters,
  cluster: ClusterChoice,
  t: Dict,
  lang: "es" | "en",
  defaults: Filters,
  mainshockId: string | null,
): FilterChip[] {
  const chips: FilterChip[] = [];
  if (cluster !== "all") chips.push({ key: "cluster", label: t.clusterShort[cluster], cluster });
  if (f.from !== defaults.from || f.to !== defaults.to) {
    // Colombian days, like the fields themselves and every other date on the page.
    const a = f.from ? fmtDay(Date.parse(dayBounds(f.from)[0]), lang) : "";
    const b = f.to ? fmtDay(Date.parse(dayBounds(f.to)[1]), lang) : "";
    chips.push({
      key: "dates",
      label: a && b ? t.chipRange(a, b) : a ? t.chipFrom(a) : b ? t.chipTo(b) : t.chipAllDates,
    });
  }
  if (f.minMag !== defaults.minMag) chips.push({ key: "minMag", label: t.chipMinMag(f.minMag.toFixed(1)) });
  if (f.manualOnly) chips.push({ key: "manualOnly", label: t.chipManual });
  if (f.excludeMainshock && mainshockId !== null) chips.push({ key: "excludeMainshock", label: t.chipNoMainshock });
  if (f.mc !== null) chips.push({ key: "mc", label: t.chipMc(f.mc.toFixed(1)) });
  return chips;
}
