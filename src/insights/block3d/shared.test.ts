import captured from "../../../test/fixtures/api-events-2026-09-24.json";
import { describe, expect, it } from "vitest";
import { GROUND } from "../block";
import { insights, type Catalogues } from "../claims";
import { EAST, FLOOR_KM, NORTH, PRESETS, SOUTH, WEST, blockModel, framing, mapUv, type Preset } from "./shared";

const NOW = Date.parse("2026-09-24T14:44:03Z");
const data = insights(captured as Catalogues, NOW);

/** Where a point lands on screen for a camera at `pos` looking at `target`: [-1, 1] is in view. */
function onScreen(p: number[], pos: number[], target: number[], fovDeg: number, aspect: number) {
  const sub = (a: number[], b: number[]) => a.map((v, i) => v - b[i]!);
  const norm = (a: number[]) => a.map((v) => v / Math.hypot(...a));
  const cross = (a: number[], b: number[]) => [
    a[1]! * b[2]! - a[2]! * b[1]!,
    a[2]! * b[0]! - a[0]! * b[2]!,
    a[0]! * b[1]! - a[1]! * b[0]!,
  ];
  const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i]!, 0);
  const forward = norm(sub(target, pos));
  let right = cross(forward, [0, 1, 0]);
  if (Math.hypot(...right) < 1e-6) right = [1, 0, 0];
  right = norm(right);
  const up = cross(right, forward);
  const v = sub(p, pos);
  const depth = dot(v, forward);
  const t = Math.tan((fovDeg * Math.PI) / 360);
  return [dot(v, right) / (depth * t * aspect), dot(v, up) / (depth * t)];
}

describe("framing", () => {
  const corners = (ex: number) =>
    [WEST, EAST].flatMap((x) => [0, -FLOOR_KM * ex].flatMap((y) => [NORTH, SOUTH].map((z) => [x, y, z])));

  it.each([
    ["oblique", 1, 0.46],
    ["oblique", 2, 1.7],
    ["south", 4, 0.46],
    ["south", 1, 3],
    ["above", 2, 1],
    ["above", 1, 0.46],
  ] as [Preset, number, number][])("keeps the whole block in view from %s at ×%s, aspect %s", (preset, ex, aspect) => {
    const { position, target } = framing(preset, ex, 32, aspect);
    for (const c of corners(ex)) {
      const [sx, sy] = onScreen(c, position, target, 32, aspect);
      expect(Math.abs(sx!)).toBeLessThanOrEqual(1);
      expect(Math.abs(sy!)).toBeLessThanOrEqual(1);
    }
  });

  it("fills the screen: some corner reaches the edge within the 4 % margin", () => {
    const { position, target } = framing("south", 2, 32, 1.7);
    const reach = Math.max(
      ...corners(2).flatMap((c) => onScreen(c, position, target, 32, 1.7).map((v) => Math.abs(v))),
    );
    expect(reach).toBeGreaterThan(0.9);
  });

  it("looks at a fixed point for the close views, deeper with the exaggeration", () => {
    const a = framing("rupture", 1, 32, 1);
    const b = framing("rupture", 2, 32, 1);
    expect(b.target[1]).toBeCloseTo(2 * a.target[1], 6);
    expect(PRESETS.rupture.dist).toBe(330);
  });
});

describe("mapUv", () => {
  const uv = mapUv();
  const v = (j: number) => uv[j * GROUND.nx * 2 + 1]!;

  it("runs the image over the block exactly, west to east and south to north", () => {
    expect(uv[0]).toBe(0);
    expect(uv[(GROUND.nx - 1) * 2]).toBe(1);
    expect(v(0)).toBe(0);
    expect(v(GROUND.ny - 1)).toBeCloseTo(1, 12);
  });

  it("follows Mercator's y, not the latitude: the middle latitude sits just below the image's middle", () => {
    // Mercator stretches northwards; at 3.5–5.3° N the stretch is tiny but not zero.
    const mid = v((GROUND.ny - 1) / 2);
    expect(mid).toBeLessThan(0.5);
    expect(mid).toBeGreaterThan(0.499);
  });
});

/** Production's catalogue of 2026-09-24; every figure recomputed independently in Python. */
describe("blockModel on the production catalogue of 2026-09-24", () => {
  const m = blockModel(data);

  it("names the depths the catalogue snaps shallow events to", () => {
    expect(m.snapped).toEqual([
      { depthKm: 42.9, count: 60 },
      { depthKm: 39.9, count: 54 },
      { depthKm: 45.9, count: 32 },
    ]);
  });

  it("shows USGS's rupture for the M7.4, with its length, largest slip and hypocentre against SGC's", () => {
    expect(m.rupture).not.toBeNull();
    expect(m.rupture!.lengthKm).toBe(150);
    expect(m.rupture!.maxSlipM).toBeCloseTo(3.98, 6);
    expect(m.rupture!.offsetKm).toBeCloseTo(23.24, 1);
    expect(m.rupture!.compass).toBe("E");
    expect(m.rupture!.deeperKm).toBeCloseTo(21.59, 1);
  });

  it("puts every live event in, in time order, the mainshock marked", () => {
    const live = [...data.sources.shallow, ...data.sources.deep, ...data.sources.tolima];
    expect(m.events).toHaveLength(live.length);
    expect(m.events.every((e, i) => i === 0 || m.events[i - 1]!.t <= e.t)).toBe(true);
    expect(m.events.filter((e) => e.source === "mainshock").map((e) => e.id)).toEqual(["SGC2026pqqmro"]);
  });
});

describe("blockModel without the M7.4", () => {
  it("shows no rupture when the detected mainshock is another event, or there is none", () => {
    const cat = captured as Catalogues;
    // Withdrawing the M7.4 leaves Chocó with no clear mainshock: USGS's plane is about that event only.
    const without = {
      ...cat,
      choco: cat.choco.map((e) => (e.id === "SGC2026pqqmro" ? { ...e, removedAt: "2026-09-24T00:00:00Z" } : e)),
    };
    expect(blockModel(insights(without, NOW)).rupture).toBeNull();
  });
});
