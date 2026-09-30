/**
 * The page's pixel background (`pixels.ts`), mounted once the catalogue is in and kept in step with
 * it. It is drawn on a canvas portalled to `<body>`, behind the page, and loaded as its own chunk
 * after the page has drawn, so it costs the first paint nothing.
 */
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { StoredEvent } from "../../worker/api-types.ts";
import type { Backdrop as Drawn, BackdropInput } from "./shared";

// Outside the component: React Compiler does not compile a function with an `import()` in it.
const loadPixels = () => import("./pixels").then((m) => m.pixels);

function toInput(events: StoredEvent[]): BackdropInput {
  return {
    events: events
      .filter((e) => e.removedAt === null)
      .map((e) => ({ t: Date.parse(e.time), lat: e.lat, lon: e.lon, mag: e.mag })),
  };
}

export function Backdrop({ events }: { events: StoredEvent[] | undefined }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawn = useRef<Drawn | null>(null);

  // The newest catalogue, for a background mounted after it arrived; one already drawn gets it
  // through `update`, so a refetch redraws in place.
  const latest = useRef<BackdropInput | null>(null);
  useEffect(() => {
    latest.current = events ? toInput(events) : null;
    if (latest.current) drawn.current?.update(latest.current);
  }, [events]);

  const ready = events !== undefined;
  useEffect(() => {
    if (!ready || !canvas.current) return;
    let cancelled = false;
    const el = canvas.current;
    // A chunk that fails to load (a deploy between the page and it) leaves the page as it is.
    loadPixels()
      .then((pixels) => {
        if (cancelled || !latest.current) return;
        drawn.current = pixels(el, latest.current);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      drawn.current?.destroy();
      drawn.current = null;
    };
  }, [ready]);

  // Drawn over the whole document and scrolled with it; its size is set by `pixels.ts`.
  return createPortal(
    <canvas ref={canvas} aria-hidden className="pixelated pointer-events-none absolute top-0 left-0 -z-10" />,
    document.body,
  );
}
