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
import {
  calculationTable,
  type CalculationResult,
  isMode,
  parseLimit,
  queryBody,
  type QueryBody,
  sinceMs,
  WORKER,
} from "./logs-query";

const API = "https://api.cloudflare.com/client/v4";

const USAGE = `usage: pnpm logs [events|cpu|lanes] [options]

  events   (default) the log lines themselves, oldest first
  cpu      median/p90/p99/max CPU time per invocation, by route and cron — the free plan's 10 ms limit
  lanes    how many ingest runs each lane made, and how many failed

options:
  --since 90m|6h|3d   how far back to look (default 1h)
  --limit N           lines to return in the events view, max 2000 (default 100)
  --level LEVEL       only lines at this level: debug, info, warn, error
  --msg TEXT          only lines whose msg contains TEXT (not with cpu)
  --json              print the raw API response and nothing else
`;

interface Creds {
  token: string;
  accountId: string;
  how: string;
}

/**
 * The OAuth token `wrangler login` stored on this machine. Two places, because wrangler puts
 * it under Library/Preferences on macOS and under XDG_CONFIG_HOME (or ~/.config) elsewhere.
 * A missing file is the ordinary case for anyone who has never logged in, so it returns
 * undefined rather than throwing ENOENT over the top of the message that explains what to do.
 */
function wranglerOauthToken(): string | undefined {
  const configs = [
    join(homedir(), "Library", "Preferences", ".wrangler", "config", "default.toml"),
    join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), ".wrangler", "config", "default.toml"),
  ];
  for (const path of configs) {
    try {
      const found = /^oauth_token\s*=\s*"([^"]+)"/m.exec(readFileSync(path, "utf8"))?.[1];
      if (found !== undefined) return found;
    } catch {
      continue; // no such file on this platform, or not readable
    }
  }
  return undefined;
}

/**
 * `.env` at the checkout root, if there is one. Node's own loader, so nothing is added to
 * the dependency tree, and it does **not** override a variable already exported — so
 * `CLOUDFLARE_API_TOKEN=… pnpm logs` still beats the file, which is the precedence anyone
 * would expect. A missing file is the ordinary case and not an error.
 *
 * `.env` is gitignored. **Never give a secret here a `VITE_` prefix**: Vite reads this same
 * file and inlines every `VITE_`-prefixed value into the client bundle, which is published
 * as a static asset. A token named `CLOUDFLARE_API_TOKEN` is invisible to the page; the same
 * token named `VITE_CLOUDFLARE_API_TOKEN` would be served to every visitor.
 */
function loadDotEnv(): void {
  try {
    process.loadEnvFile();
  } catch {
    // No .env in this directory, which is how most checkouts run.
  }
}

/**
 * The account and the token are resolved **independently**, which is the whole point: they
 * used to be one `token && accountId` check, so setting only CLOUDFLARE_API_TOKEN fell
 * silently through to the wrangler login — which this endpoint refuses. You would set a
 * freshly minted token, still get 403, and conclude the token was wrong.
 *
 * The account id is pinned in wrangler.jsonc precisely so nothing here has to guess it, and
 * CLOUDFLARE_ACCOUNT_ID is only needed to point somewhere else.
 */
function credentials(): Creds {
  loadDotEnv();
  const accountId =
    process.env.CLOUDFLARE_ACCOUNT_ID ??
    /"account_id"\s*:\s*"([^"]+)"/.exec(readFileSync("wrangler.jsonc", "utf8"))?.[1];
  if (accountId === undefined) {
    throw new Error(
      "No account: set CLOUDFLARE_ACCOUNT_ID, or run this from a checkout with account_id in wrangler.jsonc.",
    );
  }

  const fromEnv = process.env.CLOUDFLARE_API_TOKEN;
  if (fromEnv) return { token: fromEnv, accountId, how: "CLOUDFLARE_API_TOKEN" };

  const oauth = wranglerOauthToken();
  if (oauth === undefined) {
    throw new Error(
      "No credentials. Either set CLOUDFLARE_API_TOKEN (it needs Account · Workers\n" +
        "Observability · Read), or run `pnpm exec wrangler login` — though a login is not\n" +
        "enough for this endpoint; its scopes stop at the live tail.",
    );
  }
  return { token: oauth, accountId, how: "your wrangler login" };
}

async function query(creds: Creds, body: QueryBody): Promise<Record<string, any>> {
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
    const scopes =
      res.status === 401 || res.status === 403
        ? `\n\n${creds.how} is not allowed to read Workers Logs. Create an API token with` +
          "\n  Account · Workers Observability · Read" +
          "\n(https://dash.cloudflare.com/profile/api-tokens), then:" +
          "\n  export CLOUDFLARE_API_TOKEN=…" +
          `\n(the account, ${creds.accountId}, comes from wrangler.jsonc; CLOUDFLARE_ACCOUNT_ID` +
          "\noverrides it only if you need to point somewhere else.)"
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
    const f = { ...(e.source ?? e.$workers?.source), ...e };
    const when = f.time ?? (e.timestamp ? new Date(e.timestamp).toISOString() : "?");
    const level = String(f.level ?? "?")
      .toUpperCase()
      .padEnd(5);
    const msg = f.msg ?? f.message ?? "";
    // Everything that is not the four we just printed, so nothing is silently hidden.
    const rest = Object.fromEntries(
      Object.entries(f).filter(
        ([k, v]) =>
          !["time", "level", "msg", "message", "timestamp", "source", "$workers", "$metadata", "$cloudflare"].includes(
            k,
          ) &&
          v !== null &&
          v !== undefined,
      ),
    );
    console.log(`${when}  ${level} ${msg}  ${Object.keys(rest).length ? JSON.stringify(rest) : ""}`.trimEnd());
  }
}

function printCalculations(result: Record<string, any>): void {
  const calcs: CalculationResult[] = result.calculations ?? [];
  if (calcs.every((c) => (c.aggregates ?? []).length === 0)) {
    console.log("nothing in that window");
    return;
  }
  for (const line of calculationTable(calcs)) console.log(line);
}

async function main(argv: string[]): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(USAGE);
    return;
  }

  const mode = argv[0] && !argv[0].startsWith("--") ? argv[0] : "events";
  if (!isMode(mode)) {
    console.error(USAGE);
    process.exit(2);
  }
  const flag = (name: string) => {
    const at = argv.indexOf(`--${name}`);
    return at === -1 ? undefined : argv[at + 1];
  };

  const creds = credentials();
  const to = Date.now();
  const from = to - sinceMs(flag("since") ?? "1h");
  const limit = parseLimit(flag("limit"));

  const body = queryBody(mode, { from, to, limit, level: flag("level"), msg: flag("msg") });

  const result = await query(creds, body);
  if (argv.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

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
