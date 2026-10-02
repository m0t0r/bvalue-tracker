/**
 * Where a drawing's labels go, so they stay inside it and clear of one another (issue #154). Pure
 * functions over widths measured with `useTextWidth()`; an axis' labels go through `ownPlaceLabels`
 * (`@bvalue/charts`) instead.
 */

/**
 * The least room between two labels on the insights drawings, in px: an axis' labels (the `gap` given
 * to `ownPlaceLabels`) and a label and what it must stay clear of.
 */
export const INSIGHTS_LABEL_GAP = 6;

/** A label's box on the drawing, in px: left, right, top and bottom. */
export interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/**
 * The box of one line of SVG text, as the browser boxes it in Geist: from an em above the baseline to
 * 0.3 em below (measured at 10–14 px, 2026-09-30). `x` and `y` are the text's own attributes.
 */
export function textBox({
  x,
  y,
  width,
  fontSize,
  anchor = "start",
}: {
  x: number;
  y: number;
  width: number;
  fontSize: number;
  anchor?: "start" | "middle" | "end";
}): Box {
  const x0 = anchor === "start" ? x : anchor === "middle" ? x - width / 2 : x - width;
  return { x0, x1: x0 + width, y0: y - fontSize, y1: y + fontSize * 0.3 };
}

/** Whether two boxes share area, or come closer than `gap`. Boxes that only touch do not overlap. */
export function overlaps(a: Box, b: Box, gap = 0): boolean {
  return a.x0 < b.x1 + gap && b.x0 < a.x1 + gap && a.y0 < b.y1 + gap && b.y0 < a.y1 + gap;
}

/**
 * Whether the straight line from `a` to `b` passes through the box, or within `pad` of it: a drawn
 * line a label must not sit on. Clipped against the box (Liang–Barsky), so a diagonal that only spans
 * the box's rows and columns does not count.
 */
export function crosses(box: Box, a: readonly [number, number], b: readonly [number, number], pad = 0): boolean {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  let t0 = 0;
  let t1 = 1;
  const sides: [number, number][] = [
    [-dx, a[0] - (box.x0 - pad)],
    [dx, box.x1 + pad - a[0]],
    [-dy, a[1] - (box.y0 - pad)],
    [dy, box.y1 + pad - a[1]],
  ];
  for (const [p, q] of sides) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}

/**
 * Whether a circle's outline passes through the box, or within `pad` of it: a label may sit inside a
 * drawn circle or outside it, not on its line. True when the box's nearest point is within the radius
 * and its farthest corner beyond it.
 */
export function crossesRing(box: Box, { cx, cy, r }: { cx: number; cy: number; r: number }, pad = 0): boolean {
  const near = Math.hypot(Math.max(box.x0 - cx, 0, cx - box.x1), Math.max(box.y0 - cy, 0, cy - box.y1));
  const far = Math.hypot(Math.max(cx - box.x0, box.x1 - cx), Math.max(cy - box.y0, box.y1 - cy));
  return near <= r + pad && far >= r - pad;
}

/**
 * The first of a label's possible placements that lies wholly inside `frame` and clear of every box
 * in `avoid` by `gap`, or null when none does: the label is then left off.
 */
export function firstClear<T extends Box>(
  placements: readonly T[],
  frame: Box,
  avoid: readonly Box[],
  gap = 0,
): T | null {
  return (
    placements.find(
      (p) =>
        p.x0 >= frame.x0 &&
        p.x1 <= frame.x1 &&
        p.y0 >= frame.y0 &&
        p.y1 <= frame.y1 &&
        avoid.every((b) => !overlaps(p, b, gap)),
    ) ?? null
  );
}

/**
 * A row of labels read left to right, each asking to start at `at`: its left edge, in px. Each is
 * moved inside the room (left to end at `end`, right to start at `start`) and kept only if it then
 * starts at least `gap` after the last kept one ends. Returns each label's left edge, or null where
 * it is left off. The lull bands' labels, on the questions tab and in the story, go through this.
 */
export function forwardLabels(
  labels: readonly { at: number; width: number }[],
  { start, end, gap }: { start: number; end: number; gap: number },
): (number | null)[] {
  let free = -Infinity;
  return labels.map(({ at, width }) => {
    if (width > end - start) return null;
    const x = Math.max(start, Math.min(at, end - width));
    if (x < free) return null;
    free = x + width + gap;
    return x;
  });
}
