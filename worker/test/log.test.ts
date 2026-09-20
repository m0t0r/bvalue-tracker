import { afterEach, describe, expect, it, vi } from "vitest";
import { asLevel, errorFields, logger, silentLogger } from "../log.ts";

/**
 * These assert the *shape* of a line, not its wording, because the shape is the contract
 * with Workers Logs: it indexes the fields of a single object argument and nothing else.
 * A line that arrives as two arguments, or as a string, is a line you can only grep.
 */
type Call = { method: string; args: unknown[] };

function capture(): { calls: Call[]; only: () => Record<string, unknown> } {
  const calls: Call[] = [];
  for (const m of ["debug", "info", "warn", "error"] as const) {
    vi.spyOn(console, m).mockImplementation((...args: unknown[]) => void calls.push({ method: m, args }));
  }
  return {
    calls,
    only: () => {
      expect(calls).toHaveLength(1);
      expect(calls[0]!.args, "a log line must be ONE object argument").toHaveLength(1);
      return calls[0]!.args[0] as Record<string, unknown>;
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe("logger", () => {
  it("writes one object, with the level, an ISO time and the message", () => {
    const c = capture();
    logger().info({ runId: 7 }, "ingest ok");
    const line = c.only();
    expect(line).toMatchObject({ level: "info", msg: "ingest ok", runId: 7 });
    expect(line.time).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
  });

  it("uses the console method that matches the level, so both filters agree", () => {
    const c = capture();
    const log = logger({}, "debug");
    log.debug({}, "d");
    log.warn({}, "w");
    log.error({}, "e");
    expect(c.calls.map((x) => x.method)).toEqual(["debug", "warn", "error"]);
    expect(c.calls.map((x) => (x.args[0] as { level: string }).level)).toEqual(["debug", "warn", "error"]);
  });

  it("carries a child's bindings on every line, and lets the line override them", () => {
    const c = capture();
    logger({ lane: "fast" }).child({ runId: 3 }).info({ lane: "sweep" }, "x");
    expect(c.only()).toMatchObject({ lane: "sweep", runId: 3 });
  });

  // JSON.stringify(new Error()) is "{}", so an un-flattened error is a log line that says
  // nothing at exactly the moment it matters. The gate is here, not at the call site.
  it("flattens an Error anywhere in the fields", () => {
    const c = capture();
    logger().error({ err: new TypeError("boom") }, "failed");
    expect(c.only().err).toMatchObject({ name: "TypeError", message: "boom" });
    expect((c.only().err as { stack: string }).stack).toContain("TypeError");
  });

  // core/seiscomp.ts puts the HTTP status behind "failed after N attempts" as the cause,
  // which is the field that says whether SGC refused us or the connection died.
  it("keeps one level of cause", () => {
    const c = capture();
    logger().error({ err: new Error("outer", { cause: new Error("SGC responded HTTP 410") }) }, "failed");
    expect((c.only().err as { cause: string }).cause).toContain("410");
  });

  // An SGC response is ~0.8 MB of HTML and an error can quote it; Workers Logs truncates a
  // line over 256 KB, and a truncated line is one you cannot query.
  it("cuts a long string rather than letting it reach the log", () => {
    const c = capture();
    logger().warn({ html: "x".repeat(50_000) }, "big");
    expect((c.only().html as string).length).toBeLessThan(1100);
  });

  it("drops what is below the minimum level", () => {
    const c = capture();
    const log = logger({}, "warn");
    log.debug({}, "no");
    log.info({}, "no");
    log.warn({}, "yes");
    expect(c.calls).toHaveLength(1);
  });

  it("treats an unknown LOG_LEVEL as info, never as silence", () => {
    expect(asLevel("nonsense")).toBe("info");
    expect(asLevel(undefined)).toBe("info");
    expect(asLevel("debug")).toBe("debug");
  });

  it("stays silent when asked to", () => {
    const c = capture();
    silentLogger.child({ a: 1 }).error({}, "nothing");
    expect(c.calls).toHaveLength(0);
  });

  it("describes a thrown non-Error too", () => {
    expect(errorFields("just a string")).toEqual({ message: "just a string" });
  });
});
