/**
 * What the page is narrowed to, and everything read off it.
 *
 * The page is one catalogue seen through one scope: the filters form, the depth group and the b
 * card's magnitude tab. Every figure on it — the b-value, the frequency–magnitude chart, the map,
 * the table, the counts in the scope bar — comes from those three and the events. That derivation
 * used to be the body of `App.tsx`, where the rule this module exists for could not be reached by a
 * test: **every fit the page shows is above the Mc of the whole filtered catalogue**, so narrowing
 * to a depth group or to one magnitude type changes which events are counted and nothing else.
 * `computeClusterStats` keeps that rule for the groups; `measure` keeps it for the magnitude tab,
 * which is the half that lived as a single argument inside a component.
 *
 * `pageView` is the whole derivation as a plain function, so a test runs exactly what the page
 * runs. `useScope` adds only React: the state, two memo layers and the deferred copies.
 *
 * The two halves are split because **Mc moves the figures and never the selection**. Each takes
 * only the part of the scope it may read, which is also what `useScope` keys its memos on — so a
 * drag of the Mc slider re-fits the statistics while the map, the table and the magnitude chart
 * keep the very same array and do not redraw.
 */
import { useCallback, useDeferredValue, useMemo, useState } from "react";
import type { StoredEvent } from "@/lib/api";
import {
  DEFAULT_FILTERS,
  activeFilterChips,
  defaultFilters,
  applyFilters,
  type ClusterChoice,
  type EventFilters,
  type FilterChip,
  type Filters,
} from "@/lib/filters";
import type { Dict, Lang } from "@/lib/i18n";
import { useNow } from "@/lib/use-now";
import { clusterOf, computeClusterStats, type ClusterStats } from "../../core/clusters";
import { computeStats, dominantMagType, type CatalogStats } from "@bvalue/seismo";
import { mainshockId, zoneMainshock, type ZoneMainshock } from "../../core/mainshock";
import { DEFAULT_ZONE, type ZoneId } from "../../core/zones";

/** Which magnitudes feed the b card and the two b charts: every type, or only the commonest one. */
export type MagScope = "all" | "type";

export interface Scope {
  filters: Filters;
  cluster: ClusterChoice;
  magScope: MagScope;
}

export const DEFAULT_SCOPE: Scope = { filters: DEFAULT_FILTERS, cluster: "all", magScope: "all" };
const defaultScope = (zone: ZoneId): Scope => ({ ...DEFAULT_SCOPE, filters: defaultFilters(zone) });

/** The part of a scope that picks events. It has no `mc`, so `selectEvents` cannot read one. */
export interface EventScope extends EventFilters {
  cluster: ClusterChoice;
}

/** The part that moves the figures without moving the selection. */
export interface FitScope {
  mc: number | null;
  cluster: ClusterChoice;
  magScope: MagScope;
}

const eventScope = (s: Scope): EventScope => ({ ...s.filters, cluster: s.cluster });
const fitScope = (s: Scope): FitScope => ({ mc: s.filters.mc, cluster: s.cluster, magScope: s.magScope });

/** The events a scope selects. */
export interface Selection {
  /** Every event that passes the filters, both depth groups together: what the groups card compares. */
  base: StoredEvent[];
  /** `base` narrowed to the chosen group. The map, the table and the magnitude chart draw these. */
  shown: StoredEvent[];
  /** The commonest magnitude type among `shown`, or null when they already share one. */
  magType: string | null;
  /** `shown` narrowed to `magType`; `shown` itself when there is no type to choose. */
  ofType: StoredEvent[];
}

/** What a scope measures. Every fit in here is above `clusters.all.mc`. */
export interface Measured {
  clusters: ClusterStats;
  /** The fit the b card and the two b charts show. */
  stats: CatalogStats;
  /** Whether `stats` counts one magnitude type only, which is also what the b charts label themselves with. */
  oneType: boolean;
}

export interface PageView extends Selection, Measured {
  /**
   * The zone's mainshock, detected over the **whole** catalogue the page holds, never over what the
   * filters leave. It is the same answer `/api/events?excludeMainshock=1` and the CLI reach.
   */
  mainshock: ZoneMainshock<StoredEvent>;
}

/**
 * The half that the depth group does not touch. Kept apart from `selectShown` for the same reason
 * Mc is kept out of both: choosing a group must leave the groups card comparing the very same
 * `base` it was already drawing two daily strips from.
 */
export const selectBase = (events: readonly StoredEvent[], f: EventFilters, mainshock: string | null): StoredEvent[] =>
  applyFilters(events, f, mainshock);

export function selectShown(base: StoredEvent[], cluster: ClusterChoice): Selection {
  const shown = cluster === "all" ? base : base.filter((e) => clusterOf(e) === cluster);
  const magType = dominantMagType(shown);
  return { base, shown, magType, ofType: magType === null ? shown : shown.filter((e) => e.magType === magType) };
}

export const selectEvents = (events: readonly StoredEvent[], s: EventScope, mainshock: string | null): Selection =>
  selectShown(selectBase(events, s, mainshock), s.cluster);

export function measure(sel: Selection, s: FitScope, now: number): Measured {
  // Fitted over `base`, so the Mc is the whole filtered catalogue's whichever group is chosen.
  const clusters = computeClusterStats(sel.base, s.mc, now);
  const everyType = s.cluster === "all" ? clusters.all : clusters[s.cluster].stats;
  const oneType = s.magScope === "type" && sel.magType !== null;
  // The magnitude tab is the other half of the rule: the two tabs differ in which magnitudes they
  // count and in nothing else, so this passes the shared Mc and not the reader's own `mc` — which
  // would let one tab pick its own and print a b-value from a different distribution. `mc` is
  // restated for the same reason `computeClusterStats` restates it: below two events `computeStats`
  // reports none, and a subset still belongs to the catalogue's Mc.
  const stats = oneType ? { ...computeStats(sel.ofType, clusters.all.mc), mc: clusters.all.mc } : everyType;
  return { clusters, stats, oneType };
}

