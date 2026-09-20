import { readFileSync } from "node:fs";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  CHOCO_SWARM_BBOX, SEISCOMP_ENDPOINT, buildFormBody, fetchCatalog, formatFormDate, parseCatalogHtml,
  parseRetryAfter, sgcHttpError,
} from "../core/seiscomp.ts";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
// Real response captured 2026-09-18 for the Chocó bbox, 10/08/2026 .. 18/09/2026.
const FULL = fixture("seiscomp-2026-08-10_2026-09-18.html");
// Real response to a query whose date range matched nothing.
const EMPTY = fixture("seiscomp-empty.html");

const query = { start: new Date("2026-08-10T00:00:00Z"), end: new Date("2026-09-18T00:00:00Z"), bbox: CHOCO_SWARM_BBOX };

describe("form request", () => {
  it("formats dates as dd/mm/yyyy, the only shape the server accepts", () => {
    expect(formatFormDate(new Date("2026-08-10T00:00:00Z"))).toBe("10/08/2026");
    expect(formatFormDate(new Date("2026-01-05T23:59:59Z"))).toBe("05/01/2026");
  });

  it("posts the bbox under the form's real field names with wide-open quality filters", () => {
    const body = buildFormBody(query);
    expect(Object.fromEntries(body)).toMatchObject({
      inicial: "10/08/2026", final: "18/09/2026", ubi: "cuadrante",
      longitudStart: "-77.4", longitudEnd: "-76.1", latitudStart: "4.1", latitudEnd: "5.6",
      magnitudStart: "0", gapEnd: "360", eprofmax: "999", Submit: "Consultar",
    });
  });
});

describe("parseCatalogHtml on the captured response", () => {
  const page = parseCatalogHtml(FULL);

  it("returns exactly the number of events the server reported", () => {
    expect(page.reportedTotal).toBe(786);
    expect(page.events).toHaveLength(786);
  });

  it("parses the M7.4 mainshock row in full", () => {
    expect(page.events[0]).toEqual({
      id: "SGC2026pqqmro",
      time: "2026-08-10T12:34:27Z",
      lat: 4.99093472, lon: -76.29174107, depthKm: 103.4093192,
      mag: 7.4, magType: "Mw", phases: 119, rmsS: 1.2, gapDeg: 79,
      errLatKm: 1.603, errLonKm: 1.916, errDepthKm: 3.49,
      region: "San Jose del Palmar - Choco, Colombia",
      status: "manual",
      solutionStamp: "2026-08-10T19:08:37Z",
    });
  });

  it("parses the last row", () => {
    expect(page.events.at(-1)).toMatchObject({ id: "SGC2026skywaa", time: "2026-09-18T22:08:54Z", mag: 2.1 });
  });

  it("gives every event a unique id and complete core fields", () => {
    expect(new Set(page.events.map((e) => e.id)).size).toBe(786);
    for (const e of page.events) {
      expect(e.id).toMatch(/^SGC2026[a-z]+$/);
      expect(Number.isNaN(Date.parse(e.time))).toBe(false);
      expect(e.lat).toBeGreaterThanOrEqual(CHOCO_SWARM_BBOX.latMin);
      expect(e.lat).toBeLessThanOrEqual(CHOCO_SWARM_BBOX.latMax);
      expect(e.lon).toBeGreaterThanOrEqual(CHOCO_SWARM_BBOX.lonMin);
      expect(e.lon).toBeLessThanOrEqual(CHOCO_SWARM_BBOX.lonMax);
      expect(e.rmsS).not.toBeNull();
      expect(e.gapDeg).not.toBeNull();
    }
  });

  // Expected figures were computed independently (Python regex pass over the same file).
  it("matches independently computed aggregates", () => {
    const count = (f: (e: (typeof page.events)[number]) => boolean) => page.events.filter(f).length;
    expect(count((e) => e.status === "manual")).toBe(782);
    expect(count((e) => e.status === "automatic")).toBe(4);
    expect(count((e) => e.magType === "MLr_1")).toBe(737);
    expect(count((e) => e.mag === 2.0)).toBe(67);
    expect(count((e) => e.mag === 2.1)).toBe(98);
    expect(count((e) => e.mag === 2.2)).toBe(91);
    expect(count((e) => e.mag < 2.0)).toBe(2);
  });
});

