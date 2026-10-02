/**
 * How wide a chart's labels are, to choose which of them to draw. The insights page measures its labels
 * with a function of its own (`textWidth` in `src/insights/drawing/measure.ts`), and the two stay apart
 * because their callers need opposite things: that one reserves room, padding every width by 3 % and
 * guessing one without a canvas, where this one reproduces a recorded choice of labels
 * (`test/fixtures/recharts-3.10.1-ticks.json`), and so measures exactly and pads nothing.
 */
let measuring: CanvasRenderingContext2D | null | undefined;
/**
 * How wide `text` is in `font`, from a canvas: no layout, where Recharts' own measure writes each label
 * into a hidden span and reads its box. Null where there is no canvas to measure with. Before Geist has
 * loaded it measures the stand-in face, as Recharts' span did, and the labels are not chosen again when
 * Geist arrives, as Recharts' were not: the stand-in is cut to Geist's width, and choosing again would
 * draw the whole chart a second time inside a phone's load.
 */
function textWidth(text: string, font: string): number | null {
  if (measuring === undefined) measuring = document.createElement("canvas").getContext("2d") ?? null;
  if (!measuring) return null;
  measuring.font = font;
  return measuring.measureText(text).width;
}

/**
 * How wide an axis label is, to choose which labels fit: measured on a canvas, or, in a browser with no
 * canvas to measure with, taken as 0.6 em a character. That is a little wider than Geist's digits and
 * letters, so such a browser drops a label sooner and never draws two that touch.
 */
export function labelWidth(label: string, font: string): number {
  return textWidth(label, font) ?? label.length * 0.6 * (parseFloat(font) || 12);
}
