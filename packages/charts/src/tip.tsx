import { cn } from "cn";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import type { PlotArea } from "./plot";

/** How far a tooltip sits from the point it describes, as Recharts' default. */
const TIP_OFFSET = 10;

/**
 * Where a tooltip of `w` × `h` goes for a point at `at`, as Recharts places its own: below and to the
 * right of the point, or on the other side where that side would leave the plot, and never before
 * the plot's top or left edge.
 *
 * With `clear`, a stretch of the point's column the tooltip must not cover (its top and bottom, in px),
 * it goes above that stretch instead, or below it where there is no room above.
 */
export function tipPosition(
  at: { x: number; y: number },
  w: number,
  h: number,
  area: PlotArea,
  clear?: readonly [number, number],
) {
  const place = (p: number, size: number, start: number, length: number) =>
    p + TIP_OFFSET + size > start + length ? Math.max(p - TIP_OFFSET - size, start) : Math.max(p + TIP_OFFSET, start);
  const x = place(at.x, w, area.left, area.width);
  if (!clear) return { x, y: place(at.y, h, area.top, area.height) };
  const above = clear[0] - TIP_OFFSET - h;
  return {
    x,
    y: above >= area.top ? above : Math.max(area.top, Math.min(clear[1] + TIP_OFFSET, area.top + area.height - h)),
  };
}

/**
 * A chart's tooltip, over the drawing at `at`. It glides from one point to the next in 400 ms, as
 * Recharts' did, but appears where it belongs rather than gliding in from where it was last shown.
 * Its size is read after each render to place it, one layout per move, as Recharts read its own.
 * `clear` is `tipPosition`'s.
 *
 * Its surface is the dark theme's in both themes (owner's call, 2026-09-30): the `dark` class on the box
 * gives it and everything in it the dark theme's tokens, so a tooltip's content is written once, with
 * the theme's own classes. `className` is for what one chart's tooltip adds (a width cap, `tabular-nums`).
 */
export function ChartTip({
  at,
  area,
  clear,
  className,
  children,
}: {
  at: { x: number; y: number };
  area: PlotArea;
  clear?: readonly [number, number];
  className?: string;
  children: ReactNode;
}) {
  const el = useRef<HTMLDivElement>(null);
  const shown = useRef(false);
  useLayoutEffect(() => {
    const tip = el.current;
    if (!tip) return;
    const box = tip.getBoundingClientRect();
    const p = tipPosition(at, box.width, box.height, area, clear);
    tip.style.setProperty("--tip-x", `${p.x}px`);
    tip.style.setProperty("--tip-y", `${p.y}px`);
    // The first placement is not animated; from then on the tooltip glides.
    if (shown.current) tip.dataset.glide = "";
    shown.current = true;
  });
  return (
    <div
      ref={el}
      className="pointer-events-none absolute top-0 left-0 translate-x-(--tip-x) translate-y-(--tip-y) data-glide:transition-transform data-glide:duration-400 motion-reduce:transition-none"
    >
      <div
        data-chart-tip
        className={cn("dark rounded-lg border bg-background px-3 py-2 text-xs text-foreground shadow-xl", className)}
      >
        {children}
      </div>
    </div>
  );
}