describe("parseCatalogHtml failure modes", () => {
  it("returns an empty page for a genuine zero-result response", () => {
    expect(parseCatalogHtml(EMPTY)).toEqual({
      reportedTotal: 0,
      duplicatesDropped: 0,
      skippedRows: [],
      events: [],
      // Parsed from a string, so there was no network to describe.
      cost: { chars: EMPTY.length, fetchMs: null, attempts: null },
    });
  });

  it("collapses a row the server repeats, as SGC does on large queries", () => {
    const lastRow = FULL.slice(FULL.lastIndexOf("<tr>"), FULL.lastIndexOf("</tbody>"));
    const doubled = FULL.replace("</tbody>", `${lastRow}</tbody>`).replace(/(colspan=2>)786</, "$1787<");
    const page = parseCatalogHtml(doubled);
    expect(page.reportedTotal).toBe(787);
    expect(page.duplicatesDropped).toBe(1);
    expect(page.events).toHaveLength(786);
  });

  it("rejects a page that is not a result page", () => {
    expect(() => parseCatalogHtml("<html><body>503 Service Unavailable</body></html>")).toThrow(/Total de registros/);
  });

  it("rejects a truncated response instead of returning partial data", () => {
    const cut = FULL.slice(0, FULL.lastIndexOf("<tr>")) + "</tbody></table></body></html>";
    expect(() => parseCatalogHtml(cut)).toThrow(/parsed 785 rows \(\+0 skipped\) but server reported 786/);
  });

  // One bad row used to throw for the whole page, which stopped every valid event in
  // the trailing window from being ingested on every cron tick until its date rolled out.
  it("skips a single unparsable row and keeps the rest of the page", () => {
    // Make exactly one row's origin time unparsable; every other row stays valid.
    const page = parseCatalogHtml(FULL.replace("<center>2026-08-10 12:34:27</center>", "<center>n/d</center>"));
    expect(page.skippedRows).toHaveLength(1);
    expect(page.skippedRows[0]!.reason).toMatch(/not numeric|unrecognised timestamp/);
    expect(page.events).toHaveLength(785);
    expect(page.reportedTotal).toBe(786);
  });

  // An absurd but finite magnitude would otherwise be stored and then size the bin
  // array in computeStats, throwing RangeError on every /api/stats call.
  it("skips a row whose magnitude is numeric but physically impossible", () => {
    const page = parseCatalogHtml(FULL.replace("<center>7.4</center>", "<center>4.3e8</center>"));
    expect(page.skippedRows).toHaveLength(1);
    expect(page.skippedRows[0]!.reason).toMatch(/mag out of range/);
    expect(page.events).toHaveLength(785);
  });

  it("still refuses a page where most rows are unparsable", () => {
    const wrecked = FULL.replaceAll("<center>2026-", "<center>n/d 2026-");
    expect(() => parseCatalogHtml(wrecked)).toThrow(/rows unparsable; refusing partial data/);
  });

  it("rejects a changed column layout", () => {
    expect(() => parseCatalogHtml(FULL.replaceAll("<th>Mag.</th>", "<th>Magnitud local</th><th>x</th>"))).toThrow(/layout changed/);
  });
});

