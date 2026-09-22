import { describe, expect, it } from "vitest";
import { EventRejected, admitEvent } from "../core/admit.ts";

/** Every cell as a string, which is what both doors actually hand over. */
const raw = (over: Record<string, unknown> = {}) => ({
  id: "SGC2026pqqmro",
  time: "2026-08-10T12:34:27Z",
  lat: "4.99093472",
  lon: "-76.29174107",
  depthKm: "103.4093192",
  mag: "7.4",
  magType: "Mw",
  phases: "119",
  rmsS: "1.2",
  gapDeg: "79",
  errLatKm: "1.603",
  errLonKm: "1.916",
  errDepthKm: "3.49",
  region: "San Jose del Palmar - Choco, Colombia",
  status: "manual",
  solutionStamp: "2026-08-10T19:08:37Z",
  ...over,
});

describe("admitEvent", () => {
  it("turns a record of cells into an event, numbers as numbers", () => {
    expect(admitEvent(raw())).toEqual({
      id: "SGC2026pqqmro",
      time: "2026-08-10T12:34:27Z",
      lat: 4.99093472,
      lon: -76.29174107,
      depthKm: 103.4093192,
      mag: 7.4,
      magType: "Mw",
      phases: 119,
      rmsS: 1.2,
      gapDeg: 79,
      errLatKm: 1.603,
      errLonKm: 1.916,
      errDepthKm: 3.49,
      region: "San Jose del Palmar - Choco, Colombia",
      status: "manual",
      solutionStamp: "2026-08-10T19:08:37Z",
    });
  });

  it("takes a number as readily as the string for it", () => {
    expect(admitEvent(raw({ lat: 4.5, mag: 2.1, phases: 12 }))).toMatchObject({ lat: 4.5, mag: 2.1, phases: 12 });
  });

  it("drops anything that is not one of the event's own fields", () => {
    expect(admitEvent(raw({ notes: "hand-added", removedAt: null }))).not.toHaveProperty("notes");
  });

  // Bounds are what the quantity can physically be: out of range means the row is wrong.
  it.each([
    ["lat", "91", "[-90, 90]"],
    ["lat", "-91", "[-90, 90]"],
    ["lon", "181", "[-180, 180]"],
    ["depthKm", "1001", "[-10, 1000]"],
    ["depthKm", "-11", "[-10, 1000]"],
    ["mag", "10.1", "[-2, 10]"],
    ["mag", "-2.5", "[-2, 10]"],
  ])("rejects %s = %s, outside %s", (field, value, range) => {
    expect(() => admitEvent(raw({ [field]: value }))).toThrow(`${field} out of range ${range}`);
  });

  it.each(["lat", "lon", "depthKm", "mag"])("rejects a blank %s", (field) => {
    expect(() => admitEvent(raw({ [field]: "" }))).toThrow(`${field} is not numeric`);
  });

  it("names the field that failed, so a caller can say where", () => {
    try {
      admitEvent(raw({ mag: "1e7" }));
      expect.unreachable("should have rejected");
    } catch (err) {
      expect(err).toBeInstanceOf(EventRejected);
      expect((err as EventRejected).field).toBe("mag");
    }
  });

  // SGC leaves the solution-quality columns blank often enough that a missing one is an
  // absent figure, not a wrong row. They reach no array size, so they are not bounded.
  it.each(["phases", "rmsS", "gapDeg", "errLatKm", "errLonKm", "errDepthKm"])(
    "reads a blank %s as no figure rather than rejecting the event",
    (field) => {
      expect(admitEvent(raw({ [field]: "" }))).toMatchObject({ [field]: null });
      expect(admitEvent(raw({ [field]: "n/d" }))).toMatchObject({ [field]: null });
    },
  );

  it("keeps a large but harmless quality figure", () => {
    expect(admitEvent(raw({ gapDeg: "1e7" }))).toMatchObject({ gapDeg: 1e7 });
  });

  it.each(["javascript:alert(1)", "../../etc/passwd", "SGC 2026 pqqmro", "", "a".repeat(65)])(
    "rejects the id %j",
    (id) => {
      expect(() => admitEvent(raw({ id }))).toThrow(/id is not an SGC event id|id is missing/);
    },
  );

  it.each([
    ["2026-02-30T00:00:00Z", "a day that does not exist"],
    ["2026-08-10 12:34:27", "SGC's own wire form, which only the HTML reader speaks"],
    ["10/08/2026", "the form's date shape"],
    ["2026-08-10T12:34:27+05:00", "an offset other than UTC"],
  ])("rejects the time %j (%s)", (time) => {
    expect(() => admitEvent(raw({ time }))).toThrow(/time is not a UTC instant/);
  });

  it("requires a time but not a solution stamp", () => {
    expect(() => admitEvent(raw({ time: "" }))).toThrow(/time is missing/);
    expect(admitEvent(raw({ solutionStamp: "" }))).toMatchObject({ solutionStamp: null });
    expect(admitEvent(raw({ solutionStamp: null }))).toMatchObject({ solutionStamp: null });
  });

  it.each(["magType", "region", "status"])("rejects a missing %s", (field) => {
    expect(() => admitEvent(raw({ [field]: undefined }))).toThrow(`${field} is missing`);
  });
});
