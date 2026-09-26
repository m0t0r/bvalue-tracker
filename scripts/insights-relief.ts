/**
 * Writes `src/insights/block3d/relief.bin.gz`: the 3D block's ground every 0.01° (~1.1 km), five times
 * finer than `block.json`'s GEBCO grid, so the mountains are shapes and not a few triangles. Run once,
 * by hand, and commit the output:
 *
 *   pnpm tsx scripts/insights-relief.ts
 *
 * Needs `dwebp` on PATH (Homebrew's `webp`) to read Mapterhorn's tiles.
 *
 * Sources:
 * - Land: Mapterhorn's terrain tiles (the relief the monitor's map already shades, credited on the
 *   block), zoom 7 (~0.0055° a pixel), bilinear. Mapterhorn has no sea floor: the sea is 0 there.
 * - Sea floor: `block.json`'s GEBCO 2020 grid, bilinear, kept at least 1 m below the sea. It lies
 *   under the water, where 5 km steps do not show.
 *
 * Whole metres, in the format `encodeHeights` in `src/insights/block.ts` describes, gzipped;
 * `block3d/relief.ts` reads it back.
 */
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { GROUND, RELIEF, decodeHeights, encodeHeights } from "../src/insights/block";

const ZOOM = 7;
const TILE = 512;
const OUT = fileURLToPath(new URL("../src/insights/block3d/relief.bin.gz", import.meta.url));

const lon1 = GROUND.lon0 + (GROUND.nx - 1) * GROUND.step;
const lat1 = GROUND.lat0 + (GROUND.ny - 1) * GROUND.step;
if (
  RELIEF.lon0 !== GROUND.lon0 ||
  RELIEF.lat0 !== GROUND.lat0 ||
  Math.abs(RELIEF.lon0 + (RELIEF.nx - 1) * RELIEF.step - lon1) > 1e-9 ||
  Math.abs(RELIEF.lat0 + (RELIEF.ny - 1) * RELIEF.step - lat1) > 1e-9
)
  throw new Error("RELIEF in src/insights/block.ts no longer covers block.json's ground: update it first");

const world = TILE * 2 ** ZOOM;
const px = (lon: number) => ((lon + 180) / 360) * world;
const py = (lat: number) => ((1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2) * world;

const dir = await mkdtemp(join(tmpdir(), "relief-"));
const tiles = new Map<string, Uint8Array>();
try {
  for (let ty = Math.floor(py(lat1) / TILE); ty <= Math.floor(py(GROUND.lat0) / TILE); ty++) {
    for (let tx = Math.floor(px(GROUND.lon0) / TILE); tx <= Math.floor(px(lon1) / TILE); tx++) {
      const url = `https://tiles.mapterhorn.com/${ZOOM}/${tx}/${ty}.webp`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Mapterhorn: HTTP ${res.status} for ${url}`);
      const file = join(dir, `${tx}-${ty}`);
      await writeFile(`${file}.webp`, Buffer.from(await res.arrayBuffer()));
      execFileSync("dwebp", ["-quiet", `${file}.webp`, "-pam", "-o", `${file}.pam`]);
      const pam = await readFile(`${file}.pam`);
      const pixels = pam.subarray(pam.indexOf("ENDHDR\n") + 7);
      if (pixels.length !== TILE * TILE * 4) throw new Error(`Mapterhorn: ${url} is not ${TILE} px square`);
      tiles.set(`${tx}-${ty}`, pixels);
    }
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}

/** Mapterhorn's height at a global pixel, in metres. */
function tileHeight(gx: number, gy: number) {
  const t = tiles.get(`${Math.floor(gx / TILE)}-${Math.floor(gy / TILE)}`);
  if (!t) throw new Error(`no tile for pixel ${gx}, ${gy}`);
  const k = ((gy % TILE) * TILE + (gx % TILE)) * 4;
  return t[k]! * 256 + t[k + 1]! + t[k + 2]! / 256 - 32768;
}

function land(lat: number, lon: number) {
  const [fx, fy] = [px(lon) - 0.5, py(lat) - 0.5];
  const [x0, y0] = [Math.floor(fx), Math.floor(fy)];
  const [dx, dy] = [fx - x0, fy - y0];
  return (
    (tileHeight(x0, y0) * (1 - dx) + tileHeight(x0 + 1, y0) * dx) * (1 - dy) +
    (tileHeight(x0, y0 + 1) * (1 - dx) + tileHeight(x0 + 1, y0 + 1) * dx) * dy
  );
}

function seaFloor(lat: number, lon: number) {
  const fx = Math.min((lon - GROUND.lon0) / GROUND.step, GROUND.nx - 1.000001);
  const fy = Math.min((lat - GROUND.lat0) / GROUND.step, GROUND.ny - 1.000001);
  const [i, j] = [Math.floor(fx), Math.floor(fy)];
  const [dx, dy] = [fx - i, fy - j];
  const at = (a: number, b: number) => GROUND.elevationM[b * GROUND.nx + a]!;
  return (at(i, j) * (1 - dx) + at(i + 1, j) * dx) * (1 - dy) + (at(i, j + 1) * (1 - dx) + at(i + 1, j + 1) * dx) * dy;
}

const heights = new Int16Array(RELIEF.nx * RELIEF.ny);
for (let j = 0; j < RELIEF.ny; j++) {
  const lat = RELIEF.lat0 + j * RELIEF.step;
  for (let i = 0; i < RELIEF.nx; i++) {
    const lon = RELIEF.lon0 + i * RELIEF.step;
    const l = land(lat, lon);
    heights[j * RELIEF.nx + i] = Math.round(l > 0.5 ? l : Math.min(seaFloor(lat, lon), -1));
  }
}
const bytes = encodeHeights(heights, RELIEF.nx);
if (!decodeHeights(bytes, RELIEF.nx).every((h, k) => h === heights[k]))
  throw new Error("the encoding does not round-trip");
await writeFile(OUT, gzipSync(bytes, { level: 9 }));
console.log(`wrote ${OUT}: ${RELIEF.nx} × ${RELIEF.ny}`);
