import { describe, expect, it } from "vitest";
import {
  calculationTable,
  GROUPS,
  MODES,
  OPERATORS,
  parseLimit,
  queryBody,
  sinceMs,
  WORKER,
} from "../scripts/logs-query";

/**
 * `pnpm logs` is how production is read (docs/operations.md), and the API it talks to reports a
 * malformed query with a bare 400 or, worse, a quietly short answer. Both happened to
 * `pnpm logs cpu`: it asked for `p50` and failed on every run, and once that was fixed it left the
 * cron out of its answer because the API returns 10 groups unless told otherwise. Nothing here
 * talks to the API; these hold the requests to what it was seen to accept.
 */
const at = { from: 1_000, to: 2_000, limit: 100 };

describe("pnpm logs query bodies", () => {
  it("asks only for operators the API accepts, so cpu's median is not p50", () => {
    const cpu = queryBody("cpu", at);
    const operators = cpu.parameters.calculations!.map((c) => c.operator);
    expect(operators).toContain("median");
    expect(operators).not.toContain("p50");
    for (const mode of MODES)
      for (const c of queryBody(mode, at).parameters.calculations ?? [])
        expect(OPERATORS, `${mode}: ${c.operator}`).toContain(c.operator);
  });

  it("reads CPU per trigger, from the runtime's own figure", () => {
    const cpu = queryBody("cpu", at);
    expect(cpu.view).toBe("calculations");
    expect(cpu.parameters.groupBys).toEqual([{ value: "$metadata.trigger", type: "string" }]);
    for (const c of cpu.parameters.calculations!.filter((c) => c.operator !== "count"))
      expect(c).toMatchObject({ key: "$workers.cpuTimeMs", keyType: "number" });
  });

  it("asks for more groups than the API's default of 10 on every calculation", () => {
    // 13 triggers over 3 days on 2026-09-29; the lanes query groups lane × message, which grows too.
    expect(GROUPS).toBeGreaterThan(13);
    for (const mode of ["cpu", "lanes"] as const) expect(queryBody(mode, at).parameters.limit).toBe(GROUPS);
  });

  it("scopes every query to this Worker, whatever else it filters on", () => {
    const service = { key: "$metadata.service", operation: "eq", type: "string", value: WORKER };
    const level = { key: "level", operation: "eq", type: "string", value: "error" };
    const msg = { key: "msg", operation: "includes", type: "string", value: "ingest failed" };
    for (const mode of ["events", "lanes"] as const) {
      const { filters } = queryBody(mode, { ...at, level: "error", msg: "ingest failed" }).parameters;
      expect(filters[0]).toEqual(service);
      expect(filters).toContainEqual(level);
      expect(filters).toContainEqual(msg);
    }
    const { filters } = queryBody("cpu", { ...at, level: "error" }).parameters;
    expect(filters).toEqual([service, level]);
  });

  it("refuses --msg for cpu, which would only ever answer nothing", () => {
    // `msg` is on the Worker's own lines; cpuTimeMs is on the invocation log, which has no `msg`.
    expect(() => queryBody("cpu", { ...at, msg: "ingest" })).toThrow(/--msg/);
  });

  it("passes the timeframe and the line limit through", () => {
    for (const mode of MODES) {
      const body = queryBody(mode, at);
      expect(body.timeframe).toEqual({ from: 1_000, to: 2_000 });
      expect(body.limit).toBe(100);
    }
  });
});

describe("calculationTable", () => {
  // The shape the API answers, trimmed to what is read: each calculation lists its groups in its own order.
  const agg = (value: number, ...groups: string[]) => ({ groups: groups.map((g) => ({ value: g })), value });
  const cpu = [
    {
      alias: "invocations",
      calculation: "count",
      aggregates: [agg(4, "GET /api/health"), agg(5, "*/15 * * * *"), agg(10, "GET /api/events")],
    },
    {
      alias: "median ms",
      calculation: "median",
      // No CPU figure for the health route: `count` is its events, and must not show as a median.
      aggregates: [
        agg(85, "*/15 * * * *"),
        agg(9.96, "GET /api/events"),
        { ...agg(0, "GET /api/health"), value: null, count: 4 },
      ],
    },
  ];

  it("puts every calculation on one row per group, busiest first", () => {
    expect(calculationTable(cpu)).toEqual([
      "                 invocations  median ms",
      "GET /api/events           10       9.96",
      "*/15 * * * *               5         85",
      "GET /api/health            4          –",
    ]);
  });

  it("joins a multi-key group, keeps groups that print alike apart, and breaks ties by name", () => {
    const lanes = [
      {
        alias: "runs",
        calculation: "count",
        aggregates: [
          agg(2, "wide", "ingest ok"),
          agg(2, "fast", "ingest ok"),
          agg(1, "a / b", "c"),
          agg(1, "a", "b / c"),
        ],
      },
    ];
    expect(calculationTable(lanes)).toEqual([
      "                  runs",
      "fast / ingest ok     2",
      "wide / ingest ok     2",
      "a / b / c            1",
      "a / b / c            1",
    ]);
  });

  it("sorts by the count column wherever it is", () => {
    const [invocations, median] = cpu;
    expect(calculationTable([median!, invocations!])[1]).toMatch(/^GET \/api\/events/);
  });

  it("says so when a calculation comes back full, since the API drops the rest silently", () => {
    const full = [
      {
        alias: "runs",
        calculation: "count",
        aggregates: Array.from({ length: GROUPS }, (_, i) => agg(1, `GET /${i}`)),
      },
    ];
    expect(calculationTable(full).at(-1)).toMatch(/^\(runs: .*some may be missing/);
    expect(calculationTable(cpu).join("\n")).not.toMatch(/some may be missing/);
  });
});

describe("parseLimit", () => {
  it("defaults to 100 and caps at 2000", () => {
    expect(parseLimit(undefined)).toBe(100);
    expect(parseLimit("5")).toBe(5);
    expect(parseLimit("5000")).toBe(2000);
  });

  it("refuses what the API would turn into a bare 400", () => {
    // Number("x") is NaN, which JSON.stringify sends as null.
    for (const v of ["x", "", "0", "-3", "2.5"]) expect(() => parseLimit(v)).toThrow(/--limit wants/);
  });
});

describe("sinceMs", () => {
  it("reads minutes, hours and days", () => {
    expect(sinceMs("90m")).toBe(90 * 60_000);
    expect(sinceMs("6h")).toBe(6 * 3_600_000);
    expect(sinceMs(" 3d ")).toBe(3 * 86_400_000);
  });

  it("refuses anything else rather than guessing", () => {
    for (const v of ["", "3", "3w", "1.5h", "h"]) expect(() => sinceMs(v)).toThrow(/--since wants/);
  });
});
