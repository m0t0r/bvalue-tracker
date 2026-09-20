import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCatalogHtml } from "../core/seiscomp.ts";
import { dailyCounts } from "../src/lib/daily-counts.ts";

const fixture = parseCatalogHtml(
  readFileSync(new URL("./fixtures/seiscomp-2026-08-10_2026-09-18.html", import.meta.url), "utf8"),
).events;

const day = (date: string) => Date.parse(`${date}T05:00:00Z`); // Colombian midnight, UTC−5 all year

describe("events per Colombian day on the captured catalogue", () => {
  const { days } = dailyCounts(fixture);

  // Counted independently, straight from the same 786 events, in Python.
  it("runs from the day of the mainshock to the day the catalogue was captured", () => {
    expect(days).toHaveLength(40);
    expect(days[0]!.start).toBe(day("2026-08-10"));
    expect(days.at(-1)!.start).toBe(day("2026-09-18"));
  });

  it("splits each day by cluster, and the two add up to its total", () => {
    expect(days[0]).toEqual({ start: day("2026-08-10"), shallow: 10, deep: 51, total: 61 });
    expect(days.at(-1)).toEqual({ start: day("2026-09-18"), shallow: 24, deep: 0, total: 24 });
  });

  it("counts every event exactly once", () => {
    const sum = (k: "shallow" | "deep" | "total") => days.reduce((n, d) => n + d[k], 0);
    expect([sum("shallow"), sum("deep")]).toEqual([639, 147]);
    expect(sum("total")).toBe(fixture.length);
  });
});

describe("the two maxima the two charts scale against", () => {
  const { maxTotal, maxCluster } = dailyCounts(fixture);

  it("reports the busiest day's total, and the most one cluster had in a day, and they differ", () => {
    // 10 August: 51 deep and 10 shallow. The stacked bars reach 61; the per-cluster strips reach 51.
    expect([maxTotal, maxCluster]).toEqual([61, 51]);
  });
});

describe("what dailyCounts does not assume", () => {
  const at = (time: string, depthKm: number) => ({ time, depthKm });

  it("gives a day with no events its own entry, so a quiet day is a gap in the bars and not a missing day", () => {
    const { days } = dailyCounts([at("2026-08-10T15:00:00Z", 40), at("2026-08-13T15:00:00Z", 40)]);
    expect(days.map((d) => d.total)).toEqual([1, 0, 0, 1]);
    expect(days[1]!.start).toBe(day("2026-08-11"));
  });

  it("reads the same catalogue the same way whatever order it arrives in", () => {
    const shuffled = [...fixture].reverse();
    expect(dailyCounts(shuffled)).toEqual(dailyCounts(fixture));
  });

  it("puts an event in the Colombian day it happened on, not the UTC one", () => {
    // 03:10 UTC on 11 August is still 22:10 on 10 August in Colombia.
    const { days } = dailyCounts([at("2026-08-11T03:10:00Z", 40)]);
    expect(days).toEqual([{ start: day("2026-08-10"), shallow: 1, deep: 0, total: 1 }]);
  });

  it("splits at the same depth as the rest of the page, with the cut itself deep", () => {
    const { days } = dailyCounts([at("2026-08-10T15:00:00Z", 69.99), at("2026-08-10T16:00:00Z", 70)]);
    expect(days).toEqual([{ start: day("2026-08-10"), shallow: 1, deep: 1, total: 2 }]);
  });

  it("has no days and no maximum for an empty catalogue, rather than a day it invented", () => {
    expect(dailyCounts([])).toEqual({ days: [], maxTotal: 0, maxCluster: 0 });
  });

  // The page reads events straight from D1, which is deliberately outside the admission gate, and
  // this runs inside a render with no error boundary above it: one unreadable time must cost that
  // event, not the whole dashboard.
  it("leaves out an event whose time cannot be read, instead of throwing", () => {
    const { days, maxTotal } = dailyCounts([at("2026-08-10T15:00:00Z", 40), at("not a date", 40)]);
    expect(days).toEqual([{ start: day("2026-08-10"), shallow: 1, deep: 0, total: 1 }]);
    expect(maxTotal).toBe(1);
  });

  it("survives a catalogue in which no time can be read at all", () => {
    expect(dailyCounts([at("not a date", 40)])).toEqual({ days: [], maxTotal: 0, maxCluster: 0 });
  });
});
