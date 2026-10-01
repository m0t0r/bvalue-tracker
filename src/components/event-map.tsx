import {
  Map as MapLibreMap,
  NavigationControl,
  Popup,
  setWorkerUrl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { DEPTH_STOPS, MapLegend } from "@/components/map-legend";
import { MapPreview } from "@/components/map-preview";
import { CardContent } from "@/components/ui/card";
import type { StoredEvent } from "@/lib/api";
import { fmtDateTime, fmtRegion } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useIsDark } from "@/lib/theme";
import { useZone } from "@/lib/zone";
import { VIEW, addRelief, quietMissingImages, styleUrl } from "./map-style";

// MapLibre 6 ships its worker as a separate module that imports a shared chunk,
// so it must go through the bundler (`?worker&url`), not be copied as a plain asset.
setWorkerUrl(workerUrl);

/** OpenFreeMap's attribution as its TileJSON gives it, with "Data from" in the page's language. */
const openFreeMapCredit = (dataFrom: string) =>
  `<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank">© OpenMapTiles</a> ${dataFrom} <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>`;

const toGeoJson = (events: readonly StoredEvent[], mainshockId: string | null) => ({
  type: "FeatureCollection" as const,
  features: events.map((e) => ({
    type: "Feature" as const,
    geometry: { type: "Point" as const, coordinates: [e.lon, e.lat] },
    properties: { id: e.id, mag: e.mag, depth: e.depthKm, time: e.time, region: e.region, main: e.id === mainshockId },
  })),
});

/** How long the picture may cover a map that has not finished drawing. */
const MAP_WAIT_MS = 10_000;

