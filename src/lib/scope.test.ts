import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { StoredEvent } from "@/lib/api";
import { MAINSHOCK_ID } from "@/lib/filters";
import { dicts } from "@/lib/i18n";
import { DEFAULT_SCOPE, pageView, scopeChips, useScope, type Scope } from "@/lib/scope";
import { computeStats } from "../../core/gr";

/**
 * A catalogue built so that the Mc estimates a careless page could reach are all different: the
 * whole thing peaks at M2.4 (Mc 2.6) while the commonest magnitude type on its own and the deep
 * group each peak at M2.0 (Mc 2.2). Anything that quietly gives a tab or a group its own Mc
 * therefore reads as a different number here — which is the point of the fixture, since on the
 * real catalogue every estimate happens to land on 2.3 and the mistake would pass unnoticed.
 *
 * `deep` is how many of the group sit below the 70 km cut, so both depth groups carry both
 * magnitude types and both have enough events above Mc to be fitted.
 */
const GROUPS: [n: number, deep: number, mag: number, magType: string][] = [
  [50, 30, 2.0, "MLr_1"], [40, 2, 2.4, "MLr_1"], [20, 8, 2.7, "MLr_1"], [12, 6, 3.0, "MLr_1"], [8, 4, 3.4, "MLr_1"],
  [30, 3, 2.4, "MLv"], [6, 3, 3.1, "MLv"], [4, 2, 4.2, "MLv"],
];

const ev = (i: number, mag: number, depthKm: number, magType: string, over: Partial<StoredEvent> = {}): StoredEvent => ({
  id: `SGC2026z${String(i).padStart(4, "0")}`,
  time: new Date(Date.UTC(2026, 7, 10, 12, 34, 27) + i * 5 * 3_600_000).toISOString(),
  lat: 4.5, lon: -76.7, depthKm, mag, magType,
  phases: 12, rmsS: 0.4, gapDeg: 120, errLatKm: 1, errLonKm: 1, errDepthKm: 2,
  region: "Istmina, Chocó, Colombia", status: i % 5 === 0 ? "manual" : "automatic",
  solutionStamp: null,
  firstSeenAt: "2026-09-19T00:00:00.000Z", updatedAt: "2026-09-19T00:00:00.000Z", removedAt: null,
  ...over,
});

const EVENTS: StoredEvent[] = [
  // The M7.4 itself, so "sin el sismo principal" has something to exclude.
  ev(0, 7.4, 103, "Mw", { id: MAINSHOCK_ID }),
  ...GROUPS.flatMap(([n, deep, mag, magType]) =>
    Array.from({ length: n }, (_, j) => ({ mag, magType, depthKm: j < deep ? 85 : 40 })),
  ).map((e, i) => ev(i + 1, e.mag, e.depthKm, e.magType)),
];

const NOW = Date.parse("2026-09-20T00:00:00.000Z");
const scope = (over: Partial<Scope> = {}): Scope => ({ ...DEFAULT_SCOPE, ...over });
const CLUSTERS = ["all", "shallow", "deep"] as const;
const TABS = ["all", "type"] as const;

describe("the Mc every b-value on the page is fitted above", () => {
  it("is the whole filtered catalogue's, whichever group and magnitude tab the reader is on", () => {
    for (const cluster of CLUSTERS) {
      for (const magScope of TABS) {
        const view = pageView(EVENTS, scope({ cluster, magScope }), NOW);
        expect({ cluster, magScope, mc: view.stats.mc }).toEqual({ cluster, magScope, mc: 2.6 });
        expect(view.stats.mc).toBe(view.clusters.all.mc);
      }
    }
  });

  it("is not the one the chosen group or magnitude type would pick for itself", () => {
    // Without this the assertion above could pass on a catalogue where every estimate agrees.
    const view = pageView(EVENTS, scope({ magScope: "type" }), NOW);
    expect(computeStats(view.ofType).mcMaxc).toBe(2.2);
    expect(computeStats(view.base.filter((e) => e.depthKm >= 70)).mcMaxc).toBe(2.2);
  });

  it("follows the reader's own Mc into every group and tab, when they set one", () => {
    for (const cluster of CLUSTERS) {
      for (const magScope of TABS) {
        const view = pageView(EVENTS, scope({ cluster, magScope, filters: { ...DEFAULT_SCOPE.filters, mc: 2.9 } }), NOW);
        expect(view.stats.mc).toBe(2.9);
        expect(view.clusters.shallow.stats.mc).toBe(2.9);
        expect(view.clusters.deep.stats.mc).toBe(2.9);
      }
    }
  });
});

