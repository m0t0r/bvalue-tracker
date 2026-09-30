import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEventHandler,
  type KeyboardEvent,
  type KeyboardEventHandler,
  type MouseEventHandler,
  type RefCallback,
  type TouchEventHandler,
} from "react";
import { flushSync } from "react-dom";
import type { PlotArea } from "./plot";
import { onScreen, visiblePart, type ScrollView } from "./scroll";

/** Which of a chart's points the tooltip is on, and its height in the drawing; `key` when the keyboard put it there. */
export interface Reading {
  i: number;
  y: number;
  key: boolean;
}

/** What `useReading` hands a chart: the reading to draw, and the handlers that make it. */
export interface ReadingHandlers {
  /** For the drawing (`Drawing` takes it with `keys`). */
  svg: RefCallback<SVGSVGElement>;
  active: Reading | null;
  /** For the element around the drawing: the pointer and the finger. */
  frame: {
    onMouseMove: MouseEventHandler;
    onMouseLeave: MouseEventHandler;
    /** Absent on a drawing that scrolls sideways: there a moving finger is the scroll. */
    onTouchMove?: TouchEventHandler;
    onTouchEnd: TouchEventHandler;
    onTouchCancel: TouchEventHandler;
  };
  /** For the drawing itself, which is the tab stop: the keyboard, and the press that focuses it. */
  keys: {
    onMouseDown: MouseEventHandler;
    onFocus: FocusEventHandler;
    onBlur: FocusEventHandler;
    onKeyDown: KeyboardEventHandler;
  };
  /**
   * Where a pointer at the window's (`clientX`, `clientY`) is in the drawing, in its px and unrounded, or
   * null while nothing is drawn: for a chart's own presses, so a press lands where `read` would read.
   * For event handlers only.
   */
  place: (clientX: number, clientY: number) => { px: number; py: number } | null;
}

export interface ReadingOptions {
  /** How many points the arrows walk, in the order they walk them. */
  n: number;
  /**
   * The point a pointer at (`px`, `py`) in the drawing is on, and the height its tooltip goes at, or
   * null where it reads nothing (outside the plot, out of a mark's reach). It runs in the render, so it
   * must only compute. The place is as the browser gives it: a chart that reads in whole pixels, as
   * Recharts did, rounds it.
   */
  read: (px: number, py: number) => { i: number; y: number } | null;
  /**
   * What point `i` is, for the keyboard's reading to stay on it when new data moves it to another index
   * (an event's id, a day's start). Left out, a point is its index, and new data puts the keyboard's
   * reading on whatever has that index now.
   */
  id?: (i: number) => string | number;
  /**
   * The height of the keyboard's tooltip, asked when a key is pressed and not in the render; a chart
   * that places that tooltip by the point it reads leaves it out.
   */
  keyY?: (i: number) => number;
  /**
   * What Enter does, in place of hiding and showing the tooltip: called only with the point the
   * keyboard's tooltip is on, so it can never act on a point the reader is not shown.
   */
  enter?: (i: number, e: KeyboardEvent) => void;
}

/** For a drawing inside a sideways scroller (`useScrollView`). */
export interface ReadingScroll {
  view: ScrollView;
  /** Where point `i` sits in the drawing, in px: what the keyboard brings on screen. */
  x: (i: number) => number;
  /** The drawing's plot; `area` is the part of it that is on screen. */
  plot: PlotArea;
}

const byIndex = (i: number) => i;
const noHeight = () => 0;
const sameArea = (a: PlotArea, b: PlotArea) =>
  a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;

/** Whether focus came from the keyboard: a press on the drawing focuses it too, and asks for no reading. */
function fromKeyboard(el: Element): boolean {
  try {
    return el.matches(":focus-visible");
  } catch {
    return true;
  }
}

