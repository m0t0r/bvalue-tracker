/**
 * The sea state the 3D block draws: Open-Meteo's marine forecast for one point in the block's Pacific,
 * fetched once a day by the daily job (`PRODUCTS_CRON`, after USGS's products) and stored as one small
 * row for `GET /api/sea` (docs/ingest.md, "The daily sea-state job").
 *
 * - **Once a day, 72 hours ahead.** The wave models behind it update every 6–12 hours and the drawing
 *   is illustrative, so one request a day is plenty; three days of hours mean one failed run still
 *   leaves the page the current hour. The page picks the hour it is in and draws nothing from the data
 *   once the stored hours have run out.
 * - **Never on a reader's request**, like `/api/context`: the route is one primary-key read. Cloudflare's
 *   Cache API would not have done it: it does nothing on `workers.dev`.
 * - **One model, named**: Météo-France's MFWAM (`meteofrance_wave`), so the page can say whose model
 *   it is. Open-Meteo's data is CC BY 4.0 and needs its link wherever it is shown.
 * - **Only this one URL is fetched**, a redirect is a failure, and a response the digest cannot read
 *   throws and keeps the stored row, as the USGS job does.
 */
import type { SeaForecast, SeaHour, WaveTrain } from "./api-types.ts";
import type { Logger } from "./log.ts";

/** The point asked about: the open Pacific in the block's west, off the shelf (models are poor at the coast). */
export const SEA_POINT = { lat: 4.3, lon: -78.3 } as const;
const HOURS = 72;
const VARIABLES = ["swell_wave", "secondary_swell_wave", "wind_wave"] as const;
export const SEA_URL =
  "https://marine-api.open-meteo.com/v1/marine" +
  `?latitude=${SEA_POINT.lat}&longitude=${SEA_POINT.lon}` +
  `&hourly=${VARIABLES.flatMap((v) => [`${v}_height`, `${v}_direction`, `${v}_period`]).join(",")}` +
  `&models=meteofrance_wave&forecast_days=${HOURS / 24}&timezone=UTC&timeformat=unixtime`;

/** A slow Open-Meteo must not hold the invocation open; tomorrow's run tries again. */
const FETCH_TIMEOUT_MS = 20_000;
/** Bumped whenever the digest's shape or rules change, so a stored row from older code is not served. */
export const SEA_DIGEST_VERSION = 1;

/** What a wave train can physically be. Outside it the file is misread, not a record sea. */
const MAX_HEIGHT_M = 30;
const MAX_PERIOD_S = 30;
/** A week of hours: well over the 72 asked for. */
const MAX_HOURS = 24 * 7;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function train(height: unknown, from: unknown, period: unknown): WaveTrain | null {
  const [h, d, p] = [num(height), num(from), num(period)];
  // A missing value, or a train of no height or period (the wind waves on a still day), is none. So is
  // one outside what a wave can be: that hour's train alone is dropped, not the day's forecast.
  if (h === null || d === null || p === null || h <= 0 || p <= 0) return null;
  if (h > MAX_HEIGHT_M || p > MAX_PERIOD_S || d < 0 || d > 360) return null;
  return { heightM: h, fromDeg: d % 360, periodS: p };
}

/**
 * Open-Meteo's hourly answer, cut down to three wave trains an hour. Throws rather than guessing: a
 * missing column or columns of different lengths mean the file is not what this reads, and an answer
 * with no wave at all in any hour would draw a still sea from a misread.
 */
export function digestSea(file: unknown): SeaHour[] {
  const hourly = (file as { hourly?: Record<string, unknown> } | null)?.hourly;
  if (!hourly || !Array.isArray(hourly.time)) throw new Error("sea: no hourly times");
  const times = hourly.time as unknown[];
  // Asked for 72; far more is not the answer to this request, and would be stored and served whole.
  if (times.length > MAX_HOURS) throw new Error(`sea: ${times.length} hours, more than ${MAX_HOURS}`);
  const column = (name: string) => {
    const c = hourly[name];
    if (!Array.isArray(c) || c.length !== times.length) throw new Error(`sea: column ${name} missing or short`);
    return c as unknown[];
  };
  const cols = VARIABLES.map((v) => [column(`${v}_height`), column(`${v}_direction`), column(`${v}_period`)]);
  const hours = times.map((t, k): SeaHour => {
    const s = num(t);
    if (s === null || (k > 0 && s <= (num(times[k - 1]) ?? Infinity))) throw new Error("sea: hours out of order");
    const [swell, swell2, wind] = cols.map(([h, d, p]) => train(h![k], d![k], p![k]));
    return { t: s * 1000, swell: swell!, swell2: swell2!, wind: wind! };
  });
  if (!hours.some((h) => h.swell || h.swell2 || h.wind)) throw new Error("sea: no wave in any hour");
  return hours;
}

interface SeaDeps {
  db: D1Database;
  log: Logger;
  now: Date;
}

/** Fetches, digests and replaces the stored forecast. A failure keeps the stored row and throws. */
export async function refreshSea({ db, log, now }: SeaDeps): Promise<void> {
  try {
    const res = await fetch(SEA_URL, { redirect: "manual", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (res.status !== 200) throw new Error(`sea: Open-Meteo answered ${res.status}`);
    const hours = digestSea(await res.json());
    await db
      .prepare(
        "INSERT INTO sea_forecast (id, source_url, fetched_at, digest, digest_version) VALUES (1, ?, ?, ?, ?) " +
          "ON CONFLICT (id) DO UPDATE SET source_url = excluded.source_url, fetched_at = excluded.fetched_at, " +
          "digest = excluded.digest, digest_version = excluded.digest_version",
      )
      .bind(SEA_URL, now.toISOString(), JSON.stringify(hours), SEA_DIGEST_VERSION)
      .run();
    log.info(
      { hours: hours.length, from: new Date(hours[0]!.t).toISOString(), to: new Date(hours.at(-1)!.t).toISOString() },
      "sea: stored",
    );
  } catch (err) {
    log.warn({ err }, "sea: refresh failed");
    throw err;
  }
}

interface SeaRow {
  fetched_at: string;
  digest: string;
  digest_version: number;
}

/** What `GET /api/sea` serves: the stored forecast, or null before the first run or from older code. */
export async function readSea(db: D1Database): Promise<SeaForecast | null> {
  const row = await db
    .prepare("SELECT fetched_at, digest, digest_version FROM sea_forecast WHERE id = 1")
    .first<SeaRow>();
  if (!row || row.digest_version !== SEA_DIGEST_VERSION) return null;
  return {
    source: "open-meteo",
    model: "meteofrance_wave",
    lat: SEA_POINT.lat,
    lon: SEA_POINT.lon,
    fetchedAt: row.fetched_at,
    hours: JSON.parse(row.digest) as SeaHour[],
  };
}
