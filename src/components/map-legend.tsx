import type { CSSProperties } from "react";
import { MapPreview } from "@/components/map-preview";
import type { Dict } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n";

/**
 * The map's key, its description and its placeholder, apart from MapLibre so that `Deferred` can draw
 * them before the map's chunk arrives: the placeholder is the canvas's box and the real key under it,
 * so the card is the same height at every width however the key wraps.
 */

// Sequential single hue, light → dark with depth. Kept as hex: MapLibre cannot parse the oklch tokens.
export const DEPTH_STOPS: [number, string][] = [
  [0, "#9ec5f4"],
  [40, "#5598e7"],
  [80, "#256abf"],
  [120, "#0d366b"],
];

export const mapDescription = (t: Dict, mainshockId: string | null) =>
  mainshockId === null ? t.mapDesc : `${t.mapDesc} ${t.mapRing}`;

export function MapLegend() {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
      <div className="flex items-center gap-2">
        <span className="whitespace-nowrap">{t.depth}</span>
        <span>0</span>
        <span
          className="h-2 w-20 shrink-0 rounded-full sm:w-28"
          // oxlint-disable-next-line shadcn/no-inline-styles -- Drawn from the map's own hex stops, which MapLibre needs as hex.
          style={{ background: `linear-gradient(to right, ${DEPTH_STOPS.map(([, c]) => c).join(",")})` }}
        />
        <span>120+</span>
      </div>
      <div className="flex items-center gap-3">
        {[2, 3, 4, 5].map((mag) => (
          <span key={mag} className="flex items-center gap-1">
            <span
              className="inline-block size-(--dot) rounded-full bg-muted-foreground"
              style={{ "--dot": `${mag * 3.2}px` } as CSSProperties}
            />
            M{mag}
          </span>
        ))}
      </div>
    </div>
  );
}

/** What stands in for the map until it loads: the canvas's box with a picture of its view, and the key it will have. */
export function MapPlaceholder() {
  return (
    <div className="flex flex-col gap-3">
      <div className="relative h-96 w-full overflow-hidden rounded-lg border">
        <MapPreview lazy />
      </div>
      <MapLegend />
    </div>
  );
}
