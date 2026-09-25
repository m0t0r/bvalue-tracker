/**
 * The daily USGS job: what USGS publishes about each zone's mainshock, fetched once a day on its own
 * cron and stored as a small digest in D1 for `GET /api/context` (docs/ingest.md, "The daily USGS
 * job").
 *
 * It is its own invocation, never part of an ingest tick: those already run over the free plan's
 * 10 ms CPU, and nothing here may add to them. It never talks to SGC.
 *
 * - **Which USGS event: matched, never pinned.** The zone's mainshock is detected from SGC's
 *   catalogue (`zoneMainshock`, state "found" only), and USGS is searched for one event within a
 *   minute, 100 km and one magnitude unit of it. Exactly one is the match; none or several stores
 *   nothing and says so in the log.
 * - **An unchanged URL is an unchanged file.** USGS versions its product URLs, so a product whose
 *   URL is the one stored is not downloaded again; the row only records that it was checked.
 * - **A failure keeps what was there.** USGS down, a product missing or a file that does not parse
 *   leaves the stored digest as it was, and the route serves it with its age. The rest still runs,
 *   and then the first error is rethrown, so the invocation is recorded as failed.
 * - **A digest leaves with its mainshock.** Rows matched from any event other than the zone's found
 *   mainshock are deleted on every run, so no reader can show the M7.4's figures for a later event.
 */
import { ZONE_IDS, type ZoneId } from "../core/zones.ts";
import type { ContextResponse, ExternalProduct } from "./api-types.ts";
import { zoneMainshockRow, type MainshockRow } from "./db.ts";
import type { Logger } from "./log.ts";
import { DIGEST_VERSION, digestDyfi, digestForecast, digestPager } from "./usgs.ts";

/**
 * Once a day, at 11:07 UTC: off the ingest's quarter hours, so the two never share an invocation
 * and this one has its own CPU. Felt reports grow slowly six weeks after the M7.4 and the forecast
 * is updated about weekly, so a day is soon enough. Must match `triggers.crons` in wrangler.jsonc.
 * Defined in `core/products.ts`, because the insights page times its forecast rechecks by it.
 */
export { PRODUCTS_CRON } from "../core/products.ts";

export const USGS_SEARCH = "https://earthquake.usgs.gov/fdsnws/event/1/query";
const USGS_HOST = "earthquake.usgs.gov";

/** How far USGS's event may sit from SGC's and still be the same one: time, distance, magnitude. */
const MATCH_WINDOW_S = 60;
const MATCH_RADIUS_KM = 100;
const MATCH_MAG_BELOW = 1;

/** A slow USGS must not hold the invocation open; tomorrow's run tries again. */
const FETCH_TIMEOUT_MS = 20_000;

type Kind = keyof ContextResponse;

/** Where each kind lives among USGS's products, and how it is cut down. */
const PRODUCTS: Record<
  Kind,
  { type: string; file: string; digest: (file: unknown, props: Record<string, string>) => unknown }
> = {
  dyfi: { type: "dyfi", file: "dyfi_geo_10km.geojson", digest: digestDyfi },
  pager: { type: "losspager", file: "json/cities.json", digest: (file) => digestPager(file) },
  forecast: { type: "oaf", file: "forecast.json", digest: digestForecast },
};
const KINDS = Object.keys(PRODUCTS) as Kind[];

interface ProductRow {
  kind: Kind;
  source: "usgs";
  sgc_event_id: string;
  source_event_id: string;
  product_url: string;
  source_updated_at: string;
  checked_at: string;
  digest: string;
  digest_version: number;
}

interface UsgsProduct {
  updateTime?: number;
  properties?: Record<string, string>;
  contents?: Record<string, { url?: string }>;
}

/** Only USGS's own host, over HTTPS: a URL out of USGS's answer is still never followed elsewhere. */
function usgsUrl(raw: unknown): string {
  const url = new URL(String(raw));
  if (url.protocol !== "https:" || url.hostname !== USGS_HOST) throw new Error(`not a USGS URL: ${url.origin}`);
  return url.toString();
}

/** A redirect is a failure, never followed: the host check above holds for the first hop only. */
async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`USGS answered ${res.status} for ${url}`);
  return await res.json();
}

/** The search for SGC's mainshock in USGS's catalogue. */
export function searchUrl(m: Pick<MainshockRow, "time" | "lat" | "lon" | "mag">): string {
  const t = Date.parse(m.time);
  const q = new URLSearchParams({
    format: "geojson",
    starttime: new Date(t - MATCH_WINDOW_S * 1000).toISOString(),
    endtime: new Date(t + MATCH_WINDOW_S * 1000).toISOString(),
    latitude: String(m.lat),
    longitude: String(m.lon),
    maxradiuskm: String(MATCH_RADIUS_KM),
    minmagnitude: String(Math.round((m.mag - MATCH_MAG_BELOW) * 10) / 10),
  });
  return `${USGS_SEARCH}?${q}`;
}

/** Exactly one candidate is the event; none or several is no answer. */
function matchOne(found: unknown): { ok: true; id: string; detail: string } | { ok: false; candidates: string[] } {
  const features = (found as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) throw new Error("USGS search answered without features");
  const candidates = features.map((f: { id?: unknown }) => String(f.id));
  if (features.length !== 1) return { ok: false, candidates };
  const only = features[0] as { id?: unknown; properties?: { detail?: unknown } };
  return { ok: true, id: String(only.id), detail: usgsUrl(only.properties?.detail) };
}

