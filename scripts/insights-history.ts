/**
 * Writes `src/insights/history.json`: past Colombian earthquakes the story's "¿Qué tan grande?" step
 * compares the M7.4 with. Run once, by hand, and commit the output:
 *
 *   pnpm tsx scripts/insights-history.ts && pnpm format
 *
 * Source: ISC-GEM, the ISC-GEM Global Instrumental Earthquake Catalogue (1904–2021; Storchak et al.
 * 2013, Di Giacomo et al. 2018; doi:10.31905/D808B825, CC BY-SA 3.0), read through USGS's ComCat,
 * which carries it as the contributing catalogue `iscgem`. ISC-GEM recomputes every magnitude as a
 * moment magnitude (Mw) from the original records, so a 1906 event and a 1999 one are on one scale,
 * which ComCat's preferred magnitudes are not (its 1979 Eje Cafetero event is an mb 6.4; ISC-GEM
 * gives it Mw 7.2). Because of the licence, `history.json` is CC BY-SA 3.0 as well.
 *
 * Two things are written:
 * - `quakes`: the events the step draws, chosen by a person (`PICKED`) as earthquakes readers in
 *   Colombia know, not by a rule. The page says so. Names are ours; every figure is ISC-GEM's, the
 *   magnitude rounded to the tenth the page shows (`mag`) beside the one ISC-GEM publishes.
 * - `region`: the largest magnitude within `RADIUS_KM` of Pereira in the whole record, ISC-GEM to its
 *   end and ComCat's own catalogue after it, the M7.4 left out. The step may call the M7.4 the largest
 *   in the region only against this, never against the picked list.
 */
import { writeFile } from "node:fs/promises";
import { PEREIRA } from "../core/places";

const OUT = new URL("../src/insights/history.json", import.meta.url);
const COMCAT = "https://earthquake.usgs.gov/fdsnws/event/1/query";
/** USGS's id for the M7.4 of 2026-08-10, SGC's SGC2026pqqmro. */
const M74 = "us6000tjl2";
const RADIUS_KM = 250;
/** The region's record is read from this magnitude up; anything smaller cannot be the largest. */
const REGION_MIN_MAG = 6.5;
/** ISC-GEM begins in 1904. */
const ISCGEM_FROM = 1904;

/** ISC-GEM ids and the day each happened (UTC), with the names the page shows. */
const PICKED = [
  { id: "iscgem16957884", day: "1906-01-31", es: "Costa de Ecuador y Colombia", en: "Ecuador–Colombia coast" },
  { id: "iscgem654039", day: "1979-12-12", es: "Tumaco (Nariño)", en: "Tumaco (Nariño)" },
  { id: "iscgem656068", day: "1979-11-23", es: "Eje Cafetero", en: "Coffee region" },
  { id: "iscgem167996", day: "1994-06-06", es: "Páez (Cauca)", en: "Páez (Cauca)" },
  { id: "iscgem89834", day: "1995-08-19", es: "Neira (Caldas)", en: "Neira (Caldas)" },
  { id: "iscgem118073", day: "1995-02-08", es: "Calima (Valle)", en: "Calima (Valle)" },
  { id: "iscgem1443400", day: "1999-01-25", es: "Armenia (Quindío)", en: "Armenia (Quindío)" },
  { id: "iscgem581906", day: "1983-03-31", es: "Popayán (Cauca)", en: "Popayán (Cauca)" },
] as const;

interface Feature {
  id: string;
  properties: { mag: number; magType: string; time: number };
  geometry: { coordinates: [number, number, number] };
}

function finite(v: unknown, what: string) {
  const n = Number(v);
  if (typeof v === "boolean" || v === null || v === "" || !Number.isFinite(n))
    throw new Error(`ComCat: ${what} is not a number`);
  return n;
}

async function query(params: Record<string, string | number>) {
  const url = `${COMCAT}?${new URLSearchParams({ format: "geojson", ...params } as Record<string, string>)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ComCat: HTTP ${res.status} for ${url}`);
  return ((await res.json()) as { features: Feature[] }).features;
}

const nextDay = (day: string) => new Date(Date.parse(day) + 86_400_000).toISOString().slice(0, 10);
const r2 = (v: number) => Math.round(v * 100) / 100;
/**
 * To the tenth, half up on the decimal as written (6.35 is 6.4; in floating point 6.35 × 10 is
 * 63.4999…). The page shows and compares magnitudes in whole tenths, so every ratio it states comes
 * from the magnitude the reader sees.
 */
const tenth = (v: number) => Math.round(Number((v * 10).toFixed(6))) / 10;

const quakes = [];
for (const p of PICKED) {
  const f = (await query({ catalog: "iscgem", starttime: p.day, endtime: nextDay(p.day) })).find((x) => x.id === p.id);
  if (!f) throw new Error(`ComCat no longer lists ${p.id} on ${p.day}`);
  if (f.properties.magType.toLowerCase() !== "mw") throw new Error(`${p.id} is ${f.properties.magType}, not Mw`);
  const [lon, lat, depth] = f.geometry.coordinates;
  quakes.push({
    id: p.id,
    time: new Date(finite(f.properties.time, `${p.id} time`)).toISOString(),
    lat: r2(finite(lat, `${p.id} lat`)),
    lon: r2(finite(lon, `${p.id} lon`)),
    depthKm: Math.round(finite(depth, `${p.id} depth`)),
    mag: tenth(finite(f.properties.mag, `${p.id} mag`)),
    publishedMag: finite(f.properties.mag, `${p.id} mag`),
    name: { es: p.es, en: p.en },
  });
}

// ISC-GEM's last event, so ComCat's own catalogue takes over the day after.
const [last] = await query({ catalog: "iscgem", orderby: "time", limit: 1, starttime: "2015-01-01" });
if (!last) throw new Error("ComCat: no ISC-GEM events since 2015");
const iscgemEnd = new Date(last.properties.time).toISOString().slice(0, 10);
const around = { latitude: PEREIRA.lat, longitude: PEREIRA.lon, maxradiuskm: RADIUS_KM, minmagnitude: REGION_MIN_MAG };
const inRegion = [
  ...(await query({ ...around, catalog: "iscgem", starttime: "1900-01-01", endtime: nextDay(iscgemEnd) })),
  ...(await query({ ...around, starttime: nextDay(iscgemEnd) })).filter((f) => f.id !== M74),
];
const largest = inRegion.reduce<Feature | null>((a, b) => (!a || b.properties.mag > a.properties.mag ? b : a), null);
if (!largest) throw new Error(`ComCat: nothing of M${REGION_MIN_MAG}+ within ${RADIUS_KM} km of Pereira`);

const out = {
  source: {
    catalogue: "ISC-GEM, through USGS ComCat",
    doi: "10.31905/D808B825",
    licence: "CC BY-SA 3.0",
    retrieved: new Date().toISOString().slice(0, 10),
    iscgemEnd,
  },
  region: {
    radiusKm: RADIUS_KM,
    /** ISC-GEM's first year: the record the claim is made against starts here. */
    from: ISCGEM_FROM,
    maxMag: tenth(largest.properties.mag),
    maxId: largest.id,
    /** The event the claim is about, left out of `maxMag`. */
    excluded: M74,
  },
  quakes,
};
await writeFile(OUT, JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${OUT.pathname}: ${quakes.length} quakes; region max M${largest.properties.mag} (${largest.id})`);
