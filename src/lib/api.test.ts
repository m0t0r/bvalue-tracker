import { describe, expect, it } from "vitest";
import { HttpError, shouldRetry } from "@/lib/api";

describe("which failed requests are retried", () => {
  it.each([400, 403, 429])("gives up at once on a %i, which a retry cannot change", (status) => {
    expect(shouldRetry(0, new HttpError("/api/events", status))).toBe(false);
  });

  it("retries a 5xx or a network failure up to three times", () => {
    for (const err of [new HttpError("/api/events", 503), new TypeError("Failed to fetch")]) {
      expect([0, 1, 2, 3].map((n) => shouldRetry(n, err))).toEqual([true, true, true, false]);
    }
  });

  it("reads as the plain error it replaced, since the load error shows it verbatim", () => {
    expect(String(new HttpError("/api/events?zone=choco", 403))).toBe("Error: /api/events?zone=choco: HTTP 403");
  });
});
