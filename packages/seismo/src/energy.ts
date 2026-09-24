/**
 * How much bigger one earthquake is than another, in the two senses a reader meets: the energy it
 * releases and the size of the wiggle a seismograph records. Ratios only — the absolute constants
 * depend on the magnitude type, and a catalogue that mixes types (as SGC's does) supports nothing
 * finer than a comparison.
 */

/**
 * Seismic moment in N·m, from moment magnitude (Hanks & Kanamori 1979): M0 = 10^(1.5 Mw + 9.1).
 * Used here for shares of a sequence's total, where the constant cancels.
 */
export const seismicMoment = (mag: number): number => 10 ** (1.5 * mag + 9.1);

/**
 * How many times more energy an event of `a` releases than one of `b`: 10^(1.5 (a − b)), so one
 * magnitude unit is ~31.6× and two are 1000× (Gutenberg & Richter 1956, log E = 1.5 M + const).
 */
export const energyRatio = (a: number, b: number): number => 10 ** (1.5 * (a - b));

/**
 * How many times larger the recorded ground-motion amplitude of `a` is than that of `b`, at the
 * same distance: 10^(a − b). That is Richter's own definition of magnitude, so it holds only as
 * a rule of thumb for other types and says nothing about how the shaking is felt.
 */
export const amplitudeRatio = (a: number, b: number): number => 10 ** (a - b);

/**
 * The share of the total seismic moment that the largest event holds, in [0, 1]; null for an
 * empty catalogue. "The M7.4 released 99.9% of the sequence's energy" is this number.
 */
export function largestMomentShare(events: Iterable<{ mag: number }>): number | null {
  let total = 0,
    largest = 0;
  for (const e of events) {
    const m = seismicMoment(e.mag);
    total += m;
    if (m > largest) largest = m;
  }
  return total > 0 ? largest / total : null;
}
