import { describe, expect, it } from "vitest";
import { asOf } from "./as-of";

const CLOCK = Date.parse("2026-10-11T12:00:00Z");

describe("asOf", () => {
  it("ends the window at the last sync, not at the clock", () => {
    expect(asOf(["2026-10-01T08:00:00Z"], CLOCK)).toBe(Date.parse("2026-10-01T08:00:00Z"));
  });

  it("takes the oldest sync when a claim spans several zones", () => {
    expect(asOf(["2026-10-09T08:00:00Z", "2026-10-01T08:00:00Z"], CLOCK)).toBe(Date.parse("2026-10-01T08:00:00Z"));
  });

  it("never runs ahead of the clock", () => {
    expect(asOf(["2026-10-12T08:00:00Z"], CLOCK)).toBe(CLOCK);
  });

  // A failed status or a zone never synced says nothing about where the data stops.
  it.each([[[null]], [[undefined]], [["2026-10-01T08:00:00Z", null]], [["not a date"]]])(
    "keeps the clock while a sync time is unknown (%j)",
    (syncs) => {
      expect(asOf(syncs, CLOCK)).toBe(CLOCK);
    },
  );
});
