/**
 * The story's dots glide in JavaScript, on a canvas, the way a CSS transition would move them: each value
 * waits out its delay, then eases to its target, and a new target turns it from wherever it is.
 */

/** How a glide moves: the curve its progress follows, and how long a whole glide takes. */
export interface Motion {
  ease: (t: number) => number;
  ms: number;
}

/**
 * One value on its way from `from` to `to`, moving from `start` (a `performance.now()` time) for `span`
 * ms. `back` and `factor` are CSS's reversing-adjusted start value and reversing shortening factor: a
 * tween sent back to `back` returns in the part of the length it had covered.
 */
export interface Tween {
  from: readonly number[];
  to: readonly number[];
  start: number;
  span: number;
  back: readonly number[];
  factor: number;
}

/** How far along a tween is at `now`, after its curve: 0 at `from`, 1 at `to`. */
export const progress = (tw: Tween, now: number, m: Motion) =>
  now >= tw.start + tw.span ? 1 : now <= tw.start ? 0 : m.ease((now - tw.start) / tw.span);

/** Where a tween is at `now`. */
export function at(tw: Tween, now: number, m: Motion): number[] {
  const p = progress(tw, now, m);
  return tw.to.map((to, i) => tw.from[i]! + (to - tw.from[i]!) * p);
}

/** Whether a tween has arrived. */
export const settled = (tw: Tween, now: number) => now >= tw.start + tw.span;

const same = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((v, i) => v === b[i]);
const there = (to: readonly number[]): Tween => ({ from: to, to, start: -Infinity, span: 0, back: to, factor: 1 });

/**
 * A tween heading for `to`, as CSS starts a transition when a value changes. A value seen for the first
 * time, or one told to `jump` (reduced motion), is there at once. The same target keeps its course. A
 * new one starts from where the value is now and moves after `delay` ms; sent back towards where a
 * running glide began, it takes only the part of the length that glide had covered (the delay stays
 * whole, as CSS keeps a positive one).
 */
export function toward(
  tw: Tween | undefined,
  to: readonly number[],
  now: number,
  delay: number,
  m: Motion,
  jump = false,
): Tween {
  if (!tw || jump) return there(to);
  if (same(tw.to, to)) return tw;
  const from = at(tw, now, m);
  if (same(from, to)) return there(to);
  if (!settled(tw, now) && same(tw.back, to)) {
    const factor = Math.min(1, Math.max(0, progress(tw, now, m) * tw.factor + 1 - tw.factor));
    return { from, to, start: now + delay, span: m.ms * factor, back: tw.to, factor };
  }
  return { from, to, start: now + delay, span: m.ms, back: from, factor: 1 };
}
