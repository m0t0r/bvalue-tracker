import { describe, expect, it } from "vitest";
import { energyRatio } from "@bvalue/seismo";
import { HISTORY, HISTORY_FOR, compareHistory, rankLayout } from "./history";

/** SGC's location for the M7.4, as the catalogue gives it. */
const M74 = {
  id: HISTORY_FOR,
  mag: 7.4,
  lat: 4.99,
  lon: -76.29,
  depthKm: 103.4,
  t: Date.parse("2026-08-10T12:34:27Z"),
};

describe("the committed history", () => {
  it("holds ISC-GEM's moment magnitudes for the picked events, and the tenths the page shows", () => {
    const mags = Object.fromEntries(HISTORY.quakes.map((q) => [q.id, q.publishedMag]));
    // Re-fetched from ComCat (catalog=iscgem) on 2026-09-25.
    expect(mags).toEqual({
      iscgem16957884: 8.45,
      iscgem654039: 8.09,
      iscgem656068: 7.2,
      iscgem167996: 6.78,
      iscgem89834: 6.53,
      iscgem118073: 6.35,
      iscgem1443400: 6.14,
      iscgem581906: 5.64,
    });
    // Half up on the decimal: 8.45 is 8.5 and 6.35 is 6.4, which toFixed(1) would make 8.4 and 6.3.
    expect(HISTORY.quakes.map((q) => q.mag)).toEqual([8.5, 8.1, 7.2, 6.8, 6.5, 6.4, 6.1, 5.6]);
  });

  it("puts the region's largest before the M7.4 at the 1979 Eje Cafetero event, Mw 7.2", () => {
    expect(HISTORY.region).toMatchObject({ radiusKm: 250, from: 1904, maxMag: 7.2, maxId: "iscgem656068" });
  });
});

describe("compareHistory", () => {
  const h = compareHistory(M74, true);

  it("splits the picked events into those the mainshock outsizes and those that outsize it", () => {
    expect(h.smaller.map((r) => r.quake.id)).toEqual([
      "iscgem656068",
      "iscgem167996",
      "iscgem89834",
      "iscgem118073",
      "iscgem1443400",
      "iscgem581906",
    ]);
    expect(h.larger.map((r) => r.quake.id)).toEqual(["iscgem16957884", "iscgem654039"]);
  });

  it("gives each energy ratio the way round a reader says it", () => {
    const armenia = h.smaller.find((r) => r.quake.id === "iscgem1443400")!;
    expect(armenia.relation).toBe("more");
    expect(armenia.times).toBeCloseTo(energyRatio(7.4, 6.1), 9);
    expect(Math.round(armenia.times)).toBe(89);
    const tumaco = h.larger.find((r) => r.quake.id === "iscgem654039")!;
    expect(tumaco.relation).toBe("less");
    expect(tumaco.times).toBeCloseTo(energyRatio(8.1, 7.4), 9);
    expect(Math.round(tumaco.times)).toBe(11);
  });

  it("calls the M7.4 the region's largest in 122 years of records", () => {
    expect(h.largestInRegion).toBe(true);
    expect(h.years).toBe(122);
  });

  it("counts the years to the mainshock, not to the reader's clock", () => {
    expect(compareHistory({ ...M74, t: Date.parse("2026-12-31T12:00:00Z") }, true).years).toBe(122);
  });

  it("claims the region only once SGC has reviewed the mainshock", () => {
    expect(compareHistory(M74, false).largestInRegion).toBe(false);
  });

  it("takes every ratio from the tenth the reader sees, on both sides", () => {
    // 7.25 shows as M7.3: against Eje Cafetero's 7.2 that is 10^0.15, not 10^0.075.
    const r = compareHistory({ ...M74, mag: 7.25 }, true).near!;
    expect(r.relation).toBe("more");
    expect(r.times).toBeCloseTo(energyRatio(7.3, 7.2), 9);
  });

  it("claims the region only for the event the record was read for, and only when it stands a tenth clear", () => {
    expect(compareHistory({ ...M74, id: "SGC2026other" }, true).largestInRegion).toBe(false);
    expect(compareHistory({ ...M74, mag: 7.2 }, true).largestInRegion).toBe(false);
    expect(compareHistory({ ...M74, mag: 7.3 }, true).largestInRegion).toBe(true);
  });

  it("finds 1979's event near the same place and depth", () => {
    expect(h.near?.quake.id).toBe("iscgem656068");
    // SGC's 4.99° N 76.29° W against ISC-GEM's 4.73° N 76.16° W: ~32 km.
    expect(h.near!.km).toBeGreaterThan(30);
    expect(h.near!.km).toBeLessThan(34);
    expect(h.near!.relation).toBe("more");
    expect(h.near!.times).toBeCloseTo(2, 1);
  });

  it("finds nothing near a mainshock far from every picked event", () => {
    expect(compareHistory({ ...M74, lat: 8, lon: -73 }, true).near).toBeNull();
  });

  it("compares in whole tenths: an event of the same tenth is the same size", () => {
    const same = compareHistory({ ...M74, mag: 7.19 }, true);
    expect(same.smaller.find((r) => r.quake.id === "iscgem656068")?.relation).toBe("same");
    expect(same.near?.relation).toBe("same");
  });

  it("moves an event across when a revised magnitude drops below it", () => {
    const revised = compareHistory({ ...M74, mag: 7.1 }, true);
    expect(revised.larger.map((r) => r.quake.id)).toContain("iscgem656068");
    expect(revised.near?.relation).toBe("less");
  });

  it("names the 1995 pair and Armenia only while the mainshock outsizes each", () => {
    expect(h.featured.armenia?.quake.id).toBe("iscgem1443400");
    expect(h.featured.pair?.map((r) => r.quake.id)).toEqual(["iscgem118073", "iscgem89834"]);
    const small = compareHistory({ ...M74, mag: 6.4 }, true);
    expect(small.featured.armenia).not.toBeNull();
    expect(small.featured.pair).toBeNull();
  });
});

describe("rankLayout", () => {
  const mags = [8.45, 8.09, 7.4, 7.2, 6.14, 5.64];

  it("keeps every square's area true to energy", () => {
    const { rows } = rankLayout(mags, { height: 700, maxSide: 400, minRow: 30, gap: 8 });
    for (let i = 1; i < mags.length; i++) {
      expect((rows[0]!.side / rows[i]!.side) ** 2).toBeCloseTo(energyRatio(mags[0]!, mags[i]!), 6);
    }
  });

  it("fills the height it is given, rows at least minRow tall and never overlapping", () => {
    const { rows } = rankLayout(mags, { height: 700, maxSide: 1000, minRow: 30, gap: 8 });
    const last = rows.at(-1)!;
    expect(last.y + last.h).toBeCloseTo(700, 0);
    expect(last.y + last.h).toBeLessThanOrEqual(700);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]!.h).toBeGreaterThanOrEqual(30);
      expect(rows[i]!.y).toBeCloseTo(rows[i - 1]!.y + rows[i - 1]!.h + 8, 9);
    }
  });

  it("stops at the widest square it may draw", () => {
    expect(rankLayout(mags, { height: 5000, maxSide: 200, minRow: 30, gap: 8 }).rows[0]!.side).toBe(200);
  });

  it("gives up on a height that cannot hold the rows' minimum", () => {
    expect(rankLayout(mags, { height: 100, maxSide: 200, minRow: 30, gap: 8 }).rows).toEqual([]);
  });
});
