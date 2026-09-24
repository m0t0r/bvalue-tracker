/**
 * Writes `src/insights/region.geo.json`, the country outlines the insights page draws its maps on.
 * Run once, by hand: `pnpm tsx scripts/insights-region.ts`. The output is committed, so the page
 * ships ~60 kB of outlines rather than the world.
 *
 * Source: Natural Earth 1:50m admin-0 countries (public domain), through the `world-atlas`
 * package. Only the countries a map around Colombia's Pacific coast and the Andes can show are
 * kept, with coordinates rounded to 0.01° (~1 km), finer than anything these maps resolve.
 */
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";

const KEEP = ["Colombia", "Panama", "Ecuador", "Venezuela"];
const OUT = new URL("../src/insights/region.geo.json", import.meta.url);

const require = createRequire(import.meta.url);
const topo = JSON.parse(await readFile(require.resolve("world-atlas/countries-50m.json"), "utf8")) as Topology<{
  countries: GeometryCollection<{ name: string }>;
}>;
const all = feature(topo, topo.objects.countries);
const round = (v: unknown): unknown =>
  typeof v === "number" ? Math.round(v * 100) / 100 : Array.isArray(v) ? v.map(round) : v;
const features = all.features
  .filter((f) => KEEP.includes(f.properties.name))
  .map((f) => ({
    type: "Feature",
    properties: { name: f.properties.name },
    geometry: { ...f.geometry, coordinates: round((f.geometry as { coordinates: unknown }).coordinates) },
  }));
if (features.length !== KEEP.length) throw new Error(`expected ${KEEP.length} countries, found ${features.length}`);
await writeFile(OUT, JSON.stringify({ type: "FeatureCollection", features }) + "\n");
console.log(`wrote ${OUT.pathname}`);
