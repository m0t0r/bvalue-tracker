/**
 * When an earthquake's moment came out, from its source time function. Imports nothing, so
 * `scripts/insights-durations.ts` can run it under plain tsx before `durations.json` exists.
 */

/** When 5% and 95% of an event's moment had been released, in seconds on its file's own time axis. */
export interface Release {
  t5: number;
  t95: number;
}

/**
 * When 5% and 95% of the moment had been released, from a moment-rate function as `[seconds, rate]`
 * samples in time order, and the moment itself. Each sample's rate holds until the next sample (the
 * last one for the step before it), and a crossing is placed inside its step in proportion, so a
 * coarse sampling moves neither time by a whole step. A negative rate, which a deconvolved function can
 * dip to, counts as no release. The times are on the file's own axis, whose zero each source defines
 * differently; only their difference, `t95 − t5`, compares across sources.
 */
export function releaseTimes(rate: readonly (readonly [number, number])[]): Release & { moment: number } {
  if (rate.length < 2) throw new Error("releaseTimes: fewer than two samples");
  const step = (i: number) => (i + 1 < rate.length ? rate[i + 1]![0] - rate[i]![0] : rate[i]![0] - rate[i - 1]![0]);
  const parts = rate.map(([, r], i) => Math.max(0, r) * step(i));
  const moment = parts.reduce((a, b) => a + b, 0);
  if (!(moment > 0)) throw new Error("releaseTimes: no moment released");
  const crossing = (share: number) => {
    const target = share * moment;
    let before = 0;
    for (let i = 0; i < rate.length; i++) {
      const part = parts[i]!;
      if (part > 0 && before + part >= target) return rate[i]![0] + (step(i) * (target - before)) / part;
      before += part;
    }
    return rate[rate.length - 1]![0];
  };
  return { t5: crossing(0.05), t95: crossing(0.95), moment };
}
