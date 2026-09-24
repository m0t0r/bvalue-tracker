import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLUSTER_DEPTH_KM, clusterOf, computeClusterStats } from "../core/clusters.ts";
import { bValue, computeStats, dominantMagType } from "@bvalue/seismo";
import { MAINSHOCK_ID, parseCatalogHtml } from "../core/seiscomp.ts";

const fixture = parseCatalogHtml(
  readFileSync(new URL("./fixtures/seiscomp-2026-08-10_2026-09-18.html", import.meta.url), "utf8"),
).events;
// The fixture was captured on 2026-09-18; "the last 7 days" is measured from here.
const NOW = Date.parse("2026-09-18T23:59:59Z");

describe("clusterOf", () => {
  it("cuts at 70 km, and the cut itself is deep", () => {
    expect(CLUSTER_DEPTH_KM).toBe(70);
    expect(clusterOf({ depthKm: 0 })).toBe("shallow");
    expect(clusterOf({ depthKm: 69.99 })).toBe("shallow");
    expect(clusterOf({ depthKm: 70 })).toBe("deep");
    expect(clusterOf({ depthKm: 70.0000001 })).toBe("deep");
    expect(clusterOf({ depthKm: 103.4 })).toBe("deep");
  });
});

describe("computeClusterStats on the captured catalogue", () => {
  const s = computeClusterStats(fixture, null, NOW);

  it("leaves the unsplit statistics exactly as computeStats gives them", () => {
    expect(s.all).toEqual(computeStats(fixture));
  });

  it("loses and double-counts nothing at the cut", () => {
    expect(s.shallow.stats.count + s.deep.stats.count).toBe(s.all.count);
    expect(s.shallow.stats.fit!.n + s.deep.stats.fit!.n).toBe(s.all.fit!.n);
    const at = (bins: { mag: number; count: number }[], mag: number) => bins.find((b) => b.mag === mag)?.count ?? 0;
    for (const bin of s.all.bins) {
      expect(at(s.shallow.stats.bins, bin.mag) + at(s.deep.stats.bins, bin.mag)).toBe(bin.count);
    }
  });

  // Reference figures, recomputed independently in Python from the same 786 events.
  it("matches the reference figures", () => {
    expect(s.all.mc).toBe(2.3);
    expect(s.shallow.stats.count).toBe(639);
    expect(s.deep.stats.count).toBe(147);
    expect(s.shallow.stats.fit!.n).toBe(438);
    expect(s.shallow.stats.fit!.b).toBeCloseTo(0.7381, 4);
    expect(s.shallow.stats.fit!.sigmaB).toBeCloseTo(0.0315, 4);
    expect(s.deep.stats.fit!.n).toBe(90);
    expect(s.deep.stats.fit!.b).toBeCloseTo(0.816, 3);
    expect(s.deep.stats.fit!.sigmaB).toBeCloseTo(0.1116, 4);
  });

  it("finds the slide in b inside the shallow cluster, and too few deep events for any window", () => {
    const w = s.shallow.stats.windows;
    expect(w).toHaveLength(29);
    expect(w[0]!.b).toBeCloseTo(1.079, 3);
    expect(w.at(-1)!.b).toBeCloseTo(0.57, 2);
    expect(s.deep.stats.windows).toHaveLength(0);
  });

  it("says the two b-values cannot be told apart", () => {
    expect(s.difference!.dAic).toBeCloseTo(-1.2658, 3);
    expect(s.difference!.p).toBeCloseTo(0.2548, 3);
  });

  it("gives both clusters the Mc of the unsplit catalogue, and flags neither as incomplete", () => {
    expect(s.shallow.stats.mc).toBe(s.all.mc);
    expect(s.deep.stats.mc).toBe(s.all.mc);
    expect(s.shallow.ownMcHigher).toBe(false);
    expect(s.deep.ownMcHigher).toBe(false);
  });

  it("counts recent activity: the shallow cluster is active, the deep one has gone quiet", () => {
    expect(s.shallow.recent).toBe(
      fixture.filter((e) => e.depthKm < 70 && Date.parse(e.time) > NOW - 7 * 86_400_000).length,
    );
    expect(s.shallow.recent).toBeGreaterThan(100);
    expect(s.deep.recent).toBeLessThan(5);
    expect(s.shallow.recentMaxMag).toBe(4.9);
    expect(s.deep.recentMaxMag).toBe(3.4);
    expect(s.shallow.lastTime! > s.deep.lastTime!).toBe(true);
  });

  // If a revision by SGC ever puts a population on the cut, this fails and the rule needs another look.
  it("does not depend on where in the 55–75 km gap the cut falls", () => {
    const mc = s.all.mc!;
    for (const cut of [55, 60, 65, 75]) {
      const b = (deep: boolean) =>
        bValue(
          fixture.filter((e) => e.depthKm >= cut === deep).map((e) => e.mag),
          mc,
        ).b;
      expect(Math.abs(b(false) - s.shallow.stats.fit!.b)).toBeLessThan(0.01);
      expect(Math.abs(b(true) - s.deep.stats.fit!.b)).toBeLessThan(0.03);
    }
  });

  it("keeps one Mc across every cluster and magnitude-type combination", () => {
    const type = dominantMagType(fixture)!;
    for (const events of [fixture, fixture.filter((e) => e.magType === type)]) {
      const c = computeClusterStats(events, s.all.mc, NOW);
      for (const stats of [c.all, c.shallow.stats, c.deep.stats]) {
        expect(stats.mc).toBe(2.3);
        expect(stats.fit).not.toBeNull();
      }
    }
  });

  it("passes an Mc override to all three", () => {
    const c = computeClusterStats(fixture, 2.5, NOW);
    expect([c.all.mc, c.shallow.stats.mc, c.deep.stats.mc]).toEqual([2.5, 2.5, 2.5]);
    expect(c.shallow.stats.fit!.n + c.deep.stats.fit!.n).toBe(c.all.fit!.n);
  });
});

