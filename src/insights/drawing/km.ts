/**
 * Kilometres in a degree, for every drawing and the 3D tab. A file of its own, importing nothing but
 * the Earth's radius: the 3D tab and `questions/derive.ts` take it from here, and through `fit.ts` the
 * 3D tab's chunk took d3-geo with it, 8.7 kB gzipped it does not use.
 */
import { EARTH_RADIUS_KM } from "@bvalue/seismo";

/**
 * Kilometres in a degree of a great circle (and of latitude), on the Earth `@bvalue/seismo` measures
 * every distance on: 111.195. The story's cuts and the drift step's scale bar used a rounder figure,
 * 0.005 % longer.
 */
export const KM_PER_DEG = (Math.PI * EARTH_RADIUS_KM) / 180;

/** Kilometres in a degree of longitude at latitude `lat`. */
export const kmPerDegLon = (lat: number) => KM_PER_DEG * Math.cos((lat * Math.PI) / 180);
