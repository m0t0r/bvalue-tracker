/**
 * Whether a catalogue has a mainshock: one event that stands clear of every other.
 *
 * The rule is one sentence a reader can check against the catalogue: **the largest event exceeds
 * every other event by at least `minGap` magnitude units, and an analyst has reviewed it.** No
 * clustering algorithm and no window in time or space: the caller decides which catalogue is "the
 * sequence" (a zone's box, from its start), and this only compares the events in it.
 */
import { magnitudeGap, tenths } from "./magnitude.ts";

/**
 * - `found`: the largest event is reviewed and stands clear.
 * - `awaiting-review`: it would stand clear, but its magnitude is still automatic. Automatic
 *   magnitudes are often revised, so it is not called a mainshock yet.
 * - `none`: nothing stands clear — a swarm, a doublet, a tie, or fewer than two events.
 */
export type MainshockState = "found" | "awaiting-review" | "none";

/**
 * `largest` and `runnerUp` are the caller's own objects, so they carry whatever the caller needs
 * (an id, a time, a magnitude type). `gap` is exact to the tenth. When `state` is `none` they say
 * why: `gap` is below the threshold (0 for a tie, where either tied event may be `largest`), or
 * `runnerUp` is null because there is at most one event.
 */
export type MainshockAssessment<T> =
  | { state: "found" | "awaiting-review"; largest: T; runnerUp: T; gap: number }
  | { state: "none"; largest: T | null; runnerUp: T | null; gap: number | null };

export interface MainshockOptions {
  /**
   * How far, in magnitude units, the largest event must stand above the next one. A policy, not a
   * constant of nature: Båth's law puts the largest aftershock ~1.2 below the mainshock on average,
   * with wide scatter, so a gap near 1 calls a sequence dominated by one event and misses some real
   * mainshocks rather than ever calling a swarm's largest event one.
   */
  minGap: number;
}

/**
 * Assess one catalogue. Recompute it whenever the catalogue changes and never keep the answer: the
 * label is **retrospective**. A later, larger event takes it, and the old mainshock becomes one of
 * that event's foreshocks.
 *
 * - The candidate is the largest event, reviewed or not. A larger automatic event is never passed
 *   over for a smaller reviewed one: it either waits for review or, if it does not stand clear,
 *   means there is no mainshock. Likewise an automatic event close in size counts as the runner-up.
 * - Magnitudes are compared as reported, whatever their types (ML, Mw, …). No conversion between
 *   scales is attempted; a caller that mixes types should say so where it shows the result.
 * - **Only the two largest events decide the answer**, and their order does not matter. A caller
 *   holding the catalogue in a database may pass just those two (`ORDER BY mag DESC LIMIT 2`).
 * - Withdrawn or deleted events must be left out by the caller.
 *
 * One pass, no sorting, no copies.
 */
export function assessMainshock<T extends { mag: number }>(
  events: Iterable<T>,
  isReviewed: (event: T) => boolean,
  { minGap }: MainshockOptions,
): MainshockAssessment<T> {
  let largest: T | null = null;
  let runnerUp: T | null = null;
  for (const e of events) {
    if (largest === null || tenths(e.mag) > tenths(largest.mag)) {
      runnerUp = largest;
      largest = e;
    } else if (runnerUp === null || tenths(e.mag) > tenths(runnerUp.mag)) runnerUp = e;
  }
  if (largest === null || runnerUp === null) return { state: "none", largest, runnerUp, gap: null };
  const gap = magnitudeGap(largest.mag, runnerUp.mag);
  if (tenths(gap) < tenths(minGap)) return { state: "none", largest, runnerUp, gap };
  return { state: isReviewed(largest) ? "found" : "awaiting-review", largest, runnerUp, gap };
}
