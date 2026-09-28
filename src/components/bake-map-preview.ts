/**
 * Bakes the monitor map's placeholder: each zone's opening view (`VIEW`), in the basemap and relief
 * `event-map.tsx` draws (both from `map-style.ts`), without the events (they are live; a picture of them would be stale). Dev
 * only; `bake-map-preview.html` loads it. How to run it is in docs/development.md ("The map's
 * placeholder pictures").
 *
 * `?zone=choco|tolima&theme=light|dark`. The map is 1024 × 384 CSS px, as wide as the map's box ever
 * gets (one column just under `lg`), drawn at half density: `MapPreview` shows the picture at
 * 1024 × 384 centred, so any narrower box crops it exactly as MapLibre crops the live map, and the
 * half density is what keeps it small and soft. Once every tile has drawn, `document.title` is
 * "ready" and `window.baked` holds the WebP as a data URL.
 */
import "maplibre-gl/dist/maplibre-gl.css";
import { Map as MapLibreMap, setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { isZoneId } from "../../core/zones";
import { VIEW, addRelief, quietMissingImages, styleUrl } from "./map-style";

setWorkerUrl(workerUrl);
const params = new URLSearchParams(location.search);
const zone = params.get("zone") ?? "";
if (!isZoneId(zone)) throw new Error(`unknown zone ${zone}`);
const dark = params.get("theme") === "dark";

const el = document.getElementById("map")!;
el.style.width = "1024px";
el.style.height = "384px";

const m = new MapLibreMap({
  container: el,
  style: styleUrl(dark),
  ...VIEW[zone],
  attributionControl: false,
  interactive: false,
  pixelRatio: 0.5,
  fadeDuration: 0,
  canvasContextAttributes: { preserveDrawingBuffer: true },
});
quietMissingImages(m);
m.on("load", () => {
  addRelief(m, dark);
  m.once("idle", () => {
    (window as unknown as { baked: string }).baked = m.getCanvas().toDataURL("image/webp", 0.7);
    document.title = "ready";
  });
});
m.on("error", (e) => {
  document.title = `error ${e.error?.message ?? ""}`;
});
