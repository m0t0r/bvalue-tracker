/**
 * The story map's side view: Pereira at the surface and each source's focus at its depth, true to
 * scale, so each line from Pereira is as long as the straight-line distance written on it. The map
 * above it can only draw distance over the surface, where the deep group's short line carried the
 * longest figure but one. Pure layout; `SideView` in `side-view.tsx` draws it.
 */
import type { SourceDistance } from "../claims";
import { crosses, overlaps, type Box } from "../drawing";

/** The arc's radius, km: the same 120 km as the map's circle, so the two drawings share one mark. */
export const ARC_KM = 120;

export interface Focus {
  /** How far across from Pereira the focus is drawn, and how deep, km. */
  acrossKm: number;
  depthKm: number;
}

/**
 * Where a source's focus sits in the side view: at its median depth, and as far across as makes the
 * line from Pereira exactly its median straight-line distance. The three medians are taken apart, so
 * they need not make a right triangle: the map distance is the one of them the drawing does not
 * state, so it gives way (by 0.6 km for the deep group on the 2026-09-24 fixture). A median depth
 * past the straight-line figure puts the focus under Pereira, at that figure.
 */
export function sideFocus(d: SourceDistance): Focus {
  const depthKm = Math.min(d.depthKm, d.hypocentralKm);
  return { acrossKm: Math.sqrt(d.hypocentralKm ** 2 - depthKm ** 2), depthKm };
}

/** Pixels per km, one for both directions: the largest at which every focus and the arc's top end fit. */
export function sideScale(foci: readonly Focus[], room: { width: number; height: number }): number {
  const across = Math.max(ARC_KM, ...foci.map((f) => f.acrossKm));
  const depth = Math.max(1, ...foci.map((f) => f.depthKm));
  return Math.min(room.width / across, room.height / depth);
}

/** The most of the map's events the card may hide before its corner is passed over. */
export const MAX_HIDDEN_SHARE = 0.05;

/**
 * Which corner of the map the side view covers. Corners are tried in the order given, so the card
 * stays in one place across widths and languages (the owner's review, 2026-09-30: it sat top-left at
 * 390 px and bottom-left at 320, and read as a bug). The first corner is taken that cuts no line,
 * covers no box the map states (a figure, a name on a line, Pereira, the mainshock's star) and hides
 * at most `MAX_HIDDEN_SHARE` of the events; failing that, the one that covers fewest of those marks,
 * then fewest events. A town's or the ocean's name is not counted: under the card it is left off.
 */
export function pickCorner<T extends Box>(
  corners: readonly T[],
  {
    boxes,
    lines,
    points,
  }: {
    boxes: readonly Box[];
    lines: readonly (readonly [readonly [number, number], readonly [number, number]])[];
    points: readonly (readonly [number, number])[];
  },
): T {
  const cost = (c: Box) => {
    const hits = lines.filter(([a, b]) => crosses(c, a, b)).length + boxes.filter((b) => overlaps(c, b)).length;
    const hidden = points.filter(([x, y]) => x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1).length;
    return { hits, hidden, clear: hits === 0 && hidden <= MAX_HIDDEN_SHARE * points.length };
  };
  const costs = corners.map((c) => ({ c, ...cost(c) }));
  const clear = costs.find((k) => k.clear);
  if (clear) return clear.c;
  return costs.reduce((best, k) => (k.hits < best.hits || (k.hits === best.hits && k.hidden < best.hidden) ? k : best))
    .c;
}
