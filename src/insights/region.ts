/**
 * What both tabs' maps are drawn on: country outlines (Natural Earth 1:50m, public domain, cut to
 * the four countries around the zones by `scripts/insights-region.ts`) and the towns the text
 * names. Towns are centres rounded to ~1 km; Pereira is the reader's, and every distance on the
 * page is measured from it (`PEREIRA` in `claims.ts`).
 */
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import raw from "./region.geo.json";
import { PEREIRA } from "./claims";

export const REGION = raw as FeatureCollection<Polygon | MultiPolygon, { name: string }>;

export interface Town {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /**
   * `home` is Pereira; `city` is a reference the reader knows; `zone` is a town the sources are named
   * after; `cut` is named only on the story's cuts, on whose line it lies (`onCut`).
   */
  kind: "home" | "city" | "zone" | "cut";
}

export const TOWNS: readonly Town[] = [
  { id: "pereira", name: "Pereira", ...PEREIRA, kind: "home" },
  { id: "manizales", name: "Manizales", lat: 5.0703, lon: -75.5138, kind: "city" },
  { id: "armenia", name: "Armenia", lat: 4.5339, lon: -75.6811, kind: "city" },
  { id: "cali", name: "Cali", lat: 3.4516, lon: -76.532, kind: "city" },
  { id: "ibague", name: "Ibagué", lat: 4.4389, lon: -75.2322, kind: "city" },
  { id: "medellin", name: "Medellín", lat: 6.2442, lon: -75.5812, kind: "city" },
  { id: "bogota", name: "Bogotá", lat: 4.711, lon: -74.0721, kind: "city" },
  { id: "quibdo", name: "Quibdó", lat: 5.6947, lon: -76.6611, kind: "city" },
  { id: "istmina", name: "Istmina", lat: 5.1553, lon: -76.6853, kind: "zone" },
  { id: "sipi", name: "Sipí", lat: 4.6526, lon: -76.6441, kind: "zone" },
  { id: "sanjose", name: "San José del Palmar", lat: 4.8975, lon: -76.2336, kind: "zone" },
  { id: "chaparral", name: "Chaparral", lat: 3.7236, lon: -75.4847, kind: "zone" },
  // DANE's DIVIPOLA centroid (datos.gov.co gdxc-w37w, municipality 76109), checked 2026-09-24.
  { id: "buenaventura", name: "Buenaventura", lat: 3.8757, lon: -77.0107, kind: "cut" },
];

/** How far off a cut's latitude a town may be and still be drawn on it: ~5.5 km. */
export const ON_CUT_DEG = 0.05;

/** A town lies on a cut, and may be drawn on its surface, when it is within `ON_CUT_DEG` of its latitude. */
export const onCut = (t: Town, cut: { lat: number }) => Math.abs(t.lat - cut.lat) <= ON_CUT_DEG;
