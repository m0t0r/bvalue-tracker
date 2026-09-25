import captured from "../../test/fixtures/api-events-2026-09-24.json";
import DETAIL from "../../test/fixtures/usgs-us6000tjl2-detail-2026-09-24.json?raw";
import DYFI_10KM from "../../test/fixtures/usgs-us6000tjl2-dyfi-geo-10km-2026-09-24.json?raw";
import PAGER_CITIES from "../../test/fixtures/usgs-us6000tjl2-pager-cities-2026-09-24.json?raw";
import { describe, expect, it } from "vitest";
import type { ContextResponse, ExternalProduct } from "../../worker/api-types";
import { digestDyfi, digestPager } from "../../worker/usgs";
import {
  bySource,
  compassPoint,
  decay,
  drift,
  FELT_MIN_RESPONSES,
  feltInPereira,
  intensityLevel,
  insights,
  lastStrong,
  pace,
  ratesSince,
  recentStrong,
  type Catalogues,
  type QuakeLike,
} from "./claims";

/**
 * Production's catalogue as it stood at 2026-09-24 14:44 UTC, the newest event in it. Every figure
 * asserted on it below was recomputed independently in Python from the same file.
 */
const fixture = captured as Catalogues;
const NOW = Date.parse("2026-09-24T14:44:03Z");
const DAY = 86_400_000;

let n = 0;
const quake = (time: number, over: Partial<QuakeLike> = {}): QuakeLike => ({
  id: `q${n++}`,
  time: new Date(time).toISOString().replace(/\.\d{3}Z$/, "Z"),
  lat: 4.5,
  lon: -76.7,
  depthKm: 40,
  mag: 3,
  magType: "MLr_1",
  status: "manual",
  ...over,
});

describe("on the production catalogue of 2026-09-24", () => {
  const all = insights(fixture, NOW);

  it("finds the M7.4 as Chocó's mainshock, holding 99.9% of the zone's energy, and none in the swarm", () => {
    expect(all.mainshock.choco.state).toBe("found");
    expect(all.mainshock.choco.largest?.mag).toBe(7.4);
    expect(all.largestShare.choco).toBeGreaterThan(0.998);
    expect(all.mainshock.tolima.state).toBe("none");
    expect(all.largestShare.tolima).toBeGreaterThan(0.1);
    expect(all.largestShare.tolima).toBeLessThan(0.15);
  });

  it("puts all three sources 105–130 km from Pereira in a straight line", () => {
    for (const s of ["shallow", "deep", "tolima"] as const) {
      expect(all.distances[s]!.hypocentralKm).toBeGreaterThan(105);
      expect(all.distances[s]!.hypocentralKm).toBeLessThan(130);
    }
  });

  it("calls the shallow group quieter than usual: 4.8 a day in the last 120 h against a median day of 10", () => {
    const p = all.shallowPace!;
    expect(p.case).toBe("quieter");
    if (p.case === "young") return;
    expect(p.mc).toBe(2.3);
    expect(p.usualPerDay).toBe(10);
    expect(p.recentPerDay).toBeCloseTo(4.8, 9);
    // The quiet stretch is dated from the recent window, 20 September (Colombian day).
    expect(new Date(p.quietSince!).toISOString()).toBe("2026-09-20T05:00:00.000Z");
  });

  it("finds the earlier lull of 30 August – 9 September, and that the group came back from it", () => {
    const p = all.shallowPace!;
    if (p.case === "young") throw new Error("young");
    expect(p.pastLulls).toHaveLength(1);
    expect(new Date(p.pastLulls[0]!.from).toISOString()).toBe("2026-08-30T05:00:00.000Z");
    expect(new Date(p.pastLulls[0]!.to).toISOString()).toBe("2026-09-09T05:00:00.000Z");
    expect(p.pastLulls[0]!.recovered).toBe(true);
  });

  it("calls the swarm too young to have a usual pace", () => {
    expect(all.tolimaPace?.case).toBe("young");
  });

  it("sees the deep group's aftershocks decayed: ~10.9 a day in the first week, ~0.3 in the last", () => {
    const d = all.deepDecay!;
    expect(d.case).toBe("decayed");
    if (d.case === "young") return;
    expect(d.firstWeekPerDay).toBeCloseTo(76 / 7, 9);
    expect(d.lastWeekPerDay).toBeCloseTo(2 / 7, 9);
  });

  it("finds 17 of the last week's 25 events at M ≥ 4 in Chaparral: a mix, not three in four", () => {
    const r = recentStrong(all.sources, NOW, 4);
    expect(r.case).toBe("mixed");
    expect(r.total).toBe(25);
    if (r.case !== "mixed") return;
    expect(r.bySource.tolima).toBe(17);
  });

  it("dates Chocó's last M ≥ 4 to 19 September, before the swarm began", () => {
    const last = lastStrong(all.sources, 4);
    expect(last.shallow?.time).toBe("2026-09-19T23:20:11Z");
    expect(Date.parse(last.shallow!.time)).toBeLessThan(all.start.tolima!);
  });
});

