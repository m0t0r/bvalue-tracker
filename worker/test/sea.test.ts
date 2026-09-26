import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import MARINE from "../../test/fixtures/open-meteo-marine-2026-09-26.json?raw";
import type { SeaForecast } from "../api-types.ts";
import { PRODUCTS_CRON } from "../external.ts";
import worker from "../index.ts";
import { SEA_DIGEST_VERSION, SEA_URL, digestSea } from "../sea.ts";

/**
 * The daily sea-state job and `GET /api/sea`. Open-Meteo is answered from its reply captured on
 * 2026-09-26 for the block's point (Météo-France's model, 72 hours); USGS finds no mainshock in an
 * empty catalogue and asks nothing. An unhandled request is an error, so nothing reaches the network.
 */
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

const MARINE_HOST = "https://marine-api.open-meteo.com/v1/marine";
const file = () => JSON.parse(MARINE) as { hourly: Record<string, (number | null)[]> };

/** Open-Meteo answering with `reply`; returns every URL asked for. */
function openMeteo(reply: () => Response = () => HttpResponse.text(MARINE)): URL[] {
  const asked: URL[] = [];
  server.use(
    http.get(MARINE_HOST, ({ request }) => {
      asked.push(new URL(request.url));
      return reply();
    }),
  );
  return asked;
}

async function runDaily(at = Date.UTC(2026, 8, 26, 11, 7)) {
  await worker.scheduled!({ cron: PRODUCTS_CRON, scheduledTime: at, noRetry() {} }, env);
}

async function sea(): Promise<SeaForecast | null> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request("https://x.test/api/sea", { headers: { "sec-fetch-site": "same-origin" } }),
    env,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  expect(res.status).toBe(200);
  return (await res.json()) as SeaForecast | null;
}

beforeEach(async () => {
  await env.DB.batch([env.DB.prepare("DELETE FROM events"), env.DB.prepare("DELETE FROM sea_forecast")]);
});

describe("digestSea", () => {
  it("reads 72 hours of three wave trains from the captured reply", () => {
    const hours = digestSea(file());
    expect(hours).toHaveLength(72);
    expect(hours[0]!.t).toBe(Date.UTC(2026, 8, 26));
    expect(hours[71]!.t - hours[0]!.t).toBe(71 * 3_600_000);
    // The first hour as the file gives it: a swell from the west, a second from the south-west, no wind waves.
    expect(hours[0]).toEqual({
      t: Date.UTC(2026, 8, 26),
      swell: { heightM: 0.54, fromDeg: 281, periodS: 11 },
      swell2: { heightM: 0.46, fromDeg: 228, periodS: 11.65 },
      wind: null,
    });
  });

  it("drops only the hour's train that is out of range, and keeps the rest of the forecast", () => {
    const f = file();
    f.hourly.swell_wave_height![3] = 45;
    f.hourly.secondary_swell_wave_direction![5] = 400;
    f.hourly.swell_wave_period![7] = 31;
    const hours = digestSea(f);
    expect(hours).toHaveLength(72);
    expect(hours[3]!.swell).toBeNull();
    expect(hours[3]!.swell2).not.toBeNull();
    expect(hours[5]!.swell2).toBeNull();
    expect(hours[7]!.swell).toBeNull();
    expect(hours[4]!.swell).toEqual(digestSea(file())[4]!.swell);
  });

  it("takes a train of no height or period, or with a missing value, as none", () => {
    const f = file();
    f.hourly.swell_wave_height![0] = 0;
    f.hourly.secondary_swell_wave_period![0] = null;
    const [first] = digestSea(f);
    expect(first!.swell).toBeNull();
    expect(first!.swell2).toBeNull();
  });

  it.each([
    ["a missing column", (f: ReturnType<typeof file>) => delete f.hourly.wind_wave_period],
    ["a short column", (f: ReturnType<typeof file>) => f.hourly.swell_wave_height!.pop()],
    ["hours out of order", (f: ReturnType<typeof file>) => f.hourly.time!.reverse()],
    [
      "far more hours than asked for",
      (f: ReturnType<typeof file>) => {
        for (const k of Object.keys(f.hourly)) f.hourly[k] = Array.from({ length: 3 }, () => f.hourly[k]!).flat();
        f.hourly.time = f.hourly.time!.map((_, k) => 1790380800 + k * 3600);
      },
    ],
    [
      "no wave in any hour",
      (f: ReturnType<typeof file>) => {
        for (const k of Object.keys(f.hourly)) if (k.endsWith("_height")) f.hourly[k] = f.hourly[k]!.map(() => 0);
      },
    ],
  ])("throws on %s rather than guessing", (_, spoil) => {
    const f = file();
    spoil(f);
    expect(() => digestSea(f)).toThrow(/^sea: /);
  });

  it("throws on something that is not Open-Meteo's answer", () => {
    expect(() => digestSea(null)).toThrow();
    expect(() => digestSea({ error: true, reason: "x" })).toThrow();
  });
});

describe("the daily sea-state job", () => {
  it("asks Open-Meteo once, for the one URL, and serves what it stored", async () => {
    const asked = openMeteo();
    expect(await sea()).toBeNull();
    await runDaily();
    expect(asked.map(String)).toEqual([SEA_URL]);
    const got = await sea();
    expect(got).toMatchObject({
      source: "open-meteo",
      model: "meteofrance_wave",
      fetchedAt: "2026-09-26T11:07:00.000Z",
    });
    expect(got!.hours).toHaveLength(72);
    expect(got!.hours).toEqual(digestSea(file()));
  });

  it("keeps the stored forecast when Open-Meteo fails, and records the run as failed", async () => {
    openMeteo();
    await runDaily();
    server.resetHandlers();
    openMeteo(() => new HttpResponse(null, { status: 503 }));
    await expect(runDaily(Date.UTC(2026, 8, 27, 11, 7))).rejects.toThrow(/503/);
    expect((await sea())!.fetchedAt).toBe("2026-09-26T11:07:00.000Z");
  });

  it("does not follow a redirect", async () => {
    openMeteo(() => new HttpResponse(null, { status: 302, headers: { location: "https://elsewhere.test/" } }));
    await expect(runDaily()).rejects.toThrow(/302/);
    expect(await sea()).toBeNull();
  });

  it("stores nothing from a reply it cannot read", async () => {
    openMeteo(() => HttpResponse.json({ hourly: { time: [1] } }));
    await expect(runDaily()).rejects.toThrow(/^sea: /);
    expect(await sea()).toBeNull();
  });

  it("serves nothing from a row older code wrote", async () => {
    openMeteo();
    await runDaily();
    await env.DB.prepare("UPDATE sea_forecast SET digest_version = ?")
      .bind(SEA_DIGEST_VERSION - 1)
      .run();
    expect(await sea()).toBeNull();
  });
});
