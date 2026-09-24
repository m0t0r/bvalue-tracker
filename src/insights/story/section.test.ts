import { describe, expect, it } from "vitest";
import { CUTS, type Cut } from "../plate";
import { TOWNS, onCut } from "../region";
import { cutEnd, frameSections, kmPerDegLon } from "./section";

/** A cut with ground data from 0.2° west of its trench to −74°. */
const cut = (lat: number, trenchLon: number): Cut => {
  const lon0 = trenchLon - 0.2;
  const n = Math.round((-74 - lon0) / 0.02) + 1;
  return { lat, lon0, step: 0.02, trenchLon, elevationM: Array.from({ length: n }, () => 0) };
};

describe("frameSections", () => {
  const short = { cut: cut(4.65, -78), lon1: -76 };
  const long = { cut: cut(3.86, -78.5), lon1: -75.5 };
  const km = (s: typeof short) => (s.lon1 - s.cut.trenchLon) * kmPerDegLon(s.cut.lat);

  it("draws every cut at the one scale that fits the longest", () => {
    const f = frameSections({ short, long }, 200, 800, 900, false);
    expect(f.short.px).toBe(f.long.px);
    // 800 wide less 60 + 24 of padding, over the longer cut's ~333 km; the height would allow more.
    expect(f.long.px).toBeCloseTo((800 - 84) / km(long), 12);
    expect(f.long.x1 - f.long.x0).toBeCloseTo(800 - 84, 9);
  });

  it("is true to scale: a kilometre across is a kilometre down", () => {
    const f = frameSections({ short, long }, 200, 800, 900, false);
    const across = f.short.x(short.cut.trenchLon + 1 / kmPerDegLon(short.cut.lat)) - f.short.x(short.cut.trenchLon);
    expect(across).toBeCloseTo(f.short.y(1) - f.short.y(0), 9);
  });

  it("lets the depth set the scale when the drawing is short", () => {
    const f = frameSections({ short, long }, 200, 800, 300, false);
    expect(f.long.px).toBeCloseTo((300 - 104 - 56) / 200, 12);
  });

  it("takes its scale only from the cuts it is told to, so a hidden cut does not shrink a shown one", () => {
    const both = frameSections({ short, long }, 200, 800, 900, false);
    const alone = frameSections({ short, long }, 200, 800, 900, false, ["short"]);
    expect(alone.short.px).toBeCloseTo((800 - 84) / km(short), 12);
    expect(alone.short.px).toBeGreaterThan(both.short.px);
  });

  it("ends a cut no further east than its ground data", () => {
    const past = { cut: cut(3.86, -78.5), lon1: -73.5 };
    const f = frameSections({ past }, 200, 800, 900, false);
    expect(cutEnd(past.cut)).toBeCloseTo(-74, 9);
    expect(f.past.lon1).toBeCloseTo(-74, 9);
  });

  it("starts each cut at its trench and centres it in the width", () => {
    const f = frameSections({ short, long }, 200, 800, 900, false);
    expect(f.short.x(short.cut.trenchLon)).toBeCloseTo(f.short.x0, 9);
    expect(f.short.x(short.lon1)).toBeCloseTo(f.short.x1, 9);
    expect(f.short.x0 - 60).toBeCloseTo(800 - 24 - f.short.x1, 9);
  });
});

describe("the towns drawn on a cut", () => {
  it("are those within ~5.5 km of its latitude: Buenaventura on Chaparral's, not Chaparral's own town", () => {
    const on = (c: Cut) => TOWNS.filter((t) => t.kind === "cut" && onCut(t, c)).map((t) => t.id);
    expect(on(CUTS.tolima)).toEqual(["buenaventura"]);
    expect(on(CUTS.choco)).toEqual([]);
    expect(
      onCut(
        TOWNS.find((t) => t.id === "chaparral")!,
        CUTS.tolima,
      ),
    ).toBe(false);
  });
});
