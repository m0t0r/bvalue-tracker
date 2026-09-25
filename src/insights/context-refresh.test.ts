import { describe, expect, it } from "vitest";
import { PRODUCTS_CRON, lastProductsRun } from "../../core/products";
import type { ContextResponse, ExternalProduct, ForecastDigest } from "../../worker/api-types";
import {
  CONTEXT_RECHECK_FOR_MS,
  CONTEXT_RECHECK_MS,
  PRODUCTS_RUN_MARGIN_MS,
  contextRecheckDue,
  keepFeltFromFirst,
} from "./context-refresh";

const T = (iso: string) => Date.parse(iso);
const MIN = 60_000;

/** A context whose forecast is due at 2026-09-28T16:00:00Z (or, without one, 14 days after issue). */
const product = <D>(digest: D): ExternalProduct<D> => ({
  source: "usgs",
  sgcEventId: "SGC2026pqqmro",
  sourceEventId: "us6000tjl2",
  productUrl: "https://earthquake.usgs.gov/product/x",
  sourceUpdatedAt: "2026-09-21T18:03:11.563Z",
  checkedAt: "2026-09-25T11:07:00.000Z",
  digest,
});
const forecast = (over: Partial<ForecastDigest> = {}) =>
  product({
    issuedAt: "2026-09-21T18:00:00.000Z",
    nextUpdateAt: "2026-09-28T16:00:00.000Z",
    expiresAt: null,
    reviewStatus: "reviewed",
    model: { b: 1, mc: 4.45, mainshockMag: 7.4, regionCenter: { lat: 4.57, lon: -76.69 }, regionRadiusKm: 125.4 },
    windows: [],
    ...over,
  } satisfies ForecastDigest);
const context = (over: Partial<ContextResponse> = {}): ContextResponse => ({
  dyfi: null,
  pager: null,
  forecast: forecast(),
  ...over,
});

describe("lastProductsRun", () => {
  it("is the daily job's own schedule, 11:07 UTC, the newest run at or before a moment", () => {
    expect(PRODUCTS_CRON).toBe("7 11 * * *");
    expect(lastProductsRun(T("2026-09-29T11:07:00Z"))).toBe(T("2026-09-29T11:07:00Z"));
    expect(lastProductsRun(T("2026-09-29T11:06:59.999Z"))).toBe(T("2026-09-28T11:07:00Z"));
    expect(lastProductsRun(T("2026-09-28T16:00:00Z"))).toBe(T("2026-09-28T11:07:00Z"));
  });
});

/**
 * The forecast is due 2026-09-28T16:00Z; the first job that can store the next one runs
 * 2026-09-29T11:07Z, and is given PRODUCTS_RUN_MARGIN_MS (5 min) to finish.
 */
describe("contextRecheckDue", () => {
  const DUE = T("2026-09-28T16:00:00Z");
  const RUN = T("2026-09-29T11:07:00Z") + 5 * MIN;
  const fetched = T("2026-09-25T12:00:00Z");

  it("waits past the due time for the first job run after it, which is when the server can have the next forecast", () => {
    expect(PRODUCTS_RUN_MARGIN_MS).toBe(5 * MIN);
    expect(contextRecheckDue(context(), fetched, fetched, DUE)).toBe(false);
    expect(contextRecheckDue(context(), fetched, fetched, RUN - 1)).toBe(false);
    expect(contextRecheckDue(context(), fetched, fetched, RUN)).toBe(true);
  });

  it("without a next update, from 14 days after issue, the forecast's own staleness rule", () => {
    const noNext = context({ forecast: forecast({ nextUpdateAt: null }) });
    // 2026-10-05T18:00Z is due; the next run is 2026-10-06T11:07Z.
    expect(contextRecheckDue(noNext, fetched, fetched, T("2026-10-06T11:11:59Z"))).toBe(false);
    expect(contextRecheckDue(noNext, fetched, fetched, T("2026-10-06T11:12:00Z"))).toBe(true);
  });

  it("once a run's answer is in, not again until the next run: the server cannot have anything newer", () => {
    const answered = RUN + 2 * MIN;
    expect(contextRecheckDue(context(), answered, answered, answered + 12 * 60 * MIN)).toBe(false);
    expect(contextRecheckDue(context(), answered, answered, RUN + 24 * 60 * MIN)).toBe(true);
  });

  it("after a failed attempt, 10 minutes before the next, so a failing server is not asked on every return", () => {
    expect(CONTEXT_RECHECK_MS).toBe(10 * MIN);
    const failed = RUN + 1 * MIN;
    expect(contextRecheckDue(context(), fetched, failed, failed + 10 * MIN - 1)).toBe(false);
    expect(contextRecheckDue(context(), fetched, failed, failed + 10 * MIN)).toBe(true);
  });

  it("stops two days after the due time: a forecast that never comes back is not asked for for ever", () => {
    expect(CONTEXT_RECHECK_FOR_MS).toBe(2 * 24 * 60 * MIN);
    const end = DUE + CONTEXT_RECHECK_FOR_MS;
    expect(contextRecheckDue(context(), fetched, fetched, end - 1)).toBe(true);
    expect(contextRecheckDue(context(), fetched, fetched, end)).toBe(false);
  });

  it("never after a failed first load or with no forecast stored: what the page opened with stays", () => {
    expect(contextRecheckDue(undefined, 0, fetched, RUN + 60 * MIN)).toBe(false);
    expect(contextRecheckDue(context({ forecast: null }), fetched, fetched, RUN + 60 * MIN)).toBe(false);
  });
});

describe("keepFeltFromFirst", () => {
  const dyfi = (responses: number) =>
    product({ responses, pereira: { cell: "c", placeName: "p", cdi: 8, responses: 41 } });
  const pager = (mmi: number) => product({ pereira: { name: "Pereira", mmi, distanceKm: 0.2 } });

  it("takes the latest figures for a product the page first had, and the latest forecast", () => {
    const first = context({ dyfi: dyfi(1249), pager: pager(8.43) });
    const latest = context({
      dyfi: dyfi(1300),
      pager: pager(8.5),
      forecast: forecast({ issuedAt: "2026-09-28T18:00:00.000Z" }),
    });
    expect(keepFeltFromFirst(first, latest)).toEqual(latest);
  });

  it("never adds or drops a product, so question 2 never comes or goes after the first answer", () => {
    const first = context({ dyfi: dyfi(1249), pager: null });
    const latest = context({ dyfi: null, pager: pager(8.5) });
    expect(keepFeltFromFirst(first, latest)).toEqual({ dyfi: first.dyfi, pager: null, forecast: latest.forecast });
  });

  it("before any later answer, or after a failed first load, is what the page first had", () => {
    const first = context({ dyfi: dyfi(1249) });
    expect(keepFeltFromFirst(first, undefined)).toBe(first);
    expect(keepFeltFromFirst(null, undefined)).toBeNull();
  });
});
