/**
 * PROTOTYPE (unit E1, branch `prototype/3d`): what both engines share, with no engine in it, so the
 * OGL build's chunk carries no three.js. Coordinates, view state, camera presets and their fit, the
 * events, the palette as linear RGB, and the DOM for the labels and pins.
 */
import { GROUND } from "../block";
import type { Insights, QuakeLike, Source } from "../claims";
import { TOWNS } from "../region";
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

export type Layer = "ground" | "plate" | "uncertainty" | "rupture" | "events" | "labels" | "snapped";
export type Preset = "oblique" | "south" | "above" | "rupture" | "chaparral" | "pereira";
export type Engine = "three" | "ogl";

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

/** What a variant can ask of either engine. */
export interface SceneHandle {
  engine: Engine;
  canvas: HTMLCanvasElement;
  setView(v: View): void;
  goTo(p: Preset, animate: boolean): void;
  setAutoRotate(on: boolean): void;
  /** Called when the reader starts turning the block by hand. */
  onInteract(cb: () => void): void;
  /** Inline on a page: one finger and the wheel scroll the page, two fingers turn the block. */
  inlineGestures(): void;
  resize(): void;
  fps(): number;
  times: { first: number; last: number };
  snapped: { depthKm: number; count: number }[];
  dispose(): void;
}

export function webglAvailable() {
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
}

// --- Colour -------------------------------------------------------------------------------------

