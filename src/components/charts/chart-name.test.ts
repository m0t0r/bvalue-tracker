import { cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { dicts } from "@/lib/i18n";
import { ChartName } from "./chart-name";

afterEach(cleanup);

// Issue #145: a chart's name in its card's title opens the card that says how to read it. `Deferred`
// draws it once, for the placeholder and the chart alike (`deferred.test.ts`).
describe("ChartName", () => {
  it.each([
    ["fmd", dicts.en.fmdTitle],
    ["b-over-time", dicts.en.bTimeTitle],
    ["magnitude-time", dicts.en.magTimeTitle],
  ] as const)("names %s with a word that opens its explainer", (chart, name) => {
    const view = render(createElement(ChartName, { chart }));
    expect(view.getByRole("button", { name }).getAttribute("aria-haspopup")).toBe("dialog");
  });
});
