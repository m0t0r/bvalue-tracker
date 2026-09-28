import { describe, expect, it } from "vitest";
import {
  INSIGHTS_LOAD,
  PRELOAD_MEDIA,
  monitorLoad,
  preloadTags,
  stylesheetBeforeBundle,
  swapPreloads,
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
