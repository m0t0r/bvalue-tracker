import { describe, expect, it } from "vitest";
import {
  INSIGHTS_LOAD,
  PRELOAD_MEDIA,
  classAttributes,
  monitorLoad,
  preloadTags,
  stylesheetBeforeBundle,
  swapPreloads,
  withAssetUrls,
  withInlineStylesheet,
} from "../core/page-data.ts";
import { HOME_ZONE } from "../core/zone-pages.ts";
import { ZONE_IDS } from "../core/zones.ts";

const page = (paths: string[]) => `<head>\n    <title>x</title>\n    ${preloadTags(paths)}\n  </head>`;
const preloaded = (html: string) =>
  [...html.matchAll(/<link rel="preload" href="([^"]+)" as="fetch"/g)].map((m) => m[1]);

describe("the pages' data preloads", () => {
  it("are what fetch() sends by default, so the page's own request is handed the response", () => {
    expect(preloadTags(["/api/status?zone=choco"])).toBe(
      `<link rel="preload" href="/api/status?zone=choco" as="fetch" crossorigin media="${PRELOAD_MEDIA}">`,
    );
  });

  // On a phone they cost the first paint a second (docs/performance.md).
  it("are for wide screens only", () => {
    const tags = preloadTags(INSIGHTS_LOAD).split("\n");
    expect(tags).toHaveLength(INSIGHTS_LOAD.length);
    for (const tag of tags) expect(tag).toContain('media="(min-width: 1024px)"');
  });

  it.each(ZONE_IDS)("give the %s page its own zone's data, and no other zone's", (zone) => {
    const html = swapPreloads(page(monitorLoad(HOME_ZONE)), monitorLoad(HOME_ZONE), monitorLoad(zone));
    expect(preloaded(html)).toEqual(monitorLoad(zone));
    for (const other of ZONE_IDS.filter((z) => z !== zone)) expect(html).not.toContain(`zone=${other}`);
  });

  it("refuse a page that has lost its preloads, rather than ship one with the wrong zone's", () => {
    expect(() => swapPreloads("<head></head>", monitorLoad(HOME_ZONE), monitorLoad("choco"))).toThrow(/found 0/);
  });

  it("refuse a page that has them twice", () => {
    const twice = page(monitorLoad(HOME_ZONE)) + preloadTags(monitorLoad(HOME_ZONE));
    expect(() => swapPreloads(twice, monitorLoad(HOME_ZONE), monitorLoad("choco"))).toThrow(/found 2/);
  });

  it("load both zones on /insights, once each", () => {
    for (const zone of ZONE_IDS) {
      expect(INSIGHTS_LOAD).toContain(`/api/events?zone=${zone}`);
      expect(INSIGHTS_LOAD).toContain(`/api/status?zone=${zone}`);
    }
    expect(new Set(INSIGHTS_LOAD).size).toBe(INSIGHTS_LOAD.length);
  });
});

describe("stylesheetBeforeBundle", () => {
  // Vite writes the stylesheet after the entry script and its module preloads.
  const built = [
    "<head>",
    '    <meta charset="UTF-8" />',
    '    <meta name="viewport" content="width=device-width" />',
    '    <script src="/assets/boot-a.js"></script>',
    "    <title>x</title>",
    '    <script type="module" crossorigin src="/assets/index-a.js"></script>',
    '    <link rel="modulepreload" crossorigin href="/assets/react-a.js">',
    '    <link rel="stylesheet" crossorigin href="/assets/src-a.css">',
    "  </head>",
  ].join("\n");

  it("moves the stylesheet ahead of the bundle, but not of the head script, which would wait for it", () => {
    const html = stylesheetBeforeBundle(built);
    const at = (s: string) => html.indexOf(s);
    expect(at('<link rel="stylesheet"')).toBeGreaterThan(at("boot-a.js"));
    expect(at('<link rel="stylesheet"')).toBeLessThan(at("index-a.js"));
    expect(at('<link rel="stylesheet"')).toBeLessThan(at("react-a.js"));
    expect(html).toContain(
      '\n    <link rel="stylesheet" crossorigin href="/assets/src-a.css">\n    <script type="module"',
    );
    expect(html.match(/rel="stylesheet"/g)).toHaveLength(1);
    // Nothing else moves or goes.
    expect(html.replace(/\s+/g, "").length).toBe(built.replace(/\s+/g, "").length);
  });

  it("refuses a page with no stylesheet or no module script, rather than ship it unchanged", () => {
    expect(() => stylesheetBeforeBundle(built.replace(/.*rel="stylesheet".*\n/, ""))).toThrow(/stylesheet/);
    expect(() => stylesheetBeforeBundle(built.replace(/.*(type="module"|modulepreload).*\n/g, ""))).toThrow(
      /module script/,
    );
  });
});