describe("computeClusterStats at the edges", () => {
  const ev = (mag: number, depthKm: number, i = 0) => ({
    mag,
    depthKm,
    time: new Date(Date.UTC(2026, 7, 10) + i * 60_000).toISOString(),
  });

  it("shares the pooled Mc even when a cluster's own Mc is higher, and says so", () => {
    // 300 shallow events peaking at M2.0; 100 deep ones peaking at M2.8.
    const shallow = Array.from({ length: 300 }, (_, i) => ev(2.0 + (i % 10 === 0 ? 0.5 : 0) + (i % 3) * 0.1, 40, i));
    const deep = Array.from({ length: 100 }, (_, i) => ev(2.8 + (i % 4) * 0.1, 90, 300 + i));
    const c = computeClusterStats([...shallow, ...deep], null, NOW);
    expect(c.all.mc).toBe(2.2);
    expect(c.deep.stats.mcMaxc).toBe(3.0);
    expect(c.deep.stats.mc).toBe(2.2);
    expect(c.deep.ownMcHigher).toBe(true);
    expect(c.shallow.ownMcHigher).toBe(false);
  });

  it("does not flag a cluster too small for its own Mc to mean anything", () => {
    const shallow = Array.from({ length: 300 }, (_, i) => ev(2.0 + (i % 3) * 0.1, 40, i));
    const deep = Array.from({ length: 10 }, (_, i) => ev(3.5 + (i % 2) * 0.1, 90, 300 + i));
    expect(computeClusterStats([...shallow, ...deep], null, NOW).deep.ownMcHigher).toBe(false);
  });

  it("survives an empty cluster, a one-event cluster and an empty catalogue", () => {
    const shallow = Array.from({ length: 60 }, (_, i) => ev(2.0 + (i % 5) * 0.1, 40, i));
    const none = computeClusterStats(shallow, null, NOW);
    expect(none.deep).toMatchObject({ recent: 0, recentMaxMag: null, lastTime: null, ownMcHigher: false });
    expect(none.deep.stats.fit).toBeNull();
    expect(none.difference).toBeNull();
    expect(none.shallow.stats.fit).not.toBeNull();

    const one = computeClusterStats([...shallow, ev(5, 100, 99)], null, NOW);
    expect(one.deep.stats.count).toBe(1);
    expect(one.deep.stats.mc).toBe(one.all.mc);
    expect(none.deep.stats.mc).toBe(none.all.mc);
    expect(one.deep.stats.fit).toBeNull();
    expect(one.difference).toBeNull();

    const empty = computeClusterStats([], null, NOW);
    expect(empty.all.count).toBe(0);
    expect(empty.difference).toBeNull();
  });

  it("has no fit for a cluster that lies entirely below the shared Mc", () => {
    const shallow = Array.from({ length: 200 }, (_, i) => ev(3.0 + (i % 5) * 0.1, 40, i));
    const deep = Array.from({ length: 20 }, (_, i) => ev(2.0, 90, 200 + i));
    const c = computeClusterStats([...shallow, ...deep], null, NOW);
    expect(c.deep.stats.fit).toBeNull();
    expect(c.difference).toBeNull();
  });

  it("works without the mainshock, which belongs to the deep cluster", () => {
    expect(clusterOf(fixture.find((e) => e.id === MAINSHOCK_ID)!)).toBe("deep");
    const c = computeClusterStats(
      fixture.filter((e) => e.id !== MAINSHOCK_ID),
      null,
      NOW,
    );
    expect(c.deep.stats.count).toBe(146);
    expect(c.deep.stats.fit!.n).toBe(89);
  });
});
