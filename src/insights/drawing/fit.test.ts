import { describe, expect, it, vi } from "vitest";
import { fitRegion } from "./fit";
import { largestFit } from "./largest-fit";
import { KM_PER_DEG, kmPerDegLon } from "./km";

describe("largestFit", () => {
  it("keeps the size it starts from when that fits", () => {
    expect(largestFit(13, () => true)).toBe(13);
  });

  it("steps down a pixel at a time to the largest size that fits", () => {
    const tried: number[] = [];
    const fs = largestFit(13, (f) => {
      tried.push(f);
      return f <= 10;
    });
    expect(fs).toBe(10);
    expect(tried).toEqual([13, 12, 11, 10]);
  });

  it("returns null when not even the floor fits, having tried the floor", () => {
    const tried: number[] = [];
    expect(
      largestFit(11, (f) => {
        tried.push(f);
        return false;
      }),
    ).toBeNull();
    expect(tried).toEqual([11, 10, 9]);
  });

  it("tries the floor itself when a step from a fractional size passes it", () => {
    const tried: number[] = [];
    largestFit(11.5, (f) => {
      tried.push(f);
      return false;
    });
    expect(tried).toEqual([11.5, 10.5, 9.5, 9]);
  });

  it("takes another floor", () => {
    expect(largestFit(12, (f) => f <= 7, 8)).toBeNull();
    expect(largestFit(12, (f) => f <= 8, 8)).toBe(8);
  });

  it("returns null for a start that is not a finite number, without trying it", () => {
    for (const from of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const fits = vi.fn(() => false);
      expect(largestFit(from, fits)).toBeNull();
      expect(fits).not.toHaveBeenCalled();
    }
  });

  it("tries only the size it starts from when that is at the floor or under it", () => {
    const tried: number[] = [];
    expect(
      largestFit(8, (f) => {
        tried.push(f);
        return false;
      }),
    ).toBeNull();
    expect(tried).toEqual([8]);
  });
});

describe("fitRegion", () => {
  const box = [
    [-77.3, 3.3],
    [-74.4, 5.95],
  ] as const;
  const extent = [
    [4, 4],
    [396, 296],
  ] as const;
  const inside = ([x, y]: [number, number]) =>
    x >= extent[0][0] - 1e-9 && x <= extent[1][0] + 1e-9 && y >= extent[0][1] - 1e-9 && y <= extent[1][1] + 1e-9;

  it("puts the box's corners inside the extent", () => {
    const { proj } = fitRegion(box, extent);
    for (const [lon, lat] of [box[0], box[1], [box[0][0], box[1][1]], [box[1][0], box[0][1]]] as const) {
      expect(inside(proj([lon, lat])!)).toBe(true);
    }
  });

  it("draws an outline for each of the region's four countries", () => {
    const { outlines } = fitRegion(box, extent);
    // The countries `scripts/insights-region.ts` cut the region to, in the file's order.
    expect(outlines.map((o) => o.name)).toEqual(["Venezuela", "Panama", "Ecuador", "Colombia"]);
    for (const o of outlines) expect(o.d).toMatch(/^M/);
  });
});

describe("KM_PER_DEG", () => {
  // Worked by hand: π × 6371 km / 180 = 111.19493 km in a degree; half that at 60° (cos 60° = ½).
  it("is a degree of a great circle on a 6371 km Earth, 111.195 km", () => {
    expect(KM_PER_DEG).toBeCloseTo(111.19493, 5);
  });

  it("gives a degree of longitude as 111.195 km at the equator and half that at 60°", () => {
    expect(kmPerDegLon(0)).toBeCloseTo(111.19493, 5);
    expect(kmPerDegLon(60)).toBeCloseTo(55.597463, 5);
  });
});
