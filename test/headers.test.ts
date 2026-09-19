import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * public/_headers is what every response for the page itself carries; nothing in the
 * build would notice if one went missing. These are the six headers securityheaders.com
 * grades on — the page scored B until Strict-Transport-Security and Permissions-Policy
 * were added — plus the two cross-origin isolation headers we can set without breaking
 * the basemap.
 */
const HEADERS = readFileSync(new URL("../public/_headers", import.meta.url), "utf8");

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

  it("promises HSTS for at least a year", () => {
    const hsts = value("Strict-Transport-Security");
    expect(Number(/max-age=(\d+)/.exec(hsts)?.[1])).toBeGreaterThanOrEqual(31_536_000);
    expect(hsts).toContain("includeSubDomains");
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
