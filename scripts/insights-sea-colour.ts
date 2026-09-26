/**
 * Writes `src/insights/block3d/sea-colour.json`: how green the 3D block's sea is, cell by cell, from
 * what satellites see, so the drawn sea is clear blue offshore and grey-green where the rivers meet it,
 * as the real one is. Run once, by hand, and commit the output:
 *
 *   pnpm tsx scripts/insights-sea-colour.ts && pnpm format
 *
 * Source: ESA's Ocean Colour Climate Change Initiative, version 6.0 (merged sensors, cloud-filtered
 * monthly composites, 0.0417° ≈ 4.6 km), chlorophyll-a, through NOAA PIFSC's ERDDAP
 * (`esa-cci-chla-monthly-v6-0`). Free and open; cite "Ocean Colour Climate Change Initiative dataset,
 * Version 6.0, European Space Agency, https://esa-oceancolour-cci.org".
 *
 * - **The median month of five years (2021–2025)**, per cell, so one bloom or one cloudy season does
 *   not set the colour; a cell needs at least `MIN_MONTHS` clear months or it is filled.
 * - **Chlorophyll stands for colour.** Near this coast it rises with river runoff and sediment as well
 *   as plankton (and the product overestimates it in turbid water), which is what turns the water
 *   green-grey; `seaColour` in `block3d/shared.ts` turns it into a colour.
 * - **Every cell is filled**: the satellite masks the first 5–15 km off the river mouths and the land,
 *   so an empty cell takes its nearest measured one. The water there is probably browner than that.
 *
 * Stored as log10 of mg/m³, to the hundredth, from the south-west corner, row by row.
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../src/insights/block3d/sea-colour.json", import.meta.url));
const DATASET = "esa-cci-chla-monthly-v6-0";
const ERDDAP = `https://oceanwatch.pifsc.noaa.gov/erddap/griddap/${DATASET}.csv`;
const YEARS = [2021, 2025] as const;
/** The block's sea: its west edge to past the easternmost bay, its south edge to its north (block.json). */
const BOX = { lat: [3.5, 5.3], lon: [-79, -76.6] } as const;
const MIN_MONTHS = 6;

// ERDDAP's grid: longitude 0–360, latitude listed north to south.
const east = (lon: number) => lon + 360;
const query =
  `chlor_a[(${YEARS[0]}-01-01T00:00:00Z):1:(${YEARS[1]}-12-01T00:00:00Z)]` +
  `[(${BOX.lat[1]}):1:(${BOX.lat[0]})][(${east(BOX.lon[0])}):1:(${east(BOX.lon[1])})]`;
const url = `${ERDDAP}?${query}`;
console.log(`fetching ${url}`);
const res = await fetch(url);
if (!res.ok) throw new Error(`ERDDAP answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
const rows = (await res.text()).trim().split("\n").slice(2); // a header row and a units row

// Every month's value per cell, keyed by the cell's grid position.
const lats = new Set<number>();
const lons = new Set<number>();
const byCell = new Map<string, number[]>();
for (const row of rows) {
  const [, lat, lon, chl] = row.split(",");
  const [la, lo, v] = [Number(lat), Number(lon), Number(chl)];
  lats.add(la);
  lons.add(lo);
  const key = `${la},${lo}`;
  if (!byCell.has(key)) byCell.set(key, []);
  if (Number.isFinite(v) && v > 0) byCell.get(key)!.push(v);
}
const latList = [...lats].sort((a, b) => a - b);
const lonList = [...lons].sort((a, b) => a - b);
const [ny, nx] = [latList.length, lonList.length];
const step = (latList.at(-1)! - latList[0]!) / (ny - 1);

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};
const grid: (number | null)[] = [];
let measured = 0;
for (const la of latList)
  for (const lo of lonList) {
    const v = byCell.get(`${la},${lo}`) ?? [];
    const ok = v.length >= MIN_MONTHS;
    measured += ok ? 1 : 0;
    grid.push(ok ? Math.log10(median(v)) : null);
  }

// Fill each empty cell from its nearest measured one (breadth first, four neighbours).
const filled = [...grid];
let frontier = filled.flatMap((v, k) => (v === null ? [] : [k]));
while (frontier.length) {
  const next: number[] = [];
  for (const k of frontier) {
    const [i, j] = [k % nx, Math.floor(k / nx)];
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const [a, b] = [i + di, j + dj];
      if (a < 0 || b < 0 || a >= nx || b >= ny) continue;
      const n = b * nx + a;
      if (filled[n] !== null) continue;
      filled[n] = filled[k]!;
      next.push(n);
    }
  }
  frontier = next;
}

const out = {
  source: `ESA Ocean Colour CCI v6.0, ${DATASET} via NOAA PIFSC ERDDAP; median month ${YEARS[0]}–${YEARS[1]}`,
  lon0: lonList[0]! - 360,
  lat0: latList[0]!,
  step: Math.round(step * 1e6) / 1e6,
  nx,
  ny,
  log10Chl: filled.map((v) => Math.round(v! * 100) / 100),
};
await writeFile(OUT, `${JSON.stringify(out)}\n`);
const chl = grid.filter((v): v is number => v !== null).map((v) => 10 ** v);
console.log(
  `${nx} × ${ny} cells, ${measured} measured (${((100 * measured) / (nx * ny)).toFixed(0)}%), ` +
    `chlorophyll ${Math.min(...chl).toFixed(2)}–${Math.max(...chl).toFixed(2)} mg/m³, median ${median(chl).toFixed(2)}`,
);
