/**
 * The 3D block's logic that needs no engine and no DOM: coordinates, the camera's views and how they
 * frame the block, where the map image lies on the ground, and what the block shows from the data.
 * `scene.ts` draws it with OGL; the tests hold it here.
 *
 * Units are kilometres. x runs east, z runs south (a camera in the south looks north with east on its
 * right), y runs up. Everything vertical is multiplied by one exaggeration, ground and depth alike;
 * the land alone can also be raised (`landScale`), the one place the block mixes two scales.
 */
import { bearingDeg, epicentralKm } from "@bvalue/seismo";
import { GROUND, RUPTURE } from "../block";
import { compassPoint, type Insights, type QuakeLike, type Source } from "../claims";
import { TOWNS } from "../region";
import { commonDepths } from "../shared";
import { USGS_ASSESSED } from "../story/model";
import type { SeaForecast, SeaHour, WaveTrain } from "../../../worker/api-types";

const LON0 = -76.75;
const LAT0 = 4.4;
const KM_LAT = 111.195;
const KM_LON = KM_LAT * Math.cos((LAT0 * Math.PI) / 180);
/** The block's floor: deep enough for the plate under Pereira (~160 km) and its body. */
export const FLOOR_KM = 240;

export const x = (lon: number) => (lon - LON0) * KM_LON;
export const z = (lat: number) => -(lat - LAT0) * KM_LAT;
export const WEST = x(GROUND.lon0);
export const EAST = x(GROUND.lon0 + (GROUND.nx - 1) * GROUND.step);
export const SOUTH = z(GROUND.lat0);
export const NORTH = z(GROUND.lat0 + (GROUND.ny - 1) * GROUND.step);
/** The block's size as the copy states it, to the nearest 10 km: west–east and south–north. */
export const WIDTH_KM = Math.round((EAST - WEST) / 10) * 10;
export const LENGTH_KM = Math.round((SOUTH - NORTH) / 10) * 10;

export type Layer = "ground" | "sea" | "plate" | "uncertainty" | "rupture" | "events" | "labels" | "snapped";
export type Preset = "oblique" | "south" | "above" | "rupture" | "chaparral";

export interface View {
  exaggeration: number;
  /** The mountains raised to `RAISED_LAND` times their height; false leaves them at the exaggeration. */
  raised: boolean;
  layers: Record<Layer, boolean>;
  /** Show events up to this time (ms); null shows all. */
  until: number | null;
}

/**
 * The vertical exaggeration each surface opens at: the turning preview at ×2, where the relief and the
 * depths separate, as a showcase; the viewer at ×1, true to scale (owner's call, 2026-09-26), with ×2
 * and ×4 one press away. The viewer keeps the reader's choice while the tab stays open.
 */
export const PREVIEW_EXAGGERATION = 2;
export const VIEWER_EXAGGERATION = 1;

/**
 * How many times their height the mountains stand when raised, whatever the vertical exaggeration.
 * They are at most ~5 km high on a 500 km block: at true scale, ~8 px on a laptop, too little to read
 * as relief (owner's call, 2026-09-26, with a setting back to true scale). Only the land is raised:
 * the sea floor and every depth stay at the block's exaggeration.
 */
export const RAISED_LAND = 5;

/** The factor the land's heights are drawn at, before the block's own exaggeration multiplies them. */
export const landScale = (v: Pick<View, "raised" | "exaggeration">) =>
  v.raised ? Math.max(1, RAISED_LAND / v.exaggeration) : 1;

export const ALL_LAYERS: Record<Layer, boolean> = {
  ground: true,
  sea: true,
  plate: true,
  uncertainty: true,
  rupture: true,
  events: true,
  labels: true,
  snapped: false,
};

// --- The sea's surface -------------------------------------------------------------------------

/**
 * How much longer and taller than the real waves the block draws them. Real ones are a few metres high
 * and a few hundred metres long: on a 500 km block, at true scale, under a thousandth of a pixel. One
 * factor for every train, so a longer or higher real sea is a longer or higher drawn one, and the key
 * states both.
 */
export const WAVE_LENGTH_SCALE = 75;
export const WAVE_HEIGHT_SCALE = 400;
/**
 * The shortest drawn wave, km. The wind's own waves (a few seconds, a few tens of metres) would still be
 * under a pixel at 75×; they are drawn at least this long, as texture, and the key says so.
 */
export const MIN_DRAWN_WAVELENGTH_KM = 2.5;
/** A wind sea this high (m) starts to break into whitecaps, and one this high is covered in them. */
export const WHITECAPS_FROM_M = 0.3;
export const WHITECAPS_FULL_M = 1;

