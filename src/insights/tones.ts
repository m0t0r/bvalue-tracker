/**
 * Each source's colour, as static classes the design-system lint can read. Shallow blue and deep
 * teal are the monitor's; Chaparral's violet is `--chart-5` (see `index.css`); orange stays the
 * mainshock's. One map for both tabs, so a source is the same colour everywhere on the page.
 */
import type { Source } from "./claims";

export type Tone = Source | "mainshock";
/**
 * A theme token's current value, which a canvas can take as a colour. Reading it makes the browser work
 * out the page's styles on the spot, so a drawing reads its tokens once per theme, not per frame.
 */
export const token = (name: string, el: Element = document.documentElement) =>
  getComputedStyle(el).getPropertyValue(name).trim();

/** The same colours as the theme tokens behind them, for what is drawn on a canvas. */
export const TOKEN: Record<Tone, string> = {
  shallow: "--chart-1",
  deep: "--chart-4",
  tolima: "--chart-5",
  mainshock: "--chart-2",
};
export const FILL: Record<Tone, string> = {
  shallow: "fill-chart-1",
  deep: "fill-chart-4",
  tolima: "fill-chart-5",
  mainshock: "fill-chart-2",
};
export const STROKE: Record<Tone, string> = {
  shallow: "stroke-chart-1",
  deep: "stroke-chart-4",
  tolima: "stroke-chart-5",
  mainshock: "stroke-chart-2",
};
export const BG: Record<Tone, string> = {
  shallow: "bg-chart-1",
  deep: "bg-chart-4",
  tolima: "bg-chart-5",
  mainshock: "bg-chart-2",
};
