import { describe, expect, it } from "vitest";
import {
  dayBounds,
  dayStart,
  fmtDateLong,
  fmtDateTime,
  fmtDay,
  fmtDayLong,
  fmtDayRange,
  fmtIsoDay,
  fmtIsoDateTime,
  fmtPlace,
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
    expect(fmtDay(Date.parse(LATE), "es")).toBe("10\u00A0ago");
    expect(fmtIsoDateTime(LATE)).toBe("2026-08-10 22:10");
    expect(fmtUtc(LATE)).toBe("2026-08-11 03:10 UTC");
  });

  it("keeps a short day on one line, and writes it out in full for running prose", () => {
    // A no-break space: "20 sept – 22 / sept" broke across lines in the b card.
    expect(fmtDay(Date.parse("2026-09-20T17:00:00Z"), "es")).toBe("20\u00A0sept");
    expect(fmtDayLong(Date.parse(LATE), "es")).toBe("10 de agosto");
    expect(fmtDayLong(Date.parse(LATE), "en")).toBe("10 August");
    // With its year, for a day in another year: the 1979 earthquake the story names in a sentence.
    expect(fmtDateLong(Date.parse("1979-11-23T23:40:00Z"), "es")).toBe("23 de noviembre de 1979");
    expect(fmtDateLong(Date.parse("1979-11-23T23:40:00Z"), "en")).toBe("23 November 1979");
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

  it("reads SGC's 'municipality - department' as a place, 'Chaparral, Tolima'", () => {
    expect(fmtPlace("Chaparral - Tolima, Colombia")).toBe("Chaparral, Tolima");
    expect(fmtPlace("El Litoral del San Juan (Docordo) - Choco, Colombia")).toBe(
      "El Litoral del San Juan (Docordo), Choco",
    );
    expect(fmtPlace("Medio Baudo(Boca de Pepe) - Choco, Colombia")).toBe("Medio Baudo(Boca de Pepe), Choco");
    expect(fmtPlace("Colombia, Pacific Ocean")).toBe("Colombia, Pacific Ocean");
  });
});

describe("a range of Colombian days", () => {
  const day = (date: string) => Date.parse(`${date}T05:00:00Z`);

  it("names one day as the day itself", () => {
    expect(fmtDayRange(day("2026-09-12"), day("2026-09-12"), "es")).toBe("12\u00A0sept");
  });

  it("writes the month once when both ends share it", () => {
    expect(fmtDayRange(day("2026-09-12"), day("2026-09-18"), "es")).toBe("12–18\u00A0sept");
    expect(fmtDayRange(day("2026-09-12"), day("2026-09-18"), "en")).toBe("12–18\u00A0Sept");
  });

  it("keeps each end whole across a month, and never breaks after the dash", () => {
    expect(fmtDayRange(day("2026-08-30"), day("2026-09-02"), "es")).toBe("30\u00A0ago –\u2060 2\u00A0sept");
  });

  it("gives a file name the Colombian date, not the UTC one", () => {
    expect(fmtIsoDay(day("2026-09-12"))).toBe("2026-09-12");
    expect(fmtIsoDay(dayStart(LATE))).toBe("2026-08-10");
  });
});
