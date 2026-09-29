/**
 * The requests `pnpm logs` sends to the Workers Observability telemetry query API, apart from the
 * sending, so a test can hold them to what the API accepts. Both faults this has had answered with
 * no hint of the cause: `p50` got a bare HTTP 400, and the missing group limit silently dropped the
 * cron from `pnpm logs cpu`.
 */

export const WORKER = "bvalue-tracker";

export const MODES = ["events", "cpu", "lanes"] as const;
export type Mode = (typeof MODES)[number];
export const isMode = (v: string): v is Mode => (MODES as readonly string[]).includes(v);

/**
 * The operators the API accepts for a calculation, as docs/ingest.md lists them. `p50` is not one:
 * the API refuses it with a bare 400 (verified 2026-09-29), and `median` is its name.
 */
export const OPERATORS = ["count", "median", "p90", "p95", "p99", "avg", "min", "max", "sum", "stddev"] as const;
type Operator = (typeof OPERATORS)[number];

/**
 * How many groups a calculation returns. The API's default is 10 and it drops the rest without a
 * word: over 3 days `pnpm logs cpu` has 13 triggers, and on 2026-09-29 the cron and
 * `GET /api/events` were among the ones left out. The top-level `limit` does not reach this; it
 * counts the lines of the events view. Every route anyone requests is a trigger, so a scan of
 * made-up paths could fill even 100: `pnpm logs` says so when a calculation comes back full.
 */
export const GROUPS = 100;

export type Filter = { key: string; operation: string; type: string; value: string | number };
export type Calculation = { operator: Operator; alias: string; key?: string; keyType?: string };

export interface QueryBody {
  queryId: string;
  timeframe: { from: number; to: number };
  parameters: {
    filters: Filter[];
    calculations?: Calculation[];
    groupBys?: { value: string; type: string }[];
    limit?: number;
  };
  view: "events" | "calculations";
  limit: number;
}

/** `--limit`: how many lines the events view returns, 1 to 2000. It has no say over the groups. */
export function parseLimit(v: string | undefined): number {
  if (v === undefined) return 100;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new Error(`--limit wants a whole number from 1, not ${JSON.stringify(v)}`);
  return Math.min(n, 2000);
}

/** "90m", "6h", "3d" — the shapes anyone types when something has gone wrong. */
export function sinceMs(v: string): number {
  const m = /^(\d+)(m|h|d)$/.exec(v.trim());
  if (!m) throw new Error(`--since wants something like 90m, 6h or 3d, not ${JSON.stringify(v)}`);
  return Number(m[1]) * { m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2] as "m" | "h" | "d"];
}

export function queryBody(
  mode: Mode,
  o: { from: number; to: number; limit: number; level?: string; msg?: string },
): QueryBody {
  const timeframe = { from: o.from, to: o.to };
  // Every query is scoped to this Worker: the account has others, and a question about
  // this one must never be answered with another one's lines.
  const filters: Filter[] = [{ key: "$metadata.service", operation: "eq", type: "string", value: WORKER }];
  if (o.level !== undefined) filters.push({ key: "level", operation: "eq", type: "string", value: o.level });
  // `msg` is on the Worker's own lines and never on an invocation log, which is where the CPU is.
  if (o.msg !== undefined && mode === "cpu")
    throw new Error("--msg filters log lines; cpu reads invocation logs, which have none");
  if (o.msg !== undefined) filters.push({ key: "msg", operation: "includes", type: "string", value: o.msg });

  if (mode === "cpu")
    return {
      queryId: "sgc-cpu",
      timeframe,
      // The free plan allows 10 ms of CPU per invocation (docs/ingest.md, "The CPU budget"). The
      // runtime is the only thing that can see it, and it publishes it on the invocation log.
      //
      // Grouped by trigger, which is the route for a request ("GET /api/events") and the cron
      // pattern for a tick ("*/15 * * * *"). **Not** by lane, which is not obtainable here
      // however the query is written: cpuTimeMs lives on the invocation log, `lane` lives on
      // the lines the Worker itself writes, and all three lanes hang off the one */15 cron, so
      // they share a trigger. To separate them, take the lanes' ticks from `pnpm logs lanes`
      // and compare their invocations' CPU against the rest by timestamp.
      parameters: {
        filters,
        calculations: [
          { operator: "count", alias: "invocations" },
          ...(["median", "p90", "p99", "max"] as const).map((op) => ({
            operator: op,
            key: "$workers.cpuTimeMs",
            keyType: "number",
            alias: `${op} ms`,
          })),
        ],
        groupBys: [{ value: "$metadata.trigger", type: "string" }],
        limit: GROUPS,
      },
      view: "calculations",
      limit: o.limit,
    };

  if (mode === "lanes")
    return {
      queryId: "sgc-lanes",
      timeframe,
      // At */15 (worker/plan.ts), a wide run for each zone on :00 and :30, a sweep for each on
      // the hour, and a fast run on :15 and :45 for Tolima only: 96 wide, 48 sweep and 48 fast a
      // day, which is what 2026-09-29 read. All fast and no sweep is the 2026-09-20 tickMinute
      // fault.
      parameters: {
        filters: [...filters, { key: "lane", operation: "exists", type: "string", value: "" }],
        calculations: [{ operator: "count", alias: "runs" }],
        groupBys: [
          { value: "lane", type: "string" },
          { value: "msg", type: "string" },
        ],
        limit: GROUPS,
      },
      view: "calculations",
      limit: o.limit,
    };

  return { queryId: "sgc-events", timeframe, parameters: { filters }, view: "events", limit: o.limit };
}

