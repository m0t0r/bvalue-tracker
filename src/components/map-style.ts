import type { Map as MapLibreMap } from "maplibre-gl";
import type { ZoneId } from "../../core/zones";

/**
 * How the monitor's map is drawn, apart from the React component: `event-map.tsx` draws the live map
 * with it and `bake-map-preview.ts` the placeholder's pictures, so the picture a reader sees first is
 * the map that replaces it.
 */

/**
 * Where each zone's map opens. Chocó's two groups sit ~50 km apart and need the wider view;
 * Chaparral's swarm fits in ~20 km, and at Chocó's zoom it would be one blot.
 */
export const VIEW: Record<ZoneId, { center: [number, number]; zoom: number }> = {
  choco: { center: [-76.6, 4.75], zoom: 7.6 },
  tolima: { center: [-75.63, 3.85], zoom: 10 },
};

/** The basemap's style URL, by theme. */
export const styleUrl = (dark: boolean) => `https://tiles.openfreemap.org/styles/${dark ? "dark" : "positron"}`;

/**
 * Relief shading per theme, hex because MapLibre cannot parse the oklch tokens. On the dark basemap
 * a shadow has nothing darker to fall to, so the highlight carries the relief.
 */
const RELIEF_COLOURS = {
  light: { shadow: "#5c5c58", highlight: "#ffffff" },
  dark: { shadow: "#000000", highlight: "#5a5a56" },
};

/**
 * OpenFreeMap's styles name sprite images their sprite sheet does not carry (circle-11), and MapLibre
 * warns for each one, twice per load. Nothing of ours is missing, so hand it an empty pixel and keep
 * the console readable for real errors.
 */
export function quietMissingImages(m: MapLibreMap) {
  m.on("styleimagemissing", (e) => {
    if (!m.hasImage(e.id)) m.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) });
  });
}

/**
 * Relief from Mapterhorn: terrarium-encoded 512 px WebP. Colombia's data ends at z12 (z13 answers
 * 404, checked 2026-09-24), so MapLibre overzooms past it. Declared 1024, so MapLibre fetches one zoom
 * coarser and stretches them: a quarter of the tiles for a soft background that looked the same (the
 * weights are in docs/performance.md). Call it once the style has loaded.
 */
export function addRelief(m: MapLibreMap, dark: boolean) {
  m.addSource("relief", {
    type: "raster-dem",
    tiles: ["https://tiles.mapterhorn.com/{z}/{x}/{y}.webp"],
    tileSize: 1024,
    encoding: "terrarium",
    maxzoom: 12,
    attribution: '<a href="https://mapterhorn.com/attribution" target="_blank" rel="noopener">© Mapterhorn</a>',
  });
  // Over the basemap's land fills (wood, towns, parks, ice), which would otherwise wash it out
  // from z10, and under its first line, so every road, border and label stays on top. Then
  // the water goes back over it, so the sea hides the sea floor's relief. Both OpenFreeMap
  // styles draw all their fills first; a style that lost `water` fails loudly in `error`.
  const colours = RELIEF_COLOURS[dark ? "dark" : "light"];
  const firstLine = m.getStyle().layers.find((l) => l.type !== "background" && l.type !== "fill")?.id;
  m.addLayer(
    {
      id: "relief",
      type: "hillshade",
      source: "relief",
      paint: {
        // Chaparral's map opens at z10, where the same strength turned busy behind the swarm.
        "hillshade-exaggeration": ["interpolate", ["linear"], ["zoom"], 7, 0.35, 11, 0.22],
        "hillshade-shadow-color": colours.shadow,
        "hillshade-highlight-color": colours.highlight,
        "hillshade-accent-color": colours.shadow,
      },
    },
    firstLine,
  );
  m.moveLayer("water", firstLine);
}
