import { bValue, fmd } from "@bvalue/seismo";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Stats } from "@/lib/stats";
import { FmdChart } from "./fmd";

// happy-dom lays nothing out: every box is 400 × 320, so the chart has a plot to draw in.
beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(DOMRect.fromRect({ width: 400, height: 320 }));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function stats(mags: number[], mc: number | null): Stats {
  return {
    count: mags.length,
    bins: fmd(mags),
    mcMaxc: mc,
    mcGft: null,
    mc,
    fit: mc === null ? null : bValue(mags, mc),
    fitGft: null,
    windows: [],
  };
}

// 2.0 ×4, 2.1 ×3, 2.3 ×2, 2.6 ×1: bins from 2.0 to 2.6, three of them empty.
const MAGS = [2, 2, 2, 2, 2.1, 2.1, 2.1, 2.3, 2.3, 2.6];

function draw(s: Stats) {
  const view = render(createElement(FmdChart, { stats: s }));
  const svg = view.container.querySelector("svg[role=application]") as SVGSVGElement;
  // The tooltip's first line is the magnitude it is on.
  const tip = () =>
    [...view.container.querySelectorAll(".font-medium")].map((e) => e.textContent).find((t) => /^M\d/.test(t ?? ""));
  return { view, svg, tip };
}

describe("'Distribución frecuencia–magnitud' drawn without Recharts", () => {
  it("draws a square and a circle only for a magnitude with events, and names itself", () => {
    const { svg } = draw(stats(MAGS, 2));
    expect(svg.getAttribute("tabindex")).toBe("0");
    expect(svg.querySelector("title")?.textContent).toBe("Frequency–magnitude distribution");
    expect(svg.querySelector("desc")?.textContent).toMatch(/^Log scale/);
    expect(svg.querySelectorAll(".fill-chart-3 path")).toHaveLength(4);
    expect(svg.querySelectorAll(".fill-chart-1 path")).toHaveLength(4);
    expect(svg.textContent).toContain("Mc 2.0");
  });

  it("keeps Recharts' keyboard layer: focus shows the first magnitude, the arrows step, Enter toggles", () => {
    const { svg, tip } = draw(stats(MAGS, 2));
    expect(tip()).toBeUndefined();
    act(() => svg.focus());
    expect(tip()).toBe("M2.0");
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    // Every 0.1 step has a place, the empty ones too: the tooltip reports them.
    expect(tip()).toBe("M2.2");
    fireEvent.keyDown(svg, { key: "ArrowLeft" });
    expect(tip()).toBe("M2.1");
    fireEvent.keyDown(svg, { key: "Enter" });
    expect(tip()).toBeUndefined();
    fireEvent.keyDown(svg, { key: "Enter" });
    expect(tip()).toBe("M2.1");
  });

  it("stops at either end, lets go on blur, and shows where it was on the next focus", () => {
    const { svg, tip } = draw(stats(MAGS, 2));
    act(() => svg.focus());
    fireEvent.keyDown(svg, { key: "ArrowLeft" });
    expect(tip()).toBe("M2.0");
    for (let i = 0; i < 10; i++) fireEvent.keyDown(svg, { key: "ArrowRight" });
    expect(tip()).toBe("M2.6");
    act(() => svg.blur());
    expect(tip()).toBeUndefined();
    // Recharts showed nothing here until an arrow was pressed.
    act(() => svg.focus());
    expect(tip()).toBe("M2.6");
    fireEvent.keyDown(svg, { key: "ArrowLeft" });
    expect(tip()).toBe("M2.5");
  });

  it("forgets a magnitude a new catalogue no longer has, rather than reading past its bins", () => {
    const { svg, tip, view } = draw(stats(MAGS, 2));
    act(() => svg.focus());
    for (let i = 0; i < 10; i++) fireEvent.keyDown(svg, { key: "ArrowRight" });
    expect(tip()).toBe("M2.6");
    // A filter leaves bins from 2.0 to 2.1 only.
    view.rerender(createElement(FmdChart, { stats: stats([2, 2, 2.1], 2) }));
    expect(tip()).toBeUndefined();
    fireEvent.keyDown(svg, { key: "Enter" });
    expect(tip()).toBeUndefined();
    fireEvent.keyDown(svg, { key: "ArrowLeft" });
    expect(tip()).toBe("M2.1");
  });

  it("hides the tooltip when a finger is lifted", () => {
    const { svg, tip, view } = draw(stats(MAGS, 2));
    const box = svg.closest("[data-slot=card-content] > div")!;
    // Every box is 400 × 320 at (0, 0): the plot runs from x 40 to 388.
    fireEvent.touchMove(box, { touches: [{ clientX: 200, clientY: 100 }] });
    expect(tip()).toMatch(/^M2\.\d$/);
    fireEvent.touchEnd(box);
    expect(tip()).toBeUndefined();
    view.unmount();
  });

  it("draws Mc only when it is on the magnitude axis", () => {
    // A manual Mc of 1.5 under a catalogue that starts at M2.0: Recharts discarded the line.
    const s = { ...stats(MAGS, 2), mc: 1.5 };
    const { svg } = draw(s);
    expect([...svg.querySelectorAll("text")].map((t) => t.textContent)).not.toContainEqual(
      expect.stringMatching(/^Mc/),
    );
    expect(svg.querySelector("line[stroke-dasharray]")).toBeNull();
  });

  it("draws one magnitude, and a catalogue with no Mc or no fit, without a broken path", () => {
    for (const s of [stats([2.4, 2.4, 2.4], 2.4), stats(MAGS, null)]) {
      const { svg, view } = draw(s);
      for (const p of svg.querySelectorAll("path")) expect(p.getAttribute("d") ?? "").not.toMatch(/NaN|Infinity/);
      for (const p of svg.querySelectorAll("path"))
        expect(p.getAttribute("transform") ?? "").not.toMatch(/NaN|Infinity/);
      view.unmount();
    }
    const { svg, view } = draw(stats(MAGS, null));
    expect([...svg.querySelectorAll("text")].map((t) => t.textContent)).not.toContainEqual(
      expect.stringMatching(/^Mc/),
    );
    // The key names the fit without a b it does not have.
    expect(view.container.textContent).toContain("G–R fit");
    expect(view.container.textContent).not.toContain("b =");
  });
});