describe("recentStrong", () => {
  const src = (shallow: QuakeLike[], tolima: QuakeLike[] = []) => ({ shallow, deep: [], tolima });
  const now = Date.parse("2026-09-24T12:00:00Z");
  it("says none, one, mostly or mixed", () => {
    expect(recentStrong(src([quake(now - DAY, { mag: 3.9 })]), now, 4).case).toBe("none");
    expect(recentStrong(src([quake(now - DAY, { mag: 4 })]), now, 4)).toMatchObject({ case: "one", source: "shallow" });
    const three = [1, 2, 3].map((d) => quake(now - d * DAY, { mag: 4.2 }));
    expect(recentStrong(src(three, [quake(now - DAY, { mag: 4 })]), now, 4)).toMatchObject({
      case: "mostly",
      count: 3,
    });
    expect(recentStrong(src(three.slice(0, 2), [quake(now - DAY, { mag: 4 })]), now, 4).case).toBe("mixed");
  });
  it("counts only the window, and nothing after now", () => {
    expect(recentStrong(src([quake(now - 8 * DAY, { mag: 5 }), quake(now + 1000, { mag: 5 })]), now, 4).case).toBe(
      "none",
    );
  });
});

describe("pace", () => {
  const start = Date.parse("2026-08-01T12:00:00Z");
  const steady = (days: number, perDay: number) =>
    Array.from({ length: days * perDay }, (_, i) =>
      quake(start + Math.floor(i / perDay) * DAY + (i % perDay) * 3_600_000),
    );
  it("needs two weeks of history before it has a usual pace", () => {
    expect(pace(steady(10, 5), 2.3, start + 10 * DAY).case).toBe("young");
  });
  it("calls a steady source usual, a stopped one quieter, and a doubled one busier", () => {
    expect(pace(steady(30, 6), 2.3, start + 30 * DAY - 1).case).toBe("usual");
    expect(pace(steady(30, 6), 2.3, start + 40 * DAY).case).toBe("quieter");
    const doubled = [
      ...steady(30, 6),
      ...steady(30, 6).map((q) => ({
        ...q,
        id: `${q.id}b`,
        time: new Date(Date.parse(q.time) + 30 * DAY).toISOString(),
      })),
    ];
    const extra = Array.from({ length: 60 }, (_, i) => quake(start + 55 * DAY + i * 7_200_000));
    expect(
      pace(
        [...doubled, ...extra].sort((a, b) => Date.parse(a.time) - Date.parse(b.time)),
        2.3,
        start + 60 * DAY - 1,
      ).case,
    ).toBe("busier");
  });
  it("ignores events below Mc", () => {
    const small = steady(30, 6).map((q) => ({ ...q, mag: 2.0 }));
    expect(pace([...steady(20, 6), ...small.slice(20 * 6)], 2.3, start + 30 * DAY - 1).case).toBe("quieter");
  });
});

