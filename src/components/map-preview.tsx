import { useState } from "react";
import chocoDark from "@/components/map-preview/choco-dark.webp?url";
import chocoLight from "@/components/map-preview/choco-light.webp?url";
import tolimaDark from "@/components/map-preview/tolima-dark.webp?url";
import tolimaLight from "@/components/map-preview/tolima-light.webp?url";
import { Spinner } from "@/components/ui/spinner";
import { useI18n } from "@/lib/i18n";
import { useIsDark } from "@/lib/theme";
import { useZone } from "@/lib/zone";
import type { ZoneId } from "../../core/zones";

/**
 * Each zone's opening view, baked without the events by `bake-map-preview.ts` (5–13 kB each, against
 * ~1.5 MB for MapLibre, its style and its tiles).
 */
const PICTURES: Record<ZoneId, { light: string; dark: string }> = {
  choco: { light: chocoLight, dark: chocoDark },
  tolima: { light: tolimaLight, dark: tolimaDark },
};

/**
 * The map's box while the map is on its way: a soft picture of the view it opens on, and a spinner.
 * It fills its box, so it is laid over the placeholder's frame (`MapPlaceholder`) and over the live
 * map until MapLibre has drawn its first full frame (`EventMap`), then fades out. The reader sees
 * the place at once and never a blank or half-tiled canvas.
 *
 * `lazy` is for the placeholder, which may be far down the page.
 *
 * The picture is 1024 × 384 CSS px drawn at half density and centred at that size, as MapLibre
 * centres its view, so a narrower box crops it the same way and the live map lands on it in place.
 */
export function MapPreview({ ready = false, lazy = false }: { ready?: boolean; lazy?: boolean }) {
  const { t } = useI18n();
  const dark = useIsDark();
  const zone = useZone();
  // Once faded out it leaves the page. Under reduced motion there is no fade to wait for.
  const [gone, setGone] = useState(false);
  if (gone || (ready && matchMedia("(prefers-reduced-motion: reduce)").matches)) return null;
  return (
    <div
      aria-hidden={ready || undefined}
      data-ready={ready || undefined}
      // Its own fade only: a transition inside it would bubble here too.
      onTransitionEnd={(e) => ready && e.target === e.currentTarget && setGone(true)}
      className="pointer-events-none absolute inset-0 z-10 grid place-items-center overflow-hidden bg-muted transition-opacity duration-300 ease-out data-ready:opacity-0 motion-reduce:transition-none"
    >
      <img
        src={PICTURES[zone.id][dark ? "dark" : "light"]}
        alt=""
        decoding="async"
        // The placeholder may be screens away; over the live map the picture is always on screen, and a
        // lazy image there waits a frame for its intersection check, showing the grey under it.
        loading={lazy ? "lazy" : "eager"}
        className="absolute top-1/2 left-1/2 h-96 w-256 max-w-none -translate-x-1/2 -translate-y-1/2"
      />
      {ready ? null : (
        <span className="relative rounded-full bg-background/80 p-2 text-muted-foreground shadow-sm">
          <Spinner aria-label={t.mapLoading} />
        </span>
      )}
    </div>
  );
}
