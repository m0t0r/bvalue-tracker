import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SHARE_META, ZONE_PATHS, withZoneMeta, zonePageFile, zonePath } from "../core/zone-pages.ts";
import { ZONE_IDS } from "../core/zones.ts";

const INDEX = readFileSync(new URL("../index.html", import.meta.url), "utf8");

/** The one tag's content, as a crawler reads it. */
const tag = (html: string, key: string) =>
  key === "title"
    ? /<title>([^<]*)<\/title>/.exec(html)?.[1]
    : new RegExp(`<meta\\s+(?:name|property)="${key}"\\s+content="([^"]*)"`).exec(html)?.[1];

describe("zonePath", () => {
  it("reads the zone from the path", () => {
    expect(zonePath("/")).toBe("choco");
    expect(zonePath("/tolima")).toBe("tolima");
    expect(zonePath("/tolima/")).toBe("tolima");
    expect(zonePath("/index.html")).toBe("choco");
  });
});

describe("each zone's page", () => {
  it("index.html is Chocó's page as written, so the template and the copy cannot drift", () => {
    expect(withZoneMeta(INDEX, "choco")).toBe(INDEX);
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

  // The bug this exists for: a Tolima link previewed as Chocó.
  it("leaves no Chocó copy on the Tolima page", () => {
    const html = withZoneMeta(INDEX, "tolima");
    for (const key of ["title", "description", "og:site_name", "og:title", "og:description"]) {
      expect(tag(html, key)).not.toMatch(/Chocó/);
    }
  });

  it("keeps the production host from index.html", () => {
    expect(new URL(tag(withZoneMeta(INDEX, "tolima"), "og:url")!).origin).toBe(new URL(tag(INDEX, "og:url")!).origin);
  });

  it("refuses a template that has lost a tag, rather than shipping it half-rewritten", () => {
    expect(() => withZoneMeta(INDEX.replace(/<meta\s+property="og:title"[^>]*>/, ""), "tolima")).toThrow(/og:title/);
  });

  it("escapes the copy it writes into attributes", () => {
    expect(withZoneMeta(INDEX, "tolima")).not.toMatch(/content="[^"]*<[^"]*"/);
  });

  it("names a file the asset layer serves at the zone's path", () => {
    expect(zonePageFile("choco")).toBe("index.html");
    expect(zonePageFile("tolima")).toBe("tolima.html");
  });
});
