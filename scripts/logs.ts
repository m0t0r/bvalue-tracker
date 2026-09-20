/**
 * Read this Worker's logs from the terminal.
 *
 * `wrangler tail` shows what is happening *now*; this shows what happened. That is the
 * difference that mattered on 2026-09-20, when the question — why were 112 invocations
 * killed between 02:50 and 12:05 UTC? — could only be answered from logs that were already
 * expiring, through a dashboard, by hand. Workers Logs keeps 3 days on the free plan, so
 * the window to ask is short and the asking should be cheap.
 *
 * It talks to the Workers Observability telemetry query API, which is the same thing the
 * dashboard's Query Builder calls.
 *
 * Credentials, in order:
 *   1. CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID from the environment (what CI uses).
 *   2. The OAuth token `wrangler login` already stored on this machine, with the account
 *      id from wrangler.jsonc. The script says which one it used.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const WORKER = "choco";
const API = "https://api.cloudflare.com/client/v4";

const USAGE = `usage: pnpm logs [events|cpu|lanes] [options]

  events   (default) the log lines themselves, oldest first
  cpu      p50/p90/p99/max CPU time per invocation — the free plan's 10 ms limit
  lanes    how many ingest runs each lane made, and how many failed

options:
  --since 90m|6h|3d   how far back to look (default 1h)
  --limit N           lines to return, max 2000 (default 100)
  --level LEVEL       only lines at this level: debug, info, warn, error
  --msg TEXT          only lines whose msg contains TEXT
  --json              print the raw API response and nothing else
`;

/** "90m", "6h", "3d" — the shapes anyone types when something has gone wrong. */
function sinceMs(v: string): number {
  const m = /^(\d+)(m|h|d)$/.exec(v.trim());
  if (!m) throw new Error(`--since wants something like 90m, 6h or 3d, not ${JSON.stringify(v)}`);
  return Number(m[1]) * { m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2] as "m" | "h" | "d"];
}

interface Creds { token: string; accountId: string; how: string }

function credentials(): Creds {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (token && accountId) return { token, accountId, how: "CLOUDFLARE_API_TOKEN" };

  // wrangler's own stored login. Same credential wrangler uses, same account, this machine.
  const config = join(homedir(), "Library", "Preferences", ".wrangler", "config", "default.toml");
  const oauth = /^oauth_token\s*=\s*"([^"]+)"/m.exec(readFileSync(config, "utf8").toString())?.[1];
  if (oauth === undefined) {
    throw new Error(
      "No credentials. Either set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID (the token needs\n" +
      "Account · Workers Observability · Read), or run `pnpm exec wrangler login`.",
    );
  }
  // The account is pinned in wrangler.jsonc precisely so nothing here has to guess it.
  const pinned = /"account_id"\s*:\s*"([^"]+)"/.exec(readFileSync("wrangler.jsonc", "utf8"))?.[1];
  if (pinned === undefined) throw new Error("no account_id in wrangler.jsonc");
  return { token: oauth, accountId: pinned, how: "your wrangler login" };
}

type Filter = { key: string; operation: string; type: string; value: string | number };

