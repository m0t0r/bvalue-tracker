import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ZONE_PATHS } from "../core/zone-pages";

/**
 * public/_headers is what every response for the page itself carries; nothing in the
 * build would notice if one went missing. These are the six headers securityheaders.com
 * grades on — the page scored B until Strict-Transport-Security and Permissions-Policy
 * were added — plus the two cross-origin isolation headers we can set without breaking
 * the basemap.
 */
const HEADERS = readFileSync(new URL("../public/_headers", import.meta.url), "utf8");

/** Every page the site serves: one per zone, and the explanations page. Each is its own entry. */
const PAGES = [...Object.values(ZONE_PATHS), "/insights"];

function value(name: string): string {
  const line = HEADERS.split("\n").find((l) => l.trim().toLowerCase().startsWith(`${name.toLowerCase()}:`));
  expect(line, `${name} missing from public/_headers`).toBeDefined();
  return line!.slice(line!.indexOf(":") + 1).trim();
}

describe("public/_headers", () => {
  it("carries every header the page is graded on", () => {
    expect(value("X-Frame-Options")).toBe("DENY");
    expect(value("X-Content-Type-Options")).toBe("nosniff");
    expect(value("Referrer-Policy")).toBe("no-referrer");
    expect(value("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(value("Cross-Origin-Opener-Policy")).toBe("same-origin");
    expect(value("Cross-Origin-Resource-Policy")).toBe("same-origin");
  });

  it("lets the map reach every tile host it names", () => {
    // A host missing here fails silently in production only: `pnpm dev` does not apply
    // _headers, and the map just draws without that layer.
    // Every URL the map fetches from; an attribution's `href` is a link, not a fetch.
    // The component and the style module it draws from (shared with the placeholder's bake).
    const map = ["event-map.tsx", "map-style.ts"]
      .map((f) => readFileSync(new URL(`../src/components/${f}`, import.meta.url), "utf8"))
      .join("\n");
    const hosts = new Set([...map.matchAll(/(?<!href=")https:\/\/([a-z0-9.-]+)/g)].map((m) => m[1]!));
    expect([...hosts].sort()).toEqual(["tiles.mapterhorn.com", "tiles.openfreemap.org"]);
    // MapLibre fetches its style, tiles and sprites, so connect-src is the directive that must allow them.
    const connect = value("Content-Security-Policy")
      .split(";")
      .map((d) => d.trim().split(/\s+/))
      .find(([name]) => name === "connect-src");
    for (const host of hosts) expect(connect, `${host} in connect-src`).toContain(`https://${host}`);
  });

  it("lets every page load the scripts it names from another host, and their reports out", () => {
    // Like the tile hosts: `pnpm dev` ignores _headers, so a blocked beacon shows only in production,
    // as Web Analytics quietly counting nobody.
    const directive = (name: string) =>
      value("Content-Security-Policy")
        .split(";")
        .map((d) => d.trim().split(/\s+/))
        .find(([n]) => n === name);
    for (const page of ["index.html", "insights.html"]) {
      const html = readFileSync(new URL(`../${page}`, import.meta.url), "utf8");
      const hosts = [...html.matchAll(/<script[^>]*\ssrc="https:\/\/([a-z0-9.-]+)\//g)].map((m) => m[1]!);
      expect(hosts, `${page}'s beacon`).toContain("static.cloudflareinsights.com");
      for (const host of hosts) expect(directive("script-src"), `${host} in script-src`).toContain(`https://${host}`);
    }
    expect(directive("connect-src")).toContain("https://cloudflareinsights.com");
  });

  it("promises HSTS for at least a year", () => {
    const hsts = value("Strict-Transport-Security");
    expect(Number(/max-age=(\d+)/.exec(hsts)?.[1])).toBeGreaterThanOrEqual(31_536_000);
    expect(hsts).toContain("includeSubDomains");
  });

  it("lets the content-hashed assets be cached for good", () => {
    // A changed file gets a new name, so revalidating them on every visit buys nothing.
    // index.html is the one file that must not be pinned this way.
    const rule = HEADERS.slice(HEADERS.indexOf("/assets/*"));
    expect(rule, "no /assets/* rule in public/_headers").toContain("/assets/*");
    expect(rule).toMatch(/Cache-Control:\s*public, max-age=31536000, immutable/i);
    expect(HEADERS.slice(0, HEADERS.indexOf("/assets/*"))).not.toMatch(/^\s*Cache-Control:/im);
  });

  it("gives every page the speculation rules, as a file the CSP need not allow", () => {
    // Blocks of a path line and its indented headers, in file order.
    const rules = new Map<string, string[]>();
    let path = "";
    for (const line of HEADERS.split("\n")) {
      if (line.startsWith("/")) rules.set((path = line.trim()), []);
      else if (/^\s+[A-Za-z-]+:/.test(line) && path) rules.get(path)!.push(line.trim());
    }
    // Every page, since each is its own entry and a link between them is a full navigation.
    for (const page of PAGES)
      expect(rules.get(page), `Speculation-Rules on ${page}`).toContain('Speculation-Rules: "/speculation-rules.json"');
    // Chrome ignores a rule set served as anything else.
    expect(rules.get("/speculation-rules.json")).toContain("Content-Type: application/speculationrules+json");
  });

  it("speculates only on the pages, never on the API", () => {
    // A prerender runs the page it loads; /api/refresh is the one request that reaches SGC.
    const file = readFileSync(new URL("../public/speculation-rules.json", import.meta.url), "utf8");
    const set = JSON.parse(file) as Record<string, { where: { href_matches: string[] } }[]>;
    const targets = Object.values(set).flatMap((list) => list.flatMap((r) => r.where.href_matches));
    expect(targets.length).toBeGreaterThan(0);
    for (const t of targets) expect(PAGES).toContain(t);
  });

  it("denies the device permissions the page never asks for", () => {
    const policy = value("Permissions-Policy");
    for (const feature of ["camera", "microphone", "geolocation", "payment", "usb"]) {
      expect(policy).toContain(`${feature}=()`);
    }
    // An allow-list anywhere in here would be a mistake: nothing on the page needs one.
    expect(policy).not.toMatch(/=\((?!\))/);
  });
});
