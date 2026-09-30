/**
 * What the pixel background (`pixels.ts`) and its header text (`pixel-text.ts`) share: the shape of
 * what they are given, the ordered dither every fade and halftone steps through, and the reads of
 * the reader's device and theme. Everything is drawn in the theme's own ink, so it follows both
 * themes and adds no colour but the mainshock's.
 */
export interface BackdropEvent {
  t: number;
  lat: number;
  lon: number;
  mag: number;
}

export interface BackdropInput {
  events: BackdropEvent[];
}

export interface Backdrop {
  /** A new catalogue: redraw, and mark whatever is new. */
  update(input: BackdropInput): void;
  destroy(): void;
}

export type BackdropFactory = (canvas: HTMLCanvasElement, input: BackdropInput) => Backdrop;

// prettier-ignore
const BAYER = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26,
  12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
  3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25,
  15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
].map((v) => (v + 0.5) / 64);
/** The ordered-dither threshold at a pixel (Bayer 8×8), 0 to 1: what every fade and halftone here steps through. */
export const bayer = (x: number, y: number) => BAYER[(y & 7) * 8 + (x & 7)]!;

export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
/**
 * A mouse or a trackpad: the hover version. Anything else (a finger) gets the epicenter and its
 * rings. To see a phone's version headlessly, emulate a touch device (Chrome DevTools MCP `emulate`
 * with `390x844x3,mobile,touch`); agent-browser's viewport alone keeps a fine pointer.
 */
export const finePointer = () => matchMedia("(hover: hover) and (pointer: fine)").matches;
export const isDark = () => document.documentElement.classList.contains("dark");

/**
 * A CSS colour as sRGB, 0–255, read by painting it on a pixel: `getComputedStyle` gives `oklch()`
 * here, which is no use for channel numbers.
 */
export function cssRgb(colour: string): [number, number, number] {
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [128, 128, 128];
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return [r!, g!, b!];
}

/** A theme token as sRGB, 0–255. */
export const tokenRgb = (name: string) =>
  cssRgb(getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888");

/**
 * Calls `redraw` on a switch of theme (the `dark` class on `<html>`) or language (its `lang`), after
 * the frame React draws the new header in, since its words are read from the page; and `resized` on
 * a resize, which decides for itself whether anything moved (a phone's toolbar sliding away resizes
 * the window and moves nothing).
 */
export function onEnvChange(redraw: () => void, resized: () => void): () => void {
  const mo = new MutationObserver(() => requestAnimationFrame(redraw));
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "lang"] });
  addEventListener("resize", resized);
  return () => {
    mo.disconnect();
    removeEventListener("resize", resized);
  };
}

/** A small, fast, seeded noise (value noise with smooth interpolation), for textures that must not flicker. */
export function valueNoise(seed = 1) {
  const hash = (x: number, y: number) => {
    let h = (x * 374761393 + y * 668265263 + seed * 144269504) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = smooth(x - xi);
    const yf = smooth(y - yi);
    const a = hash(xi, yi);
    const b = hash(xi + 1, yi);
    const c = hash(xi, yi + 1);
    const d = hash(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
}
