import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useReducedMotion } from "../use-reduced-motion";

/** The element's content box, in whole pixels, kept current by a ResizeObserver. Zero until measured. */
export function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const width = Math.round(entry.contentRect.width);
      const height = Math.round(entry.contentRect.height);
      setSize((s) => (s.width === width && s.height === height ? s : { width, height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

const wideQuery = () => window.matchMedia("(min-width: 768px)");

/** The story's two layouts: text beside the drawing (≥ 768 px), or the drawing pinned above the text. */
export const useWide = () =>
  useSyncExternalStore(
    (cb) => {
      const mq = wideQuery();
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => wideQuery().matches,
  );

/**
 * Which step of the story the reader is on: the one crossing a line across the window. The line
 * sits mid-window when the text runs beside the drawing, and three quarters down when the drawing
 * is pinned over the top half, so a step turns current once it is clear of the drawing.
 */
export function useActiveStep(count: number, isWide: boolean) {
  const els = useRef<(HTMLElement | null)[]>([]);
  const [active, setActive] = useState(0);
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const i = els.current.indexOf(e.target as HTMLElement);
          if (i >= 0) setActive(i);
        }
      },
      { rootMargin: isWide ? "-50% 0px -50% 0px" : "-75% 0px -25% 0px" },
    );
    for (const el of els.current.slice(0, count)) if (el) io.observe(el);
    return () => io.disconnect();
  }, [count, isWide]);
  const register = (i: number) => (el: HTMLElement | null) => {
    els.current[i] = el;
  };
  return { active: Math.min(active, count - 1), register };
}

/**
 * A value that runs from 0 to 1 over `ms` each time `on` turns true, for drawings that replay
 * (the swarm filling in, the waves travelling). Stays at 1 for a reader who asked for less motion,
 * so they see the finished drawing at once.
 */
export function useProgress(on: boolean, ms: number) {
  const reduced = useReducedMotion();
  const [p, setP] = useState(0);
  useEffect(() => {
    if (!on) {
      setP(0);
      return;
    }
    if (reduced) {
      setP(1);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const v = Math.min(1, (t - t0) / ms);
      setP(v);
      if (v < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on, ms, reduced]);
  return p;
}
