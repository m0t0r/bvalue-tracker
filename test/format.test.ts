import { describe, expect, it } from "vitest";
import {
  dayBounds,
  dayStart,
  fmtDateTime,
  fmtDay,
  fmtIsoDateTime,
  fmtRegion,
  fmtUtc,
  fmtYear,
} from "../src/lib/format.ts";

// 03:10 UTC on 11 August is still 22:10 on 10 August in Colombia (UTC−5, no daylight saving).
const LATE = "2026-08-11T03:10:00Z";

describe("Colombian time", () => {
  it("formats every date and time in America/Bogota, whatever the machine's own zone", () => {
    expect(fmtDateTime("2026-08-10T12:34:27Z", "es")).toBe("10 ago 2026, 07:34");
    expect(fmtDateTime(LATE, "en")).toBe("10 Aug 2026, 22:10");
    expect(fmtDay(Date.parse(LATE), "es")).toBe("10 ago");
    expect(fmtIsoDateTime(LATE)).toBe("2026-08-10 22:10");
    expect(fmtUtc(LATE)).toBe("2026-08-11 03:10 UTC");
  });

  it("gives a past event's year by Colombia's own clock, which ran on UTC−4 in 1992–93", () => {
    expect(fmtYear(Date.parse("1999-01-25T18:19:18Z"))).toBe(1999);
    expect(fmtYear(Date.parse("2027-01-01T04:30:00Z"))).toBe(2026);
    // 00:30 on 1 January 1993 in Colombia, during its daylight saving; a fixed UTC−5 says 1992.
    expect(fmtYear(Date.parse("1993-01-01T04:30:00Z"))).toBe(1993);
  });
  it("starts a day at Colombian midnight", () => {
    expect(new Date(dayStart(LATE)).toISOString()).toBe("2026-08-10T05:00:00.000Z");
    expect(new Date(dayStart("2026-08-11T05:00:00Z")).toISOString()).toBe("2026-08-11T05:00:00.000Z");
  });

  it("bounds a filter day in the same shape as event times, so string comparison holds at the edges", () => {
    const [from, to] = dayBounds("2026-08-10");
    expect([from, to]).toEqual(["2026-08-10T05:00:00Z", "2026-08-11T04:59:59Z"]);
    expect("2026-08-10T05:00:00Z" >= from && "2026-08-11T04:59:59Z" <= to).toBe(true);
    expect("2026-08-10T04:59:59Z" >= from).toBe(false);
    expect("2026-08-11T05:00:00Z" <= to).toBe(false);
  });
});

describe("region names", () => {
  it('drops the ", Colombia" every SGC region ends with, and only at the end', () => {
    expect(fmtRegion("Sipi - Choco, Colombia")).toBe("Sipi - Choco");
    expect(fmtRegion("San Jose del Palmar - Choco,Colombia")).toBe("San Jose del Palmar - Choco");
    expect(fmtRegion("Colombia, Pacific Ocean")).toBe("Colombia, Pacific Ocean");
  });
});
