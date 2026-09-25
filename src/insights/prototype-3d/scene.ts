/**
 * PROTOTYPE (unit E1, branch `prototype/3d`, never merged): the one three.js scene every variant
 * shows. Throwaway code: no tests, the minimum of error handling. What it draws comes from committed
 * data only: Slab2 (`plate.ts`), GEBCO and USGS's finite-fault plane (`block.ts`), and the live
 * catalogue the story reads.
 *
 * Units are kilometres. x runs east, z runs south (so a camera in the south looks north with east to
 * its right), y runs up; everything vertical is multiplied by one exaggeration, ground and depth
 * alike, so the block never mixes two scales.
 */
import {
  AmbientLight,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  DirectionalLight,
  DoubleSide,
  EdgesGeometry,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  NearestFilter,
  Object3D,
  PerspectiveCamera,
  Plane,
  RGBAFormat,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { GROUND, RUPTURE } from "../block";
import type { Insights, QuakeLike, Source } from "../claims";
import { SLAB2 } from "../plate";
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
const WEST = x(GROUND.lon0);
const EAST = x(GROUND.lon0 + (GROUND.nx - 1) * GROUND.step);
const SOUTH = z(GROUND.lat0);
const NORTH = z(GROUND.lat0 + (GROUND.ny - 1) * GROUND.step);

export type Layer = "ground" | "plate" | "uncertainty" | "rupture" | "events" | "labels" | "snapped";
export type Preset = "oblique" | "south" | "above" | "rupture" | "chaparral" | "pereira";

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

/** A colour the page's CSS defines, as the sRGB the screen shows (getComputedStyle gives oklch). */
function cssColour(expr: string) {
  const probe = document.createElement("span");
  probe.style.color = expr;
  document.body.append(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  const ctx = document.createElement("canvas").getContext("2d")!;
  ctx.fillStyle = value;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return new Color().setRGB(r! / 255, g! / 255, b! / 255, SRGBColorSpace);
}

export function palette() {
  return {
    background: cssColour("var(--background)"),
    foreground: cssColour("var(--foreground)"),
    muted: cssColour("var(--muted-foreground)"),
    shallow: cssColour("var(--chart-1)"),
    deep: cssColour("var(--chart-4)"),
    tolima: cssColour("var(--chart-5)"),
    mainshock: cssColour("var(--chart-2)"),
    place: cssColour("var(--place)"),
    dark: document.documentElement.classList.contains("dark"),
  };
}

export function webglAvailable() {
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
}

/** A hypsometric tint, muted so the events stay the only saturated colour in the block. */
function groundColour(m: number, dark: boolean) {
  const c = new Color();
  if (m < 0) {
    const t = Math.min(1, -m / 4500);
    c.setHSL(0.58, 0.28, dark ? 0.32 - 0.14 * t : 0.78 - 0.22 * t);
  } else {
    const t = Math.min(1, m / 4200);
    c.setHSL(0.25 - 0.17 * t, 0.2 - 0.1 * t, dark ? 0.3 + 0.35 * t : 0.62 + 0.28 * t);
  }
  return c;
}

function gridSurface(
  nx: number,
  ny: number,
  at: (i: number, j: number) => [number, number, number] | null,
  colour?: (i: number, j: number) => Color,
) {
  const pos = new Float32Array(nx * ny * 3);
  const col = colour ? new Float32Array(nx * ny * 3) : null;
  const ok: boolean[] = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const p = at(i, j);
      ok[k] = p !== null;
      if (p) pos.set(p, k * 3);
      if (col && p) col.set(colour!(i, j).toArray(), k * 3);
    }
  }
  const index: number[] = [];
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const [b, c, d] = [a + 1, a + nx, a + nx + 1];
      if (ok[a] && ok[b] && ok[c] && ok[d]) index.push(a, c, b, b, c, d);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(pos, 3));
  if (col) g.setAttribute("color", new BufferAttribute(col, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

function label(text: string, className: string) {
  const el = document.createElement("div");
  el.className = className;
  el.textContent = text;
  return new CSS2DObject(el);
}

const LABEL = "pointer-events-none rounded bg-background/80 px-1 text-[11px] leading-tight font-medium text-foreground";
const LABEL_MUTED = "pointer-events-none text-2xs leading-tight text-muted-foreground";

interface Ev extends QuakeLike {
  source: Source | "mainshock";
  t: number;
}

export interface SceneHandle {
  controls: OrbitControls;
  canvas: HTMLCanvasElement;
  setView(v: View): void;
  goTo(p: Preset, animate: boolean): void;
  setAutoRotate(on: boolean): void;
  resize(): void;
  /** Frames drawn in the last second, for the phone test. */
  fps(): number;
  /** The events in time order, for a replay slider. */
  times: { first: number; last: number };
  snapped: { depthKm: number; count: number }[];
  dispose(): void;
}

export function createScene(container: HTMLElement, data: Insights, initial: View): SceneHandle {
  const pal = palette();
  const renderer = new WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(pal.background);
  renderer.localClippingEnabled = true;
  // The plate goes on below the block's floor; it is cut there, as the cuts' frame cuts it.
  const floor = new Plane(new Vector3(0, 1, 0), FLOOR_KM);
  container.append(renderer.domElement);
  renderer.domElement.className = "block size-full";
  const labels = new CSS2DRenderer();
  labels.domElement.className = "pointer-events-none absolute inset-0";
  container.append(labels.domElement);

  const scene = new Scene();
  scene.add(new AmbientLight(0xffffff, pal.dark ? 1.4 : 1.6));
  const sun = new DirectionalLight(0xffffff, 1.6);
  sun.position.set(-300, 400, -200);
  scene.add(sun);

  const camera = new PerspectiveCamera(32, 1, 5, 6000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxDistance = 2200;
  controls.minDistance = 60;

  // Everything vertical lives in `vertical`, whose y scale is the exaggeration.
  const vertical = new Group();
  scene.add(vertical);

  // --- Ground: GEBCO 2020 every 0.05° -------------------------------------------------------
  const ground = new Mesh(
    gridSurface(
      GROUND.nx,
      GROUND.ny,
      (i, j) => {
        const m = GROUND.elevationM[j * GROUND.nx + i]!;
        return [x(GROUND.lon0 + i * GROUND.step), m / 1000, z(GROUND.lat0 + j * GROUND.step)];
      },
      (i, j) => groundColour(GROUND.elevationM[j * GROUND.nx + i]!, pal.dark),
    ),
    new MeshLambertMaterial({ vertexColors: true, side: DoubleSide }),
  );
  vertical.add(ground);

  // --- The plate: Slab2's top, its body and its stated uncertainty ---------------------------
  const slabAt = (off: (k: number) => number | null) => (i: number, j: number) => {
    const k = j * SLAB2.nx + i;
    const d = off(k);
    return d === null
      ? null
      : ([x(SLAB2.lon0 + i * SLAB2.step), -d, z(SLAB2.lat0 + j * SLAB2.step)] as [number, number, number]);
  };
  const top = (k: number) => SLAB2.topKm[k] ?? null;
  const plateMat = (opacity: number) =>
    new MeshLambertMaterial({
      color: pal.muted,
      transparent: true,
      opacity,
      side: DoubleSide,
      depthWrite: false,
      clippingPlanes: [floor],
    });
  const plate = new Group();
  plate.add(new Mesh(gridSurface(SLAB2.nx, SLAB2.ny, slabAt(top)), plateMat(0.5)));
  plate.add(
    new Mesh(
      gridSurface(
        SLAB2.nx,
        SLAB2.ny,
        slabAt((k) => (top(k) === null ? null : top(k)! + SLAB2.thicknessKm[k]!)),
      ),
      plateMat(0.18),
    ),
  );
  vertical.add(plate);
  const uncertainty = new Group();
  for (const sign of [-1, 1]) {
    uncertainty.add(
      new Mesh(
        gridSurface(
          SLAB2.nx,
          SLAB2.ny,
          slabAt((k) => (top(k) === null ? null : Math.max(0, top(k)! + sign * SLAB2.uncertaintyKm[k]!))),
        ),
        plateMat(0.08),
      ),
    );
  }
  vertical.add(uncertainty);

  // --- USGS's rupture plane, shown only for the event it is about ----------------------------
  const rupture = new Group();
  const showsRupture =
    data.mainshock.choco.state === "found" && data.mainshock.choco.largest.id === USGS_ASSESSED.sgcId;
  if (showsRupture) {
    type P = [number, number, number];
    const [ts, te, be, bs] = RUPTURE.corners as [P, P, P, P];
    const pos = new Float32Array([ts, te, bs, be].flatMap(([lon, lat, d]) => [x(lon), -d, z(lat)]));
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(pos, 3));
    // u runs along the strike (column 0 at the NE start), v down the dip (row 0 at the top).
    g.setAttribute("uv", new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), 2));
    g.setIndex([0, 2, 1, 1, 2, 3]);
    const max = Math.max(...RUPTURE.slipCm);
    const px = new Uint8Array(RUPTURE.slipCm.length * 4);
    const hot = pal.mainshock;
    RUPTURE.slipCm.forEach((s, k) => {
      const t = Math.sqrt(s / max);
      px.set([hot.r * 255, hot.g * 255, hot.b * 255, 25 + 175 * t], k * 4);
    });
    const tex = new DataTexture(px, RUPTURE.alongStrike, RUPTURE.downDip, RGBAFormat);
    tex.magFilter = NearestFilter;
    tex.flipY = false;
    tex.needsUpdate = true;
    rupture.add(
      new Mesh(g, new MeshBasicMaterial({ map: tex, transparent: true, side: DoubleSide, depthWrite: false })),
    );
    const edge = new BufferGeometry().setFromPoints(
      [ts, te, be, bs, ts].map(([lon, lat, d]) => new Vector3(x(lon), -d, z(lat))),
    );
    rupture.add(new LineSegments(edge, new LineBasicMaterial({ color: pal.mainshock })));
  }
  vertical.add(rupture);

  // --- Events -----------------------------------------------------------------------------
  const mainId = data.mainshock.choco.state === "found" ? data.mainshock.choco.largest.id : undefined;
  const events: Ev[] = (["shallow", "deep", "tolima"] as const)
    .flatMap((s) =>
      data.sources[s].map((e) => ({ ...e, source: e.id === mainId ? "mainshock" : s, t: Date.parse(e.time) }) as Ev),
    )
    .sort((a, b) => a.t - b.t);
  const snapped = commonDepths(data.sources.shallow, 3).filter((d) => d.count >= 20);
  const snappedSet = new Set(snapped.map((d) => d.depthKm));
  const sphere = new SphereGeometry(1, 14, 10);
  const dots = new InstancedMesh(sphere, new MeshLambertMaterial(), events.length);
  const colourOf = (e: Ev, highlightSnapped: boolean) =>
    highlightSnapped && e.source === "shallow" && snappedSet.has(Math.round(e.depthKm * 10) / 10)
      ? pal.foreground
      : pal[e.source];
  const dummy = new Object3D();
  const placeDots = (ex: number, highlightSnapped: boolean) => {
    events.forEach((e, k) => {
      const r = e.source === "mainshock" ? 7 : 1.1 * 1.45 ** (e.mag - 2);
      dummy.position.set(x(e.lon), -e.depthKm * ex, z(e.lat));
      dummy.scale.setScalar(r);
      dummy.updateMatrix();
      dots.setMatrixAt(k, dummy.matrix);
      dots.setColorAt(k, colourOf(e, highlightSnapped));
    });
    dots.instanceMatrix.needsUpdate = true;
    if (dots.instanceColor) dots.instanceColor.needsUpdate = true;
  };
  scene.add(dots); // not in `vertical`: a scaled sphere would be squashed

  // --- The box, depth ticks, places ---------------------------------------------------------
  const box = new LineSegments(
    new EdgesGeometry(new BoxGeometry(EAST - WEST, FLOOR_KM, SOUTH - NORTH)),
    new LineBasicMaterial({ color: pal.muted, transparent: true, opacity: 0.5 }),
  );
  box.position.set((EAST + WEST) / 2, -FLOOR_KM / 2, (SOUTH + NORTH) / 2);
  vertical.add(box);
  const labelGroup = new Group();
  vertical.add(labelGroup);
  for (let d = 0; d <= 200; d += 50) {
    const l = label(d === 0 ? "0 km" : `${d} km`, LABEL_MUTED);
    l.position.set(EAST + 6, -d, SOUTH);
    labelGroup.add(l);
  }
  const pins: { town: (typeof TOWNS)[number]; line: LineSegments; tag: CSS2DObject }[] = [];
  for (const t of TOWNS) {
    if (!["pereira", "chaparral", "istmina", "buenaventura"].includes(t.id)) continue;
    const home = t.kind === "home";
    const line = new LineSegments(
      new BufferGeometry().setFromPoints([new Vector3(0, 0, 0), new Vector3(0, 1, 0)]),
      new LineBasicMaterial({ color: home ? pal.place : pal.foreground }),
    );
    const tag = label(t.name, home ? `${LABEL} text-place` : LABEL);
    labelGroup.add(line, tag);
    pins.push({ town: t, line, tag });
  }
  const trench = label("fosa del Pacífico", LABEL_MUTED);
  labelGroup.add(trench);
  const plateTag = label("placa de Nazca · modelo USGS Slab2", LABEL_MUTED);
  plate.add(plateTag);
  plateTag.position.set(x(-77.3), -40, z(3.6));
  const ruptureTag = label("ruptura del M7.4 · modelo del USGS", `${LABEL} text-chart-2`);
  if (showsRupture) rupture.add(ruptureTag);
  ruptureTag.position.set(x(-76.9), -150, z(4.1));

  // --- View state -------------------------------------------------------------------------
  let view = initial;
  const groundAtTown = (lat: number, lon: number) => {
    const i = Math.round((lon - GROUND.lon0) / GROUND.step);
    const j = Math.round((lat - GROUND.lat0) / GROUND.step);
    return (GROUND.elevationM[j * GROUND.nx + i] ?? 0) / 1000;
  };
  function setView(v: View) {
    view = v;
    const ex = v.exaggeration;
    const exChanged = vertical.scale.y !== ex;
    vertical.scale.y = ex;
    floor.constant = FLOOR_KM * ex;
    ground.visible = v.layers.ground;
    plate.visible = v.layers.plate;
    uncertainty.visible = v.layers.plate && v.layers.uncertainty;
    rupture.visible = v.layers.rupture;
    dots.visible = v.layers.events;
    labelGroup.visible = v.layers.labels;
    trench.element.style.display = v.layers.labels ? "" : "none";
    placeDots(ex, v.layers.snapped);
    dots.count = v.until === null ? events.length : events.filter((e) => e.t <= v.until!).length;
    for (const p of pins) {
      const h = groundAtTown(p.town.lat, p.town.lon);
      // The pin stands 25 km tall on screen, whatever the exaggeration, so it clears the relief.
      p.line.position.set(x(p.town.lon), h, z(p.town.lat));
      p.line.scale.y = 25 / ex;
      p.tag.position.set(x(p.town.lon), h + 27 / ex, z(p.town.lat));
      for (const el of [p.tag.element]) el.style.display = v.layers.labels ? "" : "none";
    }
    trench.position.set(x(-78.05), 8 / ex, z(4.2));
    // A taller block needs the camera further back: keep the view the reader picked, refitted.
    if (exChanged && current) goTo(current, false);
  }

  // --- Camera presets ---------------------------------------------------------------------
  // A direction to look from and a point to look at (depth in km, before exaggeration). `fit`
  // steps back until the whole block is in view, whatever the screen's shape and the exaggeration.
  const presets: Record<
    Preset,
    { dir: [number, number, number]; target: [number, number, number]; dist: number | "fit" }
  > = {
    oblique: { dir: [0.55, 0.55, 0.8], target: [0, 100, 0], dist: "fit" },
    south: { dir: [0, 0.08, 1], target: [0, 110, 0], dist: "fit" },
    above: { dir: [0, 1, 0.001], target: [0, 0, 0], dist: "fit" },
    rupture: { dir: [0.75, 0.25, 0.65], target: [x(-76.5), 110, z(4.55)], dist: 330 },
    chaparral: { dir: [0.35, 0.3, 1], target: [x(-75.6), 60, z(3.86)], dist: 380 },
    pereira: { dir: [0.4, 0.15, 0.3], target: [x(-76.6), 60, z(4.6)], dist: 150 },
  };
  let current: Preset | null = null;
  // Once the reader turns the block themselves, a resize or a new exaggeration no longer moves it.
  controls.addEventListener("start", () => {
    current = null;
    tween = null;
  });
  const fitDistance = (dir: Vector3) => {
    const ex = vertical.scale.y;
    // The block's corners, seen along `dir`: how far back the camera must be for all of them to fit.
    // From the floor to the tops of the town pins and their names (~40 km over the ground on screen).
    const headroom = 40;
    const half = [(EAST - WEST) / 2, (FLOOR_KM * ex + headroom) / 2, (SOUTH - NORTH) / 2];
    const centre = new Vector3(0, (headroom - FLOOR_KM * ex) / 2, 0);
    const vf = (camera.fov * Math.PI) / 360;
    const hf = Math.atan(Math.tan(vf) * camera.aspect);
    const right = new Vector3().crossVectors(new Vector3(0, 1, 0), dir).normalize();
    if (right.lengthSq() < 0.5) right.set(1, 0, 0);
    const up = new Vector3().crossVectors(dir, right).normalize();
    let need = 0;
    for (const sx of [-1, 1])
      for (const sy of [-1, 1])
        for (const sz of [-1, 1]) {
          const c = new Vector3(sx * half[0]!, sy * half[1]!, sz * half[2]!);
          const along = c.dot(dir);
          need = Math.max(
            need,
            along + Math.abs(c.dot(right)) / Math.tan(hf),
            along + Math.abs(c.dot(up)) / Math.tan(vf),
          );
        }
    return { centre, dist: need * 1.04 };
  };
  let tween: { from: Vector3; to: Vector3; tFrom: Vector3; tTo: Vector3; start: number; ms: number } | null = null;
  function goTo(p: Preset, animate: boolean) {
    current = p;
    const ex = vertical.scale.y;
    const pr = presets[p];
    const dir = new Vector3(...pr.dir).normalize();
    let tTo = new Vector3(pr.target[0], -pr.target[1] * ex, pr.target[2]);
    let dist = pr.dist === "fit" ? 0 : pr.dist;
    if (pr.dist === "fit") {
      const f = fitDistance(dir);
      tTo = f.centre;
      dist = f.dist;
    }
    const to = tTo.clone().addScaledVector(dir, dist);
    if (!animate) {
      camera.position.copy(to);
      controls.target.copy(tTo);
      controls.update();
      tween = null;
      return;
    }
    tween = {
      from: camera.position.clone(),
      to,
      tFrom: controls.target.clone(),
      tTo,
      start: performance.now(),
      ms: 1100,
    };
  }

  // --- Loop ---------------------------------------------------------------------------------
  let frames = 0;
  let fps = 0;
  let second = performance.now();
  let raf = 0;
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    if (tween) {
      const t = Math.min(1, (now - tween.start) / tween.ms);
      const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
      camera.position.lerpVectors(tween.from, tween.to, e);
      controls.target.lerpVectors(tween.tFrom, tween.tTo, e);
      if (t === 1) tween = null;
    }
    controls.update();
    renderer.render(scene, camera);
    labels.render(scene, camera);
    frames++;
    if (now - second >= 1000) {
      fps = frames;
      frames = 0;
      second = now;
    }
  };
  function resize() {
    const { clientWidth: w, clientHeight: h } = container;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    labels.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (current && !tween) goTo(current, false);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);

  resize();
  setView(initial);
  goTo("oblique", false);
  raf = requestAnimationFrame(loop);

  return {
    controls,
    canvas: renderer.domElement,
    setView,
    goTo,
    setAutoRotate(on) {
      controls.autoRotate = on;
      controls.autoRotateSpeed = 0.6;
    },
    resize,
    fps: () => fps,
    times: { first: events[0]?.t ?? 0, last: events.at(-1)?.t ?? 0 },
    snapped,
    dispose() {
      cancelAnimationFrame(raf);
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      labels.domElement.remove();
      void view;
    },
  };
}