/** One train as the scene draws it: where it runs to (x east, z south), its length and height in km. */
export interface DrawnTrain {
  dir: [number, number];
  lengthKm: number;
  periodS: number;
  heightKm: number;
  /** How strongly it is shaded: grows with its real height. */
  steep: number;
}

export interface DrawnSea {
  swell: DrawnTrain;
  swell2: DrawnTrain;
  chop: DrawnTrain;
  /** 0 to 1: how much the wind's waves break. */
  whitecaps: number;
}

const G = 9.81;
/**
 * The period below which a wave would be drawn shorter than `MIN_DRAWN_WAVELENGTH_KM` at 75×, and so is
 * drawn longer than 75× (~4.6 s): the key says so.
 */
export const SHORT_WAVE_PERIOD_S = Math.sqrt(
  (2 * Math.PI * ((MIN_DRAWN_WAVELENGTH_KM * 1000) / WAVE_LENGTH_SCALE)) / G,
);
const ABSENT: Omit<DrawnTrain, "dir"> = { lengthKm: 20, periodS: 12, heightKm: 0, steep: 0 };

/** Where a train coming from `fromDeg` (0° north, 90° east) runs to, as x east and z south. */
const runsTo = (fromDeg: number): [number, number] => {
  const to = ((fromDeg + 180) * Math.PI) / 180;
  return [Math.sin(to), -Math.cos(to)];
};

/**
 * A real train drawn: its length from its period, as deep water sets it (L = gT²/2π), times
 * `WAVE_LENGTH_SCALE`; its period itself, so each crest takes as long to pass as the real one; its
 * height times `WAVE_HEIGHT_SCALE`.
 */
export function drawnTrain(t: WaveTrain): DrawnTrain {
  const realLengthM = (G * t.periodS ** 2) / (2 * Math.PI);
  return {
    dir: runsTo(t.fromDeg),
    lengthKm: Math.max(MIN_DRAWN_WAVELENGTH_KM, (realLengthM * WAVE_LENGTH_SCALE) / 1000),
    periodS: t.periodS,
    heightKm: (t.heightM * WAVE_HEIGHT_SCALE) / 1000,
    steep: 0.3 + 0.4 * Math.min(t.heightM / 1.5, 1),
  };
}

/**
 * The sea before any forecast has loaded, or after the stored hours run out: a swell from the south-west
 * and a lesser one from the west, as the Pacific here usually has, and no figure stated for it.
 */
export const USUAL_SEA: Pick<SeaHour, "swell" | "swell2" | "wind"> = {
  swell: { heightM: 1, fromDeg: 225, periodS: 12 },
  swell2: { heightM: 0.5, fromDeg: 280, periodS: 9 },
  wind: null,
};

/**
 * The three trains the shader draws from one hour of the forecast. A missing swell is drawn flat. The
 * wind's waves always leave some fine texture (a real sea is never glassy at this scale); they break
 * into whitecaps only as high as the data says.
 */
export function drawnSea(hour: Pick<SeaHour, "swell" | "swell2" | "wind"> | null): DrawnSea {
  const h = hour ?? USUAL_SEA;
  const swell = h.swell ? drawnTrain(h.swell) : { ...ABSENT, dir: runsTo(225) };
  const swell2 = h.swell2 ? drawnTrain(h.swell2) : { ...ABSENT, dir: swell.dir };
  const wind = h.wind ? drawnTrain(h.wind) : null;
  const windM = h.wind?.heightM ?? 0;
  // With no wind sea, a faint texture across the swell; the wind's own direction when it has one.
  const [dx, dz] = swell.dir;
  const chop: DrawnTrain = {
    dir: wind?.dir ?? [dx * 0.8 - dz * 0.6, dx * 0.6 + dz * 0.8],
    lengthKm: wind?.lengthKm ?? MIN_DRAWN_WAVELENGTH_KM,
    periodS: wind?.periodS ?? 4,
    heightKm: 0,
    steep: 0.12 + 0.35 * Math.min(windM / WHITECAPS_FULL_M, 1),
  };
  const whitecaps = Math.min(1, Math.max(0, (windM - WHITECAPS_FROM_M) / (WHITECAPS_FULL_M - WHITECAPS_FROM_M)));
  return { swell, swell2, chop, whitecaps };
}

