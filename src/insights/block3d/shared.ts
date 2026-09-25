/**
 * The 3D block's logic that needs no engine and no DOM: coordinates, the camera's views and how they
 * frame the block, where the map image lies on the ground, and what the block shows from the data.
 * `scene.ts` draws it with OGL; the tests hold it here.
 *
 * Units are kilometres. x runs east, z runs south (a camera in the south looks north with east on its
 * right), y runs up. Everything vertical is multiplied by one exaggeration, ground and depth alike, so
 * the block never mixes two scales.
 */
import { bearingDeg, epicentralKm } from "@bvalue/seismo";
import { GROUND, RUPTURE } from "../block";
import { compassPoint, type Insights, type QuakeLike, type Source } from "../claims";
import { commonDepths } from "../shared";
import { USGS_ASSESSED } from "../story/model";

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

export type Layer = "ground" | "plate" | "uncertainty" | "rupture" | "events" | "labels" | "snapped";
export type Preset = "oblique" | "south" | "above" | "rupture" | "chaparral";

export interface View {
  exaggeration: number;
  layers: Record<Layer, boolean>;
  /** Show events up to this time (ms); null shows all. */
  until: number | null;
}

export const ALL_LAYERS: Record<Layer, boolean> = {
  ground: true,
  plate: true,
  uncertainty: true,
  rupture: true,
  events: true,
  labels: true,
  snapped: false,
};

// --- What the block shows ----------------------------------------------------------------------

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
export function mapUv() {
  const merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const lat1 = GROUND.lat0 + (GROUND.ny - 1) * GROUND.step;
  const uv = new Float32Array(GROUND.nx * GROUND.ny * 2);
  for (let j = 0; j < GROUND.ny; j++) {
    const v = (merc(GROUND.lat0 + j * GROUND.step) - merc(GROUND.lat0)) / (merc(lat1) - merc(GROUND.lat0));
    for (let i = 0; i < GROUND.nx; i++) uv.set([i / (GROUND.nx - 1), v], (j * GROUND.nx + i) * 2);
  }
  return uv;
}

/** The ground's height at a town, from the nearest GEBCO node, in km. */
export function groundKmAt(lat: number, lon: number) {
  const i = Math.round((lon - GROUND.lon0) / GROUND.step);
  const j = Math.round((lat - GROUND.lat0) / GROUND.step);
  return (GROUND.elevationM[j * GROUND.nx + i] ?? 0) / 1000;
}