describe("decay", () => {
  const start = Date.parse("2026-08-01T00:00:00Z");
  it("is young for the first three weeks", () => {
    expect(decay([], 2.3, start, start + 20 * DAY).case).toBe("young");
  });
  it("calls a tenfold fall decayed, and a steady rate not", () => {
    const early = Array.from({ length: 70 }, (_, i) => quake(start + i * 7_200_000));
    const late = [quake(start + 29 * DAY)];
    expect(decay([...early, ...late], 2.3, start, start + 30 * DAY).case).toBe("decayed");
    const flat = Array.from({ length: 30 }, (_, i) => quake(start + i * DAY + 1000));
    expect(decay(flat, 2.3, start, start + 30 * DAY).case).toBe("not-decayed");
  });
});

describe("drift", () => {
  const t0 = Date.parse("2026-09-20T00:00:00Z");
  const cloud = (t: number, lat: number, lon: number) =>
    Array.from({ length: 12 }, (_, i) =>
      quake(t + i * 60_000, { lat: lat + (i % 3) * 0.001, lon, errLatKm: 0.5, errLonKm: 0.5 }),
    );
  it("claims movement only past both 1.5 km and the location error", () => {
    const moved = drift([...cloud(t0, 3.85, -75.6), ...cloud(t0 + 3 * DAY, 3.85, -75.63)], t0 + 3 * DAY + DAY / 2);
    expect(moved.case).toBe("moved");
    if (moved.case === "too-few") return;
    expect(compassPoint(moved.bearingDeg)).toBe("W");
    const still = drift([...cloud(t0, 3.85, -75.6), ...cloud(t0 + 3 * DAY, 3.85, -75.605)], t0 + 3 * DAY + DAY / 2);
    expect(still.case).toBe("none");
  });
  it("needs enough events at both ends", () => {
    expect(drift(cloud(t0, 3.85, -75.6).slice(0, 5), t0 + 3 * DAY).case).toBe("too-few");
  });
});

describe("bySource", () => {
  it("leaves withdrawn events out and splits Chocó at 70 km", () => {
    const s = bySource({
      choco: [quake(0, { depthKm: 69.9 }), quake(1, { depthKm: 70 }), quake(2, { removedAt: "2026-09-01T00:00:00Z" })],
      tolima: [quake(3, { depthKm: 19 })],
    });
    expect([s.shallow.length, s.deep.length, s.tolima.length]).toEqual([1, 1, 1]);
  });
});

describe("the strongMix sentence", () => {
  it("contracts de + el in Spanish", async () => {
    const { insightsCopy } = await import("./copy");
    const one = insightsCopy.es.claims.strongMix(
      { case: "one", total: 3, source: "tolima", count: 3, bySource: { shallow: 0, deep: 0, tolima: 3 } },
      4,
      7,
    );
    expect(one).toContain("todos del enjambre de Chaparral");
    expect(one).not.toContain("de el ");
  });
});

describe("ratesSince", () => {
  const start = Date.parse("2026-08-10T00:00:00Z");
  const ev = (day: number) => ({
    id: `r${day}`,
    time: new Date(start + day * DAY).toISOString(),
    lat: 0,
    lon: 0,
    depthKm: 40,
    mag: 3,
    magType: "M",
    status: "manual",
  });
  it("leaves out a bin in progress until it is half its width", () => {
    const bins = ratesSince([ev(42.005)], 2.3, start, start + 42.01 * DAY);
    expect(bins.at(-1)!.toDay).toBe(42);
    const later = ratesSince([ev(42.005)], 2.3, start, start + 46 * DAY);
    expect(later.at(-1)).toMatchObject({ fromDay: 42, toDay: 46, count: 1 });
  });
  it("keeps going past four months, a fortnight a bin", () => {
    // Edges run 126, 140, 154, 168: at day 160 the last bin is 6 of its 14 days old, so it waits.
    const bins = ratesSince([ev(150)], 2.3, start, start + 160 * DAY);
    expect(bins.at(-1)).toMatchObject({ fromDay: 140, toDay: 154 });
    expect(bins.reduce((n, b) => n + b.count, 0)).toBe(1);
  });
});