/**
 * The water's own colour by how much chlorophyll satellites see in it (`sea-colour.json`, from
 * `scripts/insights-sea-colour.ts`), sRGB, before any sky or sun. Anchored on this sea's own colours
 * (2026-09-26): the first three are ESA OC-CCI v6's median reflectance for the box's open sea, shelf
 * and nearshore water turned into sRGB; the last is the Forel-Ule scale's class 12 (Wernand et al.
 * 2013, Ocean Science, table 5), the delta front's class, darkened by the same ratio that turns class 6
 * into the measured nearshore colour. Between anchors, linear in log chlorophyll and in linear light.
 */
export const SEA_COLOUR_STOPS: readonly (readonly [chlorophyll: number, hex: string])[] = [
  [0.22, "#004679"], // open sea, over ~50 km out
  [0.55, "#255466"], // the shelf, 10–50 km
  [2.3, "#4e7065"], // nearshore, 0–10 km
  [7, "#708a47"], // the San Juan's delta front
];

const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLin = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
const hexLin = (h: string) => [1, 3, 5].map((i) => toLin(parseInt(h.slice(i, i + 2), 16) / 255));

/** The water's colour at log10 of its chlorophyll (mg/m³), as sRGB 0–1; held at the ends of the stops. */
const STOPS = SEA_COLOUR_STOPS.map(([chl, hex]) => [Math.log10(chl), hexLin(hex)] as const);

export function seaColour(log10Chl: number): [number, number, number] {
  const stops = STOPS;
  const k = stops.findIndex(([at]) => at >= log10Chl);
  const [a, b] =
    k === -1 ? [stops.at(-1)!, stops.at(-1)!] : k === 0 ? [stops[0]!, stops[0]!] : [stops[k - 1]!, stops[k]!];
  const t = a === b ? 0 : (log10Chl - a[0]) / (b[0] - a[0]);
  return [0, 1, 2].map((i) => fromLin(a[1][i]! + (b[1][i]! - a[1][i]!) * t)) as [number, number, number];
}

/** The forecast's hour that `now` falls in, or null when the stored hours do not reach it. */
export function seaHourAt(forecast: SeaForecast | null, now: number): SeaHour | null {
  return forecast?.hours.find((h) => h.t <= now && now < h.t + 3_600_000) ?? null;
}

// --- What the block shows ----------------------------------------------------------------------

/**
 * Each pinned place but Pereira, and how far it is from Pereira in a straight line over the surface
 * (great circle), to the nearest 5 km: the block's pins are for scale, not for survey.
 */
export function pinDistances() {
  const home = TOWNS.find((t) => t.kind === "home")!;
  return TOWNS.filter((t) => PINNED.includes(t.id) && t.id !== home.id).map((t) => ({
    id: t.id,
    name: t.name,
    km: Math.round(epicentralKm(home, t) / 5) * 5,
  }));
}

/** The places the block pins. The baked map leaves their names off, so none is named twice. */
export const PINNED = ["pereira", "istmina", "chaparral", "buenaventura"];

export interface BlockEvent extends QuakeLike {
  source: Source | "mainshock";
  t: number;
}

/** Fewer events than this at one depth is chance, not the catalogue snapping depths. */
const SNAPPED_MIN = 20;

/**
 * The events in time order (the detected mainshock marked), the depths the catalogue snaps shallow
 * events to, and USGS's rupture plane with the figures its legend states. The plane is about the M7.4
 * alone, so it shows only while that is the detected mainshock (`USGS_ASSESSED`), like USGS's quote.
 */
export function blockModel(data: Insights) {
  const main = data.mainshock.choco.state === "found" ? data.mainshock.choco.largest : null;
  const events: BlockEvent[] = (["shallow", "deep", "tolima"] as const)
    .flatMap((s) =>
      data.sources[s].map((e) => ({
        ...e,
        source: e.id === main?.id ? ("mainshock" as const) : s,
        t: Date.parse(e.time),
      })),
    )
    .sort((a, b) => a.t - b.t);
  const snapped = commonDepths(data.sources.shallow, 3).filter((d) => d.count >= SNAPPED_MIN);
  const h = RUPTURE.hypocentre;
  const rupture =
    main && main.id === USGS_ASSESSED.sgcId
      ? {
          lengthKm: RUPTURE.lengthKm,
          maxSlipM: Math.max(...RUPTURE.slipCm) / 100,
          /** USGS's model hypocentre against SGC's location of the same event. */
          offsetKm: epicentralKm(main, h),
          compass: compassPoint(bearingDeg(main, h)),
          deeperKm: h.depthKm - main.depthKm,
        }
      : null;
  return { events, snapped, rupture };
}
export type BlockModel = ReturnType<typeof blockModel>;

