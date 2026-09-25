import { describe, expect, it } from "vitest";
import { insightsCopy } from "../copy";
import { questionsCopy } from "../questions/copy";
import { storyCopy } from "./copy";
import { placeholders } from "./rich";

/** Every argument any function in the copy is keyed by: counts and each claim's cases. */
const ARGS = [
  0,
  1,
  2,
  "found",
  "awaiting-review",
  "none",
  "decayed",
  "not-decayed",
  "young",
  "quieter",
  "usual",
  "busier",
  "moved",
  "too-few",
  "above",
  "inside",
  "below",
  "close",
  "more",
  "same",
  "less",
  true,
  false,
  null,
];

/** Every string the copy can produce, by path, with each keyed function called on each argument. */
function leaves(v: unknown, path: string, out: Map<string, string>) {
  if (typeof v === "string") out.set(path, v);
  else if (Array.isArray(v)) v.forEach((x, i) => leaves(x, `${path}[${i}]`, out));
  else if (typeof v === "function")
    for (const a of ARGS) leaves((v as (a: unknown) => unknown)(a), `${path}(${String(a)})`, out);
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) leaves(x, `${path}.${k}`, out);
}

describe("the story's copy", () => {
  const es = new Map<string, string>();
  const en = new Map<string, string>();
  leaves(storyCopy.es, "", es);
  leaves(storyCopy.en, "", en);

  it("has the same sentences in both languages", () => {
    expect([...en.keys()].sort()).toEqual([...es.keys()].sort());
  });

  it("gives each sentence the same placeholders in both languages", () => {
    for (const [path, text] of es) expect([path, placeholders(en.get(path)!)]).toEqual([path, placeholders(text)]);
  });

  it("points to USGS's forecast by the question's and the tab's own names, so a rename cannot strand it", () => {
    expect(storyCopy.es.unknown.forecast).toContain(`«${questionsCopy.es.bigger.q}»`);
    expect(storyCopy.es.unknown.forecast).toContain(`«${insightsCopy.es.tabs.questions}»`);
    expect(storyCopy.en.unknown.forecast).toContain(`"${questionsCopy.en.bigger.q}"`);
    expect(storyCopy.en.unknown.forecast).toContain(`"${insightsCopy.en.tabs.questions}"`);
  });

  it("writes every number with a decimal point, never a decimal comma", () => {
    for (const [path, text] of [...es, ...en]) expect([path, /\d,\d/.test(text)]).toEqual([path, false]);
  });
});
