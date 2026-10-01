import { describe, expect, it } from "vitest";
import type { Lang } from "@/lib/i18n";
import { block3dCopy } from "./block3d/copy";
import { insightsCopy } from "./copy";
import { questionsCopy } from "./questions/copy";
import { sourceShort } from "./source-names";
import { storyCopy } from "./story/copy";

const langs: Lang[] = ["es", "en"];

/**
 * Issue #143: Chocó's shallow group was named five ways on the questions tab alone ("el grupo de
 * Istmina–Sipí", "Istmina–Sipí", "Chocó, superficial", "Chocó superficial", "grupo superficial"). Every
 * key and label takes its name from `sourceShort`, and these hold each tab to it.
 */
describe("one name per source, in every key and label", () => {
  it.each(langs)("the shared copy offers the table's names, in %s", (lang) => {
    expect(insightsCopy[lang].sourceShort).toEqual(sourceShort[lang]);
  });

  it.each(langs)("the story's legend uses them, in %s", (lang) => {
    const { legend } = storyCopy[lang];
    expect({ shallow: legend.shallow, deep: legend.deep, tolima: legend.tolima }).toEqual(sourceShort[lang]);
  });

  it.each(langs)("the questions tab's map, calendar and chart keys use them, in %s", (lang) => {
    const c = questionsCopy[lang];
    const s = sourceShort[lang];
    expect([c.far.labelShallow, c.far.labelDeep, c.far.labelTolima]).toEqual([s.shallow, s.deep, s.tolima]);
    expect([c.felt.shallowName, c.felt.deepName, c.felt.tolimaName]).toEqual([s.shallow, s.deep, s.tolima]);
    expect([c.linked.legendShallow, c.linked.legendDeep, c.linked.legendTolima]).toEqual([s.shallow, s.deep, s.tolima]);
    expect(c.stop.shallowRow(40)).toContain(s.shallow);
    expect(c.stop.deepRow(100)).toContain(s.deep);
  });

  it.each(langs)("the 3D viewer's key uses them, in %s", (lang) => {
    const g = block3dCopy[lang].groups;
    const s = sourceShort[lang];
    expect([g.shallow, g.deep, g.tolima]).toEqual([s.shallow, s.deep, s.tolima]);
  });
});

/**
 * The prose and the keys are written in four files. A name written out by hand again, in a place the
 * checks above do not reach, is what let the five names happen, so no copy file may spell one.
 */
describe("no copy file writes a source's name by hand", () => {
  const sources = import.meta.glob<string>("/src/insights/**/copy.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  });
  const files = Object.entries(sources);

  it("finds the four copy files", () => {
    expect(files.map(([path]) => path).sort()).toEqual([
      "/src/insights/block3d/copy.ts",
      "/src/insights/copy.ts",
      "/src/insights/questions/copy.ts",
      "/src/insights/story/copy.ts",
    ]);
  });

  it.each([
    ["the group's place as its name", /Istmina–Sipí/],
    ["the comma form", /Chocó, (superficial|profundo|shallow|deep)/],
    ["the group as the place's", /grupo de Istmina|Istmina–Sipí group/],
  ])("has no %s", (_what, pattern) => {
    for (const [path, source] of files)
      expect({ path, found: pattern.exec(source)?.[0] ?? null }).toEqual({ path, found: null });
  });
});
