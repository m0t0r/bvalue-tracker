import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CHOCO_SWARM_BBOX, buildFormBody, fetchCatalog, formatFormDate, parseCatalogHtml,
} from "../src/seiscomp.ts";

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
    expect(parseCatalogHtml(EMPTY)).toEqual({ reportedTotal: 0, duplicatesDropped: 0, events: [] });
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
    expect(() => parseCatalogHtml(cut)).toThrow(/parsed 785 rows but server reported 786/);
  });

  it("rejects a changed column layout", () => {
    expect(() => parseCatalogHtml(FULL.replaceAll("<th>Mag.</th>", "<th>Magnitud local</th><th>x</th>"))).toThrow(/layout changed/);
  });
});

describe("fetchCatalog", () => {
  const ok = () => new Response(FULL, { status: 200 });

  it("POSTs the form body and parses the response", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return ok(); }) as typeof fetch;
    const page = await fetchCatalog(query, { fetchImpl });
    expect(page.events).toHaveLength(786);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain("consulta_sismo.php");
    expect(calls[0]!.init.method).toBe("POST");
    expect(String(calls[0]!.init.body)).toContain("inicial=10%2F08%2F2026");
  });

  it("retries transport and HTTP failures", async () => {
    let n = 0;
    const fetchImpl = (async () => {
      n++;
      if (n === 1) throw new TypeError("fetch failed");
      if (n === 2) return new Response("bad gateway", { status: 502 });
      return ok();
    }) as typeof fetch;
    const page = await fetchCatalog(query, { fetchImpl, backoffMs: 1 });
    expect(n).toBe(3);
    expect(page.events).toHaveLength(786);
  });

  it("gives up after the retry budget and keeps the cause", async () => {
    let n = 0;
    const fetchImpl = (async () => { n++; return new Response("", { status: 500 }); }) as typeof fetch;
    await expect(fetchCatalog(query, { fetchImpl, retries: 2, backoffMs: 1 })).rejects.toThrow(/failed after 3 attempts/);
    expect(n).toBe(3);
  });

  it("does not retry a deterministic parse failure", async () => {
    let n = 0;
    const fetchImpl = (async () => { n++; return new Response("<html>maintenance</html>", { status: 200 }); }) as typeof fetch;
    await expect(fetchCatalog(query, { fetchImpl, backoffMs: 1 })).rejects.toThrow(/Total de registros/);
    expect(n).toBe(1);
  });
});
