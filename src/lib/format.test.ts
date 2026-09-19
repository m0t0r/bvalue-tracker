import { describe, expect, it } from "vitest";
import { relativeTime } from "@/lib/format";

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
