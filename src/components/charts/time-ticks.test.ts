import type { getTicks as GetTicks } from "recharts/types/cartesian/getTicks";
import { describe, expect, it, vi } from "vitest";
import { preserveEndTicks } from "./time-ticks";

// Recharts' own rule, with its DOM measure answered from `widths`, to hold `preserveEndTicks` to it: a
// Recharts release that changes the rule fails here rather than moving the chart's labels unseen.
const widths = new Map<string, number>();
vi.mock("recharts/es6/util/DOMUtils", async (original) => ({
  ...(await original<object>()),
  getStringSize: (text: string) => ({ width: widths.get(text) ?? 0, height: 12 }),
}));
const { getTicks } = (await import("recharts/es6/cartesian/getTicks" as string)) as { getTicks: typeof GetTicks };

// Candidates are their own coordinates here, and every label is 20 px wide unless said.
const layout = { x: (v: number) => v, width: () => 20, start: 0, end: 300, gap: 40 };

describe("the labels 'Valor b en el tiempo' draws on its time axis", () => {
  it("keeps the last candidate, then each earlier one that clears the label after it by the gap", () => {
    // Each kept label needs 20/2 + 40 + 20/2 = 60 px to the next kept one.
    expect(preserveEndTicks([0, 30, 60, 90, 120, 150, 180, 210, 240, 270], layout)).toEqual([30, 90, 150, 210, 270]);
  });

  it("measures each label, so a wide one pushes the label before it further away", () => {
    expect(preserveEndTicks([100, 140, 200, 280], layout)).toEqual([140, 200, 280]);
    // At 60 px, 200 leaves room only up to 200 - 30 - 40 = 130: 140 is out, 100 is in.
    const width = (v: number) => (v === 200 ? 60 : 20);
    expect(preserveEndTicks([100, 140, 200, 280], { ...layout, width })).toEqual([100, 200, 280]);
  });

  it("drops a label that would cross the start of the chart", () => {
    expect(preserveEndTicks([5, 100, 290], layout)).toEqual([100, 290]);
    expect(preserveEndTicks([10, 100, 290], layout)).toEqual([10, 100, 290]);
  });

  it("keeps the last label when it crosses the end, pulled back inside as Recharts pulls it", () => {
    // 295 would run 5 px past 300; Recharts draws it from 290, so the room before it ends at 290 - 50.
    expect(preserveEndTicks([100, 245, 295], layout)).toEqual([100, 295]);
    expect(preserveEndTicks([100, 230, 295], layout)).toEqual([100, 230, 295]);
    // Only the last one: an earlier label that crosses the room left is dropped, not pulled back.
    expect(preserveEndTicks([100, 145, 200], layout)).toEqual([100, 200]);
    expect(preserveEndTicks([295, 5], layout)).toEqual([]);
  });

  it("walks the candidates in the order given, from the last, as Recharts does", () => {
    expect(preserveEndTicks([100, 150, 200, 250, 290], layout)).toEqual([100, 200, 290]);
    // Recharts lists the main line's windows, then the dashed line's own. The walk starts from the
    // dashed line's last window, and a later window of the main line is past the room it leaves.
    expect(preserveEndTicks([100, 200, 290, 150, 250], layout)).toEqual([150, 250]);
  });

  it("places each candidate by the axis' own scale", () => {
    const x = (v: number) => 32 + v * 10;
    expect(preserveEndTicks([0, 5, 10, 15, 20, 25], { ...layout, x, end: 308 })).toEqual([5, 15, 25]);
  });

  it("chooses what Recharts' own preserveEnd rule chooses", () => {
    // A small deterministic generator, so a failure names the case that differs.
    let seed = 96;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (let run = 0; run < 300; run++) {
      const end = 200 + Math.floor(rand() * 900);
      const n = 1 + Math.floor(rand() * 80);
      // Candidates in any order, some past either edge, labels 20–90 px wide. Except the first two:
      // Recharts reads the axis' direction from them, and in the chart they are its first two windows.
      const at = new Map<number, number>();
      widths.clear();
      const candidates = Array.from({ length: n }, (_, i) => {
        at.set(i, -30 + rand() * (end + 60));
        widths.set(`L${i}`, 20 + rand() * 70);
        return i;
      });
      if (n >= 2 && at.get(0)! >= at.get(1)!) at.set(1, at.get(0)! + 1 + rand() * 50);
      const gap = Math.floor(rand() * 60);
      const recharts = getTicks({
        ticks: candidates.map((v, index) => ({ value: v, coordinate: at.get(v)!, index })),
        tick: true,
        tickFormatter: (v: number) => `L${v}`,
        viewBox: { x: 0, y: 0, width: end, height: 300 },
        minTickGap: gap,
        orientation: "bottom",
        interval: "preserveEnd",
      }).map((t) => t.value);
      const ours = preserveEndTicks(candidates, {
        x: (v) => at.get(v)!,
        width: (v) => widths.get(`L${v}`)!,
        start: 0,
        end,
        gap,
      });
      expect(ours, `run ${run}`).toEqual(recharts);
    }
  });

  it("measures only the labels that could still fit", () => {
    const measured: number[] = [];
    const width = (v: number) => (measured.push(v), 20);
    // After 270, the room ends at 220: 230, 240, 250 and 260 are past it and never measured.
    preserveEndTicks([100, 230, 240, 250, 260, 270], { ...layout, width });
    expect(measured).toEqual([270, 100]);
  });

  it("returns nothing for no candidates", () => {
    expect(preserveEndTicks([], layout)).toEqual([]);
  });
});
