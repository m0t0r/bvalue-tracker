import captured from "../../test/fixtures/api-events-2026-09-24.json";
import { describe, expect, it } from "vitest";
import { insights, type Catalogues } from "./claims";
import { CUTS, groundAt, plateAt, plateSide, SLAB2, type Plate } from "./plate";
import { storyModel } from "./story/model";

const NOW = Date.parse("2026-09-24T14:44:03Z");

// A 3 × 3 grid, 1° apart, one node without a model (the trench's side).
const grid = {
  lon0: 0,
  lat0: 0,
  step: 1,
  nx: 3,
  ny: 3,
  topKm: [null, 10, 20, 10, 20, 30, 20, 30, 40],
  thicknessKm: [null, 60, 60, 60, 60, 60, 60, 60, 60],
  uncertaintyKm: [null, 5, 5, 5, 5, 5, 5, 5, 5],
};

describe("plateAt", () => {
  it("interpolates between the four nodes around a point", () => {
    expect(plateAt(1.5, 1.5, grid)).toEqual({ topKm: 30, thicknessKm: 60, uncertaintyKm: 5 });
    expect(plateAt(1, 1.25, grid)?.topKm).toBeCloseTo(22.5);
  });

  it("is the node's own value on a node, the last row and column included", () => {
    expect(plateAt(2, 2, grid)?.topKm).toBe(40);
    expect(plateAt(0, 2, grid)?.topKm).toBe(20);
  });

  it("extrapolates nothing: off the grid, or next to a node without a model", () => {
    expect(plateAt(-0.1, 1, grid)).toBeNull();
    expect(plateAt(1, 2.1, grid)).toBeNull();
    expect(plateAt(0.5, 0.5, grid)).toBeNull();
  });
});

describe("plateSide", () => {
  const p: Plate = { topKm: 80, thicknessKm: 60, uncertaintyKm: 20 };

  it("adds the event's depth error to Slab2's uncertainty", () => {
    expect(plateSide(50, 5, p).marginKm).toBe(25);
    // A negative error is not a narrower margin.
    expect(plateSide(50, -5, p).marginKm).toBe(20);
  });

  it("says above, inside or below only beyond the margin, and close within it", () => {
    expect(plateSide(54.9, 5, p).side).toBe("above");
    expect(plateSide(55, 5, p).side).toBe("close");
    expect(plateSide(105, 5, p).side).toBe("close");
    expect(plateSide(105.1, 5, p).side).toBe("inside");
    expect(plateSide(114.9, 5, p).side).toBe("inside");
    expect(plateSide(115, 5, p).side).toBe("close");
    expect(plateSide(165, 5, p).side).toBe("close");
    expect(plateSide(165.1, 5, p).side).toBe("below");
  });
});

describe("the committed Slab2 grid", () => {
  // Nodes read straight from Slab2's own `sam_slab2_{dep,thk,unc}_02.23.18.xyz`.
  it.each([
    [4.8, -76.3, 87, 66, 23],
    [4.7, -78.1, 8, 63, 6],
    [3.9, -75.6, 160, 63, 22],
  ])("holds Slab2's node at %s° N, %s°", (lat, lon, top, thk, unc) => {
    const p = plateAt(lat, lon)!;
    expect(p.topKm).toBeCloseTo(top, 9);
    expect(p.thicknessKm).toBeCloseTo(thk, 9);
    expect(p.uncertaintyKm).toBeCloseTo(unc, 9);
  });

  it("has no model west of the trench", () => {
    expect(plateAt(CUTS.choco.lat, CUTS.choco.trenchLon - 0.2)).toBeNull();
    expect(SLAB2.topKm.some((v) => v === null)).toBe(true);
  });
});

describe("the ground along the cuts", () => {
  it("is sea floor west of the trench and mountains near its east end", () => {
    const sea = groundAt(CUTS.choco, CUTS.choco.trenchLon - 0.1)!;
    expect(sea).toBeLessThan(-2000);
    expect(Math.max(...CUTS.choco.elevationM)).toBeGreaterThan(3000);
  });

  it("is linear between samples and null off the cut", () => {
    const c = { ...CUTS.choco, lon0: 0, step: 1, elevationM: [0, 100, 300] };
    expect(groundAt(c, 1.5)).toBe(200);
    expect(groundAt(c, 2)).toBe(300);
    expect(groundAt(c, -0.01)).toBeNull();
    expect(groundAt(c, 2.01)).toBeNull();
  });
});

/**
 * Production's catalogue of 2026-09-24 against the committed grid. Recomputed independently in
 * Python from Slab2's raw XYZ files (not from `section.json`), with the same medians and margin.
 */
describe("on the production catalogue of 2026-09-24", () => {
  const plate = storyModel(insights(captured as Catalogues, NOW)).plate;

  it("puts the shallow group above the plate, outside the margin", () => {
    expect(plate.shallow?.side).toBe("above");
    expect(plate.shallow?.plate.topKm).toBeCloseTo(72.52, 1);
    expect(plate.shallow?.marginKm).toBeCloseTo(27.93, 1);
  });

  it("cannot decide for the deep group or the M7.4: both within the margin of the plate's top", () => {
    expect(plate.deep?.side).toBe("close");
    expect(plate.deep?.plate.topKm).toBeCloseTo(82.06, 1);
    expect(plate.deep?.marginKm).toBeCloseTo(28.32, 1);
    expect(plate.main?.side).toBe("close");
    expect(plate.main?.plate.topKm).toBeCloseTo(82.6, 1);
    expect(plate.main?.marginKm).toBeCloseTo(25.66, 1);
  });

  it("puts the Chaparral swarm far above it, in the crust", () => {
    expect(plate.tolima?.side).toBe("above");
    expect(plate.tolima?.plate.topKm).toBeCloseTo(160.16, 1);
  });
});
