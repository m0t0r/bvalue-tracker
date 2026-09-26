import { describe, expect, it } from "vitest";
import handler, { redirectTo } from "../redirect/index";

const OLD = "https://choco.sgc-swarm.workers.dev";
const TARGET = "https://bvalue-tracker.sgc-swarm.workers.dev";

describe("the old-name redirect", () => {
  it("keeps the path and query", () => {
    expect(redirectTo(`${OLD}/`, TARGET)).toBe(`${TARGET}/`);
    expect(redirectTo(`${OLD}/choco?mc=2.1`, TARGET)).toBe(`${TARGET}/choco?mc=2.1`);
    expect(redirectTo(`${OLD}/api/events.csv?zone=tolima`, TARGET)).toBe(`${TARGET}/api/events.csv?zone=tolima`);
  });

  it("never leaves the target host, even for a path that reads as protocol-relative", () => {
    expect(new URL(redirectTo(`${OLD}//evil.example/x`, TARGET)).origin).toBe(TARGET);
  });

  it("answers a permanent redirect", () => {
    const res = handler.fetch(new Request(`${OLD}/insights`), { TARGET_ORIGIN: TARGET });
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe(`${TARGET}/insights`);
  });
});
