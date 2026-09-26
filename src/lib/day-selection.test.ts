import { describe, expect, it } from "vitest";
import { pickDay, spanDays } from "@/lib/day-selection";

const D = 86_400_000;
const d = (n: number) => Date.parse("2026-09-10T05:00:00Z") + n * D;

describe("choosing days on the daily bars", () => {
  it("selects the one day pressed", () => {
    expect(pickDay(null, d(2))).toEqual({ from: d(2), to: d(2) });
    expect(pickDay({ from: d(0), to: d(5) }, d(2))).toEqual({ from: d(2), to: d(2) });
  });

  it("lets go of a day pressed again, which is how the reader gets every day back", () => {
    expect(pickDay({ from: d(2), to: d(2) }, d(2))).toBeNull();
  });

  it("spans a drag in either direction, both ends included", () => {
    expect(spanDays(d(3), d(7))).toEqual({ from: d(3), to: d(7) });
    expect(spanDays(d(7), d(3))).toEqual({ from: d(3), to: d(7) });
  });
});
