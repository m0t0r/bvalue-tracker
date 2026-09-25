import { describe, expect, it } from "vitest";
import DETAIL from "../../test/fixtures/usgs-us6000tjl2-detail-2026-09-24.json?raw";
import DYFI_10KM from "../../test/fixtures/usgs-us6000tjl2-dyfi-geo-10km-2026-09-24.json?raw";
import OAF_FORECAST from "../../test/fixtures/usgs-us6000tjl2-oaf-forecast-2026-09-24.json?raw";
import PAGER_CITIES from "../../test/fixtures/usgs-us6000tjl2-pager-cities-2026-09-24.json?raw";
import { digestDyfi, digestForecast, digestPager } from "../usgs.ts";

/**
 * USGS's products for the M7.4 (us6000tjl2), captured 2026-09-24. Every figure pinned here was
 * recomputed from the same files in Python: the 10 km cell that contains Pereira's point, found by
 * a point-in-polygon test over all 260 cells, and the nearest PAGER city by haversine.
 */
const products = (
  JSON.parse(DETAIL) as { properties: { products: Record<string, { properties: Record<string, string> }[]> } }
).properties.products;
const props = (kind: string) => products[kind]![0]!.properties;

describe("digestDyfi", () => {
  it("reads the felt reports of the 10 km cell Pereira is in, and the total", () => {
    expect(digestDyfi(JSON.parse(DYFI_10KM), props("dyfi"))).toEqual({
      responses: 1249,
      pereira: { cell: "UTM:(18N 042 053 10000)", placeName: "Dos Quebradas", cdi: 8, responses: 41 },
    });
  });
});

describe("digestPager", () => {
  it("takes the modelled intensity of the PAGER city nearest Pereira's point", () => {
    const d = digestPager(JSON.parse(PAGER_CITIES));
    expect(d.pereira?.name).toBe("Pereira");
    expect(d.pereira?.mmi).toBeCloseTo(8.4326534271, 9);
    expect(d.pereira?.distanceKm).toBeCloseTo(0.2, 1);
  });
});

describe("digestForecast", () => {
  const d = digestForecast(JSON.parse(OAF_FORECAST), props("oaf"));

  it("keeps when it was issued, when USGS says the next one is due, and that it was reviewed", () => {
    expect(d.issuedAt).toBe("2026-09-21T18:03:11.563Z");
    expect(d.nextUpdateAt).toBe("2026-09-28T16:00:31.849Z");
    // A year out: the file's own expiry is not the staleness rule Part D needs (docs/science.md).
    expect(d.expiresAt).toBe("2027-09-22T04:29:55.309Z");
    expect(d.reviewStatus).toBe("reviewed");
  });

  it("keeps the model's own b, Mc and region, which the page's caveats compare against", () => {
    expect(d.model).toEqual({
      b: 1,
      mc: 4.45,
      mainshockMag: 7.4,
      regionCenter: { lat: 4.5663, lon: -76.6881 },
      regionRadiusKm: 125.4,
    });
  });

  it("keeps each window's probability, median count and 95% range per magnitude, and nothing else", () => {
    expect(d.windows.map((w) => w.label)).toEqual(["1 Day", "1 Week", "1 Month", "1 Year"]);
    const week = d.windows[1]!;
    expect(week.start).toBe("2026-09-21T16:00:31.849Z");
    expect(week.end).toBe("2026-09-28T16:00:31.849Z");
    expect(week.aboveMainshock).toEqual({ magnitude: 7.4, probability: 0.0011 });
    expect(week.bins).toEqual([
      { magnitude: 3, probability: 0.9996, median: 16, p95Min: 6, p95Max: 39 },
      { magnitude: 4, probability: 0.776, median: 1, p95Min: 0, p95Max: 6 },
      { magnitude: 5, probability: 0.1478, median: 0, p95Min: 0, p95Max: 1 },
      { magnitude: 6, probability: 0.0173, median: 0, p95Min: 0, p95Max: 0 },
      { magnitude: 7, probability: 0.0023, median: 0, p95Min: 0, p95Max: 0 },
    ]);
    expect(d.windows[2]!.bins[3]!.probability).toBe(0.0609);
    expect(d.windows[3]!.bins[2]).toEqual({ magnitude: 5, probability: 0.8937, median: 3, p95Min: 0, p95Max: 18 });
  });
});

describe("a file the digests cannot read", () => {
  it("throws, so the job keeps the stored digest instead of storing a guess", () => {
    expect(() => digestDyfi({}, props("dyfi"))).toThrow();
    expect(() => digestDyfi(JSON.parse(DYFI_10KM), {})).toThrow(/num-responses/);
    expect(() => digestPager({ cities: [] })).toThrow();
    expect(() => digestForecast({ ...JSON.parse(OAF_FORECAST), creationTime: "soon" }, props("oaf"))).toThrow();
  });

  it("throws on cells or cities of a shape it does not know, rather than calling Pereira unreported", () => {
    const multi = JSON.parse(DYFI_10KM) as { features: { geometry: { type: string } }[] };
    for (const f of multi.features) f.geometry.type = "MultiPolygon";
    expect(() => digestDyfi(multi, props("dyfi"))).toThrow(/Polygon/);
    const cities = JSON.parse(PAGER_CITIES) as { all_cities: { lat: unknown }[] };
    for (const c of cities.all_cities) c.lat = String(c.lat);
    expect(() => digestPager(cities)).toThrow(/lat/);
  });

  it("says nobody answered from Pereira's cell rather than borrowing a neighbour's", () => {
    const file = JSON.parse(DYFI_10KM) as { features: { properties: { name: string } }[] };
    file.features = file.features.filter((f) => !f.properties.name.includes("042 053"));
    expect(digestDyfi(file, props("dyfi")).pereira).toBeNull();
  });
});
