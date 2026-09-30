import { describe, expect, it } from "vitest";
import { INSIGHTS_LOAD, monitorLoad } from "../core/page-data";
import { ZONE_IDS } from "../core/zones";
import { apiAnswer, cacheControl, CAPTURED, contentType, staticFile } from "../scripts/fixture-routes";

/**
 * `scripts/fixture-server.ts` serves a build with no Worker behind it, for render profiles
 * (docs/development.md, "Profiling React renders"). These hold what it answers; nothing here opens
 * a socket or reads a file.
 */
const status = (zone: string) => ({ totalEvents: zone.length, backfill: { done: 3, total: 3 } });
const fixtures = {
  "/api/events?zone=tolima": [{ id: "SGC1" }],
  "/api/status?zone=tolima": status("tolima"),
  "/api/status?zone=choco": status("choco"),
  "/api/sea": null,
};

describe("CAPTURED", () => {
  it("lists every request either page makes on load, and the 3D tab's", () => {
    for (const path of [...INSIGHTS_LOAD, ...ZONE_IDS.flatMap(monitorLoad), "/api/sea"]) {
      expect(CAPTURED).toContain(path);
    }
    expect(new Set(CAPTURED).size).toBe(CAPTURED.length);
    // Only what a GET can answer from the database: the one route that reaches SGC is a POST.
    expect(CAPTURED.filter((p) => p.includes("refresh"))).toEqual([]);
  });
});

describe("apiAnswer", () => {
  it("answers a captured GET with its body, matched by path and query", () => {
    expect(apiAnswer("GET", "/api/events?zone=tolima", fixtures)).toEqual({ status: 200, body: [{ id: "SGC1" }] });
    expect(apiAnswer("GET", "/api/sea", fixtures)).toEqual({ status: 200, body: null });
  });

  it("says which request has no fixture, rather than answering something else", () => {
    const answer = apiAnswer("GET", "/api/events?zone=choco", fixtures);
    expect(answer.status).toBe(404);
    expect(JSON.stringify(answer.body)).toContain("GET /api/events?zone=choco");
    expect(apiAnswer("GET", "/api/events", fixtures).status).toBe(404);
    expect(apiAnswer("DELETE", "/api/sea", fixtures).status).toBe(404);
  });

  it("answers a refresh as the Worker does when it stands down: the zone's status, SGC not queried", () => {
    const answer = apiAnswer("POST", "/api/refresh?zone=choco", fixtures);
    expect(answer).toEqual({ status: 200, body: { ...status("choco"), refreshed: false, retryAfterS: 900 } });
    // Longer than the page's back-fill loop will wait (`LONG_WAIT_S` in status-bar.tsx, 60 s), so a
    // capture of an unfinished history does not set the loop going against this server.
    expect((answer.body as { retryAfterS: number }).retryAfterS).toBeGreaterThan(60);
    expect(apiAnswer("POST", "/api/refresh?zone=nowhere", fixtures).status).toBe(404);
  });

  it("takes the page's error reports and answers nothing", () => {
    expect(apiAnswer("POST", "/api/client-error", fixtures)).toEqual({ status: 204, body: null });
  });
});

describe("staticFile", () => {
  const files = new Set(["index.html", "choco.html", "insights.html", "assets/index-abc.js", "speculation-rules.json"]);
  const has = (file: string) => files.has(file);

  it("serves a page at its clean path, as the asset layer does", () => {
    expect(staticFile("/", has)).toBe("index.html");
    expect(staticFile("/choco", has)).toBe("choco.html");
    expect(staticFile("/insights", has)).toBe("insights.html");
    expect(staticFile("/insights/", has)).toBe("insights.html");
  });

  it("serves a file at its own path", () => {
    expect(staticFile("/assets/index-abc.js", has)).toBe("assets/index-abc.js");
    expect(staticFile("/speculation-rules.json", has)).toBe("speculation-rules.json");
  });

  it("has nothing for a path with no file: no page stands in for it", () => {
    expect(staticFile("/tolima", has)).toBeNull();
    expect(staticFile("/assets/missing.js", has)).toBeNull();
  });

  it("never leaves the directory it serves", () => {
    const anything = () => true;
    expect(staticFile("/../package.json", anything)).toBeNull();
    expect(staticFile("/assets/%2e%2e/%2e%2e/package.json", anything)).toBeNull();
    expect(staticFile("/assets\\..\\..\\secret", anything)).toBeNull();
    expect(staticFile("/%00", anything)).toBeNull();
    expect(staticFile("/%E0%A4%A", anything)).toBeNull();
  });
});

describe("the headers a profile depends on", () => {
  it("caches hashed assets for good and nothing else, as production does", () => {
    expect(cacheControl("assets/index-abc.js")).toBe("public, max-age=31536000, immutable");
    expect(cacheControl("index.html")).toBe("no-cache");
  });

  it("names each type the pages load", () => {
    expect(contentType("insights.html")).toBe("text/html; charset=utf-8");
    expect(contentType("assets/index-abc.js")).toBe("text/javascript; charset=utf-8");
    expect(contentType("assets/geist-latin-wght-normal-x.woff2")).toBe("font/woff2");
    // Chrome ignores the rules under any other type (public/_headers).
    expect(contentType("speculation-rules.json")).toBe("application/speculationrules+json");
    // The 3D block's ground is gzip the page unzips itself: a type, never a Content-Encoding.
    expect(contentType("assets/relief-x.bin.gz")).toBe("application/gzip");
    expect(contentType("assets/unknown.xyz")).toBe("application/octet-stream");
  });
});
