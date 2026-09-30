import { cn } from "@/lib/utils";
import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** A plot's box in whole pixels, as Recharts' `ResponsiveContainer` rounds its own, and the font its labels are in. */
export interface PlotSize {
  width: number;
  height: number;
  font: string;
}

/**
 * The size of the element the returned ref is put on, read in the ref callback so the first frame is
 * already drawn at it, and followed with a `ResizeObserver`. Null until measured, and again once the
 * element is gone, so a plot drawn again waits for its own size.
 */
export function usePlotSize(): [(el: HTMLElement | null) => void, PlotSize | null] {
  const [size, setSize] = useState<PlotSize | null>(null);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: HTMLElement | null) => {
    observer.current?.disconnect();
    if (!el) return setSize(null);
    const style = getComputedStyle(el);
    const font = `${style.fontSize} ${style.fontFamily}`;
    const set = (width: number, height: number) =>
      setSize((s) => {
        const next = { width: Math.round(width), height: Math.round(height), font };
        return s?.width === next.width && s.height === next.height && s.font === font ? s : next;
      });
    const box = el.getBoundingClientRect();
    set(box.width, box.height);
    observer.current = new ResizeObserver(([e]) => set(e!.contentRect.width, e!.contentRect.height));
    observer.current.observe(el);
  }, []);
  return [ref, size];
}

let measuring: CanvasRenderingContext2D | null | undefined;
/**
 * How wide `text` is in `font`, from a canvas: no layout, where Recharts' own measure writes each label
 * into a hidden span and reads its box. Null where there is no canvas to measure with. Before Geist has
 * loaded it measures the stand-in face, as Recharts' span did, and the labels are not chosen again when
 * Geist arrives, as Recharts' were not: the stand-in is cut to Geist's width, and choosing again would
 * draw the whole chart a second time inside a phone's load.
 */
export function textWidth(text: string, font: string): number | null {
  if (measuring === undefined) measuring = document.createElement("canvas").getContext("2d") ?? null;
  if (!measuring) return null;
  measuring.font = font;
  return measuring.measureText(text).width;
}

/** The plot's own area inside the drawing: where a pointer reads a value, and where a tooltip is kept. */
export interface PlotArea {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** How far a tooltip sits from the point it describes, as Recharts' default. */
const TIP_OFFSET = 10;

/**
 * Where a tooltip of `w` × `h` goes for a point at `at`, as Recharts places its own: below and to the
 * right of the point, or on the other side where that side would leave the plot, and never before
 * the plot's top or left edge.
 */
export function tipPosition(at: { x: number; y: number }, w: number, h: number, area: PlotArea) {
  const place = (p: number, size: number, start: number, length: number) =>
    p + TIP_OFFSET + size > start + length ? Math.max(p - TIP_OFFSET - size, start) : Math.max(p + TIP_OFFSET, start);
  return { x: place(at.x, w, area.left, area.width), y: place(at.y, h, area.top, area.height) };
}

/**
 * A chart's tooltip, over the drawing at `at`. It glides from one point to the next in 400 ms, as
 * Recharts' did, but appears where it belongs rather than gliding in from where it was last shown.
 * Its size is read after each render to place it, one layout per move, as Recharts read its own.
 */
export function ChartTip({
  at,
  area,
  children,
}: {
  at: { x: number; y: number };
  area: PlotArea;
  children: ReactNode;
}) {
  const el = useRef<HTMLDivElement>(null);
  const shown = useRef(false);
  useLayoutEffect(() => {
    const tip = el.current;
    if (!tip) return;
    const box = tip.getBoundingClientRect();
    const p = tipPosition(at, box.width, box.height, area);
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
      {children}
    </div>
  );
}

/** The colours a key's square can take, each a whole class so the design-system lint can read it. */
const SWATCH = {
  "chart-1": "bg-chart-1",
  "chart-3": "bg-chart-3",
  foreground: "bg-foreground",
} as const;

/** A chart's key, drawn as shadcn's `ChartLegendContent` draws it: a small square of each series' colour and its name. */
export function ChartKey({ items }: { items: { label: ReactNode; colour: keyof typeof SWATCH }[] }) {
  return (
    // The right margin is the plot's, so the key is centred under the plot as Recharts centred it.
    <div className="mr-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-3">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5 whitespace-nowrap">
          <div className={cn("h-2 w-2 shrink-0 rounded-xs", SWATCH[item.colour])} />
          {item.label}
        </div>
      ))}
    </div>
  );
}