describe("the mixed strongMix sentence", () => {
  it("names each source that contributed, and none that did not", async () => {
    const { insightsCopy } = await import("./copy");
    const bySource = { shallow: 2, deep: 2, tolima: 0 };
    const es = insightsCopy.es.claims.strongMix({ case: "mixed", total: 4, bySource }, 4, 7);
    expect(es).toContain("2 del grupo superficial del Chocó y 2 del grupo profundo del Chocó");
    expect(es).not.toContain("Chaparral");
    const en = insightsCopy.en.claims.strongMix(
      { case: "mixed", total: 25, bySource: { shallow: 8, deep: 0, tolima: 17 } },
      4,
      7,
    );
    expect(en).toContain("8 from Chocó's shallow group and 17 from Chaparral");
  });
});

// ---------------------------------------------------------------------------------------------
// How strongly the mainshock was felt in Pereira, from what USGS publishes about it

/**
 * `/api/context` as the daily job would have stored it on 2026-09-24: the captured USGS files, run
 * through the Worker's own digests. Every figure asserted below was read off those files by hand
 * (and in Python): DYFI's cell holding Pereira, CDI 8.0 from 41 responses, of 1,249; PAGER's
 * Pereira, MMI 8.43.
 */
const product = <D>(digest: D, sourceUpdatedAt: string): ExternalProduct<D> => ({
  source: "usgs",
  sgcEventId: "SGC2026pqqmro",
  sourceEventId: "us6000tjl2",
  productUrl: "https://earthquake.usgs.gov/product/example",
  sourceUpdatedAt,
  checkedAt: "2026-09-24T11:07:00.000Z",
  digest,
});
const detailProps = (kind: string) =>
  (JSON.parse(DETAIL) as { properties: { products: Record<string, { properties: Record<string, string> }[]> } })
    .properties.products[kind]![0]!.properties;
const CONTEXT: ContextResponse = {
  dyfi: product(digestDyfi(JSON.parse(DYFI_10KM), detailProps("dyfi")), "2026-09-23T20:15:00.000Z"),
  pager: product(digestPager(JSON.parse(PAGER_CITIES)), "2026-08-12T02:00:00.000Z"),
  forecast: null,
};

