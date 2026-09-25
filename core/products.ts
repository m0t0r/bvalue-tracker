/**
 * When the daily USGS job runs (docs/ingest.md, "The daily USGS job"), shared by the Worker, whose
 * `scheduled()` matches the pattern, and the insights page, which asks for USGS's next forecast only
 * once a run could have stored it. Change the pattern and the run time together; the Worker's test
 * holds the pattern to `wrangler.jsonc`.
 */
export const PRODUCTS_CRON = "7 11 * * *";

const DAY = 86_400_000;
/** The run's time of day, in ms after midnight UTC: 11:07. */
const RUN_AT_MS = (11 * 60 + 7) * 60_000;

/** The newest run at or before `t` (ms since the epoch). */
export function lastProductsRun(t: number): number {
  const run = Math.floor(t / DAY) * DAY + RUN_AT_MS;
  return run <= t ? run : run - DAY;
}
