import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dicts } from "@/lib/i18n";
import type { Stats } from "@/lib/stats";
import { BOverTimeChart } from "./b-over-time";

// happy-dom lays nothing out: every box is 400 × 320 at (0, 0), so the plot runs from x 32 to 360 and
// from y 16 to 290.
beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(DOMRect.fromRect({ width: 400, height: 320 }));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const DAY = 86_400_000;
const T0 = Date.parse("2026-09-01T00:00:00Z");
const iso = (day: number) => new Date(T0 + day * DAY).toISOString();

type Win = { day: number; b: number; mcOwn?: number };
/** Windows ending on the given days, each ten days long, at a fixed Mc of 2.3. */
function stats(windows: Win[]): Stats {
  return {
    count: 1000,
    bins: [],
    mcMaxc: 2.3,
    mcGft: null,
    mc: 2.3,
    fit: null,
    fitGft: null,
    windows: windows.map((w) => ({
      from: iso(w.day - 10),
      to: iso(w.day),
      b: w.b,
      sigmaB: 0.05,
      a: 3,
      n: 150,
      meanMag: 2.8,
      mc: 2.3,
      mcOwn: w.mcOwn ?? 2.3,
    })),
  };
}

// Five windows, a day apart, over four days: 82 px between neighbours.
const FIVE: Win[] = [
  { day: 0, b: 1.0 },
  { day: 1, b: 0.9 },
  { day: 2, b: 0.8 },
  { day: 3, b: 0.7 },
  { day: 4, b: 0.6 },
];

function draw(s: Stats, props: { other?: Stats | null; otherKey?: string | null; mainshockTime?: string | null } = {}) {
  const element = (next: Stats) =>
    createElement(BOverTimeChart, {
      stats: next,
      other: props.other ?? null,
      otherKey: props.otherKey ?? null,
      cluster: null,
      mainshockTime: props.mainshockTime ?? null,
    });
  const view = render(element(s));
  const svg = view.container.querySelector("svg[role=application]") as SVGSVGElement;
  // The tooltip's first line is the window's b.
  const tip = () =>
    [...view.container.querySelectorAll(".font-medium")].map((e) => e.textContent).find((t) => t?.startsWith("b = "));
  const cursor = () => svg.querySelector("line[stroke-dasharray='3 3']");
  const texts = () => [...svg.querySelectorAll("text")].map((t) => t.textContent);
  return { view, svg, tip, cursor, texts, rerender: (next: Stats) => view.rerender(element(next)) };
}

