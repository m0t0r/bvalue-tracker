import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fromCsv, toCsv, windowsToCsv } from "../core/csv.ts";
import { computeStats } from "../core/gr.ts";
import { parseCatalogHtml } from "../core/seiscomp.ts";

describe("csv", () => {
  it("round-trips the whole captured catalogue losslessly", () => {
    const html = readFileSync(new URL("./fixtures/seiscomp-2026-08-10_2026-09-18.html", import.meta.url), "utf8");
    const { events } = parseCatalogHtml(html);
    expect(fromCsv(toCsv(events))).toEqual(events);
  });

  it("quotes the comma in region names", () => {
    const html = readFileSync(new URL("./fixtures/seiscomp-2026-08-10_2026-09-18.html", import.meta.url), "utf8");
    const line = toCsv(parseCatalogHtml(html).events.slice(0, 1)).split("\n")[1]!;
    expect(line).toContain('"San Jose del Palmar - Choco, Colombia"');
  });

  it("writes b over time as one row per window, matching the statistics pipeline", () => {
    const html = readFileSync(new URL("./fixtures/seiscomp-2026-08-10_2026-09-18.html", import.meta.url), "utf8");
    const { windows } = computeStats(parseCatalogHtml(html).events);
    const lines = windowsToCsv(windows).trimEnd().split("\n");
    expect(lines[0]).toBe("from,to,n,mc,b,sigmaB,a,meanMag");
    expect(lines).toHaveLength(windows.length + 1);
    const last = lines.at(-1)!.split(",");
    expect(last[0]).toBe(windows.at(-1)!.from);
    expect(last.slice(2, 4)).toEqual(["150", "2.3"]);
    expect(Number(last[4])).toBeCloseTo(0.58, 2);
  });

  it("writes only the header when there are no windows", () => {
    expect(windowsToCsv([])).toBe("from,to,n,mc,b,sigmaB,a,meanMag\n");
  });

  it("translates only the header row, and reads a Spanish file back losslessly", () => {
    const html = readFileSync(new URL("./fixtures/seiscomp-2026-08-10_2026-09-18.html", import.meta.url), "utf8");
    const { events } = parseCatalogHtml(html);
    const [enHead, ...enRows] = toCsv(events).split("\n");
    const [esHead, ...esRows] = toCsv(events, "es").split("\n");
    expect(enHead).toBe("id,time,lat,lon,depthKm,mag,magType,phases,rmsS,gapDeg,errLatKm,errLonKm,errDepthKm,region,status,solutionStamp");
    expect(esHead).toBe("id,hora_utc,lat,lon,profundidad_km,magnitud,tipo_magnitud,fases,rms_s,gap_grados,err_lat_km,err_lon_km,err_prof_km,region,estado,sello_solucion");
    expect(esRows).toEqual(enRows);
    expect(fromCsv(toCsv(events, "es"))).toEqual(events);
  });

  it("translates the b-over-time header", () => {
    expect(windowsToCsv([], "es")).toBe("desde,hasta,n,mc,b,sigma_b,a,magnitud_media\n");
  });
});
