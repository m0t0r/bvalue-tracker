import { describe, expect, it } from "vitest";
import { crosses, crossesRing, firstClear, forwardLabels, overlaps, textBox, type Box } from "./place";

describe("crossesRing", () => {
  const ring = { cx: 100, cy: 100, r: 50 };
  const at = (x0: number, y0: number, w = 20, h = 10): Box => ({ x0, x1: x0 + w, y0, y1: y0 + h });

  it("is true for a box the circle's outline runs through", () => {
    expect(crossesRing(at(140, 95), ring)).toBe(true);
  });

  it("is false for a box wholly inside the circle, and one wholly outside it", () => {
    expect(crossesRing(at(90, 95), ring)).toBe(false);
    expect(crossesRing(at(160, 95), ring)).toBe(false);
    // Outside, in the corner the circle does not reach, though within its bounding square.
    expect(crossesRing(at(52, 52, 10, 10), ring)).toBe(false); // nearest corner (62, 62): 53.7 away
  });

  it("counts an outline within `pad` of the box", () => {
    expect(crossesRing(at(152, 95), ring, 3)).toBe(true);
    expect(crossesRing(at(154, 95), ring, 3)).toBe(false);
  });
});

describe("crosses", () => {
  const box: Box = { x0: 10, x1: 50, y0: 10, y1: 20 };

  it("is true for a line through the box, even with both ends outside it", () => {
    expect(crosses(box, [0, 15], [60, 15])).toBe(true);
    expect(crosses(box, [0, 0], [60, 30])).toBe(true);
  });

  it("is false for a line that passes by, although it spans the box's rows and columns", () => {
    // From below-left to above-right, missing the box's lower-right corner.
    expect(crosses(box, [40, 40], [70, 10])).toBe(false);
    expect(crosses(box, [0, 25], [60, 25])).toBe(false);
  });

  it("counts a line within `pad` of the box", () => {
    expect(crosses(box, [0, 22], [60, 22], 3)).toBe(true);
    expect(crosses(box, [0, 24], [60, 24], 3)).toBe(false);
  });

  it("is true for a point inside the box", () => {
    expect(crosses(box, [20, 15], [20, 15])).toBe(true);
  });
});

describe("textBox", () => {
  it("spans the line from an em above the baseline to 0.3 em below, as the browser boxes Geist", () => {
    expect(textBox({ x: 100, y: 50, width: 40, fontSize: 10 })).toEqual({ x0: 100, x1: 140, y0: 40, y1: 53 });
  });

  it("reads the anchor as SVG does", () => {
    expect(textBox({ x: 100, y: 50, width: 40, fontSize: 10, anchor: "middle" })).toMatchObject({ x0: 80, x1: 120 });
    expect(textBox({ x: 100, y: 50, width: 40, fontSize: 10, anchor: "end" })).toMatchObject({ x0: 60, x1: 100 });
  });
});

describe("overlaps", () => {
  const a: Box = { x0: 0, x1: 10, y0: 0, y1: 10 };

  it("is true for boxes that share area, and false for boxes that only touch", () => {
    expect(overlaps(a, { x0: 9, x1: 20, y0: 5, y1: 15 })).toBe(true);
    expect(overlaps(a, { x0: 10, x1: 20, y0: 0, y1: 10 })).toBe(false);
    expect(overlaps(a, { x0: 0, x1: 10, y0: 10, y1: 20 })).toBe(false);
  });

  it("counts a gap between them as overlap", () => {
    expect(overlaps(a, { x0: 13, x1: 20, y0: 0, y1: 10 }, 4)).toBe(true);
    expect(overlaps(a, { x0: 14, x1: 20, y0: 0, y1: 10 }, 4)).toBe(false);
  });
});

describe("firstClear", () => {
  const frame: Box = { x0: 0, x1: 200, y0: 0, y1: 100 };
  const left = { x0: 20, x1: 80, y0: 10, y1: 23, id: "left" };
  const inside = { x0: 120, x1: 180, y0: 10, y1: 23, id: "inside" };

  it("takes the first placement when it fits", () => {
    expect(firstClear([left, inside], frame, [])?.id).toBe("left");
  });

  it("passes over a placement that would cover a box to avoid", () => {
    const other: Box = { x0: 60, x1: 110, y0: 15, y1: 28 };
    expect(firstClear([left, inside], frame, [other])?.id).toBe("inside");
  });

  it("passes over a placement that leaves the frame on either side", () => {
    const pastStart = { ...left, x0: -1, id: "past start" };
    const pastEnd = { ...inside, x1: 201, id: "past end" };
    expect(firstClear([pastStart, pastEnd, inside], frame, [])?.id).toBe("inside");
  });

  it("gives nothing when no placement fits, or none is offered", () => {
    expect(firstClear([{ ...left, x1: 300 }], frame, [])).toBeNull();
    expect(firstClear([], frame, [])).toBeNull();
  });
});

describe("forwardLabels", () => {
  const room = { start: 0, end: 300, gap: 4 };

  it("puts each label where it asks to start when they all fit", () => {
    expect(
      forwardLabels(
        [
          { at: 10, width: 40 },
          { at: 100, width: 40 },
          { at: 200, width: 40 },
        ],
        room,
      ),
    ).toEqual([10, 100, 200]);
  });

  it("drops a label that would start before the previous one ends, gap included, and goes on after it", () => {
    expect(
      forwardLabels(
        [
          { at: 10, width: 40 },
          { at: 52, width: 40 }, // 10 + 40 + 4 = 54: two pixels short
          { at: 54, width: 40 }, // starts exactly where the room does
        ],
        room,
      ),
    ).toEqual([10, null, 54]);
  });

  it("moves a label left to end at the drawing's end, then judges it there", () => {
    expect(
      forwardLabels(
        [
          { at: 200, width: 40 },
          { at: 290, width: 40 }, // pulled to 260: clear of 244
        ],
        room,
      ),
    ).toEqual([200, 260]);
    // Pulled back to 260, it would start before the one at 250 has ended.
    expect(
      forwardLabels(
        [
          { at: 250, width: 30 },
          { at: 295, width: 40 },
        ],
        room,
      ),
    ).toEqual([250, null]);
  });

  it("moves a label right to start at the drawing's start", () => {
    expect(forwardLabels([{ at: -12, width: 40 }], room)).toEqual([0]);
  });

  it("drops a label wider than the whole drawing", () => {
    expect(forwardLabels([{ at: 0, width: 301 }], room)).toEqual([null]);
  });

  it("has nothing to place for no labels", () => {
    expect(forwardLabels([], room)).toEqual([]);
  });
});
