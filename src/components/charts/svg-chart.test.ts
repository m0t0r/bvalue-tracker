import { cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ChartTip, tipPosition } from "./svg-chart";

afterEach(cleanup);

// A plot from (40, 16), 500 × 300, as the frequency–magnitude chart's at 552 px.
const area = { left: 40, top: 16, width: 500, height: 300 };

describe("where a chart's tooltip goes, as Recharts placed it", () => {
  it("sits 10 px below and to the right of the point", () => {
    expect(tipPosition({ x: 100, y: 50 }, 120, 60, area)).toEqual({ x: 110, y: 60 });
  });

  it("goes to the other side where it would leave the plot", () => {
    // 480 + 10 + 120 passes 540; 280 + 10 + 60 passes 316.
    expect(tipPosition({ x: 480, y: 280 }, 120, 60, area)).toEqual({ x: 350, y: 210 });
  });

  it("never starts before the plot's left or top edge", () => {
    // Too wide for either side: it keeps to the left edge rather than run off it.
    expect(tipPosition({ x: 100, y: 50 }, 480, 60, area)).toEqual({ x: 40, y: 60 });
    expect(tipPosition({ x: 100, y: 20 }, 120, 320, area)).toEqual({ x: 110, y: 16 });
  });

  it("goes above a stretch it must keep clear of, or below it where there is no room above", () => {
    // Over the stretch from 150 to 190: its bottom edge 10 px above 150.
    expect(tipPosition({ x: 100, y: 170 }, 120, 60, area, [150, 190])).toEqual({ x: 110, y: 80 });
    // A stretch 40 px under the plot's top leaves no room for 60 px: below it, 10 px under 96.
    expect(tipPosition({ x: 100, y: 76 }, 120, 60, area, [56, 96])).toEqual({ x: 110, y: 106 });
    // No room either way: inside the plot, as low as it fits.
    expect(tipPosition({ x: 100, y: 150 }, 120, 200, area, [60, 300])).toEqual({ x: 110, y: 116 });
    expect(tipPosition({ x: 480, y: 170 }, 120, 60, area, [150, 190]).x).toBe(350);
  });
});

describe("a chart's tooltip", () => {
  it("is on the dark theme's surface in either theme, and keeps what its chart adds", () => {
    const view = render(
      createElement(ChartTip, { at: { x: 100, y: 50 }, area, className: "tabular-nums", children: "M2.5" }),
    );
    const box = view.container.querySelector("[data-chart-tip]")!;
    expect(box.textContent).toBe("M2.5");
    // `dark` gives the box the dark theme's tokens; the text colour is set on it, not inherited from the page.
    expect([...box.classList]).toEqual(expect.arrayContaining(["dark", "bg-background", "text-foreground"]));
    expect(box.classList.contains("tabular-nums")).toBe(true);
    // The box is inside the element that is placed and measured.
    expect((box.parentElement as HTMLElement).style.getPropertyValue("--tip-x")).not.toBe("");
  });
});
