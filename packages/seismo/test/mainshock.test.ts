import { describe, expect, it } from "vitest";
import { assessMainshock, magnitudeGap } from "../src/index.ts";

interface Ev {
  id: string;
  mag: number;
  reviewed: boolean;
}
const ev = (id: string, mag: number, reviewed = true): Ev => ({ id, mag, reviewed });
const assess = (events: Ev[], minGap = 1.0) => assessMainshock(events, (e) => e.reviewed, { minGap });

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("assessMainshock", () => {
  it("finds a reviewed event that stands clear of every other by the gap", () => {
    const r = assess([ev("a", 3.1), ev("main", 5.0), ev("b", 3.8), ev("c", 2.4)]);
    expect(r.state).toBe("found");
    expect(r.largest?.id).toBe("main");
    expect(r.runnerUp?.id).toBe("b");
    expect(r.gap).toBe(1.2);
  });

  // In floating point 4.6 − 3.6 is 0.9999999999999996: a subtraction would miss this mainshock.
  it("counts a gap of exactly the threshold, in whole tenths", () => {
    expect(4.6 - 3.6).toBeLessThan(1);
    const r = assess([ev("main", 4.6), ev("b", 3.6)]);
    expect(r).toMatchObject({ state: "found", gap: 1 });
    expect(assess([ev("x", 4.5), ev("y", 3.6)])).toMatchObject({ state: "none", gap: 0.9 });
    // The same trap one step up, for Båth's 1.2.
    expect(assess([ev("main", 6.1), ev("b", 4.9)], 1.2)).toMatchObject({ state: "found", gap: 1.2 });
  });

  it("waits for review when the largest event would stand clear but is automatic", () => {
    const r = assess([ev("auto", 5.6, false), ev("b", 4.5), ev("c", 4.2)]);
    expect(r).toMatchObject({ state: "awaiting-review", gap: 1.1 });
    expect(r.largest?.id).toBe("auto");
  });

  // An automatic event close in size still means "not dominant": it counts as the runner-up.
  it("lets an automatic event close in size stop a reviewed one", () => {
    const r = assess([ev("main", 5.0), ev("auto", 4.3, false), ev("c", 3.0)]);
    expect(r).toMatchObject({ state: "none", gap: 0.7 });
    expect(r.runnerUp?.id).toBe("auto");
  });

  // A reviewed event below a larger automatic one is never the candidate: the largest event is.
  it("does not fall back to the largest reviewed event when a larger one is automatic", () => {
    const r = assess([ev("auto", 7.6, false), ev("main", 7.4), ev("c", 4.9)]);
    expect(r).toMatchObject({ state: "none", gap: 0.2 });
    expect(r.largest?.id).toBe("auto");
  });

  it("gives no mainshock when two events share the top magnitude", () => {
    expect(assess([ev("a", 4.0), ev("b", 4.0), ev("c", 2.5)])).toMatchObject({ state: "none", gap: 0 });
  });

  it("gives no mainshock to an empty catalogue or a single event, which has nothing to stand clear of", () => {
    expect(assess([])).toEqual({ state: "none", largest: null, runnerUp: null, gap: null });
    expect(assess([ev("only", 6.0)])).toMatchObject({ state: "none", runnerUp: null, gap: null });
  });

  // The label is retrospective: a later, larger event takes it, and the old mainshock becomes a foreshock.
  it("moves the label to a later, larger event", () => {
    const events = [ev("first", 5.0), ev("a", 3.8), ev("b", 3.1)];
    expect(assess(events).largest?.id).toBe("first");
    const r = assess([...events, ev("later", 6.2)]);
    expect(r).toMatchObject({ state: "found", gap: 1.2 });
    expect(r.largest?.id).toBe("later");
    expect(r.runnerUp?.id).toBe("first");
  });

  it("follows the threshold it is given", () => {
    const events = [ev("main", 5.0), ev("b", 3.9)];
    expect(assess(events, 1.0).state).toBe("found");
    expect(assess(events, 1.2).state).toBe("none");
  });

  /**
   * The answer depends on the two largest events and on nothing else, which is what lets a database
   * hand over just those two (`ORDER BY mag DESC LIMIT 2`). Checked on random catalogues, in random
   * order, with ties, against the same catalogue cut to its two largest.
   */
  it("depends only on the two largest events, whatever their order", () => {
    const rnd = mulberry32(7);
    for (let trial = 0; trial < 500; trial++) {
      const n = 1 + Math.floor(rnd() * 40);
      const events = Array.from({ length: n }, (_, i) =>
        ev(`e${i}`, Math.round((2 + rnd() * rnd() * 5) * 10) / 10, rnd() < 0.8),
      );
      const full = assess(events);
      const top2 = [...events].sort((a, b) => b.mag - a.mag).slice(0, 2);
      const cut = assess(top2);
      expect({ state: cut.state, gap: cut.gap }).toEqual({ state: full.state, gap: full.gap });
      if (full.state !== "none") expect(cut.largest).toBe(full.largest);
      const shuffled = [...events].sort(() => rnd() - 0.5);
      expect(assess(shuffled)).toMatchObject({ state: full.state, gap: full.gap });
    }
  });
});

describe("magnitudeGap", () => {
  it("is exact to the tenth", () => {
    expect(magnitudeGap(4.6, 3.6)).toBe(1);
    expect(magnitudeGap(7.4, 4.9)).toBe(2.5);
    expect(magnitudeGap(4.2, 4.5)).toBe(-0.3);
  });
});