/**
 * A chart's tooltip state: what the pointer, a finger and the keyboard read off a drawing, by one set of
 * rules for every chart (docs/frontend.md, "Distribución frecuencia–magnitud" and "Magnitud en el tiempo").
 * They are Recharts' `accessibilityLayer` and axis tooltip where those were right:
 *
 * - **The pointer and the keyboard never both hold the tooltip: the one used last does.** A pointer that
 *   moves onto a point takes it, and the keyboard's is hidden until a key brings it back; an arrow or a
 *   focus from the keyboard takes it from a pointer left resting on the chart. So Enter can only act on
 *   the point the tooltip names.
 * - The pointer's reading is of where the pointer is, read again on every render: when the data or the
 *   size changes under a resting pointer, the tooltip is on what is under it now; and it is forgotten
 *   with the drawing, so a plot drawn again opens with none. A pointer over nothing keeps no place,
 *   and renders nothing as it moves.
 * - A pointer that moved is told from a chart that moved under it. The browser sends a mouse move from
 *   where a resting pointer already is when the chart scrolls under it. After the keyboard's own scroll
 *   that move is ignored, or it would take the tooltip back; after the reader's (a wheel, a trackpad) it
 *   counts, so the tooltip goes on naming what is under the pointer, which is what a press there would
 *   choose. A move from the same place with nothing moved under it is no move at all.
 * - Focus from the keyboard shows the point the keyboard was last on, or the first on screen; focus
 *   from a press shows nothing, or the tooltip would jump to the first point when the pointer left.
 * - The arrows step through the `n` points and stop at the ends, and scroll nothing but the chart's own
 *   scroller, to bring the point on screen. An arrow pressed while the keyboard's tooltip is not shown
 *   shows it where it was, without a step: a step is never taken from a point the reader cannot see.
 *   Enter hides the keyboard's tooltip and shows it again, taking it from the pointer like an arrow, or
 *   is the chart's own (`enter`).
 * - A lifted finger lets go. A tap still shows the tooltip: the browser follows the touch with the mouse
 *   events of a click, and their move comes after the lift. A finger that moves is read like a pointer,
 *   except inside a sideways scroller, where the move is the scroll.
 * - The keyboard's reading is of a point by its `id`, and new data can lack it: that is no reading at all.
 *
 * With `scroll`, `area` is where a tooltip may go: the part of the plot that is on screen, read when a
 * reading is made and again whenever the chart scrolls or changes width under a tooltip.
 */