async function query(creds: Creds, body: Record<string, unknown>): Promise<Record<string, any>> {
  const res = await fetch(`${API}/accounts/${creds.accountId}/workers/observability/telemetry/query`, {
    method: "POST",
    headers: { authorization: `Bearer ${creds.token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as Record<string, any>;
  if (!res.ok || json.success === false) {
    const why = (json.errors ?? []).map((e: { message?: string }) => e.message).join("; ") || res.statusText;
    // Verified on 2026-09-20: a `wrangler login` OAuth token is refused here with 403
    // "Authentication error". Its scopes stop at workers_tail:read, which is the live tail,
    // not the stored logs. So say what to do rather than leaving a bare 403.
    const scopes = res.status === 401 || res.status === 403
      ? `\n\n${creds.how} is not allowed to read Workers Logs. Create an API token with` +
        "\n  Account · Workers Observability · Read" +
        "\n(https://dash.cloudflare.com/profile/api-tokens), then:" +
        "\n  export CLOUDFLARE_API_TOKEN=…" +
        `\n  export CLOUDFLARE_ACCOUNT_ID=${creds.accountId}`
      : "";
    throw new Error(`telemetry query failed (HTTP ${res.status}): ${why}${scopes}`);
  }
  return json.result ?? {};
}

/** Every line is one JSON object (worker/log.ts), so the fields are on the event itself. */
function printEvents(result: Record<string, any>): void {
  const events: Record<string, any>[] = result.events?.events ?? result.events ?? [];
  if (events.length === 0) {
    console.log("no matching lines in that window");
    return;
  }
  // Oldest first: an incident reads forwards.
  for (const e of [...events].reverse()) {
    const f = { ...(e.source ?? e.$workers?.source ?? {}), ...e };
    const when = f.time ?? (e.timestamp ? new Date(e.timestamp).toISOString() : "?");
    const level = String(f.level ?? "?").toUpperCase().padEnd(5);
    const msg = f.msg ?? f.message ?? "";
    // Everything that is not the four we just printed, so nothing is silently hidden.
    const rest = Object.fromEntries(
      Object.entries(f).filter(([k, v]) =>
        !["time", "level", "msg", "message", "timestamp", "source", "$workers", "$metadata", "$cloudflare"].includes(k) &&
        v !== null && v !== undefined),
    );
    console.log(`${when}  ${level} ${msg}  ${Object.keys(rest).length ? JSON.stringify(rest) : ""}`.trimEnd());
  }
}

function printCalculations(result: Record<string, any>): void {
  const calcs: Record<string, any>[] = result.calculations ?? [];
  if (calcs.length === 0) {
    console.log("nothing in that window");
    return;
  }
  for (const c of calcs) {
    console.log(`\n${c.alias ?? c.name ?? "calculation"}`);
    for (const row of c.aggregates ?? c.data ?? []) {
      const group = (row.groups ?? []).map((g: { value: unknown }) => String(g.value)).join(" / ") || "all";
      console.log(`  ${group.padEnd(28)} ${row.value ?? row.count ?? ""}`);
    }
  }
}

async function main(argv: string[]): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) { console.log(USAGE); return; }

  const mode = argv[0] && !argv[0].startsWith("--") ? argv[0] : "events";
  if (!["events", "cpu", "lanes"].includes(mode)) { console.error(USAGE); process.exit(2); }
  const flag = (name: string) => {
    const at = argv.indexOf(`--${name}`);
    return at === -1 ? undefined : argv[at + 1];
  };

  const creds = credentials();
  const to = Date.now();
  const from = to - sinceMs(flag("since") ?? "1h");
  const limit = Math.min(Number(flag("limit") ?? 100), 2000);

  // Every query is scoped to this Worker: the account has others, and a question about
  // this one must never be answered with another one's lines.
  const filters: Filter[] = [{ key: "$metadata.service", operation: "eq", type: "string", value: WORKER }];
  const level = flag("level");
  if (level !== undefined) filters.push({ key: "level", operation: "eq", type: "string", value: level });
  const msg = flag("msg");
  if (msg !== undefined) filters.push({ key: "msg", operation: "includes", type: "string", value: msg });

  const body: Record<string, unknown> =
    mode === "cpu"
      ? {
          queryId: "sgc-cpu",
          timeframe: { from, to },
          // The README's standing open item: the free plan allows 10 ms of CPU per
          // invocation and this has never been measured. The runtime is the only thing
          // that can see it, and it publishes it on the invocation log.
          parameters: {
            filters,
            calculations: (["p50", "p90", "p99", "max"] as const).map((op) => ({
              operator: op, key: "$workers.cpuTimeMs", keyType: "number", alias: `cpuMs ${op}`,
            })),
            groupBys: [{ value: "$metadata.trigger", type: "string" }],
          },
          view: "calculations",
          limit,
        }
      : mode === "lanes"
        ? {
            queryId: "sgc-lanes",
            timeframe: { from, to },
            // Four fast ticks for every wide one, and a sweep on the hour. Anything else —
            // all fast, or no sweeps at all — is the 2026-09-20 tickMinute fault.
            parameters: {
              filters: [...filters, { key: "lane", operation: "exists", type: "string", value: "" }],
              calculations: [{ operator: "count", alias: "runs" }],
              groupBys: [{ value: "lane", type: "string" }, { value: "msg", type: "string" }],
            },
            view: "calculations",
            limit,
          }
        : { queryId: "sgc-events", timeframe: { from, to }, parameters: { filters }, view: "events", limit };

  const result = await query(creds, body);
  if (argv.includes("--json")) { console.log(JSON.stringify(result, null, 2)); return; }

  console.error(`# ${WORKER}, ${new Date(from).toISOString()} .. ${new Date(to).toISOString()} (via ${creds.how})`);
  if (mode === "events") printEvents(result);
  else printCalculations(result);
}

try {
  await main(process.argv.slice(2));
} catch (err) {
  console.error(`error: ${(err as Error).message}`);
  process.exit(1);
}