describe("feltInPereira", () => {
  const found = insights(fixture, NOW).mainshock.choco;

  it("on 2026-09-24: people reported VIII and USGS's model gives VIII, from 41 of 1,249 responses", () => {
    const f = feltInPereira(CONTEXT, found)!;
    expect(f.reported).toEqual({ level: 8, cdi: 8, responses: 41, updatedAt: "2026-09-23T20:15:00.000Z" });
    expect(f.modelled).toMatchObject({ level: 8, updatedAt: "2026-08-12T02:00:00.000Z" });
    expect(f.modelled!.mmi).toBeCloseTo(8.43, 2);
    expect(f.totalResponses).toBe(1249);
    expect(f.agreement).toEqual({ case: "same", levels: 0 });
  });

  it("says nothing while the zone has no found mainshock: none, or one still awaiting review", () => {
    const m74 = fixture.choco.find((e) => e.id === "SGC2026pqqmro")!;
    const next = { ...m74, id: "other", mag: 6.9 };
    expect(feltInPereira(CONTEXT, { state: "none", largest: m74, runnerUp: next, gap: 0.5 })).toBeNull();
    expect(feltInPereira(CONTEXT, { state: "awaiting-review", largest: m74, runnerUp: next, gap: 1.5 })).toBeNull();
  });

  it("drops a digest matched from another event: a later, larger mainshock is not the M7.4", () => {
    const bigger = { ...fixture.choco[0]!, id: "SGC2027later", mag: 7.8 };
    expect(feltInPereira(CONTEXT, { ...found, largest: bigger } as typeof found)).toBeNull();
    const pagerOnly = { ...CONTEXT, dyfi: { ...CONTEXT.dyfi!, sgcEventId: "SGC2027later" } };
    const f = feltInPereira(pagerOnly, found)!;
    expect(f.reported).toBeNull();
    expect(f.totalResponses).toBeNull();
    expect(f.modelled?.level).toBe(8);
    expect(f.agreement).toBeNull();
  });

  /** CONTEXT with Pereira's DYFI cell and PAGER city replaced. */
  const withPereira = (cell: { cdi: number; responses: number } | null, mmi: number | null): ContextResponse => ({
    ...CONTEXT,
    dyfi: {
      ...CONTEXT.dyfi!,
      digest: { responses: 1249, pereira: cell && { cell: "UTM:(x)", placeName: "Somewhere", ...cell } },
    },
    pager: { ...CONTEXT.pager!, digest: { pereira: mmi === null ? null : { name: "Pereira", mmi, distanceKm: 0.2 } } },
  });

  it(`hides Pereira's reports below ${FELT_MIN_RESPONSES} responses, and keeps the model and the total`, () => {
    expect(FELT_MIN_RESPONSES).toBe(5);
    const few = feltInPereira(withPereira({ cdi: 6.1, responses: 4 }, 8.43), found)!;
    expect(few.reported).toBeNull();
    expect(few.agreement).toBeNull();
    expect(few.modelled?.level).toBe(8);
    expect(few.totalResponses).toBe(1249);
    expect(feltInPereira(withPereira({ cdi: 6.1, responses: 5 }, 8.43), found)!.reported?.responses).toBe(5);
  });

  it("says nothing when neither the reports nor the model reach Pereira", () => {
    expect(feltInPereira(withPereira({ cdi: 6.1, responses: 2 }, null), found)).toBeNull();
    expect(feltInPereira(withPereira(null, null), found)).toBeNull();
    expect(feltInPereira({ dyfi: null, pager: null, forecast: null }, found)).toBeNull();
  });

  it("compares the two as the Roman numerals the reader sees, not as decimals", () => {
    const agreement = (cdi: number, mmi: number) =>
      feltInPereira(withPereira({ cdi, responses: 20 }, mmi), found)!.agreement;
    // 7.5 is VIII, as 8.44 (shown 8.4) is: the same level although 0.94 apart.
    expect(agreement(7.5, 8.44)).toEqual({ case: "same", levels: 0 });
    // 7.4 is VII and 7.6 is VIII: one level, although 0.2 apart.
    expect(agreement(7.4, 7.6)).toEqual({ case: "within-one", levels: 1 });
    expect(agreement(6, 8.43)).toEqual({ case: "lower", levels: 2 });
    expect(agreement(9, 5.2)).toEqual({ case: "higher", levels: 4 });
  });

  it("links to USGS's own page for the event, and only for an id shaped like one of USGS's", () => {
    expect(feltInPereira(CONTEXT, found)!.usgsEventUrl).toBe(
      "https://earthquake.usgs.gov/earthquakes/eventpage/us6000tjl2",
    );
    const odd = (sourceEventId: string) =>
      feltInPereira({ ...CONTEXT, pager: null, dyfi: { ...CONTEXT.dyfi!, sourceEventId } }, found)!.usgsEventUrl;
    expect(odd("../../evil")).toBeNull();
    expect(odd("us6000tjl2?x=1")).toBeNull();
    expect(odd("")).toBeNull();
  });

  it("keeps every level on the scale the page draws, I to X+, before comparing: 11 and 10 are both X+", () => {
    const f = feltInPereira(withPereira({ cdi: 9.6, responses: 20 }, 11.2), found)!;
    expect([f.reported!.level, f.modelled!.level]).toEqual([10, 10]);
    expect(f.agreement).toEqual({ case: "same", levels: 0 });
  });

  it("takes the level from the one-decimal figure the caption shows: 7.46 is shown 7.5, so VIII", () => {
    expect(intensityLevel(7.46)).toBe(8);
    expect(intensityLevel(7.44)).toBe(7);
    expect(intensityLevel(8.4326534271)).toBe(8);
    expect(intensityLevel(0.2)).toBe(1);
  });
});
