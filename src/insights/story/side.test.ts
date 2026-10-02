import { describe, expect, it } from "vitest";
import type { SourceDistance } from "../claims";
import type { Box } from "../drawing";
import { ARC_KM, pickCorner, sideFocus, sideScale } from "./side";

const d = (hypocentralKm: number, depthKm: number): SourceDistance => ({
  count: 1,
  epicentralKm: Math.sqrt(hypocentralKm ** 2 - depthKm ** 2),
  hypocentralKm,
  depthKm,
  minKm: hypocentralKm,
  maxKm: hypocentralKm,
});

describe("sideFocus", () => {
  it("puts each source at its median depth, where the line to it is exactly the straight-line figure", () => {
    // The 2026-09-24 fixture's deep group: the medians of map distance (77.9) and depth (88.7) are not
    // a right triangle with the median straight-line distance (118.6), so across is worked out from
    // the two figures the drawing states.
    const f = sideFocus({ ...d(118.6, 88.7), epicentralKm: 77.9 });
    expect(f.depthKm).toBe(88.7);
    expect(Math.hypot(f.acrossKm, f.depthKm)).toBeCloseTo(118.6, 9);
  });
  it("stands a source straight under Pereira rather than fail when its depth outruns its distance", () => {
    // Medians are taken apart, so a source nearly under Pereira could have a median depth above its
    // median straight-line distance.
    const f = sideFocus({ ...d(50, 40), depthKm: 55 });
    expect(f.acrossKm).toBe(0);
    expect(f.depthKm).toBe(50);
  });
});

describe("sideScale", () => {
  const foci = [
    { acrossKm: 119, depthKm: 42 },
    { acrossKm: 78, depthKm: 89 },
    { acrossKm: 106, depthKm: 19 },
  ];
  it("is one scale across and down, the larger that fits both, so every line keeps its length", () => {
    const s = sideScale(foci, { width: 200, height: 120 });
    expect(s).toBeCloseTo(Math.min(200 / ARC_KM, 120 / 89), 9);
  });
  it("makes room for the arc across even when every source is nearer", () => {
    const s = sideScale([{ acrossKm: 20, depthKm: 10 }], { width: 120, height: 200 });
    expect(s).toBeCloseTo(1, 9);
  });
});

describe("pickCorner", () => {
  const corners: Box[] = [
    { x0: 0, x1: 100, y0: 300, y1: 400 },
    { x0: 300, x1: 400, y0: 300, y1: 400 },
    { x0: 0, x1: 100, y0: 0, y1: 100 },
  ];
  // Events spread away from every corner, so a few under one stay under the share.
  const spread = Array.from({ length: 200 }, (_, i) => [150 + (i % 10), 150 + Math.floor(i / 10)] as const);
  it("keeps the first corner whenever it is clear, even where a later one hides fewer events", () => {
    const got = pickCorner(corners, { boxes: [], lines: [], points: [...spread, [50, 350], [50, 351], [50, 352]] });
    expect(got).toBe(corners[0]);
  });
  it("passes over a corner that would cover a stated mark or cut a line", () => {
    const got = pickCorner(corners, {
      boxes: [{ x0: 10, x1: 40, y0: 310, y1: 320 }],
      lines: [
        [
          [350, 0],
          [350, 399],
        ],
      ],
      points: spread,
    });
    expect(got).toBe(corners[2]);
  });
  it("passes over a corner that would hide more than its share of the events", () => {
    const cluster = Array.from({ length: 50 }, () => [50, 350] as const);
    expect(pickCorner(corners, { boxes: [], lines: [], points: [...spread, ...cluster] })).toBe(corners[1]);
  });
  it("covers the fewest stated marks, then the fewest events, when no corner is clear", () => {
    const got = pickCorner(corners, {
      boxes: [
        { x0: 10, x1: 40, y0: 310, y1: 320 },
        { x0: 310, x1: 340, y0: 310, y1: 320 },
        { x0: 10, x1: 40, y0: 10, y1: 20 },
      ],
      lines: [],
      points: [
        [350, 350],
        [50, 50],
        [51, 50],
      ],
    });
    expect(got).toBe(corners[0]);
  });
});
