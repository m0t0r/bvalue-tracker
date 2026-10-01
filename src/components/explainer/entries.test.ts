import { describe, expect, it } from "vitest";
import { placeholders } from "@/lib/rich";
import { CHARTS, CHART_PARTS } from "./entries";
import { CHART_IDS } from "./ids";

// Issue #145: a chart's card explains it in a few short paragraphs, and names the b-value, Mc and the
// other terms it leans on as explainers of their own rather than defining them again.
describe("the charts' explainers", () => {
  it.each(CHART_IDS)("%s says the same things in both languages", (id) => {
    const { parts } = CHARTS[id];
    expect(parts.length).toBeGreaterThan(0);
    for (const p of parts) expect(placeholders(p.es)).toEqual(placeholders(p.en));
  });

  it.each(CHART_IDS)("%s fills every placeholder it uses", (id) => {
    for (const p of CHARTS[id].parts) {
      for (const name of placeholders(p.es)) expect(Object.keys(CHART_PARTS)).toContain(name);
    }
  });

  it("names the b-value and Mc where the issue asks for them, on the two charts that show them", () => {
    const uses = (id: (typeof CHART_IDS)[number]) => CHARTS[id].parts.flatMap((p) => placeholders(p.en));
    expect(uses("fmd")).toEqual(expect.arrayContaining(["b", "mc"]));
    expect(uses("b-over-time")).toEqual(expect.arrayContaining(["b", "mc"]));
  });
});
