/**
 * How long "Actualizar ahora" rests after a press whose request failed (the Worker or the
 * connection, never SGC: an SGC failure is a 200 with a failed run). Each failure in a row doubles
 * the wait, from 5 s up to a minute, so a reader pressing on through an outage sends a handful of
 * requests rather than one a second to a server that is already failing. A refresh that works ends
 * the run, and so do two quiet minutes between failures. A status answer does not: GET /api/status
 * can answer from D1 while POST /api/refresh fails (docs/frontend.md).
 */
const FIRST_MS = 5_000;
const MAX_MS = 60_000;
/** A failure this long after the one before it starts a new run. */
const RUN_GAP_MS = 120_000;
/** Failures past this many no longer lengthen the wait (5 s × 2⁴ is already over a minute). */
const KEPT = 5;

/** The wait after `failures` presses have failed in a row. */
export function cooldownMs(failures: number): number {
  return failures === 0 ? 0 : Math.min(FIRST_MS * 2 ** (failures - 1), MAX_MS);
}

/**
 * When the button takes presses again, or null before any press has failed. `failures` are the
 * times presses failed, oldest first; the run is the newest ones, each within `RUN_GAP_MS` of the next.
 */
export function retryAt(failures: readonly number[]): number | null {
  const last = failures.at(-1);
  if (last === undefined) return null;
  let run = 1;
  while (run < failures.length && failures.at(-run)! - failures.at(-run - 1)! <= RUN_GAP_MS) run++;
  return last + cooldownMs(run);
}

/** The list with one more failure, keeping only as many as can lengthen the wait. */
export function recordFailure(failures: readonly number[], at: number): number[] {
  return [...failures, at].slice(-KEPT);
}
