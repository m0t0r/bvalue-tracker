import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FixedLang, dicts, type Lang } from "@/lib/i18n";
import { SiteFooter } from "./site-footer";

const langs = Object.keys(dicts) as Lang[];

/** The footer as the page draws it: its own lines as `children`, in one language. */
const footer = (lang: Lang, props: { csv?: boolean } = {}) =>
  renderToStaticMarkup(
    createElement(FixedLang, {
      lang,
      children: createElement(SiteFooter, { ...props, children: createElement("p", null, "THIS PAGE'S OWN LINE") }),
    }),
  );

/**
 * Both pages end in this one footer, so what the page says about itself cannot differ between them
 * (issue #142: the monitor never said it was independent of SGC, which `/insights` did, because each
 * page had written its own footer).
 */
describe("the footer both pages share", () => {
  it.each(langs)("says the page is independent of SGC, in %s", (lang) => {
    expect(footer(lang)).toContain(dicts[lang].disclaimer);
    expect(dicts[lang].disclaimer).toMatch(
      /independiente, sin relación con el SGC|independent page, not affiliated with SGC/,
    );
  });

  it.each(langs)("says the figures are not a forecast and where the official word is, in %s", (lang) => {
    expect(dicts[lang].disclaimer).toMatch(/no son un pronóstico|are not a forecast/);
    expect(dicts[lang].disclaimer).toMatch(/información oficial|official information/);
  });

  it.each(langs)("states the time zone once, in %s", (lang) => {
    expect(footer(lang).split(dicts[lang].timeNote)).toHaveLength(2);
    expect(dicts[lang].timeNote).toContain("UTC−5");
  });

  it.each(langs)("adds the CSV note only for a page with downloads, in %s", (lang) => {
    expect(footer(lang)).not.toContain(dicts[lang].timeNoteCsv);
    expect(footer(lang, { csv: true })).toContain(dicts[lang].timeNoteCsv);
  });

  it.each(langs)("is one footer element, with the page's own lines before the shared ones, in %s", (lang) => {
    const html = footer(lang);
    expect(html.match(/<footer/g)).toHaveLength(1);
    const at = (s: string) => html.indexOf(s);
    expect(at("THIS PAGE&#x27;S OWN LINE")).toBeGreaterThan(-1);
    expect(at("THIS PAGE&#x27;S OWN LINE")).toBeLessThan(at(dicts[lang].timeNote));
    expect(at(dicts[lang].timeNote)).toBeLessThan(at(dicts[lang].disclaimer));
  });
});
