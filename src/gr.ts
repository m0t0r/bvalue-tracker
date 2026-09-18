/**
 * Gutenberg–Richter statistics: log10 N(>=M) = a - b*M.
 * Magnitudes are handled as integer bin indices (round(m / dm)) throughout so
 * that 2.3 >= 2.3 never fails on floating-point noise.
 */

export const DEFAULT_DM = 0.1;
const LOG10_E = Math.LOG10E;

const bin = (m: number, dm: number) => Math.round(m / dm);

export interface FmdBin {
  mag: number;
  count: number;
  /** Number of events with magnitude >= this bin. */
  cumulative: number;
}

/** Frequency–magnitude distribution over contiguous bins from min to max magnitude. */
export function fmd(mags: readonly number[], dm = DEFAULT_DM): FmdBin[] {
  if (mags.length === 0) return [];
  const ks = mags.map((m) => bin(m, dm));
  let lo = Infinity, hi = -Infinity;
  for (const k of ks) { if (k < lo) lo = k; if (k > hi) hi = k; }
  const counts = new Array<number>(hi - lo + 1).fill(0);
  for (const k of ks) counts[k - lo]!++;
  const out: FmdBin[] = [];
  let cum = 0;
  for (let i = counts.length - 1; i >= 0; i--) {
    cum += counts[i]!;
    out.unshift({ mag: Number(((lo + i) * dm).toFixed(6)), count: counts[i]!, cumulative: cum });
  }
  return out;
}

/**
 * Magnitude of completeness by maximum curvature: the modal bin of the
 * non-cumulative FMD, plus the customary +0.2 correction (Woessner & Wiemer 2005).
 */
export function mcMaxCurvature(mags: readonly number[], dm = DEFAULT_DM, correction = 0.2): number {
  const bins = fmd(mags, dm);
  if (bins.length === 0) throw new Error("no magnitudes");
  let best = bins[0]!;
  for (const b of bins) if (b.count > best.count) best = b;
  return Number((best.mag + correction).toFixed(6));
}

export interface BValue {
  mc: number;
  b: number;
  /** Shi & Bolt (1982) standard error. */
  sigmaB: number;
  a: number;
  /** Events with magnitude >= mc. */
  n: number;
  meanMag: number;
}

/** Aki (1965) maximum-likelihood b with Utsu's dm/2 correction for binned magnitudes. */
export function bValue(mags: readonly number[], mc: number, dm = DEFAULT_DM): BValue {
  const kc = bin(mc, dm);
  const m = mags.filter((x) => bin(x, dm) >= kc);
  const n = m.length;
  if (n < 2) throw new Error(`only ${n} events at or above Mc=${mc}`);
  const meanMag = m.reduce((s, x) => s + x, 0) / n;
  const denom = meanMag - (mc - dm / 2);
  if (denom <= 0) throw new Error("mean magnitude does not exceed Mc - dm/2");
  const b = LOG10_E / denom;
  const ss = m.reduce((s, x) => s + (x - meanMag) ** 2, 0);
  const sigmaB = 2.3 * b * b * Math.sqrt(ss / (n * (n - 1)));
  return { mc, b, sigmaB, a: Math.log10(n) + b * mc, n, meanMag };
}

/**
 * Magnitude of completeness by goodness of fit (Wiemer & Wyss 2000): the lowest
 * Mc for which a G-R law fitted above it reproduces at least `target` percent
 * of the observed cumulative FMD. Returns null if no candidate qualifies.
 */
export function mcGoodnessOfFit(
  mags: readonly number[], dm = DEFAULT_DM, target = 90, minEvents = 50,
): number | null {
  for (const candidate of fmd(mags, dm)) {
    if (candidate.cumulative < minEvents) break;
    let fit: BValue;
    try { fit = bValue(mags, candidate.mag, dm); } catch { continue; }
    const above = fmd(mags, dm).filter((x) => bin(x.mag, dm) >= bin(candidate.mag, dm));
    let absDiff = 0, total = 0;
    for (const x of above) {
      absDiff += Math.abs(x.cumulative - 10 ** (fit.a - fit.b * x.mag));
      total += x.cumulative;
    }
    if (100 * (1 - absDiff / total) >= target) return candidate.mag;
  }
  return null;
}

export interface BWindow extends BValue {
  /** ISO times of the first and last event in the window. */
  from: string;
  to: string;
}

/**
 * b over time: sliding windows of `size` events at or above a FIXED mc, advancing
 * by `step`. A fixed Mc is deliberate; letting Mc float per window mostly
 * measures changes in network detection, not in the earthquakes.
 */
export function bValueWindows(
  events: readonly { time: string; mag: number }[], mc: number, size = 150, step = 25, dm = DEFAULT_DM,
): BWindow[] {
  const kc = bin(mc, dm);
  const complete = events.filter((e) => bin(e.mag, dm) >= kc).sort((x, y) => x.time.localeCompare(y.time));
  const out: BWindow[] = [];
  for (let i = 0; i + size <= complete.length; i += step) {
    const w = complete.slice(i, i + size);
    out.push({ ...bValue(w.map((e) => e.mag), mc, dm), from: w[0]!.time, to: w[w.length - 1]!.time });
  }
  return out;
}