export interface ProductsDeps {
  db: D1Database;
  log: Logger;
  /** The run's own instant, stored as `checked_at`. */
  now: Date;
}

/**
 * One zone: match, then each product that changed. A product that fails is logged and the others
 * still run; the first failure is returned for the caller to rethrow.
 */
async function refreshZone({ db, log, now }: ProductsDeps, zone: ZoneId): Promise<unknown> {
  const main = await zoneMainshockRow(db, zone);
  // Before anything can fail: a digest matched from another event must not outlive this run.
  await db
    .prepare("DELETE FROM external_products WHERE zone = ? AND sgc_event_id IS NOT ?")
    .bind(zone, main?.id ?? null)
    .run();
  if (main === null) {
    log.info({}, "usgs: no mainshock to match");
    return null;
  }
  const match = matchOne(await getJson(searchUrl(main)));
  if (!match.ok) {
    log.warn({ sgcEventId: main.id, candidates: match.candidates }, "usgs: no single match");
    return null;
  }

  const detail = (await getJson(match.detail)) as { properties?: { products?: Record<string, UsgsProduct[]> } };
  const products = detail.properties?.products ?? {};
  const { results: stored } = await db
    .prepare("SELECT * FROM external_products WHERE zone = ?")
    .bind(zone)
    .all<ProductRow>();
  const checkedAt = now.toISOString();
  const unchanged: Kind[] = [];
  let failed: unknown = null;

  for (const kind of KINDS) {
    const { type, file, digest } = PRODUCTS[kind];
    const kl = log.child({ kind, sgcEventId: main.id, sourceEventId: match.id });
    try {
      // USGS lists the preferred version of a product first.
      const product = products[type]?.[0];
      const content = product?.contents?.[file];
      if (product === undefined || content?.url === undefined) {
        kl.info({}, "usgs: product not published");
        continue;
      }
      const url = usgsUrl(content.url);
      const had = stored.find((r) => r.kind === kind);
      if (had?.product_url === url && had.sgc_event_id === main.id && had.digest_version === DIGEST_VERSION) {
        unchanged.push(kind);
        continue;
      }
      const updatedAt = new Date(Number(product.updateTime)).toISOString();
      const d = digest(await getJson(url), product.properties ?? {});
      await db
        .prepare(
          `INSERT INTO external_products (zone, kind, source, sgc_event_id, source_event_id, product_url,
             source_updated_at, checked_at, digest, digest_version)
           VALUES (?, ?, 'usgs', ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(zone, kind) DO UPDATE SET
             source = excluded.source, sgc_event_id = excluded.sgc_event_id,
             source_event_id = excluded.source_event_id, product_url = excluded.product_url,
             source_updated_at = excluded.source_updated_at, checked_at = excluded.checked_at,
             digest = excluded.digest, digest_version = excluded.digest_version`,
        )
        .bind(zone, kind, main.id, match.id, url, updatedAt, checkedAt, JSON.stringify(d), DIGEST_VERSION)
        .run();
      kl.info({ productUrl: url, sourceUpdatedAt: updatedAt }, "usgs: product stored");
    } catch (err) {
      // One bad product costs only itself: the stored digest stays, and the others still run.
      kl.warn({ err }, "usgs: product failed");
      failed ??= err;
    }
  }
  if (unchanged.length > 0) {
    await db.batch(
      unchanged.map((kind) =>
        db
          .prepare("UPDATE external_products SET checked_at = ? WHERE zone = ? AND kind = ?")
          .bind(checkedAt, zone, kind),
      ),
    );
  }
  return failed;
}

/**
 * Every zone, one after another. A zone or product that fails is logged and the rest still run; then
 * the first failure is rethrown, as the ingest's scheduled() does, so Cloudflare records the
 * invocation as failed rather than a job that has been broken for weeks looking "ok".
 */
export async function refreshProducts(deps: ProductsDeps): Promise<void> {
  let failed: unknown = null;
  for (const zone of ZONE_IDS) {
    const zl = deps.log.child({ zone });
    try {
      // Awaited before `??=`, which would otherwise skip the zone once one had failed.
      const zoneFailed = await refreshZone({ ...deps, log: zl }, zone);
      failed ??= zoneFailed;
    } catch (err) {
      zl.warn({ err }, "usgs: zone failed");
      failed ??= err;
    }
  }
  if (failed !== null) throw failed;
}

/** What `GET /api/context` serves: the zone's stored digests, one primary-key range read. */
export async function readContext(db: D1Database, zone: ZoneId): Promise<ContextResponse> {
  const { results } = await db.prepare("SELECT * FROM external_products WHERE zone = ?").bind(zone).all<ProductRow>();
  const out: ContextResponse = { dyfi: null, pager: null, forecast: null };
  for (const r of results) {
    if (!KINDS.includes(r.kind)) continue;
    const p: ExternalProduct<unknown> = {
      source: r.source,
      sgcEventId: r.sgc_event_id,
      sourceEventId: r.source_event_id,
      productUrl: r.product_url,
      sourceUpdatedAt: r.source_updated_at,
      checkedAt: r.checked_at,
      digest: JSON.parse(r.digest),
    };
    (out as Record<Kind, unknown>)[r.kind] = p;
  }
  return out;
}
