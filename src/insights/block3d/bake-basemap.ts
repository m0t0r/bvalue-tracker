/**
 * Bakes the 3D block's top: the monitor's own map (OpenFreeMap's positron or dark style with
 * Mapterhorn's relief, as `src/components/event-map.tsx` draws it, without the events) over exactly
 * the block's bounds. Dev only; `bake-basemap.html` loads it. How to run it and turn the screenshot
 * into `basemap-{light,dark}.webp` is in docs/development.md ("The 3D block's map").
 *
 * `?theme=light|dark`. Sets `document.title` to "ready …" once every tile has drawn. The image is
 * Web Mercator; `mapUv` in `shared.ts` maps it back onto the block. The towns the block pins are left
 * off it, as are reserves and localities (labelled in English), airports and road shields.
 */
import "maplibre-gl/dist/maplibre-gl.css";
import { Map as MapLibreMap, setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { GROUND } from "../block";
import { TOWNS } from "../region";
import { PINNED } from "./shared";

setWorkerUrl(workerUrl);
const dark = new URLSearchParams(location.search).get("theme") === "dark";
const [W, E] = [GROUND.lon0, GROUND.lon0 + (GROUND.nx - 1) * GROUND.step];
const [S, N] = [GROUND.lat0, GROUND.lat0 + (GROUND.ny - 1) * GROUND.step];
const merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const WIDTH = innerWidth;
const pxPerRad = WIDTH / (((E - W) * Math.PI) / 180);
const height = Math.round((merc(N) - merc(S)) * pxPerRad);
const el = document.getElementById("map")!;
el.style.width = `${WIDTH}px`;
el.style.height = `${height}px`;
const midLat = (Math.atan(Math.exp((merc(N) + merc(S)) / 2)) * 360) / Math.PI - 90;
// MapLibre's world is 512 × 2^zoom px wide.
const zoom = Math.log2((WIDTH * 360) / (E - W) / 512);

/** Named by the block's own pins: not named twice. */
const PINNED_NAMES = TOWNS.filter((t) => PINNED.includes(t.id)).map((t) => t.name);
const RELIEF = dark ? { shadow: "#000000", highlight: "#5a5a56" } : { shadow: "#5c5c58", highlight: "#ffffff" };

const m = new MapLibreMap({
  container: el,
  style: `https://tiles.openfreemap.org/styles/${dark ? "dark" : "positron"}`,
  center: [(W + E) / 2, midLat],
  zoom,
  attributionControl: false,
  interactive: false,
  pixelRatio: devicePixelRatio,
  fadeDuration: 0,
});
m.on("styleimagemissing", (e) => {
  if (!m.hasImage(e.id)) m.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) });
});
m.on("load", () => {
  m.addSource("relief", {
    type: "raster-dem",
    tiles: ["https://tiles.mapterhorn.com/{z}/{x}/{y}.webp"],
    tileSize: 1024,
    encoding: "terrarium",
    maxzoom: 12,
  });
  const firstLine = m.getStyle().layers.find((l) => l.type !== "background" && l.type !== "fill")?.id;
  m.addLayer(
    {
      id: "relief",
      type: "hillshade",
      source: "relief",
      paint: {
        "hillshade-exaggeration": 0.35,
        "hillshade-shadow-color": RELIEF.shadow,
        "hillshade-highlight-color": RELIEF.highlight,
        "hillshade-accent-color": RELIEF.shadow,
      },
    },
    firstLine,
  );
  m.moveLayer("water", firstLine);
  for (const l of m.getStyle().layers) {
    if (l.type !== "symbol") continue;
    // Reserves and localities (in English, and crowding the Chocó coast), airports, road shields.
    // (The two styles name their layers differently: positron `label_*`, dark `place_*`.)
    if (/^(label|place)_other$|airport|shield|oneway/.test(l.id)) {
      m.setLayoutProperty(l.id, "visibility", "none");
      continue;
    }
    if (!("source-layer" in l) || l["source-layer"] !== "place") continue;
    const not = ["!", ["in", ["get", "name"], ["literal", PINNED_NAMES]]];
    const f = m.getFilter(l.id);
    m.setFilter(l.id, (f ? ["all", f, not] : not) as never);
  }
  m.once("idle", () => {
    document.title = `ready ${WIDTH}x${height}`;
  });
});
m.on("error", (e) => {
  document.title = `error ${e.error?.message ?? ""}`;
});