describe("'Valor b en el tiempo' drawn without Recharts", () => {
  it("draws the band, the line, a dot on the independent windows only, and names itself", () => {
    const { svg, texts } = draw(stats(FIVE));
    expect(svg.getAttribute("tabindex")).toBe("0");
    expect(svg.querySelector("title")?.textContent).toBe(dicts.en.bTimeTitle);
    expect(svg.querySelector("desc")?.textContent).toBe("b goes from 1.00 in the first window to 0.60 in the latest.");
    // Five windows of 150 events stepping by 10 share events: only the latest stands alone.
    const dots = svg.querySelectorAll("g.stroke-card circle");
    expect(dots).toHaveLength(1);
    expect(dots[0]!.getAttribute("cx")).toBe("360");
    expect(svg.querySelector("path.fill-chart-1")?.getAttribute("d")).toMatch(/^M32,.*Z$/);
    expect(svg.querySelectorAll("g.stroke-chart-1 path")).toHaveLength(1);
    expect(texts()).toContain("b = 1");
    expect(texts()).toContain("1.0");
    for (const p of svg.querySelectorAll("path")) expect(p.getAttribute("d") ?? "").not.toMatch(/NaN|Infinity/);
  });

  it("reads the window nearest the pointer, and nothing outside the plot", () => {
    const { svg, tip, cursor } = draw(stats(FIVE));
    const box = svg.parentElement!;
    fireEvent.mouseMove(box, { clientX: 120, clientY: 100 });
    expect(tip()).toBe("b = 0.90 ± 0.05");
    expect(cursor()?.getAttribute("x1")).toBe("114");
    // Halfway between two windows is the earlier one's.
    fireEvent.mouseMove(box, { clientX: 155, clientY: 100 });
    expect(tip()).toBe("b = 0.90 ± 0.05");
    fireEvent.mouseMove(box, { clientX: 156, clientY: 100 });
    expect(tip()).toBe("b = 0.80 ± 0.05");
    // The three dots: the two ends of ±1σ and b itself, on the cursor.
    expect([...svg.querySelectorAll("g[pointer-events=none] circle")].map((c) => c.getAttribute("cx"))).toEqual([
      "196",
      "196",
      "196",
    ]);
    for (const [x, y] of [
      [20, 100],
      [380, 100],
      [120, 8],
      [120, 300],
    ])
      expect((fireEvent.mouseMove(box, { clientX: x, clientY: y }), tip())).toBeUndefined();
    fireEvent.mouseMove(box, { clientX: 120, clientY: 100 });
    fireEvent.mouseLeave(box);
    expect(tip()).toBeUndefined();
  });

  it("reads this line's windows under the dashed line's too, up to the latest", () => {
    // The other reading's windows fall between this one's and end two days later. Recharts took a pointer
    // near one of them for a window of this line by its index, and showed a window the cursor was not on;
    // past its last, the latest windows could not be read at all.
    const other = stats([
      { day: 0.5, b: 1.1 },
      { day: 1.5, b: 1.1 },
      { day: 2.5, b: 1.1 },
      { day: 3.5, b: 1.1 },
      { day: 6, b: 1.1 },
    ]);
    const { svg, tip, cursor } = draw(stats(FIVE), { other, otherKey: "MLr_1 only" });
    expect(svg.querySelectorAll("g.stroke-chart-1 path")).toHaveLength(2);
    const box = svg.parentElement!;
    // Six days over 328 px: day 0.5 is at x 59, nearer day 1 (87) than day 0 (32) by a pixel.
    fireEvent.mouseMove(box, { clientX: 59, clientY: 100 });
    expect(tip()).toBe("b = 1.00 ± 0.05");
    expect(cursor()?.getAttribute("x1")).toBe("32");
    fireEvent.mouseMove(box, { clientX: 61, clientY: 100 });
    expect(tip()).toBe("b = 0.90 ± 0.05");
    // Anywhere past the latest window, under the dashed line's end, is the latest window.
    fireEvent.mouseMove(box, { clientX: 355, clientY: 100 });
    expect(tip()).toBe("b = 0.60 ± 0.05");
    act(() => svg.focus());
    fireEvent.mouseLeave(box);
    for (let i = 0; i < 12; i++) fireEvent.keyDown(svg, { key: "ArrowRight" });
    expect(tip()).toBe("b = 0.60 ± 0.05");
  });

  it("labels the latest dates when the dashed line ends before this one", () => {
    // Recharts walked its label candidates from the dashed line's last window back, whatever its date: one
    // that ended on day 2 took the last label, and no date after it was labelled.
    const other = stats([
      { day: 0.5, b: 1.1 },
      { day: 2, b: 1.1 },
    ]);
    const { texts } = draw(stats(FIVE), { other, otherKey: "MLr_1 only" });
    const dates = texts().filter((label) => /Sept/.test(label ?? ""));
    // Day 4 ends on 4 Sept in Colombia; it is the last label, and the dates come in order.
    expect(dates.at(-1)).toMatch(/^4\sSept$/);
    expect(dates.length).toBeGreaterThan(1);
    expect(dates).toEqual([...dates].sort());
  });

  it("reads what is under a resting pointer when the windows change", () => {
    const { svg, tip, cursor, rerender } = draw(stats(FIVE));
    const box = svg.parentElement!;
    fireEvent.mouseMove(box, { clientX: 196, clientY: 100 });
    expect(tip()).toBe("b = 0.80 ± 0.05");
    // Three windows over the same plot: x 196 is now the second, not the third it was by its index.
    rerender(stats(FIVE.slice(0, 3)));
    expect(tip()).toBe("b = 0.90 ± 0.05");
    expect(cursor()?.getAttribute("x1")).toBe("196");
  });

  it("shows nothing for a focus that a press made, and keeps the arrows to itself", () => {
    const { svg, tip } = draw(stats(FIVE));
    const box = svg.parentElement!;
    fireEvent.mouseMove(box, { clientX: 196, clientY: 100 });
    fireEvent.mouseDown(svg);
    act(() => svg.focus());
    fireEvent.mouseUp(svg);
    expect(tip()).toBe("b = 0.80 ± 0.05");
    // The pointer leaves: no tooltip jumps to the first window.
    fireEvent.mouseLeave(box);
    expect(tip()).toBeUndefined();
    // The arrows still work from there, and the page does not scroll with them.
    expect(fireEvent.keyDown(svg, { key: "ArrowRight" })).toBe(false);
    expect(tip()).toBe("b = 1.00 ± 0.05");
    expect(fireEvent.keyDown(svg, { key: "Enter" })).toBe(true);
    expect(fireEvent.keyDown(svg, { key: "Tab" })).toBe(true);
  });

  it("leaves a dashed line out unless the key names it and it has two windows", () => {
    const other = stats([
      { day: 0.5, b: 1.1 },
      { day: 6, b: 1.1 },
    ]);
    expect(draw(stats(FIVE), { other }).svg.querySelectorAll("g.stroke-chart-1 path")).toHaveLength(1);
    cleanup();
    const one = stats([{ day: 9, b: 1.7 }]);
    const { svg, texts } = draw(stats(FIVE), { other: one, otherKey: "MLr_1 only" });
    expect(svg.querySelectorAll("g.stroke-chart-1 path")).toHaveLength(1);
    // A line that is not drawn stretches neither axis: the latest window is still at the plot's end.
    expect(svg.querySelector("g.stroke-card circle")?.getAttribute("cx")).toBe("360");
    expect(texts()).not.toContain("1.8");
  });

  it("keeps the keyboard layer: focus shows the first window, the arrows step, Enter toggles", () => {
    // A tooltip of 100 × 40, so that it fits beside its point.
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      const tip = this.classList.contains("pointer-events-none");
      return DOMRect.fromRect(tip ? { width: 100, height: 40 } : { width: 400, height: 320 });
    });
    const { svg, tip, view } = draw(stats(FIVE));
    expect(tip()).toBeUndefined();
    act(() => svg.focus());
    expect(tip()).toBe("b = 1.00 ± 0.05");
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    expect(tip()).toBe("b = 0.80 ± 0.05");
    fireEvent.keyDown(svg, { key: "ArrowLeft" });
    expect(tip()).toBe("b = 0.90 ± 0.05");
    // The tooltip sits over the window it reads, 10 px clear of the top of its ±1σ.
    const top = Number(svg.querySelectorAll("g[pointer-events=none] circle")[0]!.getAttribute("cy"));
    const tipBox = () => view.container.querySelector<HTMLElement>(".pointer-events-none.absolute")!;
    expect(tipBox().style.getPropertyValue("--tip-x")).toBe("124px");
    expect(parseFloat(tipBox().style.getPropertyValue("--tip-y"))).toBeCloseTo(top - 10 - 40, 6);
    // The pointer's stays 10 px below and right of the pointer, as Recharts placed it.
    const box = svg.parentElement!;
    fireEvent.mouseMove(box, { clientX: 114, clientY: 100 });
    expect(tipBox().style.getPropertyValue("--tip-y")).toBe("110px");
    // The pointer took the tooltip and leaves with it: the keyboard's comes back on a key, where it was.
    fireEvent.mouseLeave(box);
    expect(tip()).toBeUndefined();
    fireEvent.keyDown(svg, { key: "Enter" });
    expect(tip()).toBe("b = 0.90 ± 0.05");
    fireEvent.keyDown(svg, { key: "Enter" });
    expect(tip()).toBeUndefined();
  });

  it("stops at either end, lets go on blur, and shows where it was on the next focus", () => {
    const { svg, tip } = draw(stats(FIVE));
    act(() => svg.focus());
    fireEvent.keyDown(svg, { key: "ArrowLeft" });
    expect(tip()).toBe("b = 1.00 ± 0.05");
    for (let i = 0; i < 10; i++) fireEvent.keyDown(svg, { key: "ArrowRight" });
    expect(tip()).toBe("b = 0.60 ± 0.05");
    act(() => svg.blur());
    expect(tip()).toBeUndefined();
    act(() => svg.focus());
    expect(tip()).toBe("b = 0.60 ± 0.05");
  });

  it("forgets a window a new catalogue no longer has, rather than reading past its windows", () => {
    const { svg, tip, rerender } = draw(stats(FIVE));
    act(() => svg.focus());
    for (let i = 0; i < 10; i++) fireEvent.keyDown(svg, { key: "ArrowRight" });
    expect(tip()).toBe("b = 0.60 ± 0.05");
    rerender(stats(FIVE.slice(0, 3)));
    expect(tip()).toBeUndefined();
    fireEvent.keyDown(svg, { key: "ArrowLeft" });
    expect(tip()).toBe("b = 0.80 ± 0.05");
  });

  it("hides the tooltip when a finger is lifted", () => {
    const { svg, tip } = draw(stats(FIVE));
    const box = svg.parentElement!;
    fireEvent.touchMove(box, { touches: [{ clientX: 200, clientY: 100 }] });
    expect(tip()).toBe("b = 0.80 ± 0.05");
    fireEvent.touchEnd(box);
    expect(tip()).toBeUndefined();
  });

  it("marks the mainshock only when it is on the time axis", () => {
    const on = draw(stats(FIVE), { mainshockTime: iso(2) });
    expect(on.texts()).toContain(dicts.en.mainshock.label);
    const mark = on.svg.querySelector("line.stroke-chart-2");
    expect(mark?.getAttribute("x1")).toBe("196");
    cleanup();
    // Before the first window's end, as Chocó's M7.4 is: Recharts discarded the line, and so does this.
    const off = draw(stats(FIVE), { mainshockTime: iso(-3) });
    expect(off.texts()).not.toContain(dicts.en.mainshock.label);
    expect(off.svg.querySelector("line.stroke-chart-2")).toBeNull();
  });

  it("shades the windows that may have lost small events, and says so in the tooltip and the description", () => {
    const flagged = FIVE.map((w, i) => (i === 1 || i === 2 || i === 4 ? { ...w, mcOwn: 2.6 } : w));
    const { svg, tip } = draw(stats(flagged));
    const runs = [...svg.querySelectorAll("g.fill-caution-edge rect")];
    // Days 1–2 as one stretch, half a day out on either side; the last window alone reaches back half a day.
    expect(runs.map((r) => [Number(r.getAttribute("x")), Number(r.getAttribute("width"))])).toEqual([
      [73, 164],
      [319, 41],
    ]);
    expect(svg.querySelector("desc")?.textContent).toMatch(
      /between 1\sSept and 2\sSept and on 4\sSept may be missing small events/,
    );
    const box = svg.parentElement!;
    fireEvent.mouseMove(box, { clientX: 114, clientY: 100 });
    expect(tip()).toBe("b = 0.90 ± 0.05");
    expect(box.textContent).toContain("The window's own Mc: 2.6, above 2.3.");
    fireEvent.mouseMove(box, { clientX: 32, clientY: 100 });
    expect(box.textContent).not.toContain("The window's own Mc");
  });

  it("draws a grid line once where a b tick is on the plot's edge", () => {
    // At rest the axis is 0.4–1.2: its first and last ticks are the plot's bottom and top.
    const { svg } = draw(stats(FIVE));
    const rows = [...svg.querySelectorAll("g[class='stroke-border/50'] line")].map((l) => l.getAttribute("y1"));
    expect(rows).toHaveLength(5);
    expect(new Set(rows).size).toBe(5);
  });

  it("draws two windows that end at the same moment without a broken path", () => {
    // A time axis of one instant: both windows sit at the plot's left edge, and the pointer reads the first.
    const { svg, tip } = draw(
      stats([
        { day: 1, b: 1.0 },
        { day: 1, b: 0.9 },
      ]),
    );
    for (const p of svg.querySelectorAll("path")) expect(p.getAttribute("d") ?? "").not.toMatch(/NaN|Infinity/);
    for (const c of svg.querySelectorAll("circle")) expect(c.getAttribute("cx")).toBe("32");
    fireEvent.mouseMove(svg.parentElement!, { clientX: 200, clientY: 100 });
    expect(tip()).toBe("b = 1.00 ± 0.05");
  });

  it("shows its message, and no drawing, with fewer than two windows", () => {
    const { view, svg } = draw(stats(FIVE.slice(0, 1)));
    expect(svg).toBeNull();
    expect(view.container.textContent).toMatch(/150/);
  });
});
