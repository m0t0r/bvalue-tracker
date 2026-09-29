import { describe, expect, it } from "vitest";
import { at, settled, toward, type Motion } from "./glide";

// Linear and 1 s, so the expected values can be read off the times.
const m: Motion = { ease: (t) => t, ms: 1000 };
const still = (v: number[]) => toward(undefined, v, 0, 0, m);

describe("toward", () => {
  it("puts a mark it has not seen at its target at once", () => {
    const tw = toward(undefined, [10, 20], 5000, 300, m);
    expect(at(tw, 5000, m)).toEqual([10, 20]);
    expect(settled(tw, 5000)).toBe(true);
  });

  it("waits out the delay at the old value, then glides for the motion's length", () => {
    const tw = toward(still([0, 0]), [100, 50], 1000, 200, m);
    expect(at(tw, 1100, m)).toEqual([0, 0]);
    expect(at(tw, 1200, m)).toEqual([0, 0]);
    expect(at(tw, 1700, m)).toEqual([50, 25]);
    expect(settled(tw, 1700)).toBe(false);
    expect(at(tw, 2200, m)).toEqual([100, 50]);
    expect(at(tw, 9000, m)).toEqual([100, 50]);
    expect(settled(tw, 2200)).toBe(true);
  });

  it("keeps a glide's course when the target has not changed", () => {
    const tw = toward(still([0]), [1], 1000, 0, m);
    expect(toward(tw, [1], 1400, 0, m)).toBe(tw);
  });

  it("turns from wherever the mark is towards a new target, for the full length", () => {
    const tw = toward(still([0]), [100], 1000, 0, m);
    const on = toward(tw, [200], 1400, 0, m);
    expect(at(on, 1400, m)).toEqual([40]);
    expect(at(on, 1900, m)).toEqual([120]);
    expect(at(on, 2400, m)).toEqual([200]);
  });

  // CSS Transitions §3, the reversing shortening factor: a glide sent back where it came from takes
  // only as long as it had travelled, so a reader who scrolls back does not wait a full second.
  it("sent back mid-glide, returns in the part of the length it had travelled, after its delay", () => {
    const tw = toward(still([0]), [100], 1000, 0, m);
    const back = toward(tw, [0], 1400, 100, m);
    expect(at(back, 1500, m)).toEqual([40]);
    expect(at(back, 1700, m)[0]).toBeCloseTo(20, 9);
    expect(at(back, 1900, m)).toEqual([0]);
    expect(settled(back, 1899)).toBe(false);
    expect(settled(back, 1900)).toBe(true);
  });

  it("measures the part travelled after the curve, as CSS does", () => {
    const square: Motion = { ease: (t) => t * t, ms: 1000 };
    const tw = toward(toward(undefined, [0], 0, 0, square), [100], 0, 0, square);
    // Half the time is a quarter of the way: the way back takes a quarter of the length.
    const back = toward(tw, [0], 500, 0, square);
    expect(at(back, 500, square)).toEqual([25]);
    expect(settled(back, 749)).toBe(false);
    expect(settled(back, 750)).toBe(true);
  });

  it("sent forward again, shortens by what the way back had covered", () => {
    const tw = toward(still([0]), [100], 0, 0, m);
    const back = toward(tw, [0], 400, 0, m); // 40 → 0 in 400 ms
    const again = toward(back, [100], 600, 0, m); // at 20; factor 0.5 × 0.4 + 1 − 0.4 = 0.8
    expect(at(again, 600, m)[0]).toBeCloseTo(20, 9);
    expect(at(again, 1000, m)[0]).toBeCloseTo(60, 9);
    expect(settled(again, 1400)).toBe(true);
  });

  it("sent back before it has moved, stays where it is", () => {
    const tw = toward(still([0]), [100], 1000, 300, m);
    const back = toward(tw, [0], 1100, 300, m);
    expect(at(back, 1100, m)).toEqual([0]);
    expect(settled(back, 1100)).toBe(true);
  });

  it("jumps with no motion, for a reader who asked for less", () => {
    const tw = toward(still([0]), [100], 1000, 300, m, true);
    expect(at(tw, 1000, m)).toEqual([100]);
    expect(settled(tw, 1000)).toBe(true);
  });

  it("eases the progress, not the time", () => {
    const square: Motion = { ease: (t) => t * t, ms: 1000 };
    const tw = toward(toward(undefined, [0], 0, 0, square), [100], 0, 0, square);
    expect(at(tw, 500, square)).toEqual([25]);
  });
});
