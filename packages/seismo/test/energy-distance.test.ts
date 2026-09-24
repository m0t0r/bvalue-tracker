import { describe, expect, it } from "vitest";
import {
  amplitudeRatio,
  bearingDeg,
  energyRatio,
  epicentralKm,
  hypocentralKm,
  largestMomentShare,
} from "../src/index.ts";

describe("energyRatio and amplitudeRatio", () => {
  it("gives ~31.6× energy and 10× amplitude per magnitude unit", () => {
    expect(energyRatio(5, 4)).toBeCloseTo(31.62, 2);
    expect(energyRatio(6, 4)).toBeCloseTo(1000, 6);
    expect(amplitudeRatio(5, 4)).toBeCloseTo(10, 9);
    // How many M4.0s make one M7.4: 10^(1.5 × 3.4) = 10^5.1.
    expect(energyRatio(7.4, 4)).toBeCloseTo(125_892.5, 0);
  });
});

describe("largestMomentShare", () => {
  it("is 1 for one event, a half for two equal ones, and null for none", () => {
    expect(largestMomentShare([{ mag: 3 }])).toBe(1);
    expect(largestMomentShare([{ mag: 3 }, { mag: 3 }])).toBeCloseTo(0.5, 12);
    expect(largestMomentShare([])).toBeNull();
  });
  it("gives the one-unit-larger event 31.6 parts in 32.6", () => {
    expect(largestMomentShare([{ mag: 5 }, { mag: 4 }])).toBeCloseTo(31.623 / 32.623, 4);
  });
});

describe("distances", () => {
  const pereira = { lat: 4.8133, lon: -75.6961 };
  it("measures a degree of latitude as ~111.2 km", () => {
    expect(epicentralKm({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(111.19, 1);
  });
  it("puts the M7.4 of 2026-08-10 69 km from Pereira on the map and 124 km in a straight line", () => {
    const m74 = { lat: 4.99093472, lon: -76.29174107, depthKm: 103.4093192 };
    expect(epicentralKm(m74, pereira)).toBeCloseTo(68.88, 1);
    expect(hypocentralKm(m74, pereira)).toBeCloseTo(124.25, 1);
  });
  it("gives bearings clockwise from north", () => {
    expect(bearingDeg({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(0, 6);
    expect(bearingDeg({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(90, 6);
    expect(bearingDeg({ lat: 0, lon: 0 }, { lat: 0, lon: -1 })).toBeCloseTo(270, 6);
  });
});
