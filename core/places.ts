/**
 * Places the project measures from, shared by the page and the Worker. Pereira is where the reader
 * is: every distance on the insights page is measured from it, and the Worker picks USGS's felt
 * reports and modelled shaking for this same point (worker/usgs.ts).
 */
import type { LatLon } from "@bvalue/seismo";

/** Pereira's centre, rounded to ~1 km. */
export const PEREIRA = { lat: 4.8133, lon: -75.6961 } as const satisfies LatLon;
