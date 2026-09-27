import { describe, expect, it } from "vitest";
import { fmtClock, relativeTime, relativeTimeShort } from "@/lib/format";

const NOW = Date.parse("2026-09-19T12:00:00Z");
const ago = (seconds: number, lang: "es" | "en" = "es") =>
  relativeTime(new Date(NOW - seconds * 1000).toISOString(), lang, NOW);

describe("how long ago something happened", () => {
  it("never counts in seconds: the clock behind it only ticks every 30 s", () => {
    for (const s of [0, 5, 45, 59]) expect(ago(s)).toBe("hace menos de un minuto");
    expect(ago(0, "en")).toBe("less than a minute ago");
  });

  it("says the same for a time just ahead of the reader's clock, rather than 'dentro de 5 segundos'", () => {
    expect(ago(-5)).toBe("hace menos de un minuto");
    expect(ago(-59, "en")).toBe("less than a minute ago");
  });

  it("rounds to whole minutes", () => {
    expect(ago(66)).toBe("hace 1 minuto");
    expect(ago(86)).toBe("hace 1 minuto");
    expect(ago(100)).toBe("hace 2 minutos");
    expect(ago(47 * 60, "en")).toBe("47 minutes ago");
  });

  it("moves up a unit rather than running past it: no 60 minutes, no 24 hours", () => {
    expect(ago(59.7 * 60)).toBe("hace 1 hora");
    expect(ago(86 * 60)).toBe("hace 1 hora");
    expect(ago(100 * 60)).toBe("hace 2 horas");
    expect(ago(23.7 * 3600)).toBe("hace 1 día");
  });

  it("keeps days numeric, because elapsed hours do not name a calendar day", () => {
    expect(ago(25 * 3600)).toBe("hace 1 día");
    expect(ago(3 * 86_400)).toBe("hace 3 días");
    expect(ago(2 * 86_400, "en")).toBe("2 days ago");
  });
});

describe("how long ago, where there is little room", () => {
  const short = (seconds: number, lang: "es" | "en" = "es") =>
    relativeTimeShort(new Date(NOW - seconds * 1000).toISOString(), lang, NOW);

  it("says under a minute as '<1 min', ahead of the reader's clock too", () => {
    expect(short(30)).toBe("hace\u00A0<1\u00A0min");
    expect(short(-5)).toBe("hace\u00A0<1\u00A0min");
    expect(short(0, "en")).toBe("<1m\u00A0ago");
  });

  it("keeps whole minutes exact and marks rounded hours and days with '~'", () => {
    expect(short(7 * 60)).toBe("hace\u00A07\u00A0min");
    expect(short(47 * 60, "en")).toBe("47m\u00A0ago");
    expect(short(59.7 * 60)).toBe("hace\u00A0~1\u00A0h");
    expect(short(100 * 60)).toBe("hace\u00A0~2\u00A0h");
    expect(short(100 * 60, "en")).toBe("~2h\u00A0ago");
    expect(short(3 * 86_400)).toBe("hace\u00A0~3\u00A0d");
  });
});

describe("the time of something earlier, for a sentence", () => {
  // 12:00 UTC is 07:00 in Colombia; the Colombian day began at 05:00 UTC.
  it("gives only the time when it was earlier the same Colombian day", () => {
    expect(fmtClock(Date.parse("2026-09-19T05:00:00Z"), "es", NOW)).toEqual({ time: "00:00", day: null });
    expect(fmtClock(Date.parse("2026-09-19T11:35:00Z"), "en", NOW)).toEqual({ time: "06:35", day: null });
  });

  // 04:59 UTC is still the 18th in Colombia, although it is the 19th in UTC.
  it("adds the day, by Colombia's calendar, when it was another day", () => {
    expect(fmtClock(Date.parse("2026-09-19T04:59:00Z"), "es", NOW)).toEqual({ time: "23:59", day: "18\u00A0sept" });
    expect(fmtClock(Date.parse("2026-09-17T17:35:00Z"), "en", NOW)).toEqual({ time: "12:35", day: "17\u00A0Sept" });
  });
});