describe("withInlineStylesheet", () => {
  // A zone page as the build has it by then: head script, bundle, stylesheet, then the static header.
  const built = [
    "<head>",
    '    <meta charset="UTF-8" />',
    '    <script src="/assets/boot-a.js"></script>',
    "    <title>x</title>",
    '    <script type="module" crossorigin src="/assets/index-a.js"></script>',
    '    <link rel="modulepreload" crossorigin href="/assets/react-a.js">',
    '    <link rel="stylesheet" crossorigin href="/assets/src-a.css">',
    "  </head>",
    "  <body>",
    '    <div id="root"><!--static-shell--><header>…</header><!--/static-shell--></div>',
    "  </body>",
  ].join("\n");
  const css = ".flex{display:flex}";

  it("inlines the header's CSS after the head script and before the bundle", () => {
    const html = withInlineStylesheet(built, css);
    const at = (s: string) => html.indexOf(s);
    expect(html).toContain(`<style>${css}</style>`);
    expect(at("<style>")).toBeGreaterThan(at("boot-a.js"));
    expect(at("<style>")).toBeLessThan(at("index-a.js"));
  });

  // In the body it holds up only what comes after it, and the module scripts, which wait for it: so
  // nothing React draws is ever unstyled.
  it("moves the stylesheet to the end of the body, after the static header", () => {
    const html = withInlineStylesheet(built, css);
    expect(html.match(/rel="stylesheet"/g)).toHaveLength(1);
    expect(html).toContain('<link rel="stylesheet" crossorigin href="/assets/src-a.css">\n  </body>');
    expect(html.indexOf('rel="stylesheet"')).toBeGreaterThan(html.indexOf("<!--/static-shell-->"));
  });

  it("refuses CSS that would end its <style> early, and a page it cannot rewrite", () => {
    expect(() => withInlineStylesheet(built, "a{}</style><script>")).toThrow(/<\/style/);
    expect(() => withInlineStylesheet(built, "a{}</STYLE >")).toThrow(/<\/style/);
    expect(() => withInlineStylesheet(built.replace(/.*rel="stylesheet".*\n/, ""), css)).toThrow(/stylesheet/);
    expect(() => withInlineStylesheet(built.replace("</body>", ""), css)).toThrow(/body/);
    expect(() => withInlineStylesheet(built.replace(/.*(type="module"|modulepreload).*\n/g, ""), css)).toThrow(
      /module script/,
    );
  });
});

describe("classAttributes", () => {
  // React escapes & and ' in an attribute, and Tailwind's scanner does not read HTML: given the markup
  // as it is, it missed the buttons' `[&_svg…]` rules, and the icons painted at 24 px instead of 16.
  it("gives each class attribute's names as written in the source", () => {
    const html =
      '<a class="gap-1 [&amp;_svg:not([class*=&#x27;size-&#x27;])]:size-4"><span class="sr-only">&amp; x</span></a>';
    expect(classAttributes(html)).toBe("gap-1 [&_svg:not([class*='size-'])]:size-4\nsr-only");
  });

  it("reads &quot;, &lt; and &gt; back too, and ignores text outside a class attribute", () => {
    expect(classAttributes('<p class="a [content:&quot;&lt;&gt;&quot;]">class="no"</p>')).toBe('a [content:"<>"]');
  });
});

describe("withAssetUrls", () => {
  // Vite's hashes are 8 characters of base64url, "-" included (a real one: `DjL33-gN`).
  const assets = ["assets/geist-latin-wght-normal-BgDa-nEv.woff2", "assets/geist-latin-ext-wght-normal-Xy12AbCd.woff2"];

  // The inlined CSS is compiled from the sources, so its fonts point into node_modules; the page must
  // ask for the hashed files the build wrote, the same URL the font preload fetches.
  it("points each url() at the hashed file the build wrote", () => {
    const css =
      "@font-face{src:url(./files/geist-latin-wght-normal.woff2)}@font-face{src:url(./files/geist-latin-ext-wght-normal.woff2)}";
    expect(withAssetUrls(css, assets)).toBe(
      "@font-face{src:url(/assets/geist-latin-wght-normal-BgDa-nEv.woff2)}@font-face{src:url(/assets/geist-latin-ext-wght-normal-Xy12AbCd.woff2)}",
    );
  });

  it("refuses a url() with no file of its own name in the build, rather than ship a broken one", () => {
    expect(() => withAssetUrls("a{b:url(./files/geist-greek.woff2)}", assets)).toThrow(/geist-greek/);
    expect(() => withAssetUrls('a{b:url("x.png")}', assets)).toThrow(/x\.png/);
    // Only a longer name that starts the same was built (code review): pointed at it, the page would
    // load the wrong subset.
    expect(() =>
      withAssetUrls("a{b:url(./files/geist-latin.woff2)}", ["assets/geist-latin-ext-Xy12AbCd.woff2"]),
    ).toThrow(/geist-latin/);
  });
});
