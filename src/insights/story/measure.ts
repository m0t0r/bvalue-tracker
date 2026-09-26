/**
 * The width of a line of SVG text in the page's font, for drawings that must reserve room for their
 * labels. Measured once on a canvas and cached; without a canvas (the unit tests) it falls back to a
 * generous estimate. A width measured before the web font has loaded is used but not cached, so the
 * next render measures again in the real font.
 */
let ctx: CanvasRenderingContext2D | null | undefined;
let family = "";
const cache = new Map<string, number>();

export function textWidth(
  text: string,
  fontSize: number,
  { weight = 400, letterSpacingEm = 0, uppercase = false } = {},
): number {
  const s = uppercase ? text.toUpperCase() : text;
  const spacing = letterSpacingEm * fontSize * s.length;
  if (ctx === undefined) {
    ctx = typeof document === "undefined" ? null : (document.createElement("canvas").getContext("2d") ?? null);
    family = ctx ? getComputedStyle(document.documentElement).fontFamily : "";
  }
  // Tabular figures, which the labels' numbers use, are a little wider than the canvas's own.
  if (!ctx || !family) return s.length * fontSize * 0.62 + spacing;
  const font = `${weight} ${fontSize}px ${family}`;
  const key = `${font}|${s}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit + spacing;
  ctx.font = font;
  const w = ctx.measureText(s).width * 1.03;
  if (document.fonts.check(font)) cache.set(key, w);
  return w + spacing;
}
