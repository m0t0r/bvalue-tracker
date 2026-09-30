/** Where an axis' candidate labels sit and how much room they have. */
export interface LabelRoom {
  /** Where a candidate sits on the chart, in px. */
  x: (v: number) => number;
  /** How wide its label is, in px. */
  width: (v: number) => number;
  start: number;
  end: number;
  /** The least room between two labels (Recharts' `minTickGap`). */
  gap: number;
}

/**
 * From the last candidate back, a label is kept when it lies wholly between `start` and `end`, centred
 * on its own place, and each kept label moves `end` to its own left edge less `gap`. With `pullLast`
 * the last candidate is first pulled back inside when it crosses `end`. Candidates are walked in the
 * order given, not sorted.
 */
function labelsThatFit(candidates: readonly number[], { x, width, start, end, gap }: LabelRoom, pullLast: boolean) {
  const kept: number[] = [];
  let room = end;
  for (let i = candidates.length - 1; i >= 0; i--) {
    const v = candidates[i]!;
    let at = x(v);
    // Measured only once it is needed, as Recharts measured: most candidates lie past the room left.
    let half: number | undefined;
    if (pullLast && i === candidates.length - 1) {
      half = width(v) / 2;
      at = Math.min(at, end - half);
    }
    if (at < start || at > room) continue;
    half ??= width(v) / 2;
    if (at - half < start || at + half > room) continue;
    kept.unshift(v);
    room = at - half - gap;
  }
  return kept;
}

/**
 * Which of an axis' candidate ticks get a label. This was Recharts' own rule for its default
 * `interval="preserveEnd"`, run here with widths the chart gives it: Recharts wrote each label into the
 * DOM to measure it, a layout per label inside "Valor b en el tiempo"'s first render (issue #96). The
 * charts drawn without Recharts (issues #118, #125) keep the rule, so their labels are the ones it chose.
 *
 * From the last candidate back, a label is kept when it lies wholly between `start` and `end`, and each
 * kept label moves `end` to its own left edge less `gap`. The last candidate alone is pulled back inside
 * when it crosses `end`, as Recharts pulled it; it is then drawn at its own place, past the edge by as
 * much (half a pixel for the widest label the chart has, an hour label in its 40 px right margin).
 * Candidates are walked in the order given, not sorted, as Recharts walked its own: pass them in axis
 * order. Recharts collected a time axis' candidates series by series, so a second series that ended
 * early took the "last" label and left every later date without one; "Valor b en el tiempo" sorts them.
 */
export function preserveEndTicks(candidates: readonly number[], room: LabelRoom): number[] {
  return labelsThatFit(candidates, room, true);
}

/**
 * Which labels are drawn when each must sit at its own place. From the last candidate back, one is kept
 * when its label, centred on its own place, lies wholly between `start` and `end` and clears the label
 * kept after it by `gap`.
 *
 * Recharts' rule (`preserveEndTicks`) differs in one thing: it pulled the last label inside when it
 * crossed the edge and drew it there. On a scrolling chart that was the end of the last day, drawn
 * ~10 px before its place, and it took the room of the last regular label ("21 sept" on Chocó's).
 */
export function ownPlaceLabels(candidates: readonly number[], room: LabelRoom): number[] {
  return labelsThatFit(candidates, room, false);
}
