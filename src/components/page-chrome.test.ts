import { describe, expect, it } from "vitest";

/**
 * What every page has in common is drawn once, so one page cannot say less than the other (issue #142:
 * `/insights` stated that it is independent of SGC and the monitor did not, since each wrote its own
 * footer). These read the pages' source because the pages cannot be mounted with data in a test: the
 * rule is where the markup comes from, not what it says (`site-footer.test.ts` holds that).
 */
const sources = import.meta.glob<string>("/src/**/*.tsx", { query: "?raw", import: "default", eager: true });
// Comments are the page's own prose and may name any of these; only code counts.
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const files = Object.entries(sources)
  .filter(([path]) => !path.includes(".test."))
  .map(([path, source]) => [path, code(source)] as const);

describe("the page chrome", () => {
  it("has one footer, written in SiteFooter and nowhere else", () => {
    const own = files.filter(([, source]) => /<footer[\s>]/.test(source)).map(([path]) => path);
    expect(own).toEqual(["/src/components/site-footer.tsx"]);
  });

  it.each(["/src/App.tsx", "/src/insights/app.tsx"])("ends %s in it", (path) => {
    expect(sources[path]).toMatch(/<SiteFooter[\s>]/);
  });

  it("has one page frame and one header control cluster, written in page-frame.tsx and nowhere else", () => {
    // Its two marks, wherever they sit in a class list: the column's width and the window's height. Either
    // alone is something else (the scope bar's row shares the width to line up; a skeleton fills a window).
    const frame = files
      .filter(([, source]) => /\bmax-w-7xl\b/.test(source) && /\bmin-h-svh\b/.test(source))
      .map(([path]) => path);
    expect(frame).toEqual(["/src/components/page-frame.tsx"]);
    // The 3D viewer's own header has a language button of its own, since the page's is under the viewer.
    const controls = files.filter(([, source]) => /<ThemeButton/.test(source)).map(([path]) => path);
    expect(controls).toEqual(["/src/components/page-frame.tsx"]);
  });
});
