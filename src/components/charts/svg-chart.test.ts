import { describe, expect, it } from "vitest";
import { tipPosition } from "./svg-chart";

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
