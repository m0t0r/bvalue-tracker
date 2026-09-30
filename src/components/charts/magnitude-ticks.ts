/** Rounds away binary noise: 0.4 / 0.05 is 8.000000000000002 in floating point, and ceil makes it 9. */
const clean = (v: number) => Number(v.toPrecision(12));

/**
 * The magnitude axis' labels: from the smallest magnitude in a round step, which may leave a short last
 * gap, and always the largest. This is Recharts' rule for an axis with a `tickCount` over a fixed domain
 * (`getTickValuesFixedDomain`), with one change: the step is a whole number of `unit`s (the chart's 0.1
 * bins). Recharts' step could be 0.95 or 0.09, and then a label written to one decimal was not where its
 * magnitude is ("1.8" at 1.75 on Chocó's axis) or said the same as the next ("2.5" at 2.45 and 2.54).
 * `magnitude-ticks.test.ts` holds it to Recharts' own function wherever that step is whole tenths.
 */
export function magnitudeTicks([a, b]: [number, number], tickCount: number, unit = 0.1): number[] {
  const lo = Math.min(a, b),
    hi = Math.max(a, b);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [a, b];
  if (lo === hi) return [lo];
  const rough = (hi - lo) / (Math.max(tickCount, 2) - 1);
  // Recharts' step: the rough one rounded up to a multiple of 0.05 of its power of ten (0.1 for 1–10).
  const digits = Math.floor(clean(Math.log10(rough))) + 1;
  const scale = digits !== 1 ? 0.05 : 0.1;
  const recharts = clean(clean(Math.ceil(clean(rough / 10 ** digits / scale)) * scale) * 10 ** digits);
  const step = clean(Math.ceil(clean(recharts / unit)) * unit);
  const ticks: number[] = [];
  for (let v = lo, i = 0; v < hi && i < 100_000; i++, v = clean(v + step)) ticks.push(v);
  ticks.push(hi);
  return a > b ? ticks.reverse() : ticks;
}
