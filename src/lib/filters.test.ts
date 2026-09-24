import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS, activeFilterChips, applyFilters, defaultFilters, type Filters } from "@/lib/filters";
import { scopeChips, DEFAULT_SCOPE } from "@/lib/scope";
import { dicts } from "@/lib/i18n";
import { MAINSHOCK_ID } from "../../core/seiscomp";

const es = dicts.es;
const labels = (f: Partial<Filters>, cluster: "all" | "shallow" | "deep" = "all") =>
  activeFilterChips({ ...DEFAULT_FILTERS, ...f }, cluster, es, "es", DEFAULT_FILTERS, MAINSHOCK_ID).map(
    (c) => `${c.key}=${c.label}`,
  );

describe("the filters a page is narrowed by", () => {
  it("names none on a page nobody has touched, so the scope bar stays away", () => {
    expect(activeFilterChips(DEFAULT_FILTERS, "all", es, "es", DEFAULT_FILTERS, MAINSHOCK_ID)).toEqual([]);
  });

  it("names the cluster, and carries its colour", () => {
    const [chip] = activeFilterChips(DEFAULT_FILTERS, "shallow", es, "es", DEFAULT_FILTERS, MAINSHOCK_ID);
    expect(chip).toEqual({ key: "cluster", label: es.clusterShort.shallow, cluster: "shallow" });
  });

  it("names every setting that differs from the default", () => {
    expect(labels({ minMag: 2.5, manualOnly: true, excludeMainshock: true, mc: 2.6 }, "deep")).toEqual([
      `cluster=${es.clusterShort.deep}`,
      "minMag=M ≥ 2.5",
      `manualOnly=${es.chipManual}`,
      `excludeMainshock=${es.chipNoMainshock}`,
      "mc=Mc = 2.6",
    ]);
  });

  it("writes the dates as Colombian days, whichever ends the reader set", () => {
    expect(labels({ from: "2026-09-01" })).toEqual(["dates=desde 1 sept"]);
    expect(labels({ to: "2026-09-10" })).toEqual(["dates=10 ago – 10 sept"]);
    expect(labels({ from: "2026-09-01", to: "2026-09-10" })).toEqual(["dates=1 sept – 10 sept"]);
    // Clearing the start date is a change too: it widens the page to the whole catalogue.
    expect(labels({ from: "" })).toEqual([`dates=${es.chipAllDates}`]);
  });

  it("keeps the default start date silent, since it is where the sequence begins", () => {
    expect(labels({ from: DEFAULT_FILTERS.from })).toEqual([]);
  });
});

/**
 * Each zone starts from the day its own sequence began. Chaparral read against Chocó's defaults
 * would show a date chip on a page nobody had touched, and "Restablecer" would reset it to a
 * start date five weeks before its first event.
 */
describe("a zone's own defaults", () => {
  it("starts Chaparral on 20 September and Chocó on 10 August", () => {
    expect(defaultFilters("tolima").from).toBe("2026-09-20");
    expect(defaultFilters("choco")).toEqual(DEFAULT_FILTERS);
    expect(DEFAULT_FILTERS.from).toBe("2026-08-10");
  });

  it("names no filter on an untouched Chaparral page", () => {
    expect(scopeChips({ ...DEFAULT_SCOPE, filters: defaultFilters("tolima") }, es, "es", "tolima", null)).toEqual([]);
  });

  it("names the dates once they differ from the zone's own start", () => {
    const moved = { ...DEFAULT_SCOPE, filters: { ...defaultFilters("tolima"), from: "2026-09-22" } };
    expect(scopeChips(moved, es, "es", "tolima", null).map((c) => c.key)).toEqual(["dates"]);
  });

  // An event from the day before, which the one-day padding on every SGC request brings in.
  it("leaves out what came before the zone's start", () => {
    const e = (time: string) => ({ time, mag: 2.5, status: "manual", id: "SGC2026aaaaaa" }) as never;
    const kept = applyFilters([e("2026-09-19T20:00:00Z"), e("2026-09-20T08:27:00Z")], defaultFilters("tolima"), null);
    expect(kept).toHaveLength(1);
  });
});
