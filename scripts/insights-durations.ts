/**
 * Writes `src/insights/durations.json`: how long the M7.4's fault moved, for the story's
 * "¿Cuánto duró?" step. Run once, by hand, and commit the output:
 *
 *   pnpm tsx scripts/insights-durations.ts && pnpm format
 *
 * The source is USGS's finite-fault model for us6000tjl2 (product `us6000tjl2_1`, reviewed), its
 * `moment_rate.mr` pinned by URL, as `scripts/insights-block.ts` pins the same product's plane: the
 * rate at which the fault released its seismic moment, second by second from the hypocentral time.
 * The step states the time until 95% of the moment was out (`releaseTimes`). USGS's work, public
 * domain. Checked on 2026-09-26 against the file by hand (Python).
 */
import { writeFile } from "node:fs/promises";
import { releaseTimes } from "../src/insights/release";

const OUT = new URL("../src/insights/durations.json", import.meta.url);
const USGS_MR = "https://earthquake.usgs.gov/product/finite-fault/us6000tjl2_1/us/1786734841617/moment_rate.mr";

/** `[seconds, rate]` rows from whitespace-separated text, skipping the first `header` lines. */
function rows(text: string, header: number) {
  return text
    .split("\n")
    .slice(header)
    .filter((l) => l.trim())
    .map((l) => {
      const [t, r] = l.trim().split(/\s+/).map(Number);
      if (!Number.isFinite(t) || !Number.isFinite(r)) throw new Error(`not a number in "${l}"`);
      return [t!, r!] as const;
    });
}

const r2 = (v: number) => Math.round(v * 100) / 100;

const res = await fetch(USGS_MR);
if (!res.ok) throw new Error(`HTTP ${res.status} for ${USGS_MR}`);
// Two header lines ("dt: 0.01", then the column names), then time and moment rate in N·m/s.
const mrText = await res.text();
if (!mrText.startsWith("dt:")) throw new Error("moment_rate.mr: unexpected header");
const main = releaseTimes(rows(mrText, 2));

const out = {
  source: { retrieved: new Date().toISOString().slice(0, 10) },
  main: {
    sgcId: "SGC2026pqqmro",
    usgsId: "us6000tjl2",
    product: "us6000tjl2_1",
    url: USGS_MR,
    t95: r2(main.t95),
  },
};
await writeFile(OUT, JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${OUT.pathname}:`, JSON.stringify(out));