/**
 * One calculation as the API answers it; only the fields read here. `calculation` is the operator
 * (`"count"`, `"median"`), and a group's `count` is how many events it holds, not the calculation's
 * value — so only a `count` column may fall back to it.
 */
export interface CalculationResult {
  alias?: string;
  calculation?: string;
  aggregates?: { groups?: { value: unknown }[]; value?: number | null; count?: number }[];
}

/**
 * The calculations as one table: a row per group, a column per calculation, busiest group first
 * (by the count column, whichever it is). The API answers one list per calculation, each in its
 * own order, and printed that way `cpu` read as five lists of the same thirteen names.
 */
export function calculationTable(calcs: CalculationResult[]): string[] {
  const columns = calcs.map((c, i) => c.alias ?? c.calculation ?? `calculation ${i + 1}`);
  // Keyed on the group's values, not on how they print, so two groups can never share a row.
  const rows = new Map<string, { label: string; values: (number | undefined)[] }>();
  calcs.forEach((c, i) => {
    for (const a of c.aggregates ?? []) {
      const groups = (a.groups ?? []).map((g) => String(g.value));
      const key = JSON.stringify(groups);
      const row = rows.get(key) ?? { label: groups.join(" / ") || "all", values: columns.map(() => undefined) };
      row.values[i] = a.value ?? (c.calculation === "count" ? a.count : undefined);
      rows.set(key, row);
    }
  });
  // Two decimals at most: a p99 of 9.96 ms and one of 10.04 ms sit either side of the 10 ms limit.
  const cell = (v: number | undefined) => (v === undefined ? "–" : String(Math.round(v * 100) / 100));
  const busiest = Math.max(
    0,
    calcs.findIndex((c) => c.calculation === "count"),
  );
  const body = [...rows.values()]
    .sort(
      (a, b) =>
        (b.values[busiest] ?? -1) - (a.values[busiest] ?? -1) || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0),
    )
    .map(({ label, values }) => [label, ...values.map(cell)]);
  const header = ["", ...columns];
  const table = [header, ...body];
  const widths = header.map((_, i) => Math.max(...table.map((r) => (r[i] ?? "").length)));
  const lines = table.map((r) =>
    widths
      .map((w, i) => (i === 0 ? (r[i] ?? "").padEnd(w) : (r[i] ?? "").padStart(w)))
      .join("  ")
      .trimEnd(),
  );
  // The API cuts a calculation at the group limit without saying so; the cron can be the row it cuts,
  // and a row it cut from one column but not another shows "–" there.
  const full = columns.filter((_, i) => (calcs[i]?.aggregates?.length ?? 0) >= GROUPS);
  if (full.length > 0)
    lines.push(`(${full.join(", ")}: ${GROUPS} groups, the most asked for; some may be missing, so narrow --since)`);
  return lines;
}
