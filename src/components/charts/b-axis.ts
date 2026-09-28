/** The chart's height at rest (`min-h-80`), which sets how many pixels one unit of b gets. */
export const BASE_H = 320;
/** What in that height is not plot: the top margin and the date axis. */
const CHROME_H = 16 + 30;

/**
 * The y axis for a plot `height` px tall. The axis at rest spans the data's range, rounded out to
 * tenths and never narrower than 0.4–1.2, over `BASE_H`. A taller plot keeps that many pixels per
 * unit of b and shows more of the axis, split evenly above and below: stretched instead, the same
 * fall in b would be drawn steeper, and the page is careful not to oversell a decline.
 */
export function bAxis(lo: number, hi: number, height: number): { domain: [number, number]; ticks: number[] } {
  const d0 = Math.floor(Math.min(0.4, lo) * 10) / 10,
    d1 = Math.ceil(Math.max(1.2, hi) * 10) / 10;
  const perUnit = (BASE_H - CHROME_H) / (d1 - d0);
  const range = Math.max(d1 - d0, (height - CHROME_H) / perUnit);
  // Split evenly, except that b never goes below 0: what does not fit under it goes on top.
  const bottom = Math.max(0, d0 - (range - (d1 - d0)) / 2);
  const domain: [number, number] = [bottom, bottom + range];
  const ticks: number[] = [];
  for (let k = Math.ceil(domain[0] * 5); k <= Math.floor(domain[1] * 5 + 1e-9); k++) ticks.push(k / 5);
  return { domain, ticks };
}
