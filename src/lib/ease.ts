/**
 * The page's motion curves, for what moves in JavaScript rather than in CSS. Each one is also a token in
 * `index.css`, and `test/ease-token.test.ts` holds the two to the same numbers.
 */

/** A CSS `cubic-bezier(x1, y1, x2, y2)`. */
export type Bezier = readonly [x1: number, y1: number, x2: number, y2: number];

/**
 * For a value moving to a new value, where start and end are both on screen: `--ease-move`. It leaves
 * gently and lands softly. The b card's marks, the digits beside them and the story's dots travel on it.
 */
export const EASE_MOVE: Bezier = [0.2, 0, 0, 1];
/** How long a value takes on `EASE_MOVE` beside the digits that roll with it: `--duration-move`. */
export const DURATION_MOVE_MS = 550;

/** The curve as CSS writes it. */
export const cssEasing = ([x1, y1, x2, y2]: Bezier) => `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`;

/**
 * The curve as a function of progress, 0 to 1, as a browser evaluates it: find the curve's parameter
 * whose x is the progress (Newton's method, then bisection if that stalls), and return its y.
 */
export function cubicBezier([x1, y1, x2, y2]: Bezier): (t: number) => number {
  // Each coordinate as a polynomial in the parameter s: ((a s + b) s + c) s.
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const x = (s: number) => ((ax * s + bx) * s + cx) * s;
  const y = (s: number) => ((ay * s + by) * s + cy) * s;
  const dx = (s: number) => (3 * ax * s + 2 * bx) * s + cx;
  const solve = (t: number) => {
    let s = t;
    for (let i = 0; i < 8; i++) {
      const err = x(s) - t;
      if (Math.abs(err) < 1e-7) return s;
      const d = dx(s);
      if (Math.abs(d) < 1e-6) break;
      s -= err / d;
    }
    let lo = 0;
    let hi = 1;
    s = t;
    while (hi - lo > 1e-7) {
      if (x(s) < t) lo = s;
      else hi = s;
      s = (lo + hi) / 2;
    }
    return s;
  };
  return (t) => (t <= 0 ? 0 : t >= 1 ? 1 : y(solve(t)));
}