/** `mainshockId` is the zone's detected mainshock (`core/mainshock.ts`), drawn with a ring; null draws none. */
export default function EventMap({
  events,
  mainshockId,
}: {
  events: readonly StoredEvent[];
  mainshockId: string | null;
}) {
  const { t, lang } = useI18n();
  const dark = useIsDark();
  const zone = useZone();
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const latest = useRef({ events, mainshockId });
  // oxlint-disable-next-line react-hooks-js/refs -- Until issue #131 moves this off the render: the map's long-lived listeners read it.
  latest.current = { events, mainshockId };
  // The placeholder's picture stays over the canvas until MapLibre has drawn its first full frame,
  // and comes back while a new theme or language rebuilds the map. `drawn` names the build that has
  // drawn, and is cleared when a map is torn down, so returning to an earlier theme or language
  // before the new map has drawn does not find it already marked.
  const build = `${dark ? "dark" : "light"}-${lang}`;
  const [drawn, setDrawn] = useState<string | null>(null);
  const ready = drawn === build;

  // Rebuilt when the theme or the language changes (basemap, outline colours, the controls' names).
  useEffect(() => {
    const ring = getComputedStyle(document.documentElement).getPropertyValue("--chart-2").trim();
    const m = new MapLibreMap({
      container: el.current!,
      ...VIEW[zone.id],
      attributionControl: { compact: true },
      cooperativeGestures: true,
      locale: {
        "Map.Title": t.mapTitle,
        "NavigationControl.ZoomIn": t.zoomIn,
        "NavigationControl.ZoomOut": t.zoomOut,
        "AttributionControl.ToggleAttribution": t.toggleAttribution,
        "CooperativeGesturesHandler.MacHelpText": t.gestureMac,
        "CooperativeGesturesHandler.WindowsHelpText": t.gestureWindows,
        "CooperativeGesturesHandler.MobileHelpText": t.gestureMobile,
      },
    });
    quietMissingImages(m);
    // OpenFreeMap credits OpenStreetMap as "Data from …" in English whatever the page's language. The
    // credit comes from the tiles' TileJSON, which the style only points at, so it cannot be edited
    // on the way in; an attribution written into the style's source wins over the TileJSON's
    // (MapLibre's `loadTileJson`). This is OpenFreeMap's own credit, links and all, with that one
    // phrase in the page's language.
    m.setStyle(styleUrl(dark), {
      transformStyle: (_, next) => {
        const tiles = next.sources.openmaptiles;
        if (!tiles || tiles.type !== "vector") return next;
        return {
          ...next,
          sources: { ...next.sources, openmaptiles: { ...tiles, attribution: openFreeMapCredit(t.mapDataFrom) } },
        };
      },
    });
    m.addControl(new NavigationControl({ showCompass: false }), "top-right");
    const popup = new Popup({ closeButton: false, closeOnClick: false, offset: 10, className: "dark" });
    let shownId: string | null = null;

    // The picture leaves on the map's first full frame (`idle`, below), or sooner if that will not
    // come: a style that failed to load never fires `load`, and a tile that never answers holds
    // `idle` back. The reader then gets what they had before the picture existed, the map as it is.
    const reveal = () => setDrawn(build);
    const giveUp = setTimeout(reveal, MAP_WAIT_MS);
    m.on("error", (e) => {
      console.error("map:", e.error?.message ?? e);
      if (!m.isStyleLoaded()) reveal();
    });

    m.on("load", () => {
      addRelief(m, dark);
      m.addSource("events", { type: "geojson", data: toGeoJson(latest.current.events, latest.current.mainshockId) });
      m.addLayer({
        id: "events",
        type: "circle",
        source: "events",
        // Draw small events last so large circles never bury them.
        layout: { "circle-sort-key": ["-", 10, ["get", "mag"]] },
        paint: {
          "circle-radius": ["interpolate", ["exponential", 1.6], ["get", "mag"], 2, 3, 4, 8, 5, 13, 7.4, 30],
          "circle-color": ["interpolate", ["linear"], ["get", "depth"], ...DEPTH_STOPS.flat()],
          "circle-opacity": ["case", ["get", "main"], 0.35, 0.8],
          "circle-stroke-width": ["case", ["get", "main"], 3, 0.75],
          // The outline contrasts with the basemap, so neither end of the depth ramp melts into it.
          "circle-stroke-color": ["case", ["get", "main"], ring, dark ? "#fcfcfb" : "#1a1a19"],
          "circle-stroke-opacity": ["case", ["get", "main"], 1, 0.6],
        },
      });
      m.on("mousemove", "events", (ev: MapLayerMouseEvent) => {
        const f = ev.features?.[0];
        const p = f?.properties as { id: string; mag: number; depth: number; time: string; region: string } | undefined;
        // Rebuild the popup only when the hovered event changes, not on every pointer move.
        if (!f || !p || p.id === shownId) return;
        shownId = p.id;
        m.getCanvas().style.cursor = "pointer";
        const node = document.createElement("div");
        node.className = "font-sans text-xs tabular-nums";
        const head = document.createElement("div");
        head.className = "font-medium";
        head.textContent = `M${Number(p.mag).toFixed(1)} · ${Number(p.depth).toFixed(0)} km`;
        const body = document.createElement("div");
        body.className = "text-muted-foreground";
        body.textContent = `${fmtDateTime(p.time, lang)} · ${fmtRegion(p.region)}`;
        node.append(head, body);
        popup
          .setLngLat((f.geometry as unknown as { coordinates: [number, number] }).coordinates)
          .setDOMContent(node)
          .addTo(m);
      });
      m.on("mouseleave", "events", () => {
        shownId = null;
        m.getCanvas().style.cursor = "";
        popup.remove();
      });
      // Every tile, the relief and the events drawn: the picture over the canvas can go.
      m.once("idle", reveal);
    });
    map.current = m;
    return () => {
      clearTimeout(giveUp);
      m.remove();
      map.current = null;
      setDrawn(null);
    };
  }, [build, dark, t, lang, zone]);

  useEffect(() => {
    const src = map.current?.getSource("events") as GeoJSONSource | undefined;
    src?.setData(toGeoJson(events, mainshockId));
  }, [events, mainshockId]);

  return (
    <CardContent className="flex flex-col gap-3">
      {/* The canvas is a keyboard stop (arrows pan, +/- zoom); its own outline is clipped, so the frame shows focus. */}
      <div className="relative h-96 w-full overflow-hidden rounded-lg border has-[canvas:focus-visible]:outline-2 has-[canvas:focus-visible]:outline-offset-2 has-[canvas:focus-visible]:outline-ring">
        {/* Inert under the picture: a map the reader cannot see must not take focus or a drag. */}
        <div ref={el} inert={!ready} className="size-full" />
        <MapPreview key={build} ready={ready} />
      </div>
      {/* Shared with the placeholder (`MapPlaceholder`), so the card keeps its height when the map lands. */}
      <MapLegend />
    </CardContent>
  );
}
