/**
 * USGS's products for a zone's mainshock, cut down to the few figures the insights page shows.
 *
 * Each digest function takes one product file, already parsed, and the product's own properties
 * from the event's detail GeoJSON, and throws on anything it cannot read: a malformed file must
 * leave the stored digest as it was, never replace it with a guess (docs/api.md, /api/context).
 */
import { epicentralKm } from "@bvalue/seismo";
import { PEREIRA } from "../core/places.ts";
import type { DyfiDigest, ForecastBin, ForecastDigest, PagerDigest } from "./api-types.ts";

/**
 * Bump when any digest's shape or rules change: every stored row made by older code is then rebuilt
 * on the next daily run, although USGS's URL has not changed.
 */
export const DIGEST_VERSION = 1;

type Ring = readonly (readonly [number, number])[];

/** Ray casting over a ring of [lon, lat] pairs. DYFI's cells are small quadrilaterals, so a flat test is exact enough. */
function contains(ring: Ring, lon: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const num = (v: unknown, what: string): number => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n)) throw new Error(`${what} is not a number`);
  return n;
};

interface DyfiCell {
  geometry?: { type?: string; coordinates?: Ring[] };
  properties?: { name?: unknown; cdi?: unknown; nresp?: unknown };
}

/**
 * DYFI's 10 km cells (`dyfi_geo_10km.geojson`): the one holding Pereira's point, and the event's
 * total responses from the product's `num-responses`. A cell's name is "UTM:(…)<br>Place", and the
 * place is DYFI's own label for it, which need not be Pereira (on 2026-09-24 it was Dos Quebradas).
 */
export function digestDyfi(file: unknown, props: Record<string, string>): DyfiDigest {
  const features = (file as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) throw new Error("DYFI file has no features");
  // Every cell must be the shape read here: a cell skipped for an unknown shape would turn into
  // "nobody in Pereira answered" and replace a real figure.
  const rings = (features as DyfiCell[]).map((f) => {
    const ring = f.geometry?.type === "Polygon" ? f.geometry.coordinates?.[0] : undefined;
    if (!Array.isArray(ring)) throw new Error(`DYFI cell is not a Polygon: ${f.geometry?.type}`);
    return ring;
  });
  const at = rings.findIndex((ring) => contains(ring, PEREIRA.lon, PEREIRA.lat));
  const hit = at === -1 ? undefined : (features as DyfiCell[])[at];
  const responses = num(props["num-responses"], "DYFI num-responses");
  if (hit === undefined) return { responses, pereira: null };
  const [cell = "", placeName = ""] = String(hit.properties?.name ?? "").split("<br>");
  return {
    responses,
    pereira: {
      cell,
      placeName,
      cdi: num(hit.properties?.cdi, "DYFI cdi"),
      responses: num(hit.properties?.nresp, "DYFI nresp"),
    },
  };
}

/**
 * A PAGER city further than this from Pereira's point is some other town. PAGER's own Pereira sits
 * 0.2 km from the page's; the next city out, Dosquebradas, 2.6 km.
 */
export const PAGER_CITY_MAX_KM = 2;

interface PagerCity {
  name?: unknown;
  lat?: unknown;
  lon?: unknown;
  mmi?: unknown;
}

/**
 * PAGER's `json/cities.json`: the modelled intensity at the city nearest Pereira. Matched by place,
 * not by name, so a second "Pereira" elsewhere in the world could never be taken for this one.
 */
export function digestPager(file: unknown): PagerDigest {
  const cities = (file as { all_cities?: unknown } | null)?.all_cities;
  if (!Array.isArray(cities)) throw new Error("PAGER file has no all_cities");
  let best: { city: PagerCity; km: number } | null = null;
  for (const city of cities as PagerCity[]) {
    // Throw rather than skip: skipping every city would read as "no city near Pereira".
    if (typeof city.lat !== "number" || typeof city.lon !== "number")
      throw new Error("PAGER city lat/lon is not a number");
    const km = epicentralKm(PEREIRA, { lat: city.lat, lon: city.lon });
    if (best === null || km < best.km) best = { city, km };
  }
  if (best === null || best.km > PAGER_CITY_MAX_KM) return { pereira: null };
  return {
    pereira: { name: String(best.city.name ?? ""), mmi: num(best.city.mmi, "PAGER mmi"), distanceKm: best.km },
  };
}

const obj = (v: unknown, what: string): Record<string, unknown> => {
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error(`${what} is not an object`);
  return v as Record<string, unknown>;
};

const instant = (v: unknown, what: string): string => new Date(num(v, what)).toISOString();
const optionalInstant = (v: unknown, what: string): string | null => (v == null ? null : instant(v, what));

/**
 * The OAF's `forecast.json`: its dates, its model's own parameters, and per window the probability,
 * median and 95% range at each magnitude. The fractiles and bar percentages are dropped; the page
 * shows none of them.
 */
export function digestForecast(file: unknown, props: Record<string, string>): ForecastDigest {
  const f = obj(file, "forecast");
  const params = obj(obj(f.model, "forecast model").parameters, "forecast model parameters");
  if (!Array.isArray(f.forecast)) throw new Error("forecast has no windows");
  return {
    issuedAt: instant(f.creationTime, "forecast creationTime"),
    nextUpdateAt: optionalInstant(f.nextForecastTime, "forecast nextForecastTime"),
    expiresAt: optionalInstant(f.expireTime, "forecast expireTime"),
    reviewStatus: props["review-status"] ?? null,
    model: {
      b: num(params.b, "forecast b"),
      mc: num(params.Mc, "forecast Mc"),
      mainshockMag: num(params.magMain, "forecast magMain"),
      regionCenter: {
        lat: num(params.regionCenterLat, "forecast region lat"),
        lon: num(params.regionCenterLon, "forecast region lon"),
      },
      regionRadiusKm: num(params.regionRadius, "forecast region radius"),
    },
    windows: (f.forecast as unknown[]).map((raw) => {
      const w = obj(raw, "forecast window");
      if (!Array.isArray(w.bins)) throw new Error("forecast window has no bins");
      const above = w.aboveMainshockMag == null ? null : obj(w.aboveMainshockMag, "aboveMainshockMag");
      return {
        label: String(w.label ?? ""),
        start: instant(w.timeStart, "forecast timeStart"),
        end: instant(w.timeEnd, "forecast timeEnd"),
        aboveMainshock:
          above === null
            ? null
            : {
                magnitude: num(above.magnitude, "aboveMainshockMag magnitude"),
                probability: num(above.probability, "aboveMainshockMag probability"),
              },
        bins: (w.bins as unknown[]).map((rawBin): ForecastBin => {
          const b = obj(rawBin, "forecast bin");
          return {
            magnitude: num(b.magnitude, "bin magnitude"),
            probability: num(b.probability, "bin probability"),
            median: num(b.median, "bin median"),
            p95Min: num(b.p95minimum, "bin p95minimum"),
            p95Max: num(b.p95maximum, "bin p95maximum"),
          };
        }),
      };
    }),
  };
}
