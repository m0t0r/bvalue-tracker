import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fromCsv, toCsv } from "../core/csv.ts";
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
});
