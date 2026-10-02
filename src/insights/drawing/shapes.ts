/**
 * Dot sizes and the mainshock's star and the diamond, which only the story draws today. A file of its
 * own, apart from the marks both tabs draw: the bundle splits by file, so beside them these went into
 * the chunk both tabs load, and the questions tab downloaded them for nothing.
 */

/** Dot radius for a magnitude, in px at scale `k`. Area grows with magnitude, never below a visible minimum. */
export const radius = (mag: number, k = 1) => Math.max(1.3, (mag - 1.6) * 1.15) * k;

/** A five-pointed star centred on the origin, for the mainshock. */
export function star(r: number) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push(`${(Math.cos(a) * rr).toFixed(2)},${(Math.sin(a) * rr).toFixed(2)}`);
  }
  return `M${pts.join("L")}Z`;
}

/** A diamond centred on the origin with half-diagonal `r`. */
export const diamond = (r: number) => `M0,${-r}L${r},0L0,${r}L${-r},0Z`;
