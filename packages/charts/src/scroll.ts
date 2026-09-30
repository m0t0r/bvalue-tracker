import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PlotArea } from "./plot";

/** How far inside the screen's edge the keyboard's point is kept. */
const REVEAL = 16;

/**
 * A sideways scroller, as the drawings inside it need it: which part of a drawing is on screen, so a
 * tooltip stays there, and a way to bring a point on screen for the keyboard.
 */
export interface ScrollView {
  /** The stretch of the drawing that is on screen, in its own px. */
  visible: () => { from: number; to: number };
  /** Scrolls until `x`, in the drawing's px, is on screen. */
  reveal: (x: number) => void;
  /** Whether the chart last scrolled for the keyboard, with no move of the pointer since. */
  keyboardScrolled: () => boolean;
  /** The pointer has moved: a scroll from here on is the reader's own. */
  pointerMoved: () => void;
  /** Calls `fn` whenever what is on screen changes: a scroll, or a new width. */
  subscribe: (fn: () => void) => () => void;
}

/**
 * The scroller around drawings too wide for their card, for the element `ref` and `onScroll` are put on.
 * `pinned` px at its start are a column that stays while the drawings scroll under it (a y axis), so
 * what is on screen of a drawing runs from the scroll position for as far as the room beside it.
 *
 * The reader starts at the end, the newest of a time axis, and scrolls back. A new `content` width (a
 * refresh, a filter) keeps them where they were reading unless they were already at the end, which is
 * where the next point will appear. `container` is the element's own width: a new one, like a new
 * `content`, changes what is on screen without a scroll.
 */
export function useScrollView({ pinned, content, container }: { pinned: number; content: number; container: number }): {
  ref: (el: HTMLElement | null) => void;
  onScroll: () => void;
  /** Whether it is scrolled from its start: the one cue, for a pinned column's shadow, that there is more before it. */
  scrolled: boolean;
  view: ScrollView;
} {
  const scroller = useRef<HTMLElement | null>(null);
  const ref = useCallback((el: HTMLElement | null) => {
    scroller.current = el;
  }, []);

  // Read when asked, not when the view was made: the column's width may follow the window's.
  const pin = useRef(pinned);
  useEffect(() => {
    pin.current = pinned;
  }, [pinned]);

  const stick = useRef(true);
  const [scrolled, setScrolled] = useState(false);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !stick.current) return;
    el.scrollLeft = el.scrollWidth;
    setScrolled(el.scrollLeft > 1);
  }, [content]);

  const [{ view, changed }] = useState(() => {
    let byKeyboard = false;
    const listeners = new Set<() => void>();
    const view: ScrollView = {
      keyboardScrolled: () => byKeyboard,
      pointerMoved: () => {
        byKeyboard = false;
      },
      subscribe: (fn) => {
        listeners.add(fn);
        return () => void listeners.delete(fn);
      },
      visible: () => {
        const el = scroller.current;
        const room = (el?.clientWidth ?? 0) - pin.current;
        // Not laid out: nothing is known to be off screen.
        if (!el || room <= 0) return { from: 0, to: Infinity };
        return { from: el.scrollLeft, to: el.scrollLeft + room };
      },
      reveal: (x) => {
        const el = scroller.current;
        const room = (el?.clientWidth ?? 0) - pin.current;
        if (!el || room <= 0) return;
        // With a little air, so the point is not under the pinned column's shadow or on the very edge.
        if (x >= el.scrollLeft + REVEAL && x <= el.scrollLeft + room - REVEAL) return;
        const before = el.scrollLeft;
        el.scrollLeft = x - room / 2;
        if (el.scrollLeft !== before) byKeyboard = true;
      },
    };
    return { view, changed: () => listeners.forEach((fn) => fn()) };
  });
  // A tooltip on show follows what is on screen: a scroll (`onScroll`) or a new width moves it.
  useEffect(() => changed(), [changed, content, container]);

  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    stick.current = el.scrollLeft + el.clientWidth >= el.scrollWidth - 8;
    setScrolled(el.scrollLeft > 1);
    changed();
  }, [changed]);

  return { ref, onScroll, scrolled, view };
}

/**
 * Where the keyboard starts: the first of `n` points that is on screen, or the last for an arrow to the
 * left. Without scrolling that is the first of all, as in Recharts; on a phone, where a chart opens on
 * its newest days, starting from the first of all would throw the view back to the first day.
 */
export function onScreen(view: ScrollView, n: number, x: (i: number) => number): { first: number; last: number } {
  const { from, to } = view.visible();
  let first = 0;
  while (first < n - 1 && x(first) < from + REVEAL) first++;
  let last = n - 1;
  while (last > first && x(last) > to - REVEAL) last--;
  return { first, last };
}

/** The part of a plot that is on screen: past it, the scroller cuts a tooltip off. */
export function visiblePart(view: ScrollView, plot: PlotArea): PlotArea {
  const { from, to } = view.visible();
  const left = Math.max(plot.left, from);
  const right = Math.min(plot.left + plot.width, to);
  return { left, top: plot.top, width: Math.max(0, right - left), height: plot.height };
}
