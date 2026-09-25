import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SeismicEvent } from "../../core/types.ts";
import type { ZoneId } from "../../core/zones.ts";
import DETAIL from "../../test/fixtures/usgs-us6000tjl2-detail-2026-09-24.json?raw";
import DYFI_10KM from "../../test/fixtures/usgs-us6000tjl2-dyfi-geo-10km-2026-09-24.json?raw";
import MATCH from "../../test/fixtures/usgs-us6000tjl2-match-2026-09-24.json?raw";
import OAF_FORECAST from "../../test/fixtures/usgs-us6000tjl2-oaf-forecast-2026-09-24.json?raw";
import PAGER_CITIES from "../../test/fixtures/usgs-us6000tjl2-pager-cities-2026-09-24.json?raw";
import WRANGLER from "../../wrangler.jsonc?raw";
import type { ContextResponse } from "../api-types.ts";
import { insertStmt } from "../db.ts";
import { PRODUCTS_CRON } from "../external.ts";
import worker from "../index.ts";
import { INGEST_CRON } from "../plan.ts";

/**
 * The daily USGS job, end to end: the cron that runs it and the route that serves what it stored.
 * USGS is answered from files captured on 2026-09-24 for the M7.4 (us6000tjl2). Nothing else is
 * served, and an unhandled request is an error, so the job can never reach SGC or a live USGS.
 */
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());

const FDSN = "https://earthquake.usgs.gov/fdsnws/event/1/query";
const PRODUCT = "https://earthquake.usgs.gov/product/*";
const FILES: Record<string, string> = {
  "dyfi_geo_10km.geojson": DYFI_10KM,
  "cities.json": PAGER_CITIES,
  "forecast.json": OAF_FORECAST,
};

/** USGS as it answered on 2026-09-24. `match` stands in for the search's answer; returns every URL asked for. */
function usgs({ match = () => HttpResponse.text(MATCH) }: { match?: () => Response } = {}): URL[] {
  const asked: URL[] = [];
  server.use(
    http.get(FDSN, ({ request }) => {
      const url = new URL(request.url);
      asked.push(url);
      return url.searchParams.has("eventid") ? HttpResponse.text(DETAIL) : match();
    }),
    http.get(PRODUCT, ({ request }) => {
      const url = new URL(request.url);
      asked.push(url);
      const body = FILES[url.pathname.split("/").pop()!];
      return body === undefined ? new HttpResponse(null, { status: 404 }) : HttpResponse.text(body);
    }),
  );
  return asked;
}

/** An event in the zone, written the way ingest writes one. */
async function put(e: Partial<SeismicEvent> & Pick<SeismicEvent, "id" | "mag">, zone: ZoneId = "choco") {
  await insertStmt(
    env.DB,
    {
      time: "2026-09-14T10:00:00Z",
      lat: 4.5,
      lon: -76.7,
      depthKm: 40,
      magType: "MLv",
      phases: null,
      rmsS: null,
      gapDeg: null,
      errLatKm: null,
      errLonKm: null,
      errDepthKm: null,
      region: "Chocó, Colombia",
      status: "manual",
      solutionStamp: null,
      ...e,
    },
    "2026-09-24T00:00:00Z",
    zone,
  ).run();
}

/** Chocó as SGC has it: the M7.4, reviewed, 2.5 above the next largest. */
async function chocoWithMainshock() {
  await put({
    id: "SGC2026pqqmro",
    mag: 7.4,
    time: "2026-08-10T12:34:27Z",
    lat: 4.99,
    lon: -76.29,
    depthKm: 103.4,
    magType: "Mw",
  });
  await put({ id: "SGC2026smalla", mag: 4.9 });
}

/** Fires the daily job the way Cloudflare does. */
async function runProducts(at = Date.UTC(2026, 8, 24, 11, 7)) {
  await worker.scheduled!({ cron: PRODUCTS_CRON, scheduledTime: at, noRetry() {} }, env);
}

/** Calls the Worker as the page does: same-origin, which /api/* requires. */
async function call(path: string, headers: HeadersInit = { "sec-fetch-site": "same-origin" }) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`https://x.test${path}`, { headers }), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
const context = async (zone: ZoneId = "choco") =>
  (await (await call(`/api/context?zone=${zone}`)).json()) as ContextResponse;