export function useReading(options: ReadingOptions & { scroll: ReadingScroll }): ReadingHandlers & { area: PlotArea };
export function useReading(options: ReadingOptions): ReadingHandlers;
export function useReading({
  n,
  read,
  id = byIndex,
  keyY = noHeight,
  enter,
  scroll,
}: ReadingOptions & { scroll?: ReadingScroll }): ReadingHandlers & { area: PlotArea | null } {
  const el = useRef<SVGSVGElement | null>(null);
  const pressed = useRef(false);
  // The last move, where it was in the window and in the drawing.
  const last = useRef<{ clientX: number; clientY: number; px: number; py: number } | null>(null);
  const [pointer, setPointer] = useState<{ px: number; py: number } | null>(null);
  const [key, setKey] = useState<{ id: string | number; i: number; on: boolean; y: number } | null>(null);
  const svg = useCallback((node: SVGSVGElement | null) => {
    el.current = node;
    if (node) return;
    last.current = null;
    setPointer(null);
  }, []);

  // Where the keyboard's point is now: where it was, or wherever new data has put it.
  let keyI: number | null = null;
  if (key) {
    if (key.i < n && id(key.i) === key.id) keyI = key.i;
    else for (let i = 0; i < n && keyI === null; i++) if (id(i) === key.id) keyI = i;
  }
  // A place reads a point the chart has, or nothing: never one past its points.
  const readAt = (px: number, py: number) => {
    const point = read(px, py);
    return point && point.i < n ? point : null;
  };
  const under = pointer ? readAt(pointer.px, pointer.py) : null;
  const active: Reading | null = under
    ? { ...under, key: false }
    : key?.on && keyI !== null
      ? { i: keyI, y: key.y, key: true }
      : null;

  const view = scroll?.view;
  const plot = scroll?.plot;
  const [area, setArea] = useState<PlotArea | null>(() => (view && plot ? visiblePart(view, plot) : null));
  const left = plot?.left,
    top = plot?.top,
    width = plot?.width,
    height = plot?.height;
  const measure = useCallback(() => {
    if (!view || left === undefined || top === undefined || width === undefined || height === undefined) return;
    const next = visiblePart(view, { left, top, width, height });
    setArea((a) => (a && sameArea(a, next) ? a : next));
  }, [view, left, top, width, height]);
  const live = active !== null;
  const isLive = useRef(live);
  useEffect(() => {
    isLive.current = live;
  }, [live]);
  useEffect(() => view?.subscribe(() => isLive.current && measure()), [view, measure]);

  const place = (clientX: number, clientY: number) => {
    if (!el.current) return null;
    const r = el.current.getBoundingClientRect();
    return { px: clientX - r.left, py: clientY - r.top };
  };
  const move = (clientX: number, clientY: number) => {
    const at = place(clientX, clientY);
    if (!at) return;
    const was = last.current;
    last.current = { clientX, clientY, ...at };
    if (was?.clientX === clientX && was.clientY === clientY) {
      if ((was.px === at.px && was.py === at.py) || view?.keyboardScrolled()) return;
    } else view?.pointerMoved();
    const there = readAt(at.px, at.py);
    // Over nothing there is no place to keep, and nothing to draw again for. On a point the place kept is
    // always the pointer's own, also within one day or one dot's reach: it is what a later render reads.
    if (!there && pointer === null) return;
    // Drawn within the event, before the next frame, as Recharts' store drew it: left to React's scheduler,
    // a move's tooltip reached the screen a frame later (~35 against ~30 ms at 4× CPU).
    flushSync(() => {
      measure();
      setPointer(there ? at : null);
      // The pointer takes the tooltip from the keyboard.
      if (there) setKey((k) => (k?.on ? { ...k, on: false } : k));
    });
  };
  /** The pointer has left, or a finger has lifted: the next move counts wherever it is. */
  const leave = () => {
    last.current = null;
    setPointer(null);
  };

  const shown = () => (scroll ? onScreen(scroll.view, n, scroll.x) : { first: 0, last: n - 1 });
  const showKey = (i: number) => {
    if (i < 0 || i >= n) return;
    if (scroll) {
      // Brought on screen first: on a phone the chart scrolls, and the first point is far to the left.
      scroll.view.reveal(scroll.x(i));
      measure();
    }
    // The keyboard takes the tooltip from a pointer left resting on the chart.
    setPointer(null);
    // The same reading is kept as it was, so an arrow that cannot step (at either end) renders nothing.
    const next = { id: id(i), i, on: true, y: keyY(i) };
    setKey((k) => (k?.on && k.id === next.id && k.i === i && k.y === next.y ? k : next));
  };

  return {
    svg,
    active,
    // Not measured yet (the scroller was given after the first render): the whole plot.
    area: area ?? plot ?? null,
    place,
    frame: {
      onMouseMove: (e) => move(e.clientX, e.clientY),
      onMouseLeave: leave,
      ...(scroll
        ? {}
        : {
            onTouchMove: (e) => {
              const touch = e.touches[0];
              if (touch) move(touch.clientX, touch.clientY);
            },
          }),
      // Recharts left the tooltip where a sideways drag ended, over the chart while the reader scrolled on,
      // until a tap elsewhere.
      onTouchEnd: leave,
      onTouchCancel: leave,
    },
    keys: {
      onMouseDown: () => {
        pressed.current = true;
        // The focus a press makes comes within the press's own event. After it the flag is stale: a
        // chart's own drag may prevent that focus, and the button may be let go where no event says so
        // (another window, a context menu), which would silence the next focus from the keyboard.
        setTimeout(() => (pressed.current = false));
      },
      // Recharts showed a point on the first focus only, and a reader who tabbed back found the chart
      // silent until an arrow.
      onFocus: (e) => {
        if (!pressed.current && fromKeyboard(e.currentTarget)) showKey(keyI ?? shown().first);
        pressed.current = false;
      },
      onBlur: () => {
        pressed.current = false;
        setKey((k) => (k ? { ...k, on: false } : k));
      },
      onKeyDown: (e) => {
        if (e.key === "Enter") {
          if (enter) {
            if (active?.key) enter(active.i, e);
          } else if (keyI !== null) {
            // Hides the keyboard's tooltip, or shows it: also from under a pointer that holds the tooltip,
            // which a toggle alone would have switched on unseen, to appear when the pointer left.
            if (active?.key) setKey((k) => (k ? { ...k, on: false } : k));
            else showKey(keyI);
          }
          return;
        }
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        // The arrows are the chart's here: left to the browser, they also scroll a sideways-scrolling ancestor.
        e.preventDefault();
        const step = e.key === "ArrowRight" ? 1 : -1;
        if (keyI === null) showKey(step > 0 ? shown().first : shown().last);
        else if (!active?.key) showKey(keyI);
        else showKey(Math.min(n - 1, Math.max(0, keyI + step)));
      },
    },
  };
}
