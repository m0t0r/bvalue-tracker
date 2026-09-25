import { describe, expect, it } from "vitest";
import { GROUND, RUPTURE } from "./block";
import { CUTS, SLAB2 } from "./plate";

const KM_PER_DEG = 111.195;
/** Distance and bearing on a local flat projection: at this size (~150 km) it is good to ~0.1%. */
function offset(a: readonly [number, number], b: readonly [number, number]) {
  const cos = Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  const east = (b[0] - a[0]) * KM_PER_DEG * cos;
  const north = (b[1] - a[1]) * KM_PER_DEG;
  return { km: Math.hypot(east, north), bearing: ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360 };
}

describe("the committed ground grid", () => {
  it("covers the Slab2 box at twice its resolution", () => {
    expect(GROUND.lon0).toBe(SLAB2.lon0);
    expect(GROUND.lat0).toBe(SLAB2.lat0);
    expect(GROUND.step).toBe(SLAB2.step / 2);
    expect([GROUND.nx, GROUND.ny]).toEqual([2 * SLAB2.nx - 1, 2 * SLAB2.ny - 1]);
    expect(GROUND.elevationM).toHaveLength(GROUND.nx * GROUND.ny);
  });

  it("is the same GEBCO 2020 as Chocó's cut wherever the two share a point", () => {
    // Chocó's cut (4.65° N) is a row of the grid; the two share every 0.1° of longitude.
    const row = Math.round((CUTS.choco.lat - GROUND.lat0) / GROUND.step);
    let shared = 0;
    CUTS.choco.elevationM.forEach((m, k) => {
      const lon = CUTS.choco.lon0 + k * CUTS.choco.step;
      const i = (lon - GROUND.lon0) / GROUND.step;
      if (Math.abs(i - Math.round(i)) > 1e-6) return;
      expect(GROUND.elevationM[row * GROUND.nx + Math.round(i)], `${lon}°`).toBe(m);
      shared++;
    });
    expect(shared).toBeGreaterThan(20);
  });

  it("runs row by row from the Pacific floor in the south-west to the Nevado del Ruiz", () => {
    expect(GROUND.elevationM[0]).toBe(-3840);
    // The 0.05° grid (~5.5 km) steps over the summit (5,321 m): its highest node is 3 km west of it.
    const top = Math.max(...GROUND.elevationM);
    const k = GROUND.elevationM.indexOf(top);
    expect(top).toBe(4610);
    expect(GROUND.lon0 + (k % GROUND.nx) * GROUND.step).toBeCloseTo(-75.35, 6);
    expect(GROUND.lat0 + Math.floor(k / GROUND.nx) * GROUND.step).toBeCloseTo(4.9, 6);
  });
});

/**
 * USGS's finite-fault model for us6000tjl2, version 1. Every figure recomputed independently in
 * Python from the raw FFM.geojson (not from `block.json`).
 */
describe("the committed rupture plane", () => {
  type P = [number, number, number];
  const [topStart, topEnd, bottomEnd, bottomStart] = RUPTURE.corners as [P, P, P, P];

  it("is USGS's plane: strike 226°, dip 72°, 150 × 66 km, 82–145 km deep", () => {
    expect(RUPTURE.corners.map((c) => c.length)).toEqual([3, 3, 3, 3]);
    expect(RUPTURE.strike).toBeCloseTo(225.57, 2);
    expect(RUPTURE.dip).toBeCloseTo(71.78, 2);
    expect(RUPTURE.lengthKm).toBe(150);
    expect(RUPTURE.widthKm).toBe(66);
    expect(topStart[2]).toBeCloseTo(82.3, 1);
    expect(topEnd[2]).toBeCloseTo(82.3, 1);
    expect(bottomStart[2]).toBeCloseTo(144.9, 1);
    expect(bottomEnd[2]).toBeCloseTo(144.9, 1);
  });

  it("has corners that agree with its own strike, dip and size", () => {
    const along = offset([topStart[0], topStart[1]], [topEnd[0], topEnd[1]]);
    expect(along.km).toBeCloseTo(RUPTURE.lengthKm, -1);
    expect(along.bearing).toBeCloseTo(RUPTURE.strike, 0);
    // Down the dip, the plane moves to the right of its strike, by depth ÷ tan(dip).
    const down = offset([topEnd[0], topEnd[1]], [bottomEnd[0], bottomEnd[1]]);
    const drop = bottomEnd[2] - topEnd[2];
    expect(down.km).toBeCloseTo(drop / Math.tan((RUPTURE.dip * Math.PI) / 180), 0);
    expect(down.bearing).toBeCloseTo((RUPTURE.strike + 90) % 360, 0);
    expect(Math.hypot(down.km, drop)).toBeCloseTo(RUPTURE.widthKm, 0);
  });

  it("holds the slip of each of its 25 × 11 patches, in whole centimetres", () => {
    expect([RUPTURE.alongStrike, RUPTURE.downDip]).toEqual([25, 11]);
    expect(RUPTURE.slipCm).toHaveLength(275);
    expect(Math.max(...RUPTURE.slipCm)).toBe(398);
    expect(RUPTURE.slipCm.reduce((a, b) => a + b, 0) / 275).toBeCloseTo(25.8, 0);
  });

  it("orders the patches row by row from the top, each row from the strike's start", () => {
    // The largest slip is the patch 93.7–99.4 km deep, 84–90 km along the strike from the NE end.
    const k = RUPTURE.slipCm.indexOf(398);
    expect([Math.floor(k / 25), k % 25]).toEqual([2, 14]);
    // The top row's two ends: 2.87 cm at the NE end, 0.93 cm at the SW end.
    expect([RUPTURE.slipCm[0], RUPTURE.slipCm[24]]).toEqual([3, 1]);
  });

  it("keeps USGS's own hypocentre, which is neither SGC's nor USGS's catalogue location", () => {
    expect(RUPTURE.hypocentre).toEqual({ lat: 4.987, lon: -76.082, depthKm: 125 });
    expect(RUPTURE.eventId).toBe("us6000tjl2");
  });
});
