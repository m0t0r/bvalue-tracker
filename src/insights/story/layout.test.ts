import { describe, expect, it } from "vitest";
import { fitRanks, flowRow, type RankItem } from "./layout";

/** A stand-in for the font: every character half an em wide, bold ones a tenth wider. */
const measure = (t: string, fs: number, o?: { weight?: number }) =>
  t.length * fs * ((o?.weight ?? 400) > 500 ? 0.55 : 0.5);

const item = (id: string, mag: number, line1: string, line2 = "M6.1 · 89 veces menos energía"): RankItem => ({
  id,
  mag,
  main: false,
  line1,
  line1Short: line1.replace(/, \d\d:\d\d$/, ""),
  line2,
});
const items = [
  item("main", 7.4, "Chocó · 10 ago 2026, 07:34", "M7.4"),
  item("a", 7.2, "Eje Cafetero · 23 nov 1979, 18:40"),
  item("b", 6.1, "Armenia (Quindío) · 25 ene 1999, 13:19"),
  item("c", 5.6, "Popayán (Cauca) · 31 mar 1983, 08:12"),
];

describe("fitRanks", () => {
  it("keeps every label inside the drawing: the widest line ends at the right margin at most", () => {
    for (const width of [288, 343, 358]) {
      const f = fitRanks(items, { width, height: 290, small: true }, measure)!;
      const S = Math.max(...f.rows.map((r) => r.side));
      const widest = Math.max(
        ...items.map((i) =>
          Math.max(measure(f.short ? i.line1Short : i.line1, f.fs, { weight: 600 }), measure(i.line2, f.fs)),
        ),
      );
      expect(f.left + S + f.gap + widest).toBeLessThanOrEqual(width - f.left + 1e-9);
    }
  });

  it("steps the text down before it lets the largest square shrink under two rows", () => {
    // At 11 px the widest label (38 characters, ~230 px) leaves the squares under 54 px on a 288 px drawing.
    const f = fitRanks(items, { width: 288, height: 290, small: true }, measure)!;
    expect(f.fs).toBeLessThan(11);
    expect(Math.max(...f.rows.map((r) => r.side))).toBeGreaterThanOrEqual(2 * (2 * f.fs + 5) - 1e-9);
  });

  it("keeps the largest size when there is room", () => {
    expect(fitRanks(items, { width: 700, height: 600, small: false }, measure)!.fs).toBe(13);
  });

  it("drops the time from the first lines only when even the floor is too wide", () => {
    expect(fitRanks(items, { width: 288, height: 290, small: true }, measure)!.short).toBe(false);
    const narrow = fitRanks(items, { width: 240, height: 290, small: true }, measure)!;
    expect(narrow.short).toBe(true);
    expect(narrow.fs).toBe(9);
  });

  it("gives up when the rows cannot fit the height", () => {
    expect(fitRanks(items, { width: 288, height: 60, small: true }, measure)).toBeNull();
  });
});

describe("flowRow", () => {
  it("lays entries in one row while they fit", () => {
    expect(flowRow([50, 60, 40], 10, 200)).toEqual([
      { x: 0, row: 0 },
      { x: 60, row: 0 },
      { x: 130, row: 0 },
    ]);
  });

  it("starts a new row for an entry that would pass the width", () => {
    expect(flowRow([80, 80, 80], 12, 200)).toEqual([
      { x: 0, row: 0 },
      { x: 92, row: 0 },
      { x: 0, row: 1 },
    ]);
  });
});
