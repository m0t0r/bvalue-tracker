import { useCallback, useRef, useState } from "react";

/** A plot's box in whole pixels, as Recharts' `ResponsiveContainer` rounded its own, and the font its labels are in. */
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
