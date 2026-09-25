/**
 * PROTOTYPE (unit E1, branch `prototype/3d`): the same scene as `scene.ts`, drawn with OGL instead of
 * three.js, to compare weight at equal quality. The shaders reproduce three.js's MeshLambertMaterial
 * (Lambert in linear light, divided by π, sRGB out) and MeshBasicMaterial, so the two renders match.
 */
import { Camera, Geometry, Mesh, Orbit, Program, Renderer, Sphere, Texture, Transform, Vec3 } from "ogl";
import { GROUND, RUPTURE } from "../block";
import type { Insights } from "../claims";
import { SLAB2 } from "../plate";
import {
  EAST,
  FLOOR_KM,
  LABEL,
  LABEL_MUTED,
  NORTH,
  PINNED_TOWNS,
  SOUTH,
  WEST,
  easeInOut,
  eventRadius,
  groundAt,
  groundUv,
  labelElement,
  lerp,
  linear,
  linearPalette,
  pinElement,
  prepareEvents,
  presetCamera,
  x,
  z,
  type Preset,
  type RGB,
  type SceneHandle,
  type View,
} from "./common";
import basemapDark from "./basemap-dark.webp?url";
import basemapLight from "./basemap-light.webp?url";

// --- Shaders ------------------------------------------------------------------------------------

/** Lit vertex shader; the instanced one places and colours each event from its own attributes. */
const litVertex = (instanced: boolean) => /* glsl */ `#version 300 es
in vec3 position;
in vec3 normal;
in vec2 uv;
in vec3 color;
${instanced ? "in vec3 offset;\nin float scale;\nin vec3 icolor;" : ""}
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;
out vec3 vNormal;
out vec2 vUv;
out vec3 vColor;
out float vWorldY;
void main() {
  vec3 p = ${instanced ? "position * scale + offset" : "position"};
  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorldY = world.y;
  vNormal = normalize(normalMatrix * normal);
  vUv = uv;
  vColor = ${instanced ? "icolor" : "color"};
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const SRGB_OUT = /* glsl */ `
vec3 toSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
vec3 toLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}`;

const LIT_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
in vec3 vNormal;
in vec2 vUv;
in vec3 vColor;
in float vWorldY;
uniform int uMode; // 0 uniform colour, 1 vertex colour, 2 sRGB texture
uniform vec3 uColor;
uniform float uOpacity;
uniform sampler2D tMap;
uniform vec3 uLightView;
uniform float uAmbient;
uniform float uDirect;
uniform float uClipY;
out vec4 fragColor;
${SRGB_OUT}
void main() {
  if (vWorldY < uClipY) discard;
  vec3 n = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
  vec3 base = uMode == 2 ? toLinear(texture(tMap, vUv).rgb) : uMode == 1 ? vColor : uColor;
  // three.js's Lambert: diffuse / π × (ambient + direct × n·l).
  vec3 lit = base * (uAmbient + uDirect * max(dot(n, uLightView), 0.0)) / 3.14159265;
  fragColor = vec4(toSrgb(lit), uOpacity);
}`;

const FLAT_VERTEX = /* glsl */ `#version 300 es
in vec3 position;
in vec2 uv;
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}`;