/** The whole page, derived. Pure, so a test runs exactly what `useScope` runs. */
export function pageView(events: readonly StoredEvent[], scope: Scope, now: number): PageView {
  const mainshock = zoneMainshock(events);
  const sel = selectEvents(events, eventScope(scope), mainshockId(mainshock));
  return { ...sel, ...measure(sel, fitScope(scope), now), mainshock };
}

/** Everything the page is narrowed by, named for the reader. Both halves of the scope bar show these. */
export const scopeChips = (scope: Scope, t: Dict, lang: Lang, zone: ZoneId, mainshock: string | null): FilterChip[] =>
  activeFilterChips(scope.filters, scope.cluster, t, lang, defaultFilters(zone), mainshock);

/** The groups card's control: which group the page is narrowed to, and the one way to change it. */
export interface ClusterSelection {
  cluster: ClusterChoice;
  onChange: (c: ClusterChoice) => void;
}

/** The b card's tabs: every magnitude type, or only the commonest, with the counts that name them. */
export interface MagTabs {
  value: MagScope;
  onChange: (v: MagScope) => void;
  magType: string | null;
  /** Events of `magType`, and all events, among those shown. */
  typeCount: number;
  total: number;
}

export interface PageScope {
  scope: Scope;
  view: PageView;
  /**
   * The same view, one render behind. The headline figures update at once and their digits roll;
   * the charts, the map and the table follow in an interruptible render, because drawn in the same
   * pass they hold the main thread for ~300 ms per slider step and the digits simply jump.
   */
  deferred: {
    base: StoredEvent[];
    shown: StoredEvent[];
    stats: CatalogStats;
    /** The magnitude type the b charts label themselves with, or null while showing every type. */
    magType: string | null;
    /** The depth group the b charts label themselves with, or null while showing both. */
    cluster: "shallow" | "deep" | null;
  };
  selectCluster: ClusterSelection;
  magTabs: MagTabs;
  setFilters: (f: Filters) => void;
  /** Undo every narrowing at once, which is what "Quitar filtros" on the scope bar does. */
  clear: () => void;
}

const NO_EVENTS: StoredEvent[] = [];

/**
 * `zone` is read once, for the first scope. The page mounts one of these per zone and throws it
 * away on a switch, so one zone's filters never carry over to the other's catalogue.
 */
export function useScope(events: readonly StoredEvent[] | undefined, zone: ZoneId = DEFAULT_ZONE): PageScope {
  const [scope, setScope] = useState<Scope>(() => defaultScope(zone));
  const { from, to, minMag, manualOnly, excludeMainshock, mc } = scope.filters;
  const { cluster, magScope } = scope;

  // Three layers, and each one's dependencies are exactly the argument it is given, so a setting
  // can only rebuild what actually reads it: Mc rebuilds no array at all, and the depth group
  // leaves `base` — the two daily strips in the groups card — alone.
  // Over the whole catalogue, and only when it changes: a filter never moves the mainshock.
  const mainshock = useMemo(() => zoneMainshock(events ?? NO_EVENTS), [events]);
  const mainshockEventId = mainshockId(mainshock);
  const base = useMemo(
    () => selectBase(events ?? NO_EVENTS, { from, to, minMag, manualOnly, excludeMainshock }, mainshockEventId),
    [events, from, to, minMag, manualOnly, excludeMainshock, mainshockEventId],
  );
  const sel = useMemo(() => selectShown(base, cluster), [base, cluster]);
  // "The last 7 days" in the groups card is measured from the clock, not from the data: without a
  // clock the count would freeze for as long as the events themselves did. An hour is fine enough.
  const hour = Math.floor(useNow() / 3_600_000) * 3_600_000;
  const measured = useMemo(
    () => measure(sel, { mc, cluster, magScope }, hour + 3_600_000),
    [sel, mc, cluster, magScope, hour],
  );
  const view = useMemo(() => ({ ...sel, ...measured, mainshock }), [sel, measured, mainshock]);

  const deferred = {
    base: useDeferredValue(view.base),
    shown: useDeferredValue(view.shown),
    stats: useDeferredValue(view.stats),
    magType: useDeferredValue(view.oneType ? view.magType : null),
    cluster: useDeferredValue(cluster === "all" ? null : cluster),
  };

  const setFilters = useCallback((filters: Filters) => setScope((s) => ({ ...s, filters })), []);
  const setCluster = useCallback((c: ClusterChoice) => setScope((s) => ({ ...s, cluster: c })), []);
  const setMagScope = useCallback((m: MagScope) => setScope((s) => ({ ...s, magScope: m })), []);
  // The magnitude tab is not a narrowing of the catalogue — it is which magnitudes the b-value
  // counts — so it is not in the scope bar's list and "Quitar filtros" leaves it where it is.
  const clear = useCallback(() => setScope((s) => ({ ...s, filters: defaultFilters(zone), cluster: "all" })), [zone]);

  const selectCluster = useMemo(() => ({ cluster, onChange: setCluster }), [cluster, setCluster]);
  const magTabs = useMemo(
    () => ({
      value: magScope,
      onChange: setMagScope,
      magType: view.magType,
      typeCount: view.ofType.length,
      total: view.shown.length,
    }),
    [magScope, setMagScope, view.magType, view.ofType, view.shown],
  );

  return { scope, view, deferred, selectCluster, magTabs, setFilters, clear };
}
