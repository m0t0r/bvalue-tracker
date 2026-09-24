import { describe, expect, it } from "vitest";
import {
  bDifference,
  bValue,
  bValueWindows,
  dominantMagType,
  fmd,
  mcGoodnessOfFit,
  mcMaxCurvature,
} from "../src/index.ts";

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

describe("dominantMagType", () => {
  it("names the most common type", () => {
    const t = (magType: string) => ({ magType });
    expect(dominantMagType([t("MLr_1"), t("MLv"), t("MLr_1"), t("Mw")])).toBe("MLr_1");
  });

  it("is null when there is nothing to separate", () => {
    expect(dominantMagType([])).toBeNull();
    expect(dominantMagType([{ magType: "MLr_1" }, { magType: "MLr_1" }])).toBeNull();
  });
});

describe("bDifference", () => {
  it("matches Utsu's formula worked by hand", () => {
    // N = 537: -2·537·ln 537 + 2·447·ln(447 + 90·0.732/0.816) + 2·90·ln(447·0.816/0.732 + 90) - 2
    const d = bDifference({ n: 447, b: 0.732 }, { n: 90, b: 0.816 });
    expect(d.dAic).toBeCloseTo(-1.137, 3);
    expect(d.p).toBeCloseTo(0.239, 3);
  });

  it("does not care which sample comes first", () => {
    const x = { n: 447, b: 0.732 },
      y = { n: 90, b: 0.816 };
    expect(bDifference(x, y).dAic).toBeCloseTo(bDifference(y, x).dAic, 10);
  });

  it("charges identical b-values the full penalty for the extra parameter, and never reports p above 1", () => {
    const d = bDifference({ n: 300, b: 0.9 }, { n: 120, b: 0.9 });
    expect(d.dAic).toBeCloseTo(-2, 10);
    expect(d.p).toBeCloseTo(Math.exp(-1), 10);
    expect(bDifference({ n: 2, b: 1 }, { n: 2, b: 1.0001 }).p).toBeLessThanOrEqual(1);
  });

  it("sees a real difference and mostly ignores chance ones", () => {
    const fit = (b: number, seed: number) => bValue(synthetic(500, b, 2.0, seed), 2.0);
    expect(bDifference(fit(0.7, 1), fit(1.1, 2)).p).toBeLessThan(0.001);
    let falseAlarms = 0;
    for (let seed = 0; seed < 200; seed++)
      if (bDifference(fit(0.9, 1000 + seed), fit(0.9, 5000 + seed)).p < 0.05) falseAlarms++;
    expect(falseAlarms / 200).toBeLessThan(0.08);
  });
});
