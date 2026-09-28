import { describe, expect, it } from "vitest";
import { BASE_H, bAxis } from "./b-axis";

// Pixels per unit of b on a plot `h` px tall with this axis: the slope a reader sees.
const perUnit = (a: ReturnType<typeof bAxis>, h: number) => (h - 46) / (a.domain[1] - a.domain[0]);

describe("the b-over-time axis", () => {
  it("is the data's range rounded out to tenths, and never narrower than 0.4–1.2, at rest", () => {
    expect(bAxis(0.5, 1.1, BASE_H).domain).toEqual([0.4, 1.2]);
    expect(bAxis(0.47, 1.36, BASE_H).domain).toEqual([0.4, 1.4]);
    expect(bAxis(0.31, 1.1, BASE_H).domain[0]).toBeCloseTo(0.3, 9);
  });

  it("keeps the same pixels per unit of b on a taller plot, so a fall in b is never drawn steeper", () => {
    const rest = bAxis(0.5, 1.1, BASE_H);
    for (const h of [400, 480, 623, 900]) {
      const tall = bAxis(0.5, 1.1, h);
      expect(perUnit(tall, h)).toBeCloseTo(perUnit(rest, BASE_H), 6);
      // The extra range is split evenly while it clears b = 0, so the data stays centred.
      if (tall.domain[0] > 0) expect(0.4 - tall.domain[0]).toBeCloseTo(tall.domain[1] - 1.2, 9);
    }
  });

  it("never runs below b = 0, and never shrinks under the resting range", () => {
    expect(bAxis(0.1, 0.9, 900).domain[0]).toBe(0);
    expect(bAxis(0.5, 1.1, 200).domain).toEqual([0.4, 1.2]);
  });

  it("ticks every 0.2 inside the axis", () => {
    const { domain, ticks } = bAxis(0.5, 1.1, 480);
    expect(ticks.every((v) => v >= domain[0] - 1e-9 && v <= domain[1] + 1e-9)).toBe(true);
    expect(ticks.map((v) => Math.round(v * 10) % 2)).toEqual(ticks.map(() => 0));
    expect(bAxis(0.5, 1.1, BASE_H).ticks).toEqual([0.4, 0.6, 0.8, 1, 1.2]);
  });
});