describe("fetchCatalog", () => {
  /**
   * SGC itself, answered here. An unhandled request is an error rather than a passthrough,
   * so no test in this file can reach bdrsnc.sgc.gov.co — that is test:live's job alone.
   */
  const server = setupServer();
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  const ok = () => HttpResponse.html(FULL);

  /** Answers the form with each response in turn, repeating the last; counts the requests. */
  function serves(...responses: (() => Response)[]): () => number {
    let n = 0;
    server.use(http.post(SEISCOMP_ENDPOINT, () => responses[Math.min(n++, responses.length - 1)]!()));
    return () => n;
  }

  it("POSTs the form body and parses the response", async () => {
    let seen: Request | undefined;
    server.use(http.post(SEISCOMP_ENDPOINT, ({ request }) => { seen = request.clone(); return ok(); }));
    const page = await fetchCatalog(query);
    expect(page.events).toHaveLength(786);
    expect(seen!.url).toContain("consulta_sismo.php");
    expect(seen!.method).toBe("POST");
    expect(await seen!.text()).toContain("inicial=10%2F08%2F2026");
  });

  it("retries transport and HTTP failures", async () => {
    const calls = serves(() => HttpResponse.error(), () => new Response("bad gateway", { status: 502 }), ok);
    const page = await fetchCatalog(query, { backoffMs: 1 });
    expect(calls()).toBe(3);
    expect(page.events).toHaveLength(786);
  });

  // None of this was visible from outside: a hanging SGC request and a fast empty one look
  // the same in ingest_runs, and "responses are buffered with no byte cap" was an open
  // audit question with no measurement behind it. The retry is counted too, because what a
  // slow run costs is how long SGC held us, not how long the last attempt took.
  it("reports what the response cost: its size and how many requests it took", async () => {
    serves(() => HttpResponse.error(), ok);
    const page = await fetchCatalog(query, { backoffMs: 1 });
    expect(page.cost.chars).toBe(FULL.length);
    expect(page.cost.attempts).toBe(2);
    expect(page.cost.fetchMs).toBeGreaterThanOrEqual(0);
  });

  it("gives up after the retry budget and keeps the cause", async () => {
    const calls = serves(() => new Response("", { status: 500 }));
    await expect(fetchCatalog(query, { retries: 2, backoffMs: 1 })).rejects.toThrow(/failed after 3 attempts/);
    expect(calls()).toBe(3);
  });

  it("does not retry a deterministic parse failure", async () => {
    const calls = serves(() => HttpResponse.html("<html>maintenance</html>"));
    await expect(fetchCatalog(query, { backoffMs: 1 })).rejects.toThrow(/Total de registros/);
    expect(calls()).toBe(1);
  });

  // Retrying is the one thing that makes being rate limited worse, and every other 4xx is a
  // deterministic answer about the request itself — production met 410 Gone on 2026-09-20.
  // All of them leave the loop on the first response and carry the status out for the back-off.
  it.each([429, 503, 410, 403, 404, 400])("stops at the first HTTP %i and reports its status", async (status) => {
    const calls = serves(() => new Response("", { status, headers: { "retry-after": "120" } }));
    const err = await fetchCatalog(query, { retries: 3, backoffMs: 1 }).catch((e: unknown) => e);
    expect(calls()).toBe(1);
    expect(sgcHttpError(err)).toMatchObject({ status, retryAfterS: 120 });
  });

  it("keeps the status of a retried failure as the cause", async () => {
    serves(() => new Response("", { status: 500 }));
    const err = await fetchCatalog(query, { retries: 1, backoffMs: 1 }).catch((e: unknown) => e);
    expect(sgcHttpError(err)).toMatchObject({ status: 500, retryAfterS: null });
  });
});

describe("parseRetryAfter", () => {
  const now = Date.parse("2026-09-19T12:00:00Z");

  it("reads a seconds count", () => {
    expect(parseRetryAfter("120", now)).toBe(120);
    expect(parseRetryAfter(" 30 ", now)).toBe(30);
  });

  it("reads an HTTP date as seconds from now, never negative", () => {
    expect(parseRetryAfter("Sat, 19 Sep 2026 12:05:00 GMT", now)).toBe(300);
    expect(parseRetryAfter("Sat, 19 Sep 2026 11:00:00 GMT", now)).toBe(0);
  });

  it("returns null for a missing or unreadable value", () => {
    expect(parseRetryAfter(null, now)).toBeNull();
    expect(parseRetryAfter("", now)).toBeNull();
    expect(parseRetryAfter("soon", now)).toBeNull();
  });
});
