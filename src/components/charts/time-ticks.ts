/**
 * Which of an axis' candidate ticks get a label. This is Recharts' own rule for its default
 * `interval="preserveEnd"`, run here with widths the chart gives it: Recharts wrote each label into the
 * DOM to measure it, a layout per label inside "Valor b en el tiempo"'s first render (issue #96). The
 * charts drawn without Recharts (issues #118, #125) keep the rule, so their labels are the ones it chose.
 *
 * From the last candidate back, a label is kept when it lies wholly between `start` and `end`, and each
 * kept label moves `end` to its own left edge less `gap`. The last candidate alone is pulled back inside
 * when it crosses `end`, as Recharts pulls it; it is then drawn at its own place, past the edge by as
 * much (half a pixel for the widest label the chart has, an hour label in its 40 px right margin).
 * Candidates are walked in the order given, not sorted, as Recharts walks its own: pass them in axis
 * order. Recharts collected a time axis' candidates series by series, so a second series that ended
 * early took the "last" label and left every later date without one; "Valor b en el tiempo" sorts them.
 */
export function preserveEndTicks(
  candidates: readonly number[],
  {
    x,
    width,
    start,
    end,
    gap,
  }: {
    /** Where a candidate sits on the chart, in px. */
    x: (v: number) => number;
    /** How wide its label is, in px. */
    width: (v: number) => number;
    start: number;
    end: number;
    /** The least room between two labels (Recharts' `minTickGap`). */
    gap: number;
  },
): number[] {
  const kept: number[] = [];
  let room = end;
  for (let i = candidates.length - 1; i >= 0; i--) {
    const v = candidates[i]!;
    let at = x(v);
    // Measured only once it is needed, as Recharts measures: most candidates lie past the room left.
    let half: number | undefined;
    if (i === candidates.length - 1) {
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
