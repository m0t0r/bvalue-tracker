import captured from "../../../test/fixtures/api-events-2026-09-24.json";
import { describe, expect, it } from "vitest";
import { GROUND, decodeHeights, encodeHeights } from "../block";
import { insights, type Catalogues } from "../claims";
import {
  EAST,
  FLOOR_KM,
  NORTH,
  PRESETS,
  RAISED_LAND,
  SOUTH,
  VIEWER_EXAGGERATION,
  WEST,
  MIN_DRAWN_WAVELENGTH_KM,
  SEA_COLOUR_STOPS,
  USUAL_SEA,
  WAVE_HEIGHT_SCALE,
  WAVE_LENGTH_SCALE,
  blockModel,
  drawnSea,
  drawnTrain,
  framing,
  landScale,
  mapUv,
  needleShade,
  pinDistances,
  seaColour,
  seaHourAt,
  type Preset,
} from "./shared";

describe("the sea as drawn from Open-Meteo's forecast", () => {
  it("draws a train at its deep-water length and its real period, one scale for every train", () => {
    // 13.2 s: L = 9.81 × 13.2² ÷ 2π = 272.0 m, drawn 75× = 20.4 km; 0.62 m drawn 400× = 0.248 km.
    const t = drawnTrain({ heightM: 0.62, fromDeg: 236, periodS: 13.2 });
    expect(t.lengthKm).toBeCloseTo((272.04 * WAVE_LENGTH_SCALE) / 1000, 2);
    expect(t.periodS).toBe(13.2);
    expect(t.heightKm).toBeCloseTo((0.62 * WAVE_HEIGHT_SCALE) / 1000, 6);
  });

  it("runs a train away from where it comes from: x east, z south", () => {
    const [x, z] = drawnTrain({ heightM: 1, fromDeg: 270, periodS: 10 }).dir;
    expect(x).toBeCloseTo(1, 6); // from the west: runs east
    expect(z).toBeCloseTo(0, 6);
    const [x2, z2] = drawnTrain({ heightM: 1, fromDeg: 180, periodS: 10 }).dir;
    expect(x2).toBeCloseTo(0, 6); // from the south: runs north, which is −z
    expect(z2).toBeCloseTo(-1, 6);
  });

  it("draws the wind's short waves no shorter than the shortest drawn wave", () => {
    expect(drawnTrain({ heightM: 0.2, fromDeg: 280, periodS: 1.6 }).lengthKm).toBe(MIN_DRAWN_WAVELENGTH_KM);
  });

  it("breaks the wind's waves into whitecaps only as high as the data says, and a swell alone never", () => {
    const at = (wind: number | null) =>
      drawnSea({ ...USUAL_SEA, wind: wind === null ? null : { heightM: wind, fromDeg: 280, periodS: 3 } }).whitecaps;
    expect(at(null)).toBe(0);
    expect(at(0.3)).toBe(0);
    expect(at(0.65)).toBeCloseTo(0.5, 6);
    expect(at(1.4)).toBe(1);
  });

  it("draws a missing swell flat, and the usual sea without a forecast", () => {
    expect(drawnSea({ swell: null, swell2: null, wind: null }).swell.heightKm).toBe(0);
    expect(drawnSea(null)).toEqual(drawnSea(USUAL_SEA));
  });

  it("colours the water by its chlorophyll through the measured stops, held at both ends", () => {
    const hex = (c: number[]) =>
      `#${c
        .map((v) =>
          Math.round(v * 255)
            .toString(16)
            .padStart(2, "0"),
        )
        .join("")}`;
    for (const [chl, colour] of SEA_COLOUR_STOPS) expect(hex(seaColour(Math.log10(chl)))).toBe(colour);
    expect(hex(seaColour(-3))).toBe(SEA_COLOUR_STOPS[0]![1]);
    expect(hex(seaColour(3))).toBe(SEA_COLOUR_STOPS.at(-1)![1]);
    // Greener as chlorophyll rises: green over blue grows from the open sea to the delta front.
    const tint = (chl: number) => {
      const [, g, b] = seaColour(Math.log10(chl));
      return g / b;
    };
    expect(tint(0.3)).toBeLessThan(tint(1));
    expect(tint(1)).toBeLessThan(tint(4));
  });

  it("finds the hour the clock is in, and none once the stored hours have run out", () => {
    const hour = (t: number) => ({ t, swell: null, swell2: null, wind: null });
    const f = {
      source: "open-meteo" as const,
      model: "meteofrance_wave" as const,
      lat: 4.3,
      lon: -78.3,
      fetchedAt: "",
      hours: [hour(0), hour(3_600_000)],
    };
    expect(seaHourAt(f, 3_599_999)!.t).toBe(0);
    expect(seaHourAt(f, 3_600_000)!.t).toBe(3_600_000);
    expect(seaHourAt(f, 7_200_000)).toBeNull();
    expect(seaHourAt(null, 0)).toBeNull();
  });
});

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

  it("frames the whole block in every fitted view at the exaggeration the viewer opens at, phone to desktop", () => {
    const fitted = (Object.keys(PRESETS) as Preset[]).filter((p) => PRESETS[p].dist === "fit");
    for (const preset of fitted)
      for (const aspect of [0.46, 0.8, 1.7]) {
        const { position, target } = framing(preset, VIEWER_EXAGGERATION, 32, aspect);
        for (const c of corners(VIEWER_EXAGGERATION)) {
          const [sx, sy] = onScreen(c, position, target, 32, aspect);
          expect(Math.max(Math.abs(sx!), Math.abs(sy!))).toBeLessThanOrEqual(1);
        }
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
    // Fixed, not fitted: a phone and a wide screen put the camera in the same place.
    expect(framing("rupture", 1, 32, 0.46)).toEqual(framing("rupture", 1, 32, 1.7));
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

describe("the raised mountains", () => {
  it("stand at the same height whatever the vertical exaggeration", () => {
    for (const exaggeration of [1, 2, 4]) {
      expect(landScale({ raised: true, exaggeration }) * exaggeration).toBe(RAISED_LAND);
    }
  });

  it("are never lowered below the exaggeration, and follow it at true scale", () => {
    expect(landScale({ raised: true, exaggeration: RAISED_LAND * 2 })).toBe(1);
    expect(landScale({ raised: false, exaggeration: 4 })).toBe(1);
  });
});

describe("the pins' distances from Pereira", () => {
  it("covers every pin but Pereira, to the nearest 5 km", () => {
    expect(pinDistances()).toEqual([
      { id: "istmina", name: "Istmina", km: 115 },
      { id: "chaparral", name: "Chaparral", km: 125 },
      { id: "buenaventura", name: "Buenaventura", km: 180 },
    ]);
  });
});

describe("the fine ground's file", () => {
  it("round-trips heights across the sea, the coast and the peaks", () => {
    const heights = Int16Array.from([-4080, -3900, -1, 1, 5195, 30, -32768, 32767, 0, 12]);
    expect(decodeHeights(encodeHeights(heights, 5), 5)).toEqual(heights);
  });
});

describe("the compass needle's shading", () => {
  const [northLeft, northRight, southLeft, southRight] = [0, 1, 2, 3];
  const angles = Array.from({ length: 72 }, (_, k) => (k * Math.PI) / 36);

  it("lights the faces turned to the top left: the left ones with north up", () => {
    const light = needleShade(0, false);
    expect(light[northLeft]).toBeLessThan(light[northRight]!); // lit is lighter: less of the dark ink
    expect(light[southLeft]).toBeLessThan(light[southRight]!);
    const dark = needleShade(0, true);
    expect(dark[northLeft]).toBeGreaterThan(dark[northRight]!); // lit is brighter: more of the light ink
  });

  it("turns the lit side with the rose: pointing east, the upper face of the north half is the lit one", () => {
    const [upper, lower] = needleShade(Math.PI / 2, true);
    expect(upper).toBeGreaterThan(lower!);
  });

  it("lights both sides of a half alike when that half points straight at the light", () => {
    const [left, right] = needleShade(Math.atan2(-0.6, 0.8), true);
    expect(left).toBeCloseTo(right!, 6);
  });

  it("gives a face turned half a circle the shade of the face it replaces", () => {
    for (const a of angles) {
      const [now, turned] = [needleShade(a, false), needleShade(a + Math.PI, false)];
      expect(turned[northLeft]).toBeCloseTo(now[southRight]!, 6);
      expect(turned[northRight]).toBeCloseTo(now[southLeft]!, 6);
    }
  });

  it("keeps every face at 70% or more, so north stays apart from south at any angle", () => {
    for (const a of angles)
      for (const dark of [false, true])
        for (const o of needleShade(a, dark)) {
          expect(o).toBeGreaterThanOrEqual(0.7 - 1e-9);
          expect(o).toBeLessThanOrEqual(1 + 1e-9);
        }
  });
});
