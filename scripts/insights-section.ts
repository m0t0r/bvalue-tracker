/**
 * Writes `src/insights/section.json`: the subducting Nazca plate under the insights page's two
 * zones, and the ground along the two west–east cuts the story draws. Run once, by hand, and commit
 * the output:
 *
 *   pnpm tsx scripts/insights-section.ts <Slab2 directory>
 *
 * The directory is `Slab2Distribute_Mar2018` unpacked from Slab2's "Slab2 Data Volume" on
 * ScienceBase (https://doi.org/10.5066/F7PV6JNV), which refuses scripted downloads: fetch it by hand.
 * Only the South America files are read, from `Slab2_TXT/` and `Slab2Clips/`.
 *
 * Sources, both public domain:
 * - The plate: Slab2 (Hayes 2018, USGS, doi:10.5066/F7PV6JNV), South America model, 02.23.18. The
 *   grids give the depth of the plate's top, its thickness and the model's stated depth uncertainty
 *   every 0.05°. Kept every 0.1° over the box below, as whole kilometres: the surface is smooth at
 *   that spacing, and the uncertainty is ~20 km. `Slab2Clips` gives the plate's edge, the trench.
 * - The ground: GEBCO 2020 (GEBCO Bathymetric Compilation Group 2020,
 *   doi:10.5285/a29c5465-b138-234d-e053-6c86abc040b9), land and sea floor at 15″, read through the
 *   public Open Topo Data API (100 points a request, one request a second). Every 0.02° along each
 *   cut (~2.2 km), in whole tens of metres.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const dir = process.argv[2] ?? "";
if (!dir) throw new Error("usage: pnpm tsx scripts/insights-section.ts <Slab2Distribute_Mar2018 directory>");
const OUT = new URL("../src/insights/section.json", import.meta.url);
const MODEL = "02.23.18";

/** The plate is kept over this box: both zones, the trench west of them and Pereira. */
const BOX = { lon0: -79, lon1: -74.5, lat0: 3.5, lat1: 5.3, step: 0.1 };
/**
 * Each cut is one latitude. Chocó's lies between its two groups' median latitudes (4.48° N and
 * 4.81° N on 2026-09-24), so neither is drawn more than ~6 km off its own plate depth. Chaparral's
 * is the swarm's median latitude. Both start 0.3° west of the trench, so the sea floor shows.
 */
const CUTS = { choco: { lat: 4.65, lon1: -75.3 }, tolima: { lat: 3.86, lon1: -75.2 } };
const CUT_STEP = 0.02;
const TRENCH_MARGIN = 0.3;

const r = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;
const key = (lon: number, lat: number) => `${r(lon, 2)},${r(lat, 2)}`;

async function grid(name: "dep" | "thk" | "unc") {
  const text = await readFile(join(dir, "Slab2_TXT", `sam_slab2_${name}_${MODEL}.xyz`), "utf8");
  const out = new Map<string, number>();
  for (const line of text.split("\n")) {
    const [x, y, v] = line.split(",");
    if (v === undefined || v.trim() === "NaN") continue;
    const lon = Number(x) - 360;
    const lat = Number(y);
    if (lon < BOX.lon0 - 1e-9 || lon > BOX.lon1 + 1e-9 || lat < BOX.lat0 - 1e-9 || lat > BOX.lat1 + 1e-9) continue;
    out.set(key(lon, lat), Number(v));
  }
  return out;
}

const [dep, thk, unc] = await Promise.all([grid("dep"), grid("thk"), grid("unc")]);
const nx = Math.round((BOX.lon1 - BOX.lon0) / BOX.step) + 1;
const ny = Math.round((BOX.lat1 - BOX.lat0) / BOX.step) + 1;
const top: (number | null)[] = [];
const thick: (number | null)[] = [];
const err: (number | null)[] = [];
for (let j = 0; j < ny; j++) {
  for (let i = 0; i < nx; i++) {
    const k = key(BOX.lon0 + i * BOX.step, BOX.lat0 + j * BOX.step);
    const d = dep.get(k);
    const t = thk.get(k);
    const u = unc.get(k);
    const all = d !== undefined && t !== undefined && u !== undefined;
    // Slab2 gives depth as negative elevation, in km.
    top.push(all ? Math.round(-d) : null);
    thick.push(all ? Math.round(t) : null);
    err.push(all ? Math.round(u) : null);
  }
}
if (top.every((v) => v === null)) throw new Error("no Slab2 values in the box: wrong directory or model?");

/** Where the trench crosses a latitude: the clip polygon's western edge, interpolated. */
async function trenchLon(lat: number) {
  const text = await readFile(join(dir, "Slab2Clips", `sam_slab2_clp_${MODEL}.csv`), "utf8");
  const pts = text
    .trim()
    .split("\n")
    .map(
      (l) =>
        l
          .trim()
          .split(/[\s,]+/)
          .map(Number) as [number, number],
    )
    .map(([x, y]) => [x - 360, y] as const);
  let best: number | null = null;
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1]!, pts[i]!];
    if ((a[1] - lat) * (b[1] - lat) > 0 || a[1] === b[1]) continue;
    const lon = a[0] + ((lat - a[1]) / (b[1] - a[1])) * (b[0] - a[0]);
    // The polygon also crosses this latitude far to the east; the trench is its western crossing.
    if (best === null || lon < best) best = lon;
  }
  if (best === null) throw new Error(`the trench does not cross ${lat}° N`);
  return r(best, 3);
}

async function elevations(points: [number, number][]) {
  const out: number[] = [];
  for (let i = 0; i < points.length; i += 100) {
    const batch = points.slice(i, i + 100);
    const url = `https://api.opentopodata.org/v1/gebco2020?locations=${batch.map(([lon, lat]) => `${lat},${lon}`).join("|")}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Open Topo Data: HTTP ${res.status}`);
    const body = (await res.json()) as { status: string; results: { elevation: number | null }[] };
    if (body.status !== "OK" || body.results.length !== batch.length) throw new Error(`Open Topo Data: ${body.status}`);
    for (const p of body.results) {
      if (p.elevation === null) throw new Error("Open Topo Data returned no elevation");
      out.push(Math.round(p.elevation / 10) * 10);
    }
    // The public API allows one request a second.
    if (i + 100 < points.length) await new Promise((ok) => setTimeout(ok, 1100));
  }
  return out;
}

const cuts: Record<string, { lat: number; lon0: number; step: number; trenchLon: number; elevationM: number[] }> = {};
for (const [zone, cut] of Object.entries(CUTS)) {
  const trench = await trenchLon(cut.lat);
  const lon0 = r(Math.floor((trench - TRENCH_MARGIN) / CUT_STEP) * CUT_STEP, 2);
  const n = Math.round((cut.lon1 - lon0) / CUT_STEP) + 1;
  const points = Array.from({ length: n }, (_, i) => [r(lon0 + i * CUT_STEP, 2), cut.lat] as [number, number]);
  cuts[zone] = { lat: cut.lat, lon0, step: CUT_STEP, trenchLon: trench, elevationM: await elevations(points) };
}

const out = {
  plate: { lon0: BOX.lon0, lat0: BOX.lat0, step: BOX.step, nx, ny, topKm: top, thicknessKm: thick, uncertaintyKm: err },
  cuts,
};
await writeFile(OUT, JSON.stringify(out) + "\n");
console.log(`wrote ${OUT.pathname}`);
