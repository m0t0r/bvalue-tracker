import { describe, expect, it } from "vitest";
import { HISTORY_FOR } from "./history";
import { DURATIONS, compareDurations } from "./durations";
import { releaseTimes } from "./release";

/** A moment-rate function sampled every `dt` seconds from 0 to `end`. */
const sample = (f: (t: number) => number, end: number, dt = 0.01) =>
  Array.from({ length: Math.round(end / dt) + 1 }, (_, i) => [i * dt, f(i * dt)] as const);

describe("releaseTimes", () => {
  it("finds when 5% and 95% of the moment are out, on a triangle", () => {
    // Rate t up to 5 s, then 10 − t: the area to t is t²/2 of 25, so 5% falls at √2.5 and 95% at 10 − √2.5.
    const r = releaseTimes(sample((t) => (t < 5 ? t : Math.max(0, 10 - t)), 20));
    expect(r.t5).toBeCloseTo(Math.sqrt(2.5), 1);
    expect(r.t95).toBeCloseTo(10 - Math.sqrt(2.5), 1);
    expect(r.moment).toBeCloseTo(25, 0);
  });

  it("gives times on the file's own axis, a quiet start included", () => {
    const r = releaseTimes(sample((t) => (t >= 10 && t < 20 ? 1 : 0), 30));
    expect(r.t5).toBeCloseTo(10.5, 1);
    expect(r.t95).toBeCloseTo(19.5, 1);
  });

  it("places a crossing inside its step, so coarse sampling moves neither time by a whole step", () => {
    // Ten one-second steps of rate 1 from 0 s: 5% is out at 0.5 s and 95% at 9.5 s, not at 0 and 9.
    const r = releaseTimes(Array.from({ length: 10 }, (_, i) => [i, 1] as const));
    expect(r.t5).toBeCloseTo(0.5, 9);
    expect(r.t95).toBeCloseTo(9.5, 9);
  });

  it("counts a negative rate, which a deconvolved function can dip to, as no release", () => {
    const withDip = releaseTimes(sample((t) => (t < 1 ? -5 : t < 11 ? 1 : 0), 20));
    expect(withDip.t5).toBeCloseTo(1.5, 1);
    expect(withDip.moment).toBeCloseTo(10, 1);
  });

  it("refuses a function with fewer than two samples or no release", () => {
    expect(() => releaseTimes([[0, 1]])).toThrow();
    expect(() => releaseTimes(sample(() => 0, 5))).toThrow();
  });
});

describe("the committed durations", () => {
  it("is about the event the history step is about", () => {
    expect(DURATIONS.main.sgcId).toBe(HISTORY_FOR);
    expect(DURATIONS.main.usgsId).toBe("us6000tjl2");
  });

  it("holds the times recomputed from USGS's and SCARDEC's files on 2026-09-26", () => {
    expect(DURATIONS.main).toMatchObject({ t5: 30.18, t95: 53.83 });
    const past = Object.fromEntries(DURATIONS.past.map((p) => [p.id, [p.t5, p.t95]]));
    // Neira and Calima, 1995, from SCARDEC's average source time functions.
    expect(past).toEqual({ iscgem89834: [0.91, 4.16], iscgem118073: [0.49, 2.44] });
  });
});

describe("compareDurations", () => {
  it("compares the central 90% in whole seconds, longest first", () => {
    const d = compareDurations({ id: HISTORY_FOR }, true)!;
    expect(d.main.core).toBe(24);
    expect(d.main.seconds).toBeCloseTo(23.65, 9);
    expect(d.past.map((p) => [p.quake.id, p.core])).toEqual([
      ["iscgem89834", 3],
      ["iscgem118073", 2],
    ]);
    expect(d.past[0]!.quake.name.es).toBe("Neira (Caldas)");
  });

  it("rounds the slow start down, so less than 5% was out by then", () => {
    // 30.18 s: "in the first 30 seconds" holds; rounding 29.6 up to 30 would not.
    expect(compareDurations({ id: HISTORY_FOR }, true)!.main.slow).toBe(30);
    expect(DURATIONS.main.t5).toBeGreaterThanOrEqual(30);
  });

  it("is shown only for the M7.4, and only once the page's rule has found it", () => {
    expect(compareDurations({ id: HISTORY_FOR }, false)).toBeNull();
    expect(compareDurations({ id: "SGC2026zzzzzz" }, true)).toBeNull();
  });
});
