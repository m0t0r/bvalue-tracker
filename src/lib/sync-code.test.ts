import { describe, expect, it } from "vitest";
import { HttpError } from "./api";
import { refusalOf } from "./sync-code";

const refused = (status: number, body: unknown) => new HttpError("/api/refresh?zone=tolima", status, body);

describe("a press the sync code turned away", () => {
  it("is a wrong code, with the attempts left", () => {
    expect(refusalOf(refused(403, { error: "wrong sync code", attemptsLeft: 2 }))).toEqual({
      kind: "wrong",
      attemptsLeft: 2,
    });
  });

  it("is a lock, with the wait in whole minutes, rounded up", () => {
    expect(refusalOf(refused(429, { error: "too many wrong sync codes", retryAfterS: 900 }))).toEqual({
      kind: "locked",
      minutes: 15,
    });
    expect(refusalOf(refused(429, { error: "too many wrong sync codes", retryAfterS: 61 }))).toEqual({
      kind: "locked",
      minutes: 2,
    });
  });

  it("is no code set yet", () => {
    expect(refusalOf(refused(503, { error: "sync code not set" }))).toEqual({ kind: "unset" });
  });

  it("is a changed code, when the page held the one from before the owner's last change", () => {
    expect(refusalOf(refused(401, { error: "sync code changed" }))).toEqual({ kind: "changed" });
  });

  it("is a code to ask for again, when none went or it was not four digits", () => {
    expect(refusalOf(refused(401, { error: "sync code required" }))).toEqual({ kind: "ask" });
    expect(refusalOf(refused(400, { error: "sync code must be 4 digits" }))).toEqual({ kind: "ask" });
  });
});

/**
 * The rest are presses that failed, which rest the button (`refresh-backoff.ts`): the guard's refusals
 * must not, and these must not be mistaken for them.
 */
describe("a press that failed for any other reason", () => {
  it.each([
    ["the rate limit's 429", refused(429, { error: "rate limited" })],
    ["a 503 from Cloudflare, with no JSON", refused(503, null)],
    ["a 400 for a bad zone", refused(400, { error: "zone must be one of choco, tolima" })],
    ["the same-origin check's 403", refused(403, { error: "forbidden" })],
    ["a 500", refused(500, { error: "internal error" })],
    ["a network failure", new TypeError("Failed to fetch")],
  ])("is not a refusal: %s", (_, err) => {
    expect(refusalOf(err)).toBeNull();
  });
});
