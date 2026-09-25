/**
 * PROTOTYPE (branch prototype/3d): the monitor's map (OpenFreeMap's style with Mapterhorn's relief,
 * as `event-map.tsx` draws it, without the events) over exactly the 3D block's bounds, for a
 * screenshot that becomes the block's top. `?theme=light|dark`. Sets `document.title` to "ready"
 * once every tile has drawn. Mercator: the block maps it back with `mercatorV` in scene.ts.
 */
import "maplibre-gl/dist/maplibre-gl.css";
import { Map as MapLibreMap, setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { GROUND } from "../block";

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

/** Pinned by the block itself, with Pereira in the page's own colour: not named twice. */
const PINNED = ["Pereira", "Istmina", "Chaparral", "Buenaventura"];
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
    const not = ["!", ["in", ["get", "name"], ["literal", PINNED]]];
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
