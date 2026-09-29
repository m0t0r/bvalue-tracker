/**
 * Which of a time axis' candidate ticks get a label. This is Recharts' own rule for its default
 * `interval="preserveEnd"`, run here so that the chart can pass the result as `ticks` with
 * `interval={0}`: Recharts then draws them as given, without writing each label into the DOM to measure
 * it, a layout per label inside "Valor b en el tiempo"'s first render (issue #96).
 *
 * From the last candidate back, a label is kept when it lies wholly between `start` and `end`, and each
 * kept label moves `end` to its own left edge less `gap`. The last candidate alone is pulled back inside
 * when it crosses `end`, as Recharts pulls it; it is then drawn at its own place, past the edge by as
 * much (half a pixel for the widest label the chart has, an hour label in its 40 px right margin).
 * Candidates are walked in the order given, not sorted: Recharts walks its candidates as it collects
 * them, and the chart passes them the same way so its labels stay the ones Recharts chose.
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
