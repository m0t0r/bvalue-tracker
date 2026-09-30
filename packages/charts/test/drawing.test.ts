import { cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { GridRows, PlotClip, TickLabels, inPlot } from "../src";

afterEach(cleanup);

// A plot from (40, 16), 500 × 300.
const plot = { left: 40, top: 16, width: 500, height: 300 };
const svg = (...children: ReturnType<typeof createElement>[]) =>
  render(createElement("svg", null, ...children)).container.querySelector("svg")!;

describe("the grid's rows", () => {
  it("draws a line at each tick and at the plot's two edges, across the plot", () => {
    const lines = [...svg(createElement(GridRows, { plot, ys: [100, 200] })).querySelectorAll("line")];
    expect(lines.map((l) => l.getAttribute("y1"))).toEqual(["100", "200", "16", "316"]);
    for (const l of lines) {
      expect(l.getAttribute("y2")).toBe(l.getAttribute("y1"));
      expect([l.getAttribute("x1"), l.getAttribute("x2")]).toEqual(["40", "540"]);
    }
  });

  it("draws a line once where a tick is on an edge, and keeps a tick's height unrounded", () => {
    const lines = [
      ...svg(createElement(GridRows, { plot, ys: [316, 394.50000000000006, 16] })).querySelectorAll("line"),
    ];
    expect(lines.map((l) => l.getAttribute("y1"))).toEqual(["316", "394.50000000000006", "16"]);
  });
});

describe("an axis' labels", () => {
  it("hang 14 px under the plot, centred on their ticks", () => {
    const below = { ticks: [1, 2], at: (v: number) => v * 100, label: (v: number) => v.toFixed(1), edge: 316 };
    const texts = [...svg(createElement(TickLabels, { below })).querySelectorAll("text")];
    expect(texts.map((t) => t.textContent)).toEqual(["1.0", "2.0"]);
    expect(texts.map((t) => [t.getAttribute("x"), t.getAttribute("y"), t.getAttribute("text-anchor")])).toEqual([
      ["100", "330", "middle"],
      ["200", "330", "middle"],
    ]);
    expect(texts[0]!.querySelector("tspan")!.getAttribute("dy")).toBe("0.71em");
  });

  it("end 8 px before the plot, centred on their ticks' height, after the labels below", () => {
    const below = { ticks: [1], at: () => 100, label: String, edge: 316 };
    const beside = { ticks: [10, 100], at: (v: number) => 300 - v, label: String, edge: 40 };
    const texts = [...svg(createElement(TickLabels, { below, beside })).querySelectorAll("text")];
    expect(texts.map((t) => t.textContent)).toEqual(["1", "10", "100"]);
    expect(
      texts.slice(1).map((t) => [t.getAttribute("x"), t.getAttribute("y"), t.getAttribute("text-anchor")]),
    ).toEqual([
      ["32", "290", "end"],
      ["32", "200", "end"],
    ]);
    expect(texts[1]!.querySelector("tspan")!.getAttribute("dy")).toBe("0.355em");
  });
});

describe("a plot", () => {
  it("clips to its height, at the drawing's whole width", () => {
    const rect = svg(createElement(PlotClip, { id: "clip", plot, width: 552 })).querySelector("clipPath#clip rect")!;
    expect(["x", "y", "width", "height"].map((a) => rect.getAttribute(a))).toEqual(["0", "16", "552", "300"]);
  });

  it("takes a pointer on its edges as inside", () => {
    expect(inPlot(plot, 40, 16)).toBe(true);
    expect(inPlot(plot, 540, 316)).toBe(true);
    expect(inPlot(plot, 39, 100)).toBe(false);
    expect(inPlot(plot, 100, 317)).toBe(false);
  });
});
