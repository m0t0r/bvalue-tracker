let measuring: CanvasRenderingContext2D | null | undefined;
/**
 * How wide `text` is in `font`, from a canvas: no layout, where Recharts' own measure writes each label
 * into a hidden span and reads its box. Null where there is no canvas to measure with. Before Geist has
 * loaded it measures the stand-in face, as Recharts' span did, and the labels are not chosen again when
 * Geist arrives, as Recharts' were not: the stand-in is cut to Geist's width, and choosing again would
 * draw the whole chart a second time inside a phone's load.
 */
export function textWidth(text: string, font: string): number | null {
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
