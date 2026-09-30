import { cn } from "@/lib/utils";
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEventHandler,
  type KeyboardEventHandler,
  type MouseEventHandler,
  type ReactNode,
  type RefCallback,
  type TouchEventHandler,
} from "react";
import { flushSync } from "react-dom";

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

/** Whether a pointer at (`px`, `py`) in the drawing is in the plot, its edges included. */
export const inPlot = (area: PlotArea, px: number, py: number) =>
  px >= area.left && px <= area.left + area.width && py >= area.top && py <= area.top + area.height;

/**
 * How wide an axis label is, to choose which labels fit: measured on a canvas, or, in a browser with no
 * canvas to measure with, taken as 0.6 em a character. That is a little wider than Geist's digits and
 * letters, so such a browser drops a label sooner and never draws two that touch.
 */
export function labelWidth(label: string, font: string): number {
  return textWidth(label, font) ?? label.length * 0.6 * (parseFloat(font) || 12);
}

/** Which of a chart's points the tooltip is on, and its height in the drawing; `key` when the keyboard put it there. */
export interface Reading {
  i: number;
  y: number;
  key: boolean;
}

/** What `useReading` hands a chart: the reading to draw, and the handlers that make it. */
export interface ReadingHandlers {
  svg: RefCallback<SVGSVGElement>;
  active: Reading | null;
  /** For the element around the drawing: the pointer and the finger. */
  frame: {
    onMouseMove: MouseEventHandler;
    onMouseLeave: MouseEventHandler;
    onTouchMove: TouchEventHandler;
    onTouchEnd: TouchEventHandler;
    onTouchCancel: TouchEventHandler;
  };
  /** For the drawing itself, which is the tab stop: the keyboard, and the press that focuses it. */
  keys: {
    onMouseDown: MouseEventHandler;
    onMouseUp: MouseEventHandler;
    onFocus: FocusEventHandler;
    onBlur: FocusEventHandler;
    onKeyDown: KeyboardEventHandler;
  };
}

/**
 * A chart's tooltip state, kept as Recharts' `accessibilityLayer` and axis tooltip behaved where they were
 * right, and corrected where they were not (docs/frontend.md, "Distribución frecuencia–magnitud"):
 *
 * - the pointer's reading wins over the keyboard's, which is kept while the pointer is away and lets go
 *   when the chart loses focus;
 * - the pointer's reading is of where the pointer is, read again on every render: when the data or the
 *   size changes under a resting pointer, the tooltip is on what is under it now, not on the point that
 *   had the old one's index; and it is forgotten with the drawing, so a plot drawn again opens with none;
 * - focus from the keyboard shows the point the keyboard was last on, or the first; focus from a press
 *   shows nothing, or the tooltip would jump to the first point when the pointer left;
 * - the arrows step through the `n` points and stop at the ends, and scroll nothing; Enter hides and
 *   shows the tooltip;
 * - a lifted finger lets go. A tap still shows the tooltip: the browser follows the touch with the mouse
 *   events of a click, and their move comes after the lift;
 * - the keyboard's reading is of a point by its index, and new data can have fewer points: an index past
 *   the end is no reading at all.
 *
 * `read` turns a pointer's place in the drawing, in whole pixels as Recharts read it, into the point it
 * is on, or null outside the plot; it runs in the render, so it must only compute. `keyY` is the height
 * of the keyboard's tooltip, asked when a key is pressed and not in the render; a chart that places that
 * tooltip by the point it reads leaves it out.
 */
export function useReading(
  n: number,
  read: (px: number, py: number) => { i: number; y: number } | null,
  keyY: (i: number) => number = () => 0,
): ReadingHandlers {
  const el = useRef<SVGSVGElement | null>(null);
  const pressed = useRef(false);
  const [pointer, setPointer] = useState<{ px: number; py: number } | null>(null);
  const [key, setKey] = useState<{ i: number; on: boolean; y: number } | null>(null);
  const svg = useCallback((node: SVGSVGElement | null) => {
    el.current = node;
    if (!node) setPointer(null);
  }, []);
  const keyI = key && key.i < n ? key.i : null;
  const under = pointer ? read(pointer.px, pointer.py) : null;
  const active: Reading | null =
    under && under.i < n
      ? { ...under, key: false }
      : key?.on && keyI !== null
        ? { i: keyI, y: key.y, key: true }
        : null;

  const move = (clientX: number, clientY: number) => {
    if (!el.current) return;
    const r = el.current.getBoundingClientRect();
    const px = Math.round(clientX - r.left),
      py = Math.round(clientY - r.top);
    // Drawn within the event, before the next frame, as Recharts' store drew it: left to React's scheduler,
    // a move's tooltip reached the screen a frame later (~35 against ~30 ms at 4× CPU).
    if (px !== pointer?.px || py !== pointer?.py) flushSync(() => setPointer({ px, py }));
  };
  const showKey = (i: number) => setKey({ i, on: true, y: keyY(i) });

  return {
    svg,
    active,
    frame: {
      onMouseMove: (e) => move(e.clientX, e.clientY),
      onMouseLeave: () => setPointer(null),
      onTouchMove: (e) => {
        const touch = e.touches[0];
        if (touch) move(touch.clientX, touch.clientY);
      },
      // Recharts left the tooltip where a sideways drag ended, over the chart while the reader scrolled on,
      // until a tap elsewhere.
      onTouchEnd: () => setPointer(null),
      onTouchCancel: () => setPointer(null),
    },
    keys: {
      onMouseDown: () => {
        pressed.current = true;
      },
      onMouseUp: () => {
        pressed.current = false;
      },
      // Recharts showed a point on the first focus only, and a reader who tabbed back found the chart
      // silent until an arrow.
      onFocus: () => {
        if (!pressed.current) showKey(keyI ?? 0);
        pressed.current = false;
      },
      onBlur: () => {
        pressed.current = false;
        setKey((k) => (k ? { ...k, on: false } : k));
      },
      onKeyDown: (e) => {
        if (e.key === "Enter") {
          if (key && keyI !== null) setKey({ ...key, on: !key.on });
          return;
        }
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        // The arrows are the chart's here: left to the browser, they also scroll a sideways-scrolling ancestor.
        e.preventDefault();
        const step = e.key === "ArrowRight" ? 1 : -1;
        if (keyI === null) showKey(step > 0 ? 0 : n - 1);
        else if (keyI + step >= 0 && keyI + step < n) showKey(keyI + step);
      },
    },
  };
}

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
 */
export function ChartTip({
  at,
  area,
  clear,
  children,
}: {
  at: { x: number; y: number };
  area: PlotArea;
  clear?: readonly [number, number];
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
