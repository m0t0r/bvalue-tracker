/**
 * The step a pixel at a time down to a font size that fits, which the story's energy squares, duration
 * bars and group legend take. A file of its own, apart from `fitRegion`, which both tabs use: the
 * bundle splits by file, so beside it this went into the chunk both tabs load.
 */

/** The floor a drawing's text steps down to: under 9 px it stops being read. */
export const FONT_FLOOR = 9;

/**
 * The largest font size from `from` down, a pixel at a time, at which `fits` holds; the last step is
 * the floor itself, so 11.5 tries 10.5, 9.5 and 9. Null when not even the floor fits, and for a start
 * that is not a finite number, which would never reach the floor.
 */
export function largestFit(from: number, fits: (fontSize: number) => boolean, floor = FONT_FLOOR): number | null {
  if (!Number.isFinite(from)) return null;
  for (let fs = from; ; fs = Math.max(floor, fs - 1)) {
    if (fits(fs)) return fs;
    if (fs <= floor) return null;
  }
}
