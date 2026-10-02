/** The outline map fitted to a box, which both tabs' maps and the story's cut locators draw. */
import { geoMercator, geoPath, type GeoPath, type GeoProjection } from "d3-geo";
import { REGION } from "../region";

type Point = readonly [number, number];

export interface FittedRegion {
  proj: GeoProjection;
  path: GeoPath;
  /** The region's countries, projected: one path per outline. */
  outlines: { name: string; d: string | undefined }[];
}

/**
 * An outline map fitted to a box: the Mercator projection that puts `box`'s two corners (lon, lat)
 * inside `extent` (two corners in px, top-left first), its path, and the region's outlines drawn with
 * it.
 */
export function fitRegion(box: readonly [Point, Point], extent: readonly [Point, Point]): FittedRegion {
  const proj = geoMercator().fitExtent(
    [
      [extent[0][0], extent[0][1]],
      [extent[1][0], extent[1][1]],
    ],
    { type: "MultiPoint", coordinates: [[...box[0]], [...box[1]]] },
  );
  const path = geoPath(proj);
  return {
    proj,
    path,
    outlines: REGION.features.map((f) => ({ name: f.properties.name, d: path(f) ?? undefined })),
  };
}
