import { createExecutionContext, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker, { movedPage } from "../index.ts";
import handler, { redirectTo } from "../redirect/index";

const OLD = "https://choco.sgc-swarm.workers.dev";
const TARGET = "https://bvalue.site";

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

describe("the app's old workers.dev name", () => {
  const OLD_APP = `https://${env.WORKERS_DEV_HOST}`;
  const call = (url: string, init?: RequestInit) => worker.fetch(new Request(url, init), env, createExecutionContext());

  it("sends every page to the same path and query on the domain", async () => {
    for (const path of ["/", "/choco?mc=2.1", "/insights?tab=3d"]) {
      const res = await call(`${OLD_APP}${path}`);
      expect(res.status, path).toBe(301);
      expect(res.headers.get("location")).toBe(`${env.CANONICAL_ORIGIN}${path}`);
    }
  });

  it("keeps answering the API, so a tab left open there still refreshes", async () => {
    const res = await call(`${OLD_APP}/api/health`);
    expect(res.status).toBe(200);
  });

  it("leaves the domain and preview URLs where they are", async () => {
    for (const host of ["https://bvalue.site", `https://0123abcd-${env.WORKERS_DEV_HOST}`]) {
      const res = await call(`${host}/no-such-file`);
      expect(res.status, host).toBe(404);
    }
  });

  it("never sends a page to itself, for a copy whose domain is its workers.dev name", () => {
    const own = { CANONICAL_ORIGIN: OLD_APP, WORKERS_DEV_HOST: env.WORKERS_DEV_HOST };
    expect(movedPage(new Request(`${OLD_APP}/choco`), own)).toBeNull();
  });
});
