import { describe, expect, it } from "vitest";
import { EASE_MOVE, cubicBezier, cssEasing } from "./ease";

/** The curve's point at parameter s, straight from the Bézier's definition. */
const point = ([x1, y1, x2, y2]: readonly [number, number, number, number], s: number) => {
  const b = (p1: number, p2: number) => 3 * (1 - s) ** 2 * s * p1 + 3 * (1 - s) * s ** 2 * p2 + s ** 3;
  return [b(x1, x2), b(y1, y2)] as const;
};

describe("cubicBezier", () => {
  it("is CSS's cubic-bezier: at the curve's own x it gives the curve's own y", () => {
    const f = cubicBezier(EASE_MOVE);
    for (let s = 0.05; s < 1; s += 0.05) {
      const [x, y] = point(EASE_MOVE, s);
      expect(f(x)).toBeCloseTo(y, 5);
    }
  });

  it("starts at 0, ends at 1 and clamps outside them", () => {
    const f = cubicBezier(EASE_MOVE);
    expect(f(0)).toBe(0);
    expect(f(1)).toBe(1);
    expect(f(-0.5)).toBe(0);
    expect(f(2)).toBe(1);
  });

  it("is the identity for the linear curve", () => {
    const f = cubicBezier([0, 0, 1, 1]);
    for (const t of [0.1, 0.25, 0.5, 0.9]) expect(f(t)).toBeCloseTo(t, 6);
  });
});

describe("cssEasing", () => {
  // `test/ease-token.test.ts` holds `EASE_MOVE` to `index.css` through it.
  it("writes the curve as CSS writes it, its four numbers in order", () => {
    expect(cssEasing([0.25, 0.1, 0.25, 1])).toBe("cubic-bezier(0.25, 0.1, 0.25, 1)");
  });
});
