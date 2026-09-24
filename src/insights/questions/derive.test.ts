import { describe, expect, it } from "vitest";
import type { QuakeLike } from "../claims";
import { fmtInt } from "../shared";
import {
  colombianDays,
  dailyCounts,
  energyInUnits,
  kmFrom,
  omoriFromFirstDay,
  ratioPhrase,
  relativeAmplitude,
} from "./derive";

let n = 0;
const quake = (time: string, over: Partial<QuakeLike> = {}): QuakeLike => ({
  id: `q${n++}`,
  time,
  lat: 3.85,
  lon: -75.6,
  depthKm: 19,
  mag: 3,
  magType: "MLr_2",
  status: "manual",
  ...over,
});

describe("colombianDays and dailyCounts", () => {
  it("counts by Colombian day (UTC−5) and ignores events below Mc", () => {
    // 04:59 UTC on the 21st is still the 20th in Colombia.
    const days = colombianDays(Date.parse("2026-09-20T12:00:00Z"), Date.parse("2026-09-22T12:00:00Z"));
    expect(days).toHaveLength(3);
    const counts = dailyCounts(
      [
        quake("2026-09-21T04:59:00Z"),
        quake("2026-09-21T05:00:00Z"),
        quake("2026-09-22T06:00:00Z", { mag: 2.6 }),
        quake("2026-09-22T06:00:00Z", { mag: 2.7 }),
      ],
      2.7,
      days,
    );
    expect(counts).toEqual([1, 1, 1]);
  });
});

describe("omoriFromFirstDay", () => {
  it("halves on day 2 and is a tenth on day 10", () => {
    const c = omoriFromFirstDay(40, 10);
    expect(c[0]).toBe(40);
    expect(c[1]).toBe(20);
    expect(c[9]).toBe(4);
  });
});

describe("kmFrom", () => {
  it("measures 0.02° of longitude at 3.85° N as ~2.2 km west", () => {
    const d = kmFrom({ lat: 3.85, lon: -75.6 }, { lat: 3.85, lon: -75.62 });
    expect(d.x).toBeCloseTo(-2.22, 1);
    expect(d.y).toBe(0);
  });
});

describe("energy and amplitude", () => {
  it("counts one M5.0 as ~31.6 M4.0s and an M7.4 as ~126 000", () => {
    expect(energyInUnits([{ mag: 5 }])).toBeCloseTo(31.62, 2);
    expect(energyInUnits([{ mag: 7.4 }])).toBeCloseTo(125_892.5, 0);
  });
  it("gives the reference itself a relative amplitude of 1, and a tenth for one unit smaller", () => {
    expect(relativeAmplitude(7.4, 124, 7.4, 124)).toBe(1);
    expect(relativeAmplitude(6.4, 124, 7.4, 124)).toBeCloseTo(0.1, 12);
    expect(relativeAmplitude(7.4, 248, 7.4, 124)).toBeCloseTo(0.5, 12);
  });
  it("says a ratio in words near 1, to a tenth below 10, and to two figures above", () => {
    expect(ratioPhrase(1.03)).toEqual({ kind: "same" });
    expect(ratioPhrase(0.96)).toEqual({ kind: "same" });
    // M7.3 against M7.4 in energy: 10^-0.15, about 1/1.4, never "1/1".
    expect(ratioPhrase(10 ** -0.15)).toEqual({ kind: "less", x: "1.4" });
    expect(ratioPhrase(1 / 317.4)).toEqual({ kind: "less", x: "320" });
    expect(ratioPhrase(1 / 12_345)).toEqual({ kind: "less", x: fmtInt(12_000) });
    expect(ratioPhrase(31.6)).toEqual({ kind: "more", x: "32" });
    expect(ratioPhrase(Number.NaN)).toEqual({ kind: "same" });
  });
});
