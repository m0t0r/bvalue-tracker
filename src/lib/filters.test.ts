import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS, activeFilterChips, type Filters } from "@/lib/filters";
import { dicts } from "@/lib/i18n";

const es = dicts.es;
const labels = (f: Partial<Filters>, cluster: "all" | "shallow" | "deep" = "all") =>
  activeFilterChips({ ...DEFAULT_FILTERS, ...f }, cluster, es, "es").map((c) => `${c.key}=${c.label}`);

describe("the filters a page is narrowed by", () => {
  it("names none on a page nobody has touched, so the scope bar stays away", () => {
    expect(activeFilterChips(DEFAULT_FILTERS, "all", es, "es")).toEqual([]);
  });

  it("names the cluster, and carries its colour", () => {
    const [chip] = activeFilterChips(DEFAULT_FILTERS, "shallow", es, "es");
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
