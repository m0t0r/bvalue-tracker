import captured from "../../../test/fixtures/api-events-2026-09-24.json";
import { describe, expect, it } from "vitest";
import { insights, type Catalogues } from "../claims";
import { horizontalErrorKm, median } from "../shared";
import { energyShares, omoriCurve, storyModel, strongByWeek, type Ev } from "./model";

const DAY = 86_400_000;
const NOW = Date.parse("2026-09-24T14:44:03Z");

const ev = (t: number, over: Partial<Ev> = {}): Ev => ({
  id: `e${t}`,
  time: new Date(t).toISOString(),
  t,
  lat: 3.85,
  lon: -75.6,
  depthKm: 19,
  mag: 3,
  magType: "MLr_2",
  status: "manual",
  source: "tolima",
  ...over,
});

describe("omoriCurve", () => {
  it("holds exactly the first day's count under its first day", () => {
    const rate = omoriCurve(76);
    // Integrate numerically over [0, 1] day.
    let sum = 0;
    const n = 100_000;
    for (let i = 0; i < n; i++) sum += rate((i + 0.5) / n) / n;
    expect(sum).toBeCloseTo(76, 2);
  });
  it("falls as 1/t once t is well past c", () => {
    const rate = omoriCurve(50);
    expect(rate(10) / rate(20)).toBeCloseTo(20.05 / 10.05, 9);
  });
});

describe("energyShares", () => {
  it("sums to one, largest first, and gives a one-unit-larger event 31.6 parts to 1", () => {
    const s = energyShares([{ mag: 4 }, { mag: 5 }]);
    expect(s[0]! + s[1]!).toBeCloseTo(1, 12);
    expect(s[0]! / s[1]!).toBeCloseTo(31.62, 2);
  });
  it("is empty for no events", () => {
    expect(energyShares([])).toEqual([]);
  });
});

describe("strongByWeek", () => {
  it("counts events at or above the threshold in 7-day weeks, the week in progress included", () => {
    const start = Date.parse("2026-08-10T00:00:00Z");
    const es = [ev(start + DAY, { mag: 4 }), ev(start + 8 * DAY, { mag: 3.9 }), ev(start + 15 * DAY, { mag: 4.2 })];
    expect(strongByWeek(es, start, start + 16 * DAY, 4)).toEqual([1, 0, 1]);
  });
});

describe("storyModel on the production catalogue of 2026-09-24", () => {
  const m = storyModel(insights(captured as Catalogues, NOW));

  it("finds Chocó's mainshock and the swarm's largest event", () => {
    expect(m.main?.mag).toBe(7.4);
    expect(m.mainFound).toBe(true);
    expect(m.tolimaLargest?.mag).toBe(4.5);
    expect(m.mainHypoKm).toBeCloseTo(124.25, 1);
  });

  it("anchors the 1/t curve to the deep group's first-day count", () => {
    expect(m.deepFirstDay).toBeGreaterThan(20);
    expect(m.omori(0.5)).toBeGreaterThan(m.omori(5));
  });

  it("counts the energy of every event once per zone", () => {
    expect(m.energy.choco.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    expect(m.energy.choco[0]).toBeGreaterThan(0.998);
    expect(m.energy.tolima[0]).toBeLessThan(0.15);
  });

  it("leaves the mainshock out of the strong events since the start", () => {
    expect(m.strongSince.some((e) => e.mag === 7.4)).toBe(false);
    expect(m.strongSince.every((e) => e.mag >= 4)).toBe(true);
  });

  it("measures horizontal error as latitude and longitude together, the drift claim's measure", () => {
    const choco = m.choco.flatMap((e) => (horizontalErrorKm(e) === null ? [] : [horizontalErrorKm(e)!]));
    expect(m.errors.choco.h).toBeCloseTo(median(choco)!, 12);
    expect(m.errors.choco.depth).toBeGreaterThan(0);
  });

  it("words the story for this catalogue: similar distances, a dominant mainshock, snapped crustal depths", () => {
    expect(m.facts).toMatchObject({
      distancesSimilar: true,
      mainDominant: true,
      mainHoldsMost: true,
      deepNearMain: true,
      shallowWest: true,
      eastDeeper: true,
      depthsSnapped: true,
      tolimaCrustal: true,
      tolimaFarFromPlate: true,
    });
  });

  it("shows Chaparral's cut, and only while Chocó's plate step explains the margin it uses", () => {
    expect(m.tolimaCut).toBe(true);
    const cat = captured as Catalogues;
    // With no shallow group there is no plate step in Chocó, so no Chaparral cut either.
    const noShallow = storyModel(insights({ ...cat, choco: cat.choco.filter((e) => e.depthKm >= 70) }, NOW));
    expect(noShallow.plate.tolima).not.toBeNull();
    expect(noShallow.tolimaCut).toBe(false);
  });

  it("puts Pereira ~107 km north of the swarm's centre, off Chaparral's cut", () => {
    // Haversine from Pereira to the median of the fixture's 601 Chaparral events, recomputed in Python.
    expect(m.tolimaToPereiraKm).toBeCloseTo(106.54, 1);
  });

  it("calls the swarm much further from the plate only while it is at least twice any Chocó source's gap", () => {
    // Fixture gaps above the plate's top: shallow 30.3 km, deep −6.6, M7.4 −20.8; Chaparral 141.3.
    const gaps = [m.plate.shallow, m.plate.deep, m.plate.main].map((p) => p!.plate.topKm - p!.depthKm);
    const t = m.plate.tolima!;
    expect(t.plate.topKm - t.depthKm).toBeGreaterThan(2 * Math.max(...gaps));
    const cat = captured as Catalogues;
    const with_ = (over: Partial<Catalogues>) =>
      storyModel(insights({ ...cat, ...over }, NOW)).facts.tolimaFarFromPlate;
    // The swarm 60 km deeper is no longer in the crust (median ~79 km), though still 81 km above the plate.
    expect(with_({ tolima: cat.tolima.map((e) => ({ ...e, depthKm: e.depthKm + 60 })) })).toBe(false);
    // Chocó's shallow events at 1 km put the shallow group ~71 km above the plate: twice that exceeds
    // the swarm's 141 km, so the swarm is no longer "much further".
    const shallowAt1 = cat.choco.map((e) => (e.depthKm < 70 ? { ...e, depthKm: 1 } : e));
    expect(with_({ choco: shallowAt1 })).toBe(false);
  });

  it("stops calling the mainshock dominant once a later event takes its share or its title", () => {
    const later = {
      id: "big-later",
      time: "2026-09-24T10:00:00Z",
      lat: 4.5,
      lon: -76.7,
      depthKm: 40,
      mag: 7.4,
      magType: "Mw",
      status: "manual",
    };
    const cat = captured as Catalogues;
    const moved = storyModel(insights({ ...cat, choco: [...cat.choco, later] }, NOW));
    expect(moved.facts.mainDominant).toBe(false);
    expect(moved.facts.mainHoldsMost).toBe(false);
  });

  it("draws the swarm's track from 12-hour windows of at least 20 events, in time order", () => {
    expect(m.tolimaWindows.length).toBeGreaterThan(3);
    expect(m.tolimaWindows.every((w) => w.events.length >= 20)).toBe(true);
    for (let i = 1; i < m.tolimaWindows.length; i++)
      expect(m.tolimaWindows[i]!.start).toBeGreaterThan(m.tolimaWindows[i - 1]!.start);
  });
});
