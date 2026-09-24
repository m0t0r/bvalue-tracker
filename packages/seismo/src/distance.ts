/**
 * Distances between an earthquake and a place, on a spherical Earth. Good to well under 1% at the
 * few hundred kilometres these catalogues span, which is far finer than their location errors.
 */

export interface LatLon {
  lat: number;
  lon: number;
}

const EARTH_RADIUS_KM = 6371;
const RAD = Math.PI / 180;

/** Great-circle distance in km between two points on the surface (haversine). */
export function epicentralKm(a: LatLon, b: LatLon): number {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Straight-line distance in km from an earthquake's focus, `depthKm` below its epicentre, to a
 * place at the surface. Flat-Earth Pythagoras: at 150 km it differs from the spherical answer by
 * well under a kilometre.
 */
export const hypocentralKm = (quake: LatLon & { depthKm: number }, place: LatLon): number =>
  Math.hypot(epicentralKm(quake, place), quake.depthKm);

/** Initial bearing from `a` to `b` in degrees clockwise from north, in [0, 360). */
export function bearingDeg(a: LatLon, b: LatLon): number {
  const y = Math.sin((b.lon - a.lon) * RAD) * Math.cos(b.lat * RAD);
  const x =
    Math.cos(a.lat * RAD) * Math.sin(b.lat * RAD) -
    Math.sin(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.cos((b.lon - a.lon) * RAD);
  return (((Math.atan2(y, x) / RAD) % 360) + 360) % 360;
}
