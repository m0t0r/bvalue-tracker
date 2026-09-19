import { describe, expect, it } from "vitest";
import { bValue, bValueWindows, fmd, mcGoodnessOfFit, mcMaxCurvature } from "../core/gr.ts";

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Synthetic G-R catalogue: continuous magnitudes are exponential above
 * (mMin - 0.05), then rounded to 0.1 as a real catalogue reports them.
 */
function synthetic(n: number, b: number, mMin: number, seed: number): number[] {
  const rnd = mulberry32(seed);
  const beta = b * Math.LN10;
  return Array.from({ length: n }, () => {
    const m = mMin - 0.05 - Math.log(1 - rnd()) / beta;
    return Math.round(m * 10) / 10;
  });
}

describe("fmd", () => {
  it("bins, fills gaps, and accumulates from the top", () => {
    expect(fmd([2.0, 2.0, 2.1, 2.3])).toEqual([
      { mag: 2.0, count: 2, cumulative: 4 },
      { mag: 2.1, count: 1, cumulative: 2 },
      { mag: 2.2, count: 0, cumulative: 1 },
      { mag: 2.3, count: 1, cumulative: 1 },
    ]);
  });

  it("is immune to floating-point bin edges", () => {
    // 0.1 + 0.2 === 0.30000000000000004 must land in the 0.3 bin.
    expect(fmd([0.1 + 0.2, 0.3]).map((b) => b.count)).toEqual([2]);
  });
});

describe("bValue (Aki–Utsu)", () => {
  it.each([0.7, 1.0, 1.3])("recovers a known b=%s from a synthetic catalogue", (trueB) => {
    const r = bValue(synthetic(20_000, trueB, 2.0, 42), 2.0);
    expect(r.n).toBe(20_000);
    expect(Math.abs(r.b - trueB)).toBeLessThan(0.03);
    // The true value must sit inside 3 sigma, and sigma must be the right order (b / sqrt(n)).
    expect(Math.abs(r.b - trueB)).toBeLessThan(3 * r.sigmaB);
    expect(r.sigmaB).toBeCloseTo(trueB / Math.sqrt(20_000), 2);
  });

  it("matches a hand-computed value", () => {
    // mean = 2.5, Mc - dm/2 = 1.95 → b = log10(e) / 0.55
    const r = bValue([2.0, 2.0, 3.0, 3.0], 2.0);
    expect(r.b).toBeCloseTo(0.4342944819 / 0.55, 9);
    expect(r.a).toBeCloseTo(Math.log10(4) + r.b * 2.0, 9);
  });

  it("only uses events at or above Mc, inclusive of the Mc bin", () => {
    expect(bValue([1.0, 1.5, 2.0, 2.0, 3.0, 3.0], 2.0).n).toBe(4);
  });

  it("is biased upward when Mc is set below true completeness — the failure to avoid", () => {
    const rnd = mulberry32(7);
    // b=1 catalogue complete from 2.5, with most events below 2.5 undetected.
    const mags = synthetic(30_000, 1.0, 1.5, 7).filter((m) => m >= 2.5 || rnd() < 0.15);
    expect(Math.abs(bValue(mags, 2.5).b - 1.0)).toBeLessThan(0.05);
    expect(bValue(mags, 1.5).b).toBeLessThan(0.8);
  });

  it("refuses to estimate from fewer than two events", () => {
    expect(() => bValue([2.0], 2.0)).toThrow(/only 1 events/);
  });
});

describe("magnitude of completeness", () => {
  const rnd = mulberry32(11);
  // Detection probability ramps 0→1 between M1.5 and M2.5.
  const thinned = synthetic(60_000, 1.0, 1.0, 11).filter((m) => rnd() < Math.min(1, Math.max(0, m - 1.5)));

  it("MAXC lands near the true completeness magnitude", () => {
    const mc = mcMaxCurvature(thinned);
    expect(mc).toBeGreaterThanOrEqual(2.3);
    expect(mc).toBeLessThanOrEqual(2.8);
  });

  it("GFT lands near the true completeness magnitude and yields an unbiased b", () => {
    const mc = mcGoodnessOfFit(thinned);
    expect(mc).not.toBeNull();
    expect(mc!).toBeGreaterThanOrEqual(2.0);
    expect(mc!).toBeLessThanOrEqual(2.8);
    expect(Math.abs(bValue(thinned, 2.5).b - 1.0)).toBeLessThan(0.05);
  });

  it("MAXC is the modal bin plus 0.2", () => {
    expect(mcMaxCurvature([2.0, 2.1, 2.1, 2.1, 2.2, 2.5])).toBeCloseTo(2.3, 9);
  });

  it("GFT returns null when there are too few events", () => {
    expect(mcGoodnessOfFit([2.0, 2.1, 2.2])).toBeNull();
  });
});

describe("bValueWindows", () => {
  it("slides fixed-size windows in time order above a fixed Mc", () => {
    const mags = synthetic(400, 1.0, 2.0, 3);
    const events = mags.map((mag, i) => ({ mag, time: new Date(Date.UTC(2026, 7, 10) + i * 3_600_000).toISOString() }));
    const w = bValueWindows([...events].reverse(), 2.0, 150, 50);
    expect(w).toHaveLength(6); // starts at 0,50,...,250
    expect(w.every((x) => x.n === 150)).toBe(true);
    expect(w[0]!.from).toBe(events[0]!.time);
    expect(w[1]!.from).toBe(events[50]!.time);
    expect(w[0]!.from < w[0]!.to).toBe(true);
  });
});
