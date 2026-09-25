/**
 * Writes `src/insights/block.json`: what a 3D block of the insights page's region needs besides the
 * plate (which is `section.json`'s Slab2 grid) and the events (which are the live catalogue). Run
 * once, by hand, and commit the output:
 *
 *   pnpm tsx scripts/insights-block.ts && pnpm format
 *
 * Sources, both public domain:
 * - The ground: GEBCO 2020 (`./gebco.ts`) every 0.05° over the Slab2 box of `section.json`, in whole
 *   tens of metres. The same source and rounding as the cuts, so the block and the cuts agree where
 *   they meet.
 * - The rupture: USGS's finite-fault model for the M7.4 (us6000tjl2, product `us6000tjl2_1`, version
 *   1, reviewed; https://earthquake.usgs.gov/earthquakes/eventpage/us6000tjl2/finite-fault). The
 *   plane's corners, its strike, dip and rake, the hypocentre the model was built around, and the
 *   slip of each patch. USGS product URLs are versioned and never change, so the file is pinned; a
 *   new version of the model is a new URL, and this script is re-run by a person.
 */
import { writeFile } from "node:fs/promises";
import { elevations, r } from "./gebco";

const OUT = new URL("../src/insights/block.json", import.meta.url);
/** The Slab2 box of `scripts/insights-section.ts`, at half its step. */
const BOX = { lon0: -79, lon1: -74.5, lat0: 3.5, lat1: 5.3, step: 0.05 };
const FFM = "https://earthquake.usgs.gov/product/finite-fault/us6000tjl2_1/us/1786734841617/FFM.geojson";

type Vertex = [number, number, number];
interface Ffm {
  features: { geometry: { coordinates: Vertex[][] }; properties: { slip: number } }[];
  metadata: { eventid: string; hypocenter: { lat: number; lon: number; depth: number } };
}
interface Detail {
  properties: {
    products: Record<string, { contents: Record<string, { url: string }>; properties: Record<string, string> }[]>;
  };
}

function finite(v: unknown, what: string) {
  const n = Number(v);
  if (typeof v === "boolean" || v === null || v === "" || !Number.isFinite(n))
    throw new Error(`USGS: ${what} is not a number`);
  return n;
}

async function json<T>(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`USGS: HTTP ${res.status} for ${url}`);
  return (await res.json()) as T;
}

async function rupture() {
  const ffm = await json<Ffm>(FFM);
  // Strike, dip and the rest are the product's properties on the event, not in the file. Read from
  // the product whose file is the pinned one: a newer model would have other properties, and a new URL.
  const detail = await json<Detail>(
    `https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=${ffm.metadata.eventid}&format=geojson`,
  );
  const model = detail.properties.products["finite-fault"]?.find(
    (p) => p.contents["FFM.geojson"]?.url === FFM,
  )?.properties;
  if (!model) throw new Error("USGS no longer lists the pinned finite-fault model: check for a new version");
  const strike = finite(model["model-strike"], "model-strike");
  const dip = finite(model["model-dip"], "model-dip");
  const hypo = {
    lat: finite(ffm.metadata.hypocenter.lat, "hypocentre latitude"),
    lon: finite(ffm.metadata.hypocenter.lon, "hypocentre longitude"),
    depthKm: finite(ffm.metadata.hypocenter.depth, "hypocentre depth"),
  };

  // Each patch is a quadrilateral (closed, so five vertices), depths in metres. Along the strike is
  // measured on a flat projection around the hypocentre, which at 150 km is good to ~0.1%.
  const cos = Math.cos((hypo.lat * Math.PI) / 180);
  const [sx, sy] = [Math.sin((strike * Math.PI) / 180), Math.cos((strike * Math.PI) / 180)];
  const along = ([lon, lat]: Vertex) => (lon - hypo.lon) * cos * sx + (lat - hypo.lat) * sy;
  const patches = ffm.features.map((f, k) => {
    const v = f.geometry.coordinates[0]!.slice(0, 4);
    for (const c of v.flat()) finite(c, `patch ${k}'s vertex`);
    return {
      v,
      top: Math.round(Math.min(...v.map((p) => p[2]))),
      mid: v.reduce((a, p) => a + along(p), 0) / 4,
      slip: finite(f.properties.slip, `patch ${k}'s slip`),
    };
  });

  // The patches form a grid: rows by their top depth, columns in the strike's direction, 0 at the
  // plane's north-eastern end. Every cell must be filled exactly once.
  const rows = [...new Set(patches.map((p) => p.top))].sort((a, b) => a - b);
  const alongStrike = patches.length / rows.length;
  if (!Number.isInteger(alongStrike) || alongStrike < 2) throw new Error("USGS: the patches are not a grid");
  const [first, last] = [Math.min(...patches.map((p) => p.mid)), Math.max(...patches.map((p) => p.mid))];
  const slipCm: (number | undefined)[] = Array.from({ length: patches.length }, () => undefined);
  for (const p of patches) {
    const k = rows.indexOf(p.top) * alongStrike + Math.round(((p.mid - first) / (last - first)) * (alongStrike - 1));
    if (slipCm[k] !== undefined) throw new Error("USGS: two patches in one cell of the grid");
    slipCm[k] = Math.round(p.slip * 100);
  }

  // The plane's corners: the extreme vertices along the strike at its shallowest and deepest.
  const vertices = patches.flatMap((p) => p.v);
  const edge = (depth: number) => {
    const vs = vertices.filter((p) => Math.abs(p[2] - depth) < 1);
    const by = (sign: number) => vs.reduce((a, b) => (sign * along(b) < sign * along(a) ? b : a));
    return [by(1), by(-1)] as const;
  };
  const [topStart, topEnd] = edge(Math.min(...vertices.map((p) => p[2])));
  const [bottomStart, bottomEnd] = edge(Math.max(...vertices.map((p) => p[2])));
  const corner = ([lon, lat, m]: Vertex) => [lon, lat, r(m / 1000, 2)];

  return {
    eventId: ffm.metadata.eventid,
    productUrl: FFM,
    strike: r(strike, 2),
    dip: r(dip, 2),
    rake: r(finite(model["model-rake"], "model-rake"), 2),
    lengthKm: finite(model["model-length"], "model-length"),
    widthKm: finite(model["model-width"], "model-width"),
    hypocentre: hypo,
    corners: [topStart, topEnd, bottomEnd, bottomStart].map(corner),
    alongStrike,
    downDip: rows.length,
    slipCm,
  };
}

async function ground() {
  const nx = Math.round((BOX.lon1 - BOX.lon0) / BOX.step) + 1;
  const ny = Math.round((BOX.lat1 - BOX.lat0) / BOX.step) + 1;
  const points: [number, number][] = [];
  // Row by row from the south-west corner, as `section.json`'s plate grid.
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) points.push([r(BOX.lon0 + i * BOX.step, 2), r(BOX.lat0 + j * BOX.step, 2)]);
  }
  return { lon0: BOX.lon0, lat0: BOX.lat0, step: BOX.step, nx, ny, elevationM: await elevations(points) };
}

// USGS first: it is the part that fails when the model is superseded, and it takes a second, where
// the ground takes 34 rate-limited requests.
const plane = await rupture();
await writeFile(OUT, JSON.stringify({ ground: await ground(), rupture: plane }) + "\n");
console.log(`wrote ${OUT.pathname}; run \`pnpm format\` before committing`);
