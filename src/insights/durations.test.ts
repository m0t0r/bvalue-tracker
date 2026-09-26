import { describe, expect, it } from "vitest";
import { HISTORY_FOR } from "./history";
import { DURATIONS, shakingDuration } from "./durations";
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

  it("holds the times recomputed from USGS's file on 2026-09-26", () => {
    expect(DURATIONS.main.t95).toBe(53.83);
  });
});

describe("shakingDuration", () => {
  it("leads with how long the ground moved, SGC's 90 s to 2 min near the epicentre", () => {
    const d = shakingDuration({ id: HISTORY_FOR }, true)!;
    expect(d.nearEpicentre).toEqual({ fromS: 90, toS: 120 });
  });

  it("gives the fault's own time, to 95% of the moment from the model's start, in whole seconds", () => {
    // Not the central 90% (24 s): with nothing to compare it with, the reader's question is how long
    // the fault moved, and the model's whole release says that.
    expect(shakingDuration({ id: HISTORY_FOR }, true)!.ruptureS).toBe(54);
  });

  it("puts the fault's time below the ground's, which is the point the step makes", () => {
    const d = shakingDuration({ id: HISTORY_FOR }, true)!;
    expect(d.ruptureS).toBeLessThan(d.nearEpicentre.fromS);
  });

  it("holds the Pereira station's recording as measured on 2026-09-26", () => {
    // CBOCA, from SGC's FDSN service; recomputed with ObsPy by scripts/insights-shaking.py.
    expect(DURATIONS.pereira).toMatchObject({
      station: "CBOCA",
      kmFromPereira: 6.6,
      arrivalS: 19.4,
      strongFromS: 49.6,
      strongToS: 99.6,
      peakS: 97.4,
      recordedToS: 248.4,
    });
  });

  it("tells the arc in Pereira in the round figures the prose says 'unos' to", () => {
    const p = shakingDuration({ id: HISTORY_FOR }, true)!.pereira;
    // Arrival and peak to 5 s, the strong part to the second, the recording to the minute.
    expect(p).toMatchObject({ km: 7, arrival: 20, peak: 95, strong: 50, recordedMin: 4 });
  });

  it("says the strongest shaking came after the fault stopped only while it did", () => {
    // 97.4 s against the fault's 53.83 s.
    expect(shakingDuration({ id: HISTORY_FOR }, true)!.peakAfterRupture).toBe(true);
  });

  it("is shown only for the M7.4, and only once the page's rule has found it", () => {
    expect(shakingDuration({ id: HISTORY_FOR }, false)).toBeNull();
    expect(shakingDuration({ id: "SGC2026zzzzzz" }, true)).toBeNull();
  });
});
