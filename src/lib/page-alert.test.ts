import { describe, expect, it } from "vitest";
import { pageAlert } from "./page-alert";

const none = { catalogueFailed: false, ingestFailed: false, incomplete: false };

/** The page shows at most one alert: the state that matters most right now (2026-09-26). */
describe("pageAlert", () => {
  it("is null when nothing is wrong", () => {
    expect(pageAlert(none)).toBeNull();
  });
  it("names each state on its own", () => {
    expect(pageAlert({ ...none, incomplete: true })).toBe("backfill");
    expect(pageAlert({ ...none, ingestFailed: true })).toBe("ingest");
    expect(pageAlert({ ...none, catalogueFailed: true })).toBe("load");
  });
  it("puts a failed load above everything: there is nothing on the page to caveat", () => {
    expect(pageAlert({ catalogueFailed: true, ingestFailed: true, incomplete: true })).toBe("load");
  });
  it("puts a failed SGC query above the back-fill it stalls", () => {
    expect(pageAlert({ ...none, ingestFailed: true, incomplete: true })).toBe("ingest");
  });
});