export const eventRadius = (e: BlockEvent) => (e.source === "mainshock" ? 7 : 1.1 * 1.45 ** (e.mag - 2));

// --- Camera -------------------------------------------------------------------------------------

type V3 = [number, number, number];
/**
 * Each view: the direction the camera looks from, and either a point to look at (depth in km before
 * exaggeration) at a fixed distance, or `fit`, which frames the whole block.
 */
export const PRESETS: Record<Preset, { dir: V3; target: V3; dist: number | "fit" }> = {
  oblique: { dir: [0.55, 0.55, 0.8], target: [0, 0, 0], dist: "fit" },
  south: { dir: [0, 0.08, 1], target: [0, 0, 0], dist: "fit" },
  above: { dir: [0, 1, 0.001], target: [0, 0, 0], dist: "fit" },
  rupture: { dir: [0.75, 0.25, 0.65], target: [x(-76.5), 110, z(4.55)], dist: 330 },
  chaparral: { dir: [0.35, 0.3, 1], target: [x(-75.6), 60, z(3.86)], dist: 380 },
};

const norm = (v: V3): V3 => {
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Room above the ground for the town pins and their names, in km on screen. */
const HEADROOM_KM = 40;

/** Where the camera goes for a view, for a vertical field of view (degrees) and a screen aspect. */
export function framing(p: Preset, ex: number, fovDeg: number, aspect: number): { position: V3; target: V3 } {
  const pr = PRESETS[p];
  const dir = norm(pr.dir);
  if (pr.dist !== "fit") {
    const dist = pr.dist;
    const target: V3 = [pr.target[0], -pr.target[1] * ex, pr.target[2]];
    return { position: [target[0] + dir[0] * dist, target[1] + dir[1] * dist, target[2] + dir[2] * dist], target };
  }
  // The block's corners seen along `dir`: how far back the camera must stand for all of them to fit.
  const half: V3 = [(EAST - WEST) / 2, (FLOOR_KM * ex + HEADROOM_KM) / 2, (SOUTH - NORTH) / 2];
  const centre: V3 = [(EAST + WEST) / 2, (HEADROOM_KM - FLOOR_KM * ex) / 2, (SOUTH + NORTH) / 2];
  const vf = (fovDeg * Math.PI) / 360;
  const hf = Math.atan(Math.tan(vf) * aspect);
  let right = cross([0, 1, 0], dir);
  right = Math.hypot(...right) < 0.5 ? [1, 0, 0] : norm(right);
  const up = norm(cross(dir, right));
  let need = 0;
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      for (const sz of [-1, 1]) {
        const c: V3 = [sx * half[0], sy * half[1], sz * half[2]];
        const along = dot(c, dir);
        need = Math.max(
          need,
          along + Math.abs(dot(c, right)) / Math.tan(hf),
          along + Math.abs(dot(c, up)) / Math.tan(vf),
        );
      }
  const dist = need * 1.04;
  return {
    position: [centre[0] + dir[0] * dist, centre[1] + dir[1] * dist, centre[2] + dir[2] * dist],
    target: centre,
  };
}

export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

// --- The map on the ground -------------------------------------------------------------------

/**
 * Where each ground node falls on the map image (`bake-basemap.ts`), which covers exactly the block
 * and is Web Mercator: u runs with the longitude, v with Mercator's y.
 */
/** A ground grid: `GROUND` (GEBCO) or the fine one, with its heights in metres. */
export interface HeightGrid {
  lon0: number;
  lat0: number;
  step: number;
  nx: number;
  ny: number;
  elevationM: ArrayLike<number>;
}

export function mapUv(g: Omit<HeightGrid, "elevationM" | "lon0"> = GROUND) {
  const merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const lat1 = g.lat0 + (g.ny - 1) * g.step;
  const uv = new Float32Array(g.nx * g.ny * 2);
  for (let j = 0; j < g.ny; j++) {
    const v = (merc(g.lat0 + j * g.step) - merc(g.lat0)) / (merc(lat1) - merc(g.lat0));
    for (let i = 0; i < g.nx; i++) uv.set([i / (g.nx - 1), v], (j * g.nx + i) * 2);
  }
  return uv;
}

/** The ground's height at a place, from the grid's nearest node, in km, before any raising. */
export function groundKmAt(lat: number, lon: number, g: HeightGrid = GROUND) {
  const i = Math.round((lon - g.lon0) / g.step);
  const j = Math.round((lat - g.lat0) / g.step);
  return (g.elevationM[j * g.nx + i] ?? 0) / 1000;
}
