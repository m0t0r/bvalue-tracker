import { describe, expect, it } from "vitest";
import { INSIGHTS_LOAD, PRELOAD_MEDIA, monitorLoad, preloadTags, swapPreloads } from "../core/page-data.ts";
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
