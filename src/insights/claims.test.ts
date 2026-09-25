import captured from "../../test/fixtures/api-events-2026-09-24.json";
import DETAIL from "../../test/fixtures/usgs-us6000tjl2-detail-2026-09-24.json?raw";
import DYFI_10KM from "../../test/fixtures/usgs-us6000tjl2-dyfi-geo-10km-2026-09-24.json?raw";
import OAF_FORECAST from "../../test/fixtures/usgs-us6000tjl2-oaf-forecast-2026-09-24.json?raw";
import PAGER_CITIES from "../../test/fixtures/usgs-us6000tjl2-pager-cities-2026-09-24.json?raw";
import { describe, expect, it } from "vitest";
import type { ContextResponse, ExternalProduct, ForecastDigest } from "../../worker/api-types";
import { digestDyfi, digestForecast, digestPager } from "../../worker/usgs";
import {
  bySource,
  chocoReach,
  compassPoint,
  FAR_FROM_KM,
  decay,
  drift,
  FELT_MIN_RESPONSES,
  feltInPereira,
  intensityLevel,
  insights,
  lastStrong,
  pace,
  ratesSince,
  usgsForecast,
  recentStrong,
  type Catalogues,
  type Insights,
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
  forecast: product(digestForecast(JSON.parse(OAF_FORECAST), detailProps("oaf")), "2026-09-21T18:03:11.563Z"),
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

// ---------------------------------------------------------------------------------------------
// USGS's aftershock forecast for the mainshock, relayed and never computed here

/**
 * The forecast on CONTEXT is the captured `forecast.json` (issued 2026-09-21 18:03 UTC, `reviewed`,
 * next update due 2026-09-28 16:00:31 UTC). Every figure below was read off that file in Python: the
 * week and the month both start 2026-09-21 16:00:31.849 UTC and end on 28 September and 22 October;
 * P(M ≥ 5) is 0.1478 and 0.4347, P(M ≥ 6) 0.0173 and 0.0609, and P(≥ M7.4) 0.0033 in the month.
 */
describe("usgsForecast", () => {
  const data = insights(fixture, NOW);
  const START = "2026-09-21T16:00:31.849Z";
  const WEEK_END = "2026-09-28T16:00:31.849Z";
  const MONTH_END = "2026-10-22T16:00:31.849Z";

  it("on 2026-09-24: the week and the month, at M5 and M6, in USGS's own figures", () => {
    const f = usgsForecast(CONTEXT, data)!;
    expect(f.issuedAt).toBe("2026-09-21T18:03:11.563Z");
    expect(f.nextUpdateAt).toBe(WEEK_END);
    expect(f.windows.map((w) => [w.start, w.end])).toEqual([
      [START, WEEK_END],
      [START, MONTH_END],
    ]);
    const rows = f.windows.map((w) => w.rows.map((r) => [r.magnitude, r.probability, r.median, r.p95Min, r.p95Max]));
    expect(rows).toEqual([
      [
        [5, 0.1478, 0, 0, 1],
        [6, 0.0173, 0, 0, 0],
      ],
      [
        [5, 0.4347, 0, 0, 3],
        [6, 0.0609, 0, 0, 1],
      ],
    ]);
  });

  const at = (iso: string) => ({ ...data, now: Date.parse(iso) });
  const withDigest = (over: Partial<ForecastDigest>): ContextResponse => ({
    ...CONTEXT,
    forecast: { ...CONTEXT.forecast!, digest: { ...CONTEXT.forecast!.digest, ...over } },
  });

  it("is hidden from the moment USGS's next update is due: a stale probability is worse than none", () => {
    expect(usgsForecast(CONTEXT, at("2026-09-28T16:00:31.848Z"))).not.toBeNull();
    expect(usgsForecast(CONTEXT, at(WEEK_END))).toBeNull();
    // Even with the month still open and the file's own expiry a year away.
    expect(CONTEXT.forecast!.digest.expiresAt! > MONTH_END).toBe(true);
  });

  it("without a next update, is hidden 14 days after it was issued (two missed weekly updates)", () => {
    const noNext = withDigest({ nextUpdateAt: null });
    expect(usgsForecast(noNext, at("2026-10-05T18:03:11.562Z"))).not.toBeNull();
    expect(usgsForecast(noNext, at("2026-10-05T18:03:11.563Z"))).toBeNull();
  });

  it("drops a window that has ended, and says nothing once none is left", () => {
    const late = withDigest({ nextUpdateAt: null, issuedAt: "2026-09-27T00:00:00.000Z" });
    expect(usgsForecast(late, at("2026-09-29T00:00:00.000Z"))!.windows.map((w) => w.end)).toEqual([MONTH_END]);
    const yearOnly = withDigest({
      windows: CONTEXT.forecast!.digest.windows.filter((w) => w.label === "1 Year" || w.label === "1 Day"),
    });
    expect(usgsForecast(yearOnly, data)).toBeNull();
  });

  it("is shown only once a USGS seismologist has reviewed it (owner, 2026-09-25)", () => {
    expect(CONTEXT.forecast!.digest.reviewStatus).toBe("reviewed");
    expect(usgsForecast(withDigest({ reviewStatus: "automatic" }), data)).toBeNull();
    expect(usgsForecast(withDigest({ reviewStatus: null }), data)).toBeNull();
  });

  it("is shown only while its event is the mainshock the page detects", () => {
    const m74 = fixture.choco.find((e) => e.id === "SGC2026pqqmro")!;
    const next = { ...m74, id: "other", mag: 6.9 };
    const withMainshock = (mainshock: Insights["mainshock"]["choco"]) =>
      usgsForecast(CONTEXT, { ...data, mainshock: { ...data.mainshock, choco: mainshock } });
    expect(withMainshock({ state: "awaiting-review", largest: m74, runnerUp: next, gap: 1.5 })).toBeNull();
    expect(withMainshock({ state: "none", largest: m74, runnerUp: next, gap: 0.5 })).toBeNull();
    const later = { ...m74, id: "SGC2027later", mag: 7.8 };
    expect(withMainshock({ ...data.mainshock.choco, largest: later } as Insights["mainshock"]["choco"])).toBeNull();
  });

  it("gives the chance of one as large as the mainshock or larger for the month only", () => {
    expect(usgsForecast(CONTEXT, data)!.aboveMainshock).toEqual({
      magnitude: 7.4,
      probability: 0.0033,
      start: START,
      end: MONTH_END,
    });
    const weekOnly = withDigest({ windows: CONTEXT.forecast!.digest.windows.filter((w) => w.label !== "1 Month") });
    expect(usgsForecast(weekOnly, data)!.aboveMainshock).toBeNull();
    // Never under a window the box does not show: here the month has no M5 or M6 row.
    const bare = withDigest({
      windows: CONTEXT.forecast!.digest.windows.map((w) =>
        w.label === "1 Month" ? { ...w, bins: w.bins.filter((b) => b.magnitude < 5) } : w,
      ),
    });
    expect(usgsForecast(bare, data)!.windows.map((w) => w.end)).toEqual([WEEK_END]);
    expect(usgsForecast(bare, data)!.aboveMainshock).toBeNull();
  });

  // In Python on the fixture: the shallow group's median epicentre is 10.5 km from USGS's circle's
  // centre and the deep group's 42.0 km; 95.9% of Chocó's 834 events are over 110 km from Pereira in
  // a straight line and 76.6% over 120 km; the page's b at Mc 2.3 is 0.735 from 566 events.
  it("carries what its limits compare: USGS's model beside the page's own b, and how far Chocó is", () => {
    const f = usgsForecast(CONTEXT, data)!;
    expect(f.model).toEqual({ b: 1, mc: 4.45, radiusKm: 125.4, holdsBothGroups: true });
    expect(f.page.mc).toBe(2.3);
    expect(f.page.b).toBeCloseTo(0.735, 3);
    expect(f.page.farKm).toBe(110);
    const small = withDigest({ model: { ...CONTEXT.forecast!.digest.model, regionRadiusKm: 30 } });
    expect(usgsForecast(small, data)!.model.holdsBothGroups).toBe(false);
  });

  it("says Chocó is far only from 100 km: nearer, an M5's waves are not bound to arrive much weakened", () => {
    expect(FAR_FROM_KM).toBe(100);
    const reach = (beyondKm: number) => ({ ...data, chocoReach: { ...data.chocoReach, beyondKm } });
    expect(usgsForecast(CONTEXT, reach(100))!.page.farKm).toBe(100);
    expect(usgsForecast(CONTEXT, reach(90))!.page.farKm).toBeNull();
    expect(usgsForecast(CONTEXT, reach(0))!.page.farKm).toBeNull();
  });

  it("goes stale at the exact due time, not at the next minute of the page's rounded clock", () => {
    const minute = at("2026-09-28T16:00:00Z");
    expect(usgsForecast(CONTEXT, minute, Date.parse("2026-09-28T16:00:31.848Z"))).not.toBeNull();
    expect(usgsForecast(CONTEXT, minute, Date.parse(WEEK_END))).toBeNull();
  });
  it("links to USGS's forecast for the event, and only for an id shaped like one of USGS's", () => {
    expect(usgsForecast(CONTEXT, data)!.usgsUrl).toBe(
      "https://earthquake.usgs.gov/earthquakes/eventpage/us6000tjl2/oaf/forecast",
    );
    const odd = { ...CONTEXT, forecast: { ...CONTEXT.forecast!, sourceEventId: "../evil" } };
    expect(usgsForecast(odd, data)!.usgsUrl).toBeNull();
  });
});

describe("chocoReach", () => {
  it("says how far almost all of Chocó's events are, not its groups' medians", () => {
    // 10 events 55 km under Pereira and 90 events 200 km under it: the median is 200 km, but only a
    // tenth is nearer than 55 km, so "almost all" (at least 95%) are beyond 50 km and no further.
    const under = (depthKm: number) =>
      quake(Date.parse("2026-09-01T00:00:00Z"), { lat: 4.8133, lon: -75.6961, depthKm });
    const near = Array.from({ length: 10 }, () => under(55));
    const far = Array.from({ length: 90 }, () => under(200));
    expect(chocoReach(near, far).beyondKm).toBe(50);
  });

  it("is worked out once per catalogue, not on every minute the page's clock ticks", () => {
    const a = insights(fixture, NOW).chocoReach;
    expect(a.beyondKm).toBe(110);
    expect(insights(fixture, NOW + 60_000).chocoReach).toBe(a);
  });
});
