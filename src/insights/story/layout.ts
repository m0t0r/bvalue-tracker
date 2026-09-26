/**
 * Layouts of the pinned drawing that depend on how wide their text is, kept apart from the drawing
 * so they can be tested. Widths come from `measure`, which is `textWidth` in the page.
 */
import { rankLayout, type RankRow } from "../history";
import { textWidth } from "../measure";

type Measure = (text: string, fontSize: number, opts?: { weight?: number }) => number;

/** The energy drawing's labels step down from these sizes, a pixel at a time, to the floor. */
export const RANK_FS = { small: 11, wide: 13, floor: 9 } as const;

export interface RankItem {
  id: string;
  mag: number;
  main: boolean;
  /** The row's first line, bold: place and date with the time. */
  line1: string;
  /** The same without the time, for a drawing too narrow for the full line even at the floor. */
  line1Short: string;
  line2: string;
}

export interface RankFit {
  fs: number;
  rows: RankRow[];
  /** Whether the rows' first lines are `line1Short`. */
  short: boolean;
  /** The squares' left edge; the labels end as far from the right edge. */
  left: number;
  /** Between the largest square and the labels. */
  gap: number;
}

/**
 * Squares true to energy, one per row, with each row's two lines of text beside the largest square.
 * The text is measured, and its widest line decides how much room the squares get. The labels step
 * down a pixel at a time (to 9 px) until the rows fit the height and the largest square is at least
 * two rows tall; if even the floor does not do it, the first lines drop the time. `null` when
 * nothing fits.
 */
export function fitRanks(
  items: readonly RankItem[],
  { width, height, small }: { width: number; height: number; small: boolean },
  measure: Measure = textWidth,
): RankFit | null {
  if (!items.length) return null;
  const gap = small ? 10 : 16;
  const left = small ? 6 : 24;
  for (const short of [false, true]) {
    for (let fs: number = small ? RANK_FS.small : RANK_FS.wide; fs >= RANK_FS.floor; fs--) {
      const labelW = Math.max(
        ...items.map((i) =>
          Math.max(measure(short ? i.line1Short : i.line1, fs, { weight: 600 }), measure(i.line2, fs)),
        ),
      );
      const minRow = 2 * fs + (small ? 5 : 8);
      const maxSide = width - 2 * left - gap - labelW;
      if (maxSide < 2 * minRow) continue;
      const { rows } = rankLayout(
        items.map((i) => i.mag),
        { height, maxSide, minRow, gap: small ? 3 : 8 },
      );
      if (rows.length) return { fs, rows, short, left, gap };
    }
  }
  return null;
}

/**
 * Legend entries laid out left to right, each `widths[i]` wide and `gap` apart, starting a new row
 * when the next one would pass `maxWidth`. Returns each entry's x and row.
 */
export function flowRow(widths: readonly number[], gap: number, maxWidth: number): { x: number; row: number }[] {
  let x = 0;
  let row = 0;
  return widths.map((w) => {
    if (x > 0 && x + w > maxWidth) {
      x = 0;
      row++;
    }
    const at = { x, row };
    x += w + gap;
    return at;
  });
}