export type RGB = [number, number, number];
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** A colour the page's CSS defines, as sRGB 0–1 (getComputedStyle gives oklch; a canvas converts). */
export function cssSrgb(expr: string): RGB {
  const probe = document.createElement("span");
  probe.style.color = expr;
  document.body.append(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  const ctx = document.createElement("canvas").getContext("2d")!;
  ctx.fillStyle = value;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return [r! / 255, g! / 255, b! / 255];
}

export const linear = (c: RGB): RGB => [toLinear(c[0]), toLinear(c[1]), toLinear(c[2])];
export const lerp = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** The page's colours in linear RGB, the space lighting is computed in. */
export function linearPalette() {
  const c = (v: string) => linear(cssSrgb(v));
  return {
    background: c("var(--background)"),
    foreground: c("var(--foreground)"),
    muted: c("var(--muted-foreground)"),
    shallow: c("var(--chart-1)"),
    deep: c("var(--chart-4)"),
    tolima: c("var(--chart-5)"),
    mainshock: c("var(--chart-2)"),
    place: c("var(--place)"),
    dark: document.documentElement.classList.contains("dark"),
  };
}

// --- Events ---------------------------------------------------------------------------------------

export interface Ev extends QuakeLike {
  source: Source | "mainshock";
  t: number;
}

export function prepareEvents(data: Insights) {
  const mainId = data.mainshock.choco.state === "found" ? data.mainshock.choco.largest.id : undefined;
  const events: Ev[] = (["shallow", "deep", "tolima"] as const)
    .flatMap((s) =>
      data.sources[s].map((e) => ({ ...e, source: e.id === mainId ? "mainshock" : s, t: Date.parse(e.time) }) as Ev),
    )
    .sort((a, b) => a.t - b.t);
  const snapped = commonDepths(data.sources.shallow, 3).filter((d) => d.count >= 20);
  const showsRupture =
    data.mainshock.choco.state === "found" && data.mainshock.choco.largest.id === USGS_ASSESSED.sgcId;
  return { events, snapped, snappedSet: new Set(snapped.map((d) => d.depthKm)), showsRupture };
}

export const eventRadius = (e: Ev) => (e.source === "mainshock" ? 7 : 1.1 * 1.45 ** (e.mag - 2));

// --- Camera -------------------------------------------------------------------------------------

type V3 = [number, number, number];
/** A direction to look from and a point to look at (depth in km before exaggeration); `fit` frames the block. */
export const PRESETS: Record<Preset, { dir: V3; target: V3; dist: number | "fit" }> = {
  oblique: { dir: [0.55, 0.55, 0.8], target: [0, 100, 0], dist: "fit" },
  south: { dir: [0, 0.08, 1], target: [0, 110, 0], dist: "fit" },
  above: { dir: [0, 1, 0.001], target: [0, 0, 0], dist: "fit" },
  rupture: { dir: [0.75, 0.25, 0.65], target: [x(-76.5), 110, z(4.55)], dist: 330 },
  chaparral: { dir: [0.35, 0.3, 1], target: [x(-75.6), 60, z(3.86)], dist: 380 },
  pereira: { dir: [0.4, 0.15, 0.3], target: [x(-76.6), 60, z(4.6)], dist: 150 },
};

const norm = (v: V3): V3 => {
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Where the camera goes for a preset: position and target, for a vertical fov (deg) and aspect. */
export function presetCamera(p: Preset, ex: number, fovDeg: number, aspect: number) {
  const pr = PRESETS[p];
  const dir = norm(pr.dir);
  if (pr.dist !== "fit") {
    const target: V3 = [pr.target[0], -pr.target[1] * ex, pr.target[2]];
    return { position: target.map((t, i) => t + dir[i]! * (pr.dist as number)) as V3, target };
  }
  // From the floor to the tops of the town pins and their names (~40 km over the ground on screen).
  const headroom = 40;
  const half: V3 = [(EAST - WEST) / 2, (FLOOR_KM * ex + headroom) / 2, (SOUTH - NORTH) / 2];
  const centre: V3 = [0, (headroom - FLOOR_KM * ex) / 2, 0];
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
  return { position: centre.map((t, i) => t + dir[i]! * dist) as V3, target: centre };
}

export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

// --- Labels and pins (DOM, positioned by each engine) --------------------------------------------

export const LABEL =
  "pointer-events-none rounded bg-background/80 px-1 text-[11px] leading-tight font-medium text-foreground";
export const LABEL_MUTED = "pointer-events-none text-2xs leading-tight text-muted-foreground";

export function labelElement(text: string, className: string) {
  const el = document.createElement("div");
  el.className = className;
  el.textContent = text;
  return el;
}

export const PINNED_TOWNS = TOWNS.filter((t) => ["pereira", "chaparral", "istmina", "buenaventura"].includes(t.id));

/**
 * A map pin whose tip is the town: the element has no size of its own, so centring it on the point
 * puts its origin there, and the pin and its name hang above it.
 */
export function pinElement(name: string, home: boolean) {
  const el = document.createElement("div");
  el.className = "pointer-events-none relative size-0";
  el.innerHTML = `<svg viewBox="0 0 24 32" aria-hidden="true" class="absolute -top-8 -left-3 h-8 w-6 drop-shadow ${
    home ? "text-place" : "text-foreground"
  }"><path fill="currentColor" d="M12 0C5.4 0 0 5.2 0 11.6 0 20.3 12 32 12 32s12-11.7 12-20.4C24 5.2 18.6 0 12 0z"/><circle cx="12" cy="11.5" r="4.6" class="fill-background"/></svg>`;
  const label = document.createElement("span");
  label.className = `absolute -top-14 left-0 -translate-x-1/2 whitespace-nowrap ${LABEL} ${home ? "text-place" : ""}`;
  label.textContent = name;
  el.append(label);
  return el;
}

export function groundAt(lat: number, lon: number) {
  const i = Math.round((lon - GROUND.lon0) / GROUND.step);
  const j = Math.round((lat - GROUND.lat0) / GROUND.step);
  return (GROUND.elevationM[j * GROUND.nx + i] ?? 0) / 1000;
}

/** The block top's image is Web Mercator: v follows Mercator's y. */
export function groundUv() {
  const merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const lat1 = GROUND.lat0 + (GROUND.ny - 1) * GROUND.step;
  const uv = new Float32Array(GROUND.nx * GROUND.ny * 2);
  for (let j = 0; j < GROUND.ny; j++) {
    const v = (merc(GROUND.lat0 + j * GROUND.step) - merc(GROUND.lat0)) / (merc(lat1) - merc(GROUND.lat0));
    for (let i = 0; i < GROUND.nx; i++) uv.set([i / (GROUND.nx - 1), v], (j * GROUND.nx + i) * 2);
  }
  return uv;
}
