import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HOME_ZONE, SHARE_META, ZONE_PATHS, withZoneMeta, zonePageFile, zonePath } from "../core/zone-pages.ts";
import { ZONE_IDS } from "../core/zones.ts";
import { CADENCE } from "../worker/plan.ts";

const INDEX = readFileSync(new URL("../index.html", import.meta.url), "utf8");

/** The one tag's content, as a crawler reads it. */
const tag = (html: string, key: string) =>
  key === "title"
    ? /<title>([^<]*)<\/title>/.exec(html)?.[1]
    : new RegExp(`<meta\\s+(?:name|property)="${key}"\\s+content="([^"]*)"`).exec(html)?.[1];

describe("zonePath", () => {
  it("reads the zone from the path", () => {
    expect(zonePath("/")).toBe("tolima");
    expect(zonePath("/choco")).toBe("choco");
    expect(zonePath("/choco/")).toBe("choco");
    expect(zonePath("/index.html")).toBe("tolima");
  });
});

describe("each zone's page", () => {
  it("index.html is the home zone's page as written, so the template and the copy cannot drift", () => {
    expect(withZoneMeta(INDEX, HOME_ZONE)).toBe(INDEX);
  });

  // Moving the focus is three edits in three files — HOME_ZONE, the order of ZONE_IDS and
  // CADENCE — and a swap that made only one of them would open the site on a zone re-read every
  // 30 minutes, second in its own tab bar.
  it("puts the home zone first in the tabs and gives it the fast lane, and no other zone", () => {
    expect(ZONE_IDS[0]).toBe(HOME_ZONE);
    expect(ZONE_IDS.filter((z) => CADENCE[z].fastLane)).toEqual([HOME_ZONE]);
  });

  it.each(ZONE_IDS)("says what %s is in every tag a link preview reads", (zone) => {
    const html = withZoneMeta(INDEX, zone);
    const meta = SHARE_META[zone];
    expect(tag(html, "title")).toBe(meta.title);
    expect(tag(html, "og:title")).toBe(meta.title);
    expect(tag(html, "description")).toBe(meta.description);
    expect(tag(html, "og:description")).toBe(meta.description);
    expect(tag(html, "og:site_name")).toBe(meta.site);
    expect(new URL(tag(html, "og:url")!).pathname).toBe(ZONE_PATHS[zone]);
  });

  // The bug this exists for: a link previewed as the other zone.
  it("leaves no Chaparral copy on the Chocó page", () => {
    const html = withZoneMeta(INDEX, "choco");
    for (const key of ["title", "description", "og:site_name", "og:title", "og:description"]) {
      expect(tag(html, key)).not.toMatch(/Chaparral|Tolima/);
    }
  });

  it("keeps the production host from index.html", () => {
    expect(new URL(tag(withZoneMeta(INDEX, "choco"), "og:url")!).origin).toBe(new URL(tag(INDEX, "og:url")!).origin);
  });

  it("refuses a template that has lost a tag, rather than shipping it half-rewritten", () => {
    expect(() => withZoneMeta(INDEX.replace(/<meta\s+property="og:title"[^>]*>/, ""), "choco")).toThrow(/og:title/);
  });

  it("escapes the copy it writes into attributes", () => {
    expect(withZoneMeta(INDEX, "choco")).not.toMatch(/content="[^"]*<[^"]*"/);
  });

  it("names a file the asset layer serves at the zone's path", () => {
    expect(zonePageFile("tolima")).toBe("index.html");
    expect(zonePageFile("choco")).toBe("choco.html");
  });
});
