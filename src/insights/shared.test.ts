import { describe, expect, it } from "vitest";
import { commonDepths, fmtInt, fmtPct, horizontalErrorKm, roundSig, timeWindows } from "./shared";

describe("formats", () => {
  it("groups thousands with a thin space in both languages, from five digits", () => {
    expect(fmtInt(1234)).toBe("1234");
    expect(fmtInt(125_893)).toBe("125\u202F893");
    expect(fmtInt(-12_000)).toBe("−12\u202F000");
    expect(fmtPct(96, "es")).toBe("96\u202F%");
    expect(fmtPct(96, "en")).toBe("96%");
  });
  it("rounds to significant figures without reaching zero", () => {
    expect(roundSig(125_893)).toBe(130_000);
    expect(roundSig(0.0708, 2)).toBeCloseTo(0.071, 12);
    expect(roundSig(3.2)).toBe(3.2);
    expect(roundSig(0)).toBe(0);
  });
});

describe("horizontalErrorKm", () => {
  it("is the hypotenuse of the two errors, and null without both", () => {
    expect(horizontalErrorKm({ errLatKm: 3, errLonKm: 4 } as never)).toBe(5);
    expect(horizontalErrorKm({ errLatKm: 3, errLonKm: null } as never)).toBeNull();
  });
});

describe("commonDepths", () => {
  it("ranks by count, ties to the shallower", () => {
    const d = (depthKm: number) => ({ depthKm });
    expect(commonDepths([d(19), d(16), d(19), d(16), d(12)], 2)).toEqual([
      { depthKm: 16, count: 2 },
      { depthKm: 19, count: 2 },
    ]);
  });
});

describe("timeWindows", () => {
  it("buckets by window from the first event and drops thin windows", () => {
    const at = (h: number, lat: number) =>
      ({ time: new Date(Date.UTC(2026, 8, 20) + h * 3_600_000).toISOString(), lat, lon: -75.6 }) as never;
    const w = timeWindows([at(0, 3.8), at(1, 3.9), at(2, 4.0), at(13, 3.8)], 12, 2);
    expect(w).toHaveLength(1);
    expect(w[0]!.events).toHaveLength(3);
    expect(w[0]!.centre.lat).toBeCloseTo(3.9, 12);
  });
});
