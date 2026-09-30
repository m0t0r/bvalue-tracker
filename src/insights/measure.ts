import { useSyncExternalStore } from "react";

/**
 * The width of a line of SVG text in the page's font, for drawings that must reserve room for their
 * labels. Measured once on a canvas and cached; without a canvas (the unit tests) it falls back to a
 * generous estimate. A width measured before the web font has loaded is used but not cached, so a
 * later call measures again in the real font. A component calls it through `useTextWidth`, which
 * is what makes that later call happen.
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

/** `textWidth` while the web font is still on its way: the same measurement under another identity. */
const textWidthInStandIn: typeof textWidth = (text, fontSize, options) => textWidth(text, fontSize, options);

const onFontsLoaded = (notify: () => void) => {
  if (typeof document === "undefined" || !document.fonts) return () => {};
  document.fonts.addEventListener("loadingdone", notify);
  return () => document.fonts.removeEventListener("loadingdone", notify);
};
const webFontLoaded = () =>
  typeof document === "undefined" ||
  !document.fonts ||
  document.fonts.check(`12px ${getComputedStyle(document.documentElement).fontFamily || "sans-serif"}`);

/**
 * `textWidth` for a component, as a value React can see change. A drawing laid out before the web
 * font has loaded is measured in the stand-in face, and has to be measured again when the font
 * arrives. Nothing told React so: the layout was redone only if something else happened to render the
 * drawing again, and compiled by React Compiler not even then, since a component keeps what it
 * computed until one of its inputs changes and a module's function never does (issue #130's code
 * review). This returns a different function once the font is in, so the component renders again
 * and every layout made from it is redone, once.
 */
export function useTextWidth(): typeof textWidth {
  const loaded = useSyncExternalStore(onFontsLoaded, webFontLoaded, () => true);
  return loaded ? textWidth : textWidthInStandIn;
}