const FLAT_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform int uMode; // 0 uniform colour, 1 linear texture
uniform vec3 uColor;
uniform float uOpacity;
uniform sampler2D tMap;
out vec4 fragColor;
${SRGB_OUT}
void main() {
  vec4 c = uMode == 1 ? texture(tMap, vUv) : vec4(uColor, 1.0);
  fragColor = vec4(toSrgb(c.rgb), c.a * uOpacity);
}`;

// --- Geometry helpers ---------------------------------------------------------------------------

function normals(pos: Float32Array, index: Uint16Array | Uint32Array) {
  const n = new Float32Array(pos.length);
  for (let k = 0; k < index.length; k += 3) {
    const [a, b, c] = [index[k]! * 3, index[k + 1]! * 3, index[k + 2]! * 3];
    const e1 = [pos[b]! - pos[a]!, pos[b + 1]! - pos[a + 1]!, pos[b + 2]! - pos[a + 2]!];
    const e2 = [pos[c]! - pos[a]!, pos[c + 1]! - pos[a + 1]!, pos[c + 2]! - pos[a + 2]!];
    const f = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
    for (const v of [a, b, c]) for (let d = 0; d < 3; d++) n[v + d]! += f[d]!;
  }
  for (let k = 0; k < n.length; k += 3) {
    const l = Math.hypot(n[k]!, n[k + 1]!, n[k + 2]!) || 1;
    n[k]! /= l;
    n[k + 1]! /= l;
    n[k + 2]! /= l;
  }
  return n;
}

type GL = Renderer["gl"];

function grid(
  gl: GL,
  nx: number,
  ny: number,
  at: (i: number, j: number) => [number, number, number] | null,
  extra: { uv?: Float32Array; color?: (i: number, j: number) => RGB } = {},
) {
  const pos = new Float32Array(nx * ny * 3);
  const col = extra.color ? new Float32Array(nx * ny * 3) : null;
  const ok: boolean[] = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const p = at(i, j);
      ok[k] = p !== null;
      if (p) pos.set(p, k * 3);
      if (col && p) col.set(extra.color!(i, j), k * 3);
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const [b, c, d] = [a + 1, a + nx, a + nx + 1];
      if (ok[a] && ok[b] && ok[c] && ok[d]) idx.push(a, c, b, b, c, d);
      else if (ok[a] && ok[b] && ok[d]) idx.push(a, d, b);
      else if (ok[a] && ok[c] && ok[d]) idx.push(a, c, d);
      else if (ok[a] && ok[b] && ok[c]) idx.push(a, c, b);
      else if (ok[b] && ok[c] && ok[d]) idx.push(b, c, d);
    }
  }
  const index = new Uint16Array(idx);
  return new Geometry(gl, {
    position: { size: 3, data: pos },
    normal: { size: 3, data: normals(pos, index) },
    uv: { size: 2, data: extra.uv ?? new Float32Array(nx * ny * 2) },
    color: { size: 3, data: col ?? new Float32Array(nx * ny * 3) },
    index: { data: index },
  });
}

/** three.js's `Color.setHSL`: HSL in sRGB, returned linear. */
function hsl(h: number, s: number, l: number): RGB {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return linear([f(0), f(8), f(4)]);
}

function groundColour(m: number, dark: boolean): RGB {
  if (m < 0) {
    const t = Math.min(1, -m / 4500);
    return hsl(0.58, 0.28, dark ? 0.32 - 0.14 * t : 0.78 - 0.22 * t);
  }
  const t = Math.min(1, m / 4200);
  return hsl(0.25 - 0.17 * t, 0.2 - 0.1 * t, dark ? 0.3 + 0.35 * t : 0.62 + 0.28 * t);
}

// --- The scene ------------------------------------------------------------------------------------

export function createScene(container: HTMLElement, data: Insights, initial: View): SceneHandle {
  const pal = linearPalette();
  const renderer = new Renderer({ dpr: Math.min(devicePixelRatio, 2), antialias: true, webgl: 2 });
  const gl = renderer.gl;
  const bg = pal.background.map((c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055));
  gl.clearColor(bg[0]!, bg[1]!, bg[2]!, 1);
  const canvas = gl.canvas as HTMLCanvasElement;
  canvas.className = "block size-full";
  container.append(canvas);
  const overlay = document.createElement("div");
  overlay.className = "pointer-events-none absolute inset-0 overflow-hidden";
  container.append(overlay);

  const scene = new Transform();
  const camera = new Camera(gl, { fov: 32, near: 5, far: 6000 });
  const orbit = new Orbit(camera, { element: canvas, minDistance: 60, maxDistance: 2200, target: new Vec3() });
  const vertical = new Transform();
  vertical.setParent(scene);

  // Light as three.js has it: a directional light from (-300, 400, -200) towards the origin.
  const sunWorld = new Vec3(-300, 400, -200).normalize();
  const lightView = new Vec3();
  const ambient = pal.dark ? 1.4 : 1.6;
  const programs: Program[] = [];
  const lit = (o: {
    mode: number;
    color?: RGB;
    opacity?: number;
    map?: Texture;
    clip?: boolean;
    instanced?: boolean;
  }) => {
    const p = new Program(gl, {
      vertex: litVertex(!!o.instanced),
      fragment: LIT_FRAGMENT,
      transparent: true,
      cullFace: false,
      depthWrite: o.opacity === undefined || o.opacity >= 1,
      uniforms: {
        uMode: { value: o.mode },
        uColor: { value: o.color ?? [1, 1, 1] },
        uOpacity: { value: o.opacity ?? 1 },
        tMap: { value: o.map ?? new Texture(gl) },
        uLightView: { value: lightView },
        uAmbient: { value: ambient },
        uDirect: { value: 1.6 },
        uClipY: { value: o.clip ? -FLOOR_KM : -1e9 },
      },
    });
    programs.push(p);
    return p;
  };
  const flat = (o: { mode: number; color?: RGB; opacity?: number; map?: Texture }) =>
    new Program(gl, {
      vertex: FLAT_VERTEX,
      fragment: FLAT_FRAGMENT,
      transparent: true,
      cullFace: false,
      depthWrite: false,
      uniforms: {
        uMode: { value: o.mode },
        uColor: { value: o.color ?? [1, 1, 1] },
        uOpacity: { value: o.opacity ?? 1 },
        tMap: { value: o.map ?? new Texture(gl) },
      },
    });
  const add = (
    parent: Transform,
    geometry: Geometry,
    program: Program,
    opts: { mode?: number; renderOrder?: number } = {},
  ) => {
    const m = new Mesh(gl, { geometry, program, mode: opts.mode });
    m.frustumCulled = false;
    m.renderOrder = opts.renderOrder ?? 0;
    m.setParent(parent);
    return m;
  };

  // --- Ground: GEBCO 2020, the monitor's map baked on top ---------------------------------------
  const groundProgram = lit({ mode: 1 });
  groundProgram.depthWrite = true;
  add(
    vertical,
    grid(
      gl,
      GROUND.nx,
      GROUND.ny,
      (i, j) => [
        x(GROUND.lon0 + i * GROUND.step),
        GROUND.elevationM[j * GROUND.nx + i]! / 1000,
        z(GROUND.lat0 + j * GROUND.step),
      ],
      { uv: groundUv(), color: (i, j) => groundColour(GROUND.elevationM[j * GROUND.nx + i]!, pal.dark) },
    ),
    groundProgram,
  );
  const ground = vertical.children.at(-1) as Mesh;
  {
    const img = new Image();
    img.onload = () => {
      groundProgram.uniforms.tMap!.value = new Texture(gl, { image: img, anisotropy: 16 });
      groundProgram.uniforms.uMode!.value = 2;
    };
    img.src = pal.dark ? basemapDark : basemapLight;
  }

  // --- The plate: Slab2's top, its body, its cut faces and its stated uncertainty --------------
  const top = (k: number) => SLAB2.topKm[k] ?? null;
  const surfaceKm = (k: number) => {
    const [i, j] = [k % SLAB2.nx, Math.floor(k / SLAB2.nx)];
    return -(GROUND.elevationM[2 * j * GROUND.nx + 2 * i] ?? 0) / 1000;
  };
  const slabAt = (off: (k: number) => number | null) => (i: number, j: number) => {
    const d = off(j * SLAB2.nx + i);
    return d === null
      ? null
      : ([x(SLAB2.lon0 + i * SLAB2.step), -d, z(SLAB2.lat0 + j * SLAB2.step)] as [number, number, number]);
  };
  const plateColour = lerp(pal.background, pal.foreground, pal.dark ? 0.05 : 0.28);
  const plateMat = (opacity: number) => lit({ mode: 0, color: plateColour, opacity, clip: true });
  const plate = new Transform();
  plate.setParent(vertical);
  add(plate, grid(gl, SLAB2.nx, SLAB2.ny, slabAt(top)), plateMat(0.6));
  add(
    plate,
    grid(
      gl,
      SLAB2.nx,
      SLAB2.ny,
      slabAt((k) => (top(k) === null ? null : top(k)! + SLAB2.thicknessKm[k]!)),
    ),
    plateMat(0.32),
  );
  for (const j of [0, SLAB2.ny - 1]) {
    const pos: number[] = [];
    for (let i = 0; i < SLAB2.nx - 1; i++) {
      const [k0, k1] = [j * SLAB2.nx + i, j * SLAB2.nx + i + 1];
      if (top(k0) === null || top(k1) === null) continue;
      const at = (i2: number, d: number) => [x(SLAB2.lon0 + i2 * SLAB2.step), -d, z(SLAB2.lat0 + j * SLAB2.step)];
      const [a, b] = [at(i, top(k0)!), at(i + 1, top(k1)!)];
      const [c, d] = [at(i, top(k0)! + SLAB2.thicknessKm[k0]!), at(i + 1, top(k1)! + SLAB2.thicknessKm[k1]!)];
      pos.push(...a, ...c, ...b, ...b, ...c, ...d);
    }
    const p = new Float32Array(pos);
    const index = new Uint16Array(p.length / 3).map((_, k) => k);
    add(
      plate,
      new Geometry(gl, {
        position: { size: 3, data: p },
        normal: { size: 3, data: normals(p, index) },
        uv: { size: 2, data: new Float32Array((p.length / 3) * 2) },
        color: { size: 3, data: new Float32Array(p.length) },
        index: { data: index },
      }),
      plateMat(0.45),
    );
  }
  const uncertainty = new Transform();
  uncertainty.setParent(vertical);
  for (const sign of [-1, 1]) {
    add(
      uncertainty,
      grid(
        gl,
        SLAB2.nx,
        SLAB2.ny,
        slabAt((k) => (top(k) === null ? null : Math.max(surfaceKm(k), top(k)! + sign * SLAB2.uncertaintyKm[k]!))),
      ),
      plateMat(0.1),
    );
  }

  // --- USGS's rupture plane ---------------------------------------------------------------------
  const prep = prepareEvents(data);
  const rupture = new Transform();
  rupture.setParent(vertical);
  const lineGeometry = (pts: number[][]) =>
    new Geometry(gl, {
      position: { size: 3, data: new Float32Array(pts.flat()) },
      uv: { size: 2, data: new Float32Array(pts.length * 2) },
    });
  if (prep.showsRupture) {
    type P = [number, number, number];
    const [ts, te, be, bs] = RUPTURE.corners as [P, P, P, P];
    const pos = new Float32Array([ts, te, bs, be].flatMap(([lon, lat, d]) => [x(lon), -d, z(lat)]));
    const max = Math.max(...RUPTURE.slipCm);
    const px = new Uint8Array(RUPTURE.slipCm.length * 4);
    RUPTURE.slipCm.forEach((s, k) => {
      const t = Math.sqrt(s / max);
      px.set([pal.mainshock[0] * 255, pal.mainshock[1] * 255, pal.mainshock[2] * 255, 25 + 175 * t], k * 4);
    });
    const tex = new Texture(gl, {
      image: px,
      width: RUPTURE.alongStrike,
      height: RUPTURE.downDip,
      generateMipmaps: false,
      minFilter: gl.NEAREST,
      magFilter: gl.NEAREST,
      flipY: false,
    });
    add(
      rupture,
      new Geometry(gl, {
        position: { size: 3, data: pos },
        uv: { size: 2, data: new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]) },
        index: { data: new Uint16Array([0, 2, 1, 1, 2, 3]) },
      }),
      flat({ mode: 1, map: tex }),
      { renderOrder: 1 },
    );
    const edge = [ts, te, be, bs, ts].map(([lon, lat, d]) => [x(lon), -d, z(lat)]);
    add(rupture, lineGeometry(edge), flat({ mode: 0, color: pal.mainshock }), { mode: gl.LINE_STRIP, renderOrder: 1 });
  }

  // --- Events: one instanced sphere, drawn through the plate ---------------------------------------
  const { events, snappedSet } = prep;
  const sphere = new Sphere(gl, { radius: 1, widthSegments: 14, heightSegments: 10 });
  const offsets = new Float32Array(events.length * 3);
  const scales = new Float32Array(events.map(eventRadius));
  const colours = new Float32Array(events.length * 3);
  sphere.addAttribute("offset", { instanced: 1, size: 3, data: offsets });
  sphere.addAttribute("scale", { instanced: 1, size: 1, data: scales });
  sphere.addAttribute("icolor", { instanced: 1, size: 3, data: colours });
  sphere.addAttribute("color", { size: 3, data: new Float32Array(sphere.attributes.position!.data!.length) });
  const dots = add(scene, sphere, lit({ mode: 1, instanced: true }), { renderOrder: 2 });
  const placeDots = (ex: number, highlight: boolean) => {
    events.forEach((e, k) => {
      offsets.set([x(e.lon), -e.depthKm * ex, z(e.lat)], k * 3);
      const snapped = highlight && e.source === "shallow" && snappedSet.has(Math.round(e.depthKm * 10) / 10);
      colours.set(snapped ? pal.foreground : pal[e.source], k * 3);
    });
    sphere.attributes.offset!.needsUpdate = true;
    sphere.attributes.icolor!.needsUpdate = true;
  };

  // --- Box -----------------------------------------------------------------------------------------
  const c = (sx: number, y: number, sz: number) => [sx ? EAST : WEST, y, sz ? SOUTH : NORTH];
  const boxEdges: number[][] = [];
  for (const [a, b] of [
    [c(0, 0, 0), c(1, 0, 0)],
    [c(1, 0, 0), c(1, 0, 1)],
    [c(1, 0, 1), c(0, 0, 1)],
    [c(0, 0, 1), c(0, 0, 0)],
    [c(0, -FLOOR_KM, 0), c(1, -FLOOR_KM, 0)],
    [c(1, -FLOOR_KM, 0), c(1, -FLOOR_KM, 1)],
    [c(1, -FLOOR_KM, 1), c(0, -FLOOR_KM, 1)],
    [c(0, -FLOOR_KM, 1), c(0, -FLOOR_KM, 0)],
    [c(0, 0, 0), c(0, -FLOOR_KM, 0)],
    [c(1, 0, 0), c(1, -FLOOR_KM, 0)],
    [c(1, 0, 1), c(1, -FLOOR_KM, 1)],
    [c(0, 0, 1), c(0, -FLOOR_KM, 1)],
  ] as number[][][])
    boxEdges.push(a!, b!);
  const box = add(vertical, lineGeometry(boxEdges), flat({ mode: 0, color: pal.muted, opacity: 0.5 }), {
    mode: gl.LINES,
  });

  // --- Labels: DOM over the canvas, placed by projecting their points ------------------------------
  interface Tag {
    el: HTMLElement;
    at: () => [number, number, number];
    shown: () => boolean;
  }
  const tags: Tag[] = [];
  const tag = (el: HTMLElement, at: Tag["at"], shown: Tag["shown"]) => {
    el.style.position = "absolute";
    el.style.left = "0";
    el.style.top = "0";
    overlay.append(el);
    tags.push({ el, at, shown });
  };
  let view = initial;
  let fromAbove = 0;
  for (let d = 0; d <= 200; d += 50) {
    tag(
      labelElement(d === 0 ? "0 km" : `${d} km`, LABEL_MUTED),
      () => [EAST + 6, -d * view.exaggeration, SOUTH],
      () => view.layers.labels && fromAbove < 0.5,
    );
  }
  for (const t of PINNED_TOWNS) {
    const h = groundAt(t.lat, t.lon);
    tag(
      pinElement(t.name, t.kind === "home"),
      () => [x(t.lon), h * view.exaggeration, z(t.lat)],
      () => view.layers.labels,
    );
  }
  tag(
    labelElement("fosa del Pacífico", LABEL_MUTED),
    () => [x(-78.05), 8, z(4.2)],
    () => view.layers.labels,
  );
  tag(
    labelElement("placa de Nazca · modelo USGS Slab2", LABEL),
    () => [x(-77.3), -40 * view.exaggeration, z(3.6)],
    () => view.layers.plate && fromAbove < 0.5,
  );
  if (prep.showsRupture)
    tag(
      labelElement("ruptura del M7.4 · modelo del USGS", `${LABEL} text-chart-2`),
      () => [x(-76.9), -150 * view.exaggeration, z(4.1)],
      () => view.layers.rupture && fromAbove < 0.5,
    );

  // --- View state ------------------------------------------------------------------------------
  function setView(v: View) {
    const exChanged = vertical.scale.y !== v.exaggeration;
    view = v;
    vertical.scale.y = v.exaggeration;
    for (const p of programs)
      if (p.uniforms.uClipY!.value > -1e8) p.uniforms.uClipY!.value = -FLOOR_KM * v.exaggeration;
    ground.visible = v.layers.ground;
    plate.visible = v.layers.plate;
    rupture.visible = v.layers.rupture;
    dots.visible = v.layers.events;
    placeDots(v.exaggeration, v.layers.snapped);
    sphere.instancedCount = v.until === null ? events.length : events.filter((e) => e.t <= v.until!).length;
    if (exChanged && current) goTo(current, false);
  }

  // --- Camera -----------------------------------------------------------------------------------
  let current: Preset | null = null;
  let tween: { from: Vec3; to: Vec3; tFrom: Vec3; tTo: Vec3; start: number; ms: number } | null = null;
  let autoRotate = false;
  const listeners: (() => void)[] = [];
  const place = (pos: Vec3, target: Vec3) => {
    camera.position.copy(pos);
    orbit.target.copy(target);
    orbit.forcePosition();
  };
  function goTo(p: Preset, animate: boolean) {
    current = p;
    const { position, target } = presetCamera(p, vertical.scale.y, camera.fov, camera.aspect);
    const to = new Vec3(...position);
    const tTo = new Vec3(...target);
    if (!animate) {
      tween = null;
      place(to, tTo);
      return;
    }
    tween = { from: camera.position.clone(), to, tFrom: orbit.target.clone(), tTo, start: performance.now(), ms: 1100 };
  }
  const interact = () => {
    current = null;
    tween = null;
    for (const cb of listeners) cb();
  };
  canvas.addEventListener("pointerdown", interact);
  canvas.addEventListener("wheel", interact, { passive: true });
  canvas.style.touchAction = "none";

  // --- Loop -------------------------------------------------------------------------------------
  let frames = 0;
  let fps = 0;
  let second = performance.now();
  let raf = 0;
  const tmp = new Vec3();
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    if (tween) {
      const t = Math.min(1, (now - tween.start) / tween.ms);
      const e = easeInOut(t);
      place(tmp.copy(tween.from).lerp(tween.to, e), new Vec3().copy(tween.tFrom).lerp(tween.tTo, e));
      if (t === 1) tween = null;
    } else {
      if (autoRotate) {
        const off = new Vec3().sub(camera.position, orbit.target);
        const a = ((2 * Math.PI) / 60 / 60) * 0.6;
        const [ox, oz] = [off.x * Math.cos(a) - off.z * Math.sin(a), off.x * Math.sin(a) + off.z * Math.cos(a)];
        place(new Vec3(orbit.target.x + ox, camera.position.y, orbit.target.z + oz), orbit.target.clone());
      }
      orbit.update();
    }
    camera.updateMatrixWorld();
    // The light's direction in view space, for the shaders.
    const vm = camera.viewMatrix;
    lightView
      .set(
        vm[0]! * sunWorld.x + vm[4]! * sunWorld.y + vm[8]! * sunWorld.z,
        vm[1]! * sunWorld.x + vm[5]! * sunWorld.y + vm[9]! * sunWorld.z,
        vm[2]! * sunWorld.x + vm[6]! * sunWorld.y + vm[10]! * sunWorld.z,
      )
      .normalize();
    // Looking down: see-through ground; only what makes sense from above.
    const look = new Vec3().sub(orbit.target, camera.position).normalize();
    fromAbove = Math.min(1, Math.max(0, (-look.y - 0.6) / 0.3));
    groundProgram.uniforms.uOpacity!.value = 1 - 0.45 * fromAbove;
    groundProgram.depthWrite = fromAbove === 0;
    plate.visible = view.layers.plate && fromAbove < 0.5;
    uncertainty.visible = view.layers.plate && view.layers.uncertainty && fromAbove < 0.5;
    box.visible = fromAbove < 0.5;
    renderer.render({ scene, camera, sort: true, frustumCull: false });
    // Labels.
    const { clientWidth: w, clientHeight: h } = container;
    const pv = camera.projectionViewMatrix;
    for (const t of tags) {
      const [px, py, pz] = t.at();
      const cw = pv[3]! * px + pv[7]! * py + pv[11]! * pz + pv[15]!;
      if (!t.shown() || cw <= 0) {
        t.el.style.display = "none";
        continue;
      }
      const cx = (pv[0]! * px + pv[4]! * py + pv[8]! * pz + pv[12]!) / cw;
      const cy = (pv[1]! * px + pv[5]! * py + pv[9]! * pz + pv[13]!) / cw;
      t.el.style.display = "";
      t.el.style.transform = `translate(-50%, -50%) translate(${((cx + 1) / 2) * w}px, ${((1 - cy) / 2) * h}px)`;
    }
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
    renderer.setSize(w, h);
    camera.perspective({ aspect: w / h });
    if (current && !tween) goTo(current, false);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();
  setView(initial);
  goTo("oblique", false);
  raf = requestAnimationFrame(loop);

  return {
    engine: "ogl",
    canvas,
    setView,
    goTo,
    setAutoRotate(on) {
      autoRotate = on;
    },
    onInteract(cb) {
      listeners.push(cb);
    },
    inlineGestures() {
      canvas.style.touchAction = "pan-y";
      const stop = (e: Event) => {
        if (e instanceof TouchEvent && e.touches.length > 1) return;
        e.stopImmediatePropagation();
      };
      canvas.addEventListener("touchstart", stop, { capture: true });
      canvas.addEventListener("wheel", stop, { capture: true });
    },
    resize,
    fps: () => fps,
    times: { first: events[0]?.t ?? 0, last: events.at(-1)?.t ?? 0 },
    snapped: prep.snapped,
    dispose() {
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.remove();
      overlay.remove();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
