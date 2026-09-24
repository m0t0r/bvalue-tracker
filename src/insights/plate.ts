/**
 * The subducting Nazca plate under the two zones, from USGS's Slab2 model, and the ground along the
 * story's two cuts, from GEBCO 2020. Both are committed data (`section.json`, written by
 * `scripts/insights-section.ts`); nothing about the plate is drawn or stated from anywhere else.
 */
import raw from "./section.json";

export interface Plate {
  /** Depth of the plate's top, its thickness and Slab2's stated depth uncertainty, in km. */
  topKm: number;
  thicknessKm: number;
  uncertaintyKm: number;
}

interface Grid {
  lon0: number;
  lat0: number;
  step: number;
  nx: number;
  ny: number;
  topKm: (number | null)[];
  thicknessKm: (number | null)[];
  uncertaintyKm: (number | null)[];
}

export interface Cut {
  lat: number;
  lon0: number;
  step: number;
  /** Where the plate's edge, the trench, crosses the cut. */
  trenchLon: number;
  /** Ground and sea floor every `step` degrees from `lon0`, in metres above sea level. */
  elevationM: number[];
}

export const SLAB2: Grid = raw.plate;
export const CUTS: Record<"choco" | "tolima", Cut> = raw.cuts;

/**
 * The plate at a point, interpolated between the four grid nodes around it. Null outside the grid
 * or where any of the four has no model: Slab2 ends at the trench, and nothing is extrapolated.
 */
export function plateAt(lat: number, lon: number, grid: Grid = SLAB2): Plate | null {
  // Rounded so that a point on a node lands on it: (-78.1 + 79) / 0.1 is 8.999…, whose floor is the
  // cell to the west, which by the trench has no model.
  const fx = Math.round(((lon - grid.lon0) / grid.step) * 1e9) / 1e9;
  const fy = Math.round(((lat - grid.lat0) / grid.step) * 1e9) / 1e9;
  // A point exactly on the last row or column uses the cell before it.
  const i = Math.min(Math.floor(fx), grid.nx - 2);
  const j = Math.min(Math.floor(fy), grid.ny - 2);
  if (!(i >= 0 && j >= 0 && fx <= grid.nx - 1 && fy <= grid.ny - 1)) return null;
  const tx = fx - i;
  const ty = fy - j;
  // A node with no weight is not needed: a point on the trench's side of a cell can still be on a node.
  const corners = [
    [j * grid.nx + i, (1 - tx) * (1 - ty)],
    [j * grid.nx + i + 1, tx * (1 - ty)],
    [(j + 1) * grid.nx + i, (1 - tx) * ty],
    [(j + 1) * grid.nx + i + 1, tx * ty],
  ] as const;
  const at = (vs: (number | null)[]) => {
    let sum = 0;
    for (const [k, w] of corners) {
      if (w === 0) continue;
      const v = vs[k];
      if (v === null || v === undefined) return null;
      sum += v * w;
    }
    return sum;
  };
  const topKm = at(grid.topKm);
  const thicknessKm = at(grid.thicknessKm);
  const uncertaintyKm = at(grid.uncertaintyKm);
  return topKm === null || thicknessKm === null || uncertaintyKm === null
    ? null
    : { topKm, thicknessKm, uncertaintyKm };
}

/**
 * Where a depth sits against the plate:
 * - `above`: shallower than the plate's top by more than the margin, in the overriding plate;
 * - `inside`: more than the margin below the top and above the bottom;
 * - `below`: more than the margin under the bottom;
 * - `close`: within the margin of the top or the bottom, where the model cannot decide.
 *
 * The margin is Slab2's uncertainty at that point plus the event's own depth error, added rather
 * than combined in quadrature, so the rule errs towards `close`. Slab2 states no separate
 * uncertainty for the thickness, so the bottom takes the same margin as the top.
 */
export type PlateSide = "above" | "inside" | "below" | "close";

export function plateSide(depthKm: number, depthErrorKm: number, plate: Plate): { side: PlateSide; marginKm: number } {
  const marginKm = plate.uncertaintyKm + Math.max(0, depthErrorKm);
  const bottom = plate.topKm + plate.thicknessKm;
  const side: PlateSide =
    depthKm < plate.topKm - marginKm
      ? "above"
      : depthKm <= plate.topKm + marginKm
        ? "close"
        : depthKm < bottom - marginKm
          ? "inside"
          : depthKm <= bottom + marginKm
            ? "close"
            : "below";
  return { side, marginKm };
}

/** Elevation along a cut at a longitude, in metres, linear between samples; null off the cut. */
export function groundAt(cut: Cut, lon: number): number | null {
  const f = (lon - cut.lon0) / cut.step;
  const i = Math.floor(f);
  const last = cut.elevationM.length - 1;
  if (f < 0 || f > last) return null;
  if (i >= last) return cut.elevationM[last]!;
  const t = f - i;
  return cut.elevationM[i]! * (1 - t) + cut.elevationM[i + 1]! * t;
}

/** The plate along a cut, every sample from the first with a model (the trench) to `lon1`. */
export function plateAlong(cut: Cut, lon1: number): ({ lon: number } & Plate)[] {
  const out: ({ lon: number } & Plate)[] = [];
  for (let k = 0; cut.lon0 + k * cut.step <= lon1 + 1e-9; k++) {
    const lon = cut.lon0 + k * cut.step;
    const p = plateAt(cut.lat, lon);
    if (p) out.push({ lon, ...p });
  }
  return out;
}
