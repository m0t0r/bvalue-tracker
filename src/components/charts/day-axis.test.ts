import { describe, expect, it } from "vitest";
import { bandOnAxis, countAxis, dayBar, dayTicks, tickLabel } from "./day-axis";

const DAY = 86_400_000;
// 10 August 2026, 00:00 in Colombia.
const AUG_10 = Date.UTC(2026, 7, 10, 5);

describe("the daily counts' axis", () => {
  it("takes a round step that gives at most four intervals", () => {
    expect(countAxis(61)).toEqual({ domain: [0, 80], ticks: [0, 20, 40, 60, 80] });
    expect(countAxis(172)).toEqual({ domain: [0, 200], ticks: [0, 50, 100, 150, 200] });
    expect(countAxis(4)).toEqual({ domain: [0, 4], ticks: [0, 1, 2, 3, 4] });
  });

  it("still has an axis for an empty or a huge day", () => {
    expect(countAxis(0)).toEqual({ domain: [0, 1], ticks: [0, 1] });
    expect(countAxis(9000).domain).toEqual([0, 10000]);
  });
});

describe("a pinned axis' numbers", () => {
  it("writes a thousand and over in thousands, which fit the column", () => {
    expect([0, 50, 800].map(tickLabel)).toEqual(["0", "50", "800"]);
    expect([1000, 1500, 2000, 10000].map(tickLabel)).toEqual(["1k", "1.5k", "2k", "10k"]);
    // Every label the count axis can make is four characters or fewer.
    for (const max of [900, 1001, 3999, 9000])
      for (const v of countAxis(max).ticks) expect(tickLabel(v).length).toBeLessThanOrEqual(4);
  });
});

describe("the date labels", () => {
  it("offers a day every so many, from the first day to the end of the last", () => {
    expect(dayTicks([AUG_10, AUG_10 + 3 * DAY], 1)).toEqual([AUG_10, AUG_10 + DAY, AUG_10 + 2 * DAY, AUG_10 + 3 * DAY]);
    expect(dayTicks([AUG_10, AUG_10 + 45 * DAY], 7)).toHaveLength(7);
    // A step of zero would never end.
    expect(dayTicks([AUG_10, AUG_10 + 2 * DAY], 0)).toHaveLength(3);
    // Which of them get a label is `ownPlaceLabels` (`@bvalue/charts`).
    expect(dayTicks([AUG_10, AUG_10 + 45 * DAY], 3)).toHaveLength(16);
  });
});

describe("a day's bar", () => {
  it("is 2 px clear of each side and a whole number of pixels wide, as Recharts drew it", () => {
    expect(dayBar(24.6)).toEqual({ offset: 2, width: 21 });
    expect(dayBar(24.1818)).toEqual({ offset: 2, width: 20 });
  });

  it("keeps half the day where a day is too narrow for that", () => {
    // Recharts' rule gives a width of -0.5 here, and no bar.
    expect(dayBar(3.5)).toEqual({ offset: 0.875, width: 1.75 });
    expect(dayBar(0.4).width).toBe(0.5);
  });
});

describe("the chosen days' band", () => {
  const axis = [AUG_10 + 5 * DAY, AUG_10 + 20 * DAY] as const;

  it("covers the chosen days whole", () => {
    expect(bandOnAxis({ from: AUG_10 + 6 * DAY, to: AUG_10 + 8 * DAY }, axis)).toEqual([
      AUG_10 + 6 * DAY,
      AUG_10 + 9 * DAY,
    ]);
  });

  it("keeps the part that is on the axis when a filter has cut into the choice", () => {
    // Recharts discarded the whole band here.
    expect(bandOnAxis({ from: AUG_10 + 2 * DAY, to: AUG_10 + 8 * DAY }, axis)).toEqual([
      AUG_10 + 5 * DAY,
      AUG_10 + 9 * DAY,
    ]);
    expect(bandOnAxis({ from: AUG_10 + 18 * DAY, to: AUG_10 + 30 * DAY }, axis)).toEqual([
      AUG_10 + 18 * DAY,
      AUG_10 + 20 * DAY,
    ]);
  });

  it("is nothing when no chosen day is on the axis", () => {
    expect(bandOnAxis({ from: AUG_10, to: AUG_10 + 3 * DAY }, axis)).toBeNull();
  });
});
