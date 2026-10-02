/**
 * What the insights page's drawings share, on the story's tab and the questions' (issue #155): how wide
 * a label is (`useTextWidth`), where labels go (`place.ts`), the step down to a font size that fits
 * (`largestFit`), the outline map fitted to a box (`fitRegion`), the kilometres in a degree, the marks
 * both draw (the halo, a town, Pereira) and the shapes (the star, the diamond, a dot's size). It is a
 * module of the page and not a package: each piece names the page's tokens, towns or region.
 *
 * One file per set of users: the bundle splits by file, so a piece only one tab draws, in a file the
 * other tab imports, would be downloaded by both.
 */
export { fitRegion, type FittedRegion } from "./fit";
export { FONT_FLOOR, largestFit } from "./largest-fit";
export { KM_PER_DEG, kmPerDegLon } from "./km";
export { HaloText, PereiraMark, TownMark, pereiraLook, type PereiraLook } from "./marks";
export { diamond, radius, star } from "./shapes";
export { textWidth, useTextWidth } from "./measure";
export {
  INSIGHTS_LABEL_GAP,
  crosses,
  crossesRing,
  firstClear,
  forwardLabels,
  overlaps,
  textBox,
  type Box,
} from "./place";
