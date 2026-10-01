import { describe, expect, it } from "vitest";

/**
 * Wording settled in the UX-writing review of 2026-09-30 (issue #143), held where it is written. The
 * page's words are in four modules and the monitor's in `src/lib/i18n.tsx`, and the inconsistencies came
 * from the same thing said in two of them, so each rule is checked over all of them.
 *
 * These read the copy as text because the point is the words. The rule they hold is the owner's: a
 * threshold is written "M4.0 o más", with the decimal point the page uses in every magnitude; a size
 * class keeps "M4", "M5", "M6" (the ×32 ladder, "un M4 llega muy atenuado").
 */
const copy = import.meta.glob<string>(["/src/insights/**/copy.ts", "/src/lib/i18n.tsx"], {
  query: "?raw",
  import: "default",
  eager: true,
});
const html = import.meta.glob<string>("/insights.html", { query: "?raw", import: "default", eager: true });
const everything = { ...copy, ...html };

const absent = (pattern: RegExp, files: Record<string, string> = everything) => {
  const found = Object.entries(files).flatMap(([path, source]) => {
    const hit = pattern.exec(source)?.[0];
    return hit === undefined ? [] : [{ path, hit }];
  });
  expect(found).toEqual([]);
};

describe("the insights page's wording", () => {
  it("writes a threshold with its decimal, never 'M4 o más' or 'magnitud 4 o más'", () => {
    absent(/M4 (o más|or more|and up)|magnitud 4 o más|magnitude 4 or more/);
  });

  it("says events 'por día' / 'per day' for a rate, never 'al día' or 'a day'", () => {
    absent(/eventos al día|events a day|réplicas al día|aftershocks a day/);
  });

  it("gives both zones their article in Spanish, as everywhere else: el Chocó y el Tolima", () => {
    // Not the monitor's, whose comment quotes SGC's bulletin, which names the pair that way.
    absent(/Chocó y Tolima/, {
      ...Object.fromEntries(Object.entries(copy).filter(([path]) => path.startsWith("/src/insights/"))),
      ...html,
    });
  });

  it("says a zoom, not a wheel, since a trackpad has none", () => {
    absent(/rueda para acercar/);
  });

  it("does not call the orange plane a crack", () => {
    absent(/grieta|\ba crack\b/);
  });

  it("does not make the page 'we' where it is 'this page' everywhere else", () => {
    absent(/lo mostramos tal como|we show it as USGS/);
  });
});
