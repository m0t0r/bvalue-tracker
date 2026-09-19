import { Map as MapLibreMap, NavigationControl, Popup, setWorkerUrl, type GeoJSONSource, type MapLayerMouseEvent } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { StoredEvent } from "@/lib/api";
import { MAINSHOCK_ID } from "@/lib/filters";
import { fmtDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useIsDark } from "@/lib/theme";

// MapLibre 6 ships its worker as a separate module that imports a shared chunk,
// so it must go through the bundler (`?worker&url`), not be copied as a plain asset.
setWorkerUrl(workerUrl);

// Sequential single hue, light → dark with depth. Kept as hex: MapLibre cannot parse the oklch tokens.
const DEPTH_STOPS: [number, string][] = [[0, "#9ec5f4"], [40, "#5598e7"], [80, "#256abf"], [120, "#0d366b"]];

const toGeoJson = (events: readonly StoredEvent[]) => ({
  type: "FeatureCollection" as const,
  features: events.map((e) => ({
    type: "Feature" as const,
    geometry: { type: "Point" as const, coordinates: [e.lon, e.lat] },
    properties: { id: e.id, mag: e.mag, depth: e.depthKm, time: e.time, region: e.region, main: e.id === MAINSHOCK_ID },
  })),
});

export default function EventMap({ events }: { events: readonly StoredEvent[] }) {
  const { t } = useI18n();
  const dark = useIsDark();
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const latest = useRef(events);
  latest.current = events;

  // Rebuilt when the theme changes (basemap + outline colours); the parent re-keys it on language change.
  useEffect(() => {
    const ring = getComputedStyle(document.documentElement).getPropertyValue("--chart-2").trim();
    const m = new MapLibreMap({
      container: el.current!,
      style: `https://tiles.openfreemap.org/styles/${dark ? "dark" : "positron"}`,
      center: [-76.6, 4.75], zoom: 7.6, attributionControl: { compact: true }, cooperativeGestures: true,
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
    m.addControl(new NavigationControl({ showCompass: false }), "top-right");
    const popup = new Popup({ closeButton: false, closeOnClick: false, offset: 10 });
    let shownId: string | null = null;

    m.on("error", (e) => console.error("map:", e.error?.message ?? e));

    m.on("load", () => {
      m.addSource("events", { type: "geojson", data: toGeoJson(latest.current) });
      m.addLayer({
        id: "events", type: "circle", source: "events",
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
        body.textContent = `${fmtDateTime(p.time)} UTC · ${p.region}`;
        node.append(head, body);
        popup.setLngLat((f.geometry as unknown as { coordinates: [number, number] }).coordinates).setDOMContent(node).addTo(m);
      });
      m.on("mouseleave", "events", () => { shownId = null; m.getCanvas().style.cursor = ""; popup.remove(); });
    });
    map.current = m;
    return () => { m.remove(); map.current = null; };
  }, [dark, t]);

  useEffect(() => {
    const src = map.current?.getSource("events") as GeoJSONSource | undefined;
    src?.setData(toGeoJson(events));
  }, [events]);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{t.mapTitle}</CardTitle>
        <CardDescription>{t.mapDesc}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {/* The canvas is a keyboard stop (arrows pan, +/- zoom); its own outline is clipped, so the frame shows focus. */}
        <div ref={el} className="h-96 w-full overflow-hidden rounded-lg border has-[canvas:focus-visible]:outline-2 has-[canvas:focus-visible]:outline-offset-2 has-[canvas:focus-visible]:outline-ring" />
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="whitespace-nowrap">{t.depth}</span>
            <span>0</span>
            <span className="h-2 w-20 shrink-0 rounded-full sm:w-28" style={{ background: `linear-gradient(to right, ${DEPTH_STOPS.map(([, c]) => c).join(",")})` }} />
            <span>120+</span>
          </div>
          <div className="flex items-center gap-3">
            {[2, 3, 4, 5].map((mag) => (
              <span key={mag} className="flex items-center gap-1">
                <span className="inline-block rounded-full bg-muted-foreground" style={{ width: mag * 3.2, height: mag * 3.2 }} />
                M{mag}
              </span>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