beforeEach(async () => {
  await env.DB.batch([env.DB.prepare("DELETE FROM events"), env.DB.prepare("DELETE FROM external_products")]);
});
afterEach(() => server.resetHandlers());

describe("the daily USGS job", () => {
  it("finds the zone's mainshock in USGS's catalogue and stores its three digests for /api/context", async () => {
    await chocoWithMainshock();
    const asked = usgs();
    await runProducts();

    // One search, around SGC's own time, place and size for the mainshock.
    const search = asked.find((u) => u.pathname.endsWith("/query") && u.searchParams.has("starttime"))!;
    expect(Object.fromEntries(search.searchParams)).toMatchObject({
      format: "geojson",
      starttime: "2026-08-10T12:33:27.000Z",
      endtime: "2026-08-10T12:35:27.000Z",
      latitude: "4.99",
      longitude: "-76.29",
      maxradiuskm: "100",
      minmagnitude: "6.4",
    });

    const ctx = await context();
    expect(ctx.dyfi).toMatchObject({
      source: "usgs",
      sgcEventId: "SGC2026pqqmro",
      sourceEventId: "us6000tjl2",
      sourceUpdatedAt: "2026-09-20T00:35:19.923Z",
      checkedAt: "2026-09-24T11:07:00.000Z",
      digest: { responses: 1249, pereira: { cdi: 8, responses: 41 } },
    });
    expect(ctx.pager?.digest.pereira?.name).toBe("Pereira");
    expect(ctx.forecast?.digest.nextUpdateAt).toBe("2026-09-28T16:00:31.849Z");
  });

  it("does not download a product again while its URL is the one stored, but records that it checked", async () => {
    await chocoWithMainshock();
    usgs();
    await runProducts();
    const first = await context();

    server.resetHandlers();
    const asked = usgs();
    await runProducts(Date.UTC(2026, 8, 25, 11, 7));

    expect(asked.filter((u) => u.pathname.startsWith("/product/"))).toEqual([]);
    const second = await context();
    expect(second.dyfi?.checkedAt).toBe("2026-09-25T11:07:00.000Z");
    expect(second.dyfi?.digest).toEqual(first.dyfi?.digest);
    expect(second.forecast?.sourceUpdatedAt).toBe(first.forecast?.sourceUpdatedAt);
  });

  it.each([
    ["no event", []],
    ["two events", ["us6000aaaa", "us6000bbbb"]],
  ])("stores nothing when USGS's search finds %s near the mainshock", async (_, ids) => {
    await chocoWithMainshock();
    const features = ids.map((id) => ({ ...JSON.parse(MATCH).features[0], id }));
    const asked = usgs({ match: () => HttpResponse.json({ type: "FeatureCollection", features }) });
    await runProducts();

    expect(asked.filter((u) => u.searchParams.has("eventid") || u.pathname.startsWith("/product/"))).toEqual([]);
    expect(await context()).toEqual({ dyfi: null, pager: null, forecast: null });
  });

  it("keeps yesterday's digests, with yesterday's check time, when USGS is down", async () => {
    await chocoWithMainshock();
    usgs();
    await runProducts();

    server.resetHandlers();
    usgs({ match: () => new HttpResponse(null, { status: 503 }) });
    // The invocation still fails, so Cloudflare's own record of the cron says so.
    await expect(runProducts(Date.UTC(2026, 8, 25, 11, 7))).rejects.toThrow(/503/);

    const ctx = await context();
    expect(ctx.dyfi?.checkedAt).toBe("2026-09-24T11:07:00.000Z");
    expect(ctx.forecast?.digest.issuedAt).toBe("2026-09-21T18:03:11.563Z");
  });

  it("stores the products it could read when one file is malformed, and not a guess for that one", async () => {
    await chocoWithMainshock();
    usgs();
    // Registered after usgs(), so it answers first: MSW tries the newest handler first.
    server.use(http.get("https://earthquake.usgs.gov/product/oaf/*", () => HttpResponse.json({ forecast: "no" })));
    await expect(runProducts()).rejects.toThrow(/forecast/);

    const ctx = await context();
    expect(ctx.forecast).toBeNull();
    expect(ctx.dyfi?.digest.pereira?.cdi).toBe(8);
    expect(ctx.pager?.digest.pereira?.name).toBe("Pereira");
  });

  it("rebuilds a digest stored by older digest code, although USGS's URL has not changed", async () => {
    await chocoWithMainshock();
    usgs();
    await runProducts();
    await env.DB.prepare("UPDATE external_products SET digest_version = digest_version - 1, digest = '{}'").run();

    server.resetHandlers();
    const asked = usgs();
    await runProducts(Date.UTC(2026, 8, 25, 11, 7));

    expect(asked.filter((u) => u.pathname.startsWith("/product/"))).toHaveLength(3);
    expect((await context()).dyfi?.digest.pereira?.cdi).toBe(8);
  });

  it("never follows a redirect away from USGS", async () => {
    await chocoWithMainshock();
    usgs();
    server.use(
      http.get("https://earthquake.usgs.gov/product/oaf/*", () =>
        HttpResponse.redirect("https://elsewhere.example/forecast.json", 302),
      ),
    );
    await expect(runProducts()).rejects.toThrow(/302/);
    expect((await context()).forecast).toBeNull();
  });

  it("drops the digests of an event that is no longer the zone's mainshock", async () => {
    await chocoWithMainshock();
    usgs();
    await runProducts();

    // A larger, reviewed event takes the label; USGS has nothing for it yet.
    await put({ id: "SGC2026bigger", mag: 8.6, time: "2026-09-25T02:00:00Z" });
    server.resetHandlers();
    usgs({ match: () => HttpResponse.json({ type: "FeatureCollection", features: [] }) });
    await runProducts(Date.UTC(2026, 8, 25, 11, 7));

    expect(await context()).toEqual({ dyfi: null, pager: null, forecast: null });
  });

  it("still runs the next zone after one fails", async () => {
    await chocoWithMainshock();
    // Chaparral with a clear mainshock of its own, which USGS's stub finds as us6000tjl2 too.
    await put({ id: "SGC2026tolbig", mag: 5.9, time: "2026-09-23T10:00:00Z" }, "tolima");
    await put({ id: "SGC2026tolsma", mag: 4.2, time: "2026-09-22T10:00:00Z" }, "tolima");
    let searches = 0;
    usgs({
      match: () => (++searches === 1 ? new HttpResponse(null, { status: 503 }) : HttpResponse.text(MATCH)),
    });
    await expect(runProducts()).rejects.toThrow(/503/);

    // Chaparral goes first, so it meets the 503; Chocó still gets its digest.
    expect((await context("tolima")).dyfi).toBeNull();
    expect((await context("choco")).dyfi?.sgcEventId).toBe("SGC2026pqqmro");
  });

  it("asks USGS nothing for a zone with no clear mainshock", async () => {
    await put({ id: "SGC2026tolaaa", mag: 4.5, time: "2026-09-23T10:00:00Z" }, "tolima");
    await put({ id: "SGC2026tolbbb", mag: 4.2, time: "2026-09-22T10:00:00Z" }, "tolima");
    const asked = usgs();
    await runProducts();

    expect(asked).toEqual([]);
    expect(await context("tolima")).toEqual({ dyfi: null, pager: null, forecast: null });
  });
});

describe("which job a cron runs", () => {
  it("is decided by the two patterns wrangler.jsonc declares, and no others", () => {
    const crons = /"crons":\s*(\[[^\]]*\])/.exec(WRANGLER)?.[1];
    expect(JSON.parse(crons!)).toEqual([INGEST_CRON, PRODUCTS_CRON]);
  });

  it("does nothing for a pattern it does not know: no ingest, so no request to SGC", async () => {
    await env.DB.prepare("DELETE FROM ingest_runs").run();
    const asked = usgs();
    await worker.scheduled!({ cron: "0 0 * * *", scheduledTime: Date.UTC(2026, 8, 24), noRetry() {} }, env);

    expect(asked).toEqual([]);
    const runs = await env.DB.prepare("SELECT COUNT(*) AS n FROM ingest_runs").first<{ n: number }>();
    expect(runs?.n).toBe(0);
  });
});

describe("GET /api/context", () => {
  it("is for the page only, like every /api route, and always revalidates", async () => {
    expect((await call("/api/context?zone=choco", {})).status).toBe(403);
    expect((await call("/api/context?zone=narnia")).status).toBe(400);
    const res = await call("/api/context?zone=tolima");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-cache");
  });
});