describe("the events a scope selects", () => {
  const view = (over: Partial<Scope> = {}) => pageView(EVENTS, scope(over), NOW);

  it("keeps both depth groups in reach while showing one, because the groups card compares them", () => {
    const deep = view({ cluster: "deep" });
    expect(deep.base).toEqual(view().shown);
    expect(deep.shown.length).toBeLessThan(deep.base.length);
    expect(deep.shown.every((e) => e.depthKm >= 70)).toBe(true);
    expect(view({ cluster: "shallow" }).shown.every((e) => e.depthKm < 70)).toBe(true);
    expect(view({ cluster: "shallow" }).shown.length + deep.shown.length).toBe(deep.base.length);
  });

  it("takes the magnitude tab from the group on screen, not from the whole catalogue", () => {
    for (const cluster of CLUSTERS) {
      const v = view({ cluster });
      expect(v.ofType.every((e) => e.magType === v.magType)).toBe(true);
      expect(v.ofType.length).toBe(v.shown.filter((e) => e.magType === v.magType).length);
    }
    expect(view({ cluster: "deep" }).ofType.length).not.toBe(view().ofType.length);
  });

  it("leaves nothing to choose when every event shown already shares one type", () => {
    // M >= 5 is the mainshock alone, and one type is not a choice the b card can offer.
    const only = view({ filters: { ...DEFAULT_SCOPE.filters, minMag: 5 } });
    expect(only.shown.map((e) => e.id)).toEqual([MAINSHOCK_ID]);
    expect(only.magType).toBeNull();
    expect(only.ofType).toBe(only.shown);
    expect(only.oneType).toBe(false);
  });

  it("selects on the filters the reader set", () => {
    const all = view().shown;
    // Each of these narrows the catalogue without emptying it, so no assertion below passes vacuously.
    const only = (f: Partial<Scope["filters"]>) => {
      const shown = view({ filters: { ...DEFAULT_SCOPE.filters, ...f } }).shown;
      expect(shown.length).toBeGreaterThan(0);
      expect(shown.length).toBeLessThan(all.length);
      return shown;
    };
    expect(only({ minMag: 3 }).every((e) => e.mag >= 3)).toBe(true);
    expect(only({ manualOnly: true }).every((e) => e.status === "manual")).toBe(true);
    expect(only({ excludeMainshock: true }).some((e) => e.id === MAINSHOCK_ID)).toBe(false);
    expect(only({ excludeMainshock: true })).toHaveLength(all.length - 1);
    // The date fields are Colombian days: 10 August in Bogotá still holds the 12:34 UTC mainshock.
    expect(only({ to: "2026-08-10" }).some((e) => e.id === MAINSHOCK_ID)).toBe(true);
    expect(only({ from: "2026-08-12" }).every((e) => e.time >= "2026-08-12T05:00")).toBe(true);
  });

  it("selects nothing on Mc: moving it must not hand the map and the table a new catalogue", () => {
    const { clusters: _a, stats: _b, oneType: _c, ...loose } = view({ filters: { ...DEFAULT_SCOPE.filters, mc: 3.2 } });
    const { clusters: _d, stats: _e, oneType: _f, ...tight } = view();
    expect(loose).toEqual(tight);
    // ...while still moving the figures, so the comparison above is not vacuous.
    expect(view({ filters: { ...DEFAULT_SCOPE.filters, mc: 3.2 } }).stats.mc).toBe(3.2);
    expect(view().stats.mc).toBe(2.6);
  });
});

describe("what the scope bar names", () => {
  it("stays silent on a page nobody has touched", () => {
    expect(scopeChips(DEFAULT_SCOPE, dicts.es, "es")).toEqual([]);
  });

  it("names the depth group and the filters as one list", () => {
    const chips = scopeChips(scope({ cluster: "deep", filters: { ...DEFAULT_SCOPE.filters, minMag: 2.5, mc: 2.9 } }), dicts.es, "es");
    expect(chips.map((c) => c.key)).toEqual(["cluster", "minMag", "mc"]);
  });
});

describe("the scope as the page holds it", () => {
  it("hands the map, the table and the charts the same events when only Mc moves", () => {
    const { result } = renderHook(() => useScope(EVENTS));
    const before = result.current.view;
    act(() => result.current.setFilters({ ...DEFAULT_SCOPE.filters, mc: 3.2 }));

    expect(result.current.view.base).toBe(before.base);
    expect(result.current.view.shown).toBe(before.shown);
    expect(result.current.view.ofType).toBe(before.ofType);
    expect(result.current.deferred.shown).toBe(before.shown);
    // ...and still moves every figure, so the identities above are not a frozen page.
    expect(result.current.view.stats.mc).toBe(3.2);
    expect(result.current.deferred.stats.mc).toBe(3.2);
  });

  it("hands them a new one when the reader really does narrow the catalogue", () => {
    const { result } = renderHook(() => useScope(EVENTS));
    const before = result.current.view;
    act(() => result.current.selectCluster.onChange("deep"));

    expect(result.current.view.base).toBe(before.base);
    expect(result.current.view.shown).not.toBe(before.shown);
    expect(result.current.deferred.shown).toBe(result.current.view.shown);
    expect(result.current.deferred.cluster).toBe("deep");
  });

  it("clears the filters and the group together, and leaves the b card's tab alone", () => {
    const { result } = renderHook(() => useScope(EVENTS));
    act(() => {
      result.current.selectCluster.onChange("shallow");
      result.current.magTabs.onChange("type");
      result.current.setFilters({ ...DEFAULT_SCOPE.filters, minMag: 3 });
    });
    expect(scopeChips(result.current.scope, dicts.es, "es").map((c) => c.key)).toEqual(["cluster", "minMag"]);

    act(() => result.current.clear());
    expect(result.current.scope).toEqual({ ...DEFAULT_SCOPE, magScope: "type" });
    expect(scopeChips(result.current.scope, dicts.es, "es")).toEqual([]);
  });

  it("draws nothing before the catalogue has arrived, and does not change identity waiting", () => {
    const { result, rerender } = renderHook(() => useScope(undefined));
    expect(result.current.view.shown).toEqual([]);
    const before = result.current.view.base;
    rerender();
    expect(result.current.view.base).toBe(before);
  });
});
