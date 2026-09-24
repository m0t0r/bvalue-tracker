/**
 * Catalogue magnitudes are reported to one decimal, and compared here in whole tenths. In floating
 * point 4.6 − 3.6 is 0.9999999999999996, so a gap of exactly 1.0 fails `>= 1.0` when it is taken by
 * subtraction — 37 pairs between M2 and M9 do that, M4.6 over M3.6 among them.
 */
export const tenths = (mag: number): number => Math.round(mag * 10);

/** `a − b`, exact to the tenth: `magnitudeGap(4.6, 3.6)` is 1. */
export const magnitudeGap = (a: number, b: number): number => (tenths(a) - tenths(b)) / 10;
