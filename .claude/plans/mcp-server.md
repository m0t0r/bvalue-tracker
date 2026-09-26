# Plan: a read-only MCP server for the sequence

Status: proposal, not started. Written 2026-09-22. Nothing below has been built or measured
unless it says so.

## Intent (read this first)

The repo owner wants **hands-on experience building and shipping an MCP server to production on
the latest spec**, to talk about in job interviews, and this project is the vehicle. Popularity
does not matter. What matters:

1. It is **real and in production**: deployed on the existing Worker (`choco`), reachable from a
   real MCP client (Claude.ai / Claude Desktop), with tests and docs to the same standard as the
   rest of the repo.
2. It uses **the current MCP stack**, not the 2025 one (see "The stack" below). The owner said
   "MCP 2.0". There is no spec called that. It means the **2026-07-28 spec** plus the
   **`@modelcontextprotocol/server` 2.0.0** TypeScript SDK.
3. It has **a plausible use case**: the Spanish-speaking researcher the page is written for (see
   `docs/frontend.md`, and the memory note on the audience) asks questions about the sequence
   in a chat, in Spanish, and gets the same figures the page shows, with the same caveats.
4. It **costs $0**. The owner is cost sensitive, and the account stays on the Workers **free
   plan** (maintainer decision 2026-09-20, `docs/ingest.md`).
5. It works **in Spanish and English**.

The interview story is the design decisions, not "I wrapped my API": why stateless MCP runs on
an ordinary Worker, how the tools are shaped for an LLM, how they avoid misleading scientific
output, how the server fits the existing security model, and how its cost is measured.

## Read before starting

Per `CLAUDE.md`, read these in full before changing their areas: `README.md`, `docs/science.md`
(every figure and caveat rule), `docs/api.md` + `docs/security.md` (the same-origin rule and
why), `docs/ingest.md` ("The CPU budget"), `docs/performance.md`, `docs/operations.md`,
`docs/development.md` ("Tooling gotchas"), `docs/deployment.md`. The existing plan
`.claude/plans/daily-summary.md` shows the house style for guardrails around AI output.

## The stack (verified 2026-09-22 from the sources at the end)

- **Spec 2026-07-28** (current; released 2026-07-28). What changed:
  - **The protocol is now stateless.** The `initialize`/`initialized` handshake and
    `Mcp-Session-Id` are gone. Every request carries its protocol version and client
    capabilities in `_meta` (`io.modelcontextprotocol/protocolVersion`). The version also goes
    in the `MCP-Protocol-Version` header on Streamable HTTP.
  - **`server/discover`**: a mandatory RPC. It returns the supported versions, capabilities and
    server identity.
  - **Multi Round-Trip Requests (MRTR)** replace server-initiated requests: a result can be
    `resultType: "input_required"`. Every result carries `resultType`.
  - **Headers name the method and target**: POSTs carry `Mcp-Method` / `Mcp-Name`, so gateways
    can route without parsing the body.
  - **Cacheable list results**: `ttlMs` and `cacheScope` on `tools/list`, `resources/list`,
    `resources/read` and the like. Return results in a deterministic order, so the client's
    LLM prompt cache hits.
  - **Schemas are full JSON Schema 2020-12.** `structuredContent` can be any JSON value.
  - **Authorization**: RFC 9207 issuer validation, credentials bound to their issuer, and
    **Client ID Metadata Documents (CIMD)** as the preferred registration path. **Dynamic
    Client Registration is deprecated.**
  - **Formal extensions framework** (`extensions` in capabilities). Tasks and **MCP Apps**
    (`io.modelcontextprotocol/ui`) are extensions.
  - **Deprecated**: Roots, Sampling and Logging, plus HTTP+SSE.
  - No locale or language negotiation exists in the protocol.
- **TypeScript SDK**: `@modelcontextprotocol/server@2.0.0` (the "2.0" the owner heard about)
  plus `zod`.
- **Cloudflare**: `createMcpHandler` from `agents/mcp/server` (the `agents` package). It builds
  a fresh `McpServer` from a factory **on every request**. It needs **no Durable Objects**, and
  `McpAgent` is deprecated for new servers. It accepts both 2026-07-28 requests and
  stateless requests from 2025 Streamable HTTP clients (`legacy: "stateless"`, the default).
  Options: `route` (default `/mcp`), `corsOptions` (**default wildcard CORS**; decide
  deliberately), `allowedHostnames` (defaults to localhost / `workers.dev`),
  `allowedOriginHostnames`, `authContext`, `legacy`, `responseMode` (`auto|json|sse`),
  `onerror`, `maxSubscriptions`, `keepAliveMs`. Auth plugs in through
  `@cloudflare/workers-oauth-provider`: verified `AuthInfo` arrives at
  `context.http.authInfo`, and `getMcpAuthContext()` gives app props. Pushed elicitation,
  sampling and roots fail on the stateless path; none of them are needed here.
  Cloudflare's docs say: "Use the exact MCP versions required by your installed Agents
  release." **Pin versions to what `agents` declares; do not pick them independently.**
- **Local testing**: `npx @modelcontextprotocol/inspector@latest` (a web client on
  localhost). Confirm it speaks 2026-07-28 before trusting it as the only check.
- **MCP Apps**: Claude and Claude Desktop render them. Claude Code does not (it falls back to
  text). A `ui://` resource with mime `text/html;profile=mcp-app` runs in a sandboxed iframe.
  Package: `@modelcontextprotocol/ext-apps`.

Recheck all of this at the start of the build session. It is two months old and moving fast.

## Use cases (what the researcher would ask, and which tool answers)

| Question (Spanish, as they would ask) | Tool(s) | What a good answer contains |
|---|---|---|
| "¿Está al día el catálogo?" | `get_sequence_status` | Newest event, the time of the last successful SGC read, backfill complete or not |
| "¿Cuál es el valor b de toda la secuencia?" | `get_b_value` | b ± error, Mc (maximum curvature) and why, n ≥ Mc, the "not a forecast" caveat |
| "¿Y si uso Mc 2,5?" | `get_b_value(mc: 2.5)` | The same, marked as a manual Mc |
| "¿Cómo ha cambiado b en el grupo superficial este mes?" | `get_b_over_time(cluster: "shallow", from)` | Windows with a fixed Mc, the September slide, the magnitude-type caveat, early windows least reliable |
| "¿Los dos grupos tienen valores b distintos?" | `compare_clusters` | Both b-values, Utsu p (≈0.24): **they cannot be told apart**. What really differs is activity |
| "¿Cuántos sismos hubo cada día la última semana?" | `get_daily_activity` | Counts per Colombian day, split by cluster |
| "¿Hubo sismos mayores de 4 esta semana?" / "¿Cuál fue el más grande?" | `list_events(minMag: 4, from, sort: "mag")` | A capped list with Bogotá time, magnitude + type, depth, cluster and the SGC link |
| "Hazme un resumen de la semana" | the status, activity and events tools together | Activity first, b only with its caveats |
| "¿Va a haber un sismo grande pronto?" | **none, on purpose** | The server instructions make the model decline a forecast and point to SGC. **This is the guardrail demo** for an interview |

A secondary use case is the owner in Claude Code asking about freshness, via
`get_sequence_status`. Ops tools (logs, CPU, ingest runs) do **not** belong on a public server.
For those, use `pnpm logs` or Cloudflare's hosted Observability MCP server.

## Design

### Tools: shaped for an LLM, not a mirror of the REST API

Rules for every tool:

- **Read-only, from D1 only.** Annotations: `readOnlyHint: true`, `idempotentHint: true`,
  `openWorldHint: false`. **There is no refresh or ingest tool, ever.** A model that loops a
  tool must not be able to reach SGC (`CLAUDE.md`: never loop requests against SGC).
- **The code computes every figure and the model computes none.** Return b-values already
  fitted by `core/gr.ts` / `core/clusters.ts`, never raw magnitudes for the model to fit. This
  is the same principle as `daily-summary.md`.
- **Every result carries the caveats that apply to it** (see "Guardrails"). They are data in
  the result, not only a line in a description the model might skip.
- **Every result carries a `dataQuality` block**: `backfillComplete`, `ingestAgeS`, and
  `lowN` when n ≥ Mc < 50. A half-filled database gives a confident, wrong b (`docs/science.md`),
  so when the backfill is incomplete, b is returned flagged as unrepresentative, or withheld.
  Decide which, and match the page.
- **Output**: `outputSchema` (zod) + `structuredContent`, plus a short text `content` block
  that summarises the result for clients that ignore structured output.
- **Parameters mirror `parseFilter` in `worker/index.ts`**: `from` and `to` (UTC; a bare date
  is inclusive of that day), `minMag` (0–10), `status` (`manual|automatic`), `excludeMainshock`,
  `cluster` (`shallow|deep`), and `mc` on the stats tools. **No `includeRemoved`**: withdrawn
  events stay out.
- **`lang: "es" | "en"`, default `"es"`.** It selects the language of the caveats and the text
  summary. Tool names and descriptions stay in English, which models follow most reliably.
  Claude answers in the user's language regardless.
- **Times**: `docs/frontend.md` says the page shows Colombian time (`America/Bogota`, UTC−5)
  while the API stays in UTC. Return both: `time` (UTC ISO) and `timeLocal` (Bogotá). Say in
  the descriptions that `from` and `to` are UTC dates, or accept Bogotá dates and convert.
  **Decide which, and document it.** The researcher thinks in Bogotá days, so Bogotá dates
  are probably right for this audience.
- **`tools/list`** sets `ttlMs` (the list is static) and returns the tools in a fixed order.

Proposed tools:

1. **`get_sequence_status`**: wraps `status()` plus the `ingestAgeS` logic in `/api/health`.
   It returns total events, the newest event (time and SGC link), the last successful ingest,
   backfill `{done,total}` and a plain `isCurrent` flag.
2. **`get_b_value`**: `computeStats` for the whole catalogue, or `computeClusterStats(...)[cluster]`
   for a cluster. **Never call `computeStats` on a cluster's own events**; that gives the cluster
   its own Mc (`docs/science.md`). It returns count, `mcMaxc`, `mcGft`, the Mc used and whether
   it was a manual override, `fit` (b, σ, n), `fitGft` with a note on why GFT is wrong here, and
   optionally the FMD `bins`. Possible extra parameter: `magScope: "all" | "dominantType"`. This
   is the page's magnitude-type tab. Its logic is `measure()` in `src/lib/scope.ts`, which the
   Worker cannot import today (see "Code layout").
3. **`get_b_over_time`**: `bValueWindows` (150 events, step 10, **one fixed Mc**). Returns
   `windows[{from,to,b,sigma,n}]`. For the deep cluster, return one b plus the explanation the
   chart gives (too few events for windows), rather than noisy small windows.
4. **`compare_clusters`**: `computeClusterStats` → each cluster's b ± σ, n, `ownMcHigher`,
   `recent` (last 7 days), `recentMaxMag`, `lastTime`, and `difference` (`dAic`, `p`). The text
   must say "cannot be told apart" when p is not small, and lead with activity, as the
   "Dos grupos" card does.
5. **`get_daily_activity`**: events per Colombian day split by cluster (`dailyCounts`). Since
   `docs/science.md` calls activity the most useful part for a non-seismologist, this tool
   matters more than it looks.
6. **`list_events`**: filtered and **capped** (default 20, max 50), `sort: "time" | "mag"`.
   It returns id, `time`/`timeLocal`, mag + magType, depthKm, cluster, region (with ", Colombia"
   stripped, as `fmtRegion` does), status and the SGC event URL. It depends on the auth
   decision below.

Later (phase 3), to show the other MCP primitives:

- **Prompts**: `resumen_semanal` / `weekly_summary`, and `explicar_valor_b` /
  `explain_b_value`. These are prompt templates in both languages. They show that the owner
  knows prompts are user-invoked, while tools are model-invoked.
- **Resources**: `bvalue://guide/{lang}`, the page's "Cómo leer estas cifras" caveats and
  method notes as a readable resource, with `ttlMs`.
- **MCP Apps**: `show_b_chart` returns a `ui://` resource that renders b over time, with its
  error band, in the chat. It reuses the page's chart design and speaks Spanish. It is the
  flashiest "latest tech" item and the most work. It renders in Claude and Claude Desktop,
  and Claude Code falls back to text. It runs in a sandboxed iframe with its own CSP, so plan
  the bundle (Recharts inline, no MapLibre).

### Guardrails (the scientific part of the interview story)

- **Server instructions** (sent in `server/discover` / server info; check where SDK 2.0 puts
  `instructions`), in both languages. Draft:
  > Figures come from the Servicio Geológico Colombiano (SGC) catalogue as read by this
  > project. They describe what has already happened. **A b-value is not a forecast**: never
  > use these tools to say whether a large earthquake is likely, and for safety information
  > refer the user to SGC. Always report b with its error and Mc. The two depth clusters'
  > b-values cannot be told apart statistically; what differs is their activity. Do not
  > compute statistics yourself from event lists; use the statistics tools.
- **Caveat strings are shared with the page, not rewritten.** They live in `src/lib/i18n.tsx`
  today (`caveats`, `clusterNotForecast`, the magnitude-type text). That file imports React and
  sits outside `tsconfig.worker.json`, so move the shared strings to a new `core/` module that
  both `i18n.tsx` and the MCP tools import. Do not duplicate them. `docs/frontend.md` requires
  every string in both `es` and `en`, and the move keeps that enforceable.
- Tests assert that each stats tool's result includes its caveats, and that no text the server
  writes contains forecast words. Reuse the forbidden-word idea from `daily-summary.md`.

### Code layout (proposal)

- **`worker/query.ts`** (new): move `EventFilter`, `parseFilter`, `queryEvents`, `parseCluster`,
  `ofCluster`, `statsFor` and `status()` out of `worker/index.ts`, so `/api/*` and `/mcp` share
  one path. This is the repo's "one pipeline so they cannot disagree" rule (`computeStats`
  docstring). A **parity test** (stats tool == `/api/stats` for the same filter) holds it.
- **Page logic the Worker needs moves to `core/`**: `dailyCounts` (`src/lib/daily-counts.ts`,
  which needs `dayStart` from `src/lib/format.ts`), region stripping (`fmtRegion`), and
  the magnitude-type half of `measure` (`src/lib/scope.ts`) if `magScope` ships. The page
  then imports these from `core/`. Check `tsconfig.app.json`'s `include`, which lists `core`
  files one by one.
- **`worker/mcp/tools.ts`**: pure functions from (events, status, params) to result objects.
  Unit-testable with no MCP plumbing.
- **`worker/mcp/server.ts`**: `createServer(env)` → `new McpServer(...)`, `registerTool(...)`
  for each tool with zod input/output schemas, annotations and instructions.
- **`worker/index.ts`**: mount `app.all("/mcp", (c) => mcpHandler(c.req.raw, c.env, c.executionCtx))`
  inside Hono, so `secureHeaders()`, `notFound` and `onError` still apply. Add its own rate
  limit (below).
- **`wrangler.jsonc`**: add `"/mcp"` to `assets.run_worker_first`. Add a second `ratelimits`
  entry if MCP gets its own limit. KV only if OAuth is chosen.

### Security and access: **the owner decides this before building**

`/api/*` is same-origin only, so that the raw catalogue stays out of casual reach
(`docs/api.md`). An MCP endpoint is by definition a direct caller, so it needs its own
deliberate rule. Options:

| | Option | Consistent with the same-origin rule? | Work | Interview value |
|---|---|---|---|---|
| A | **Public, no auth**, aggregates only (tools 1–5), **no `list_events`** | Yes: statistics are not the catalogue | least | good |
| B | Public, no auth, including a capped `list_events` | Partly: 50 events/call × a date walk ≈ the whole ~800-event catalogue in ~16 calls | low | good |
| C | **OAuth** (GitHub via `@cloudflare/workers-oauth-provider`, CIMD-ready, RFC 9207) around everything | Yes | most: KV namespace, GitHub OAuth apps for dev and prod, secrets, consent screen | **highest**: "implemented MCP auth under the 2026-07-28 spec" |
| D | Cloudflare Access in front of `/mcp` | Yes | medium | lower (config, not code) |

**Suggested path:** ship **A** first (a working production server fast), then add **C** as a
second milestone, with `list_events` behind auth. Record the decision in `docs/security.md`
and `docs/api.md`.

Other points:

- **The per-IP rate limit does not work for remote connectors.** Claude.ai calls a remote MCP
  server from Anthropic's infrastructure, so `cf-connecting-ip` is Anthropic's egress, shared
  by every Claude.ai user. Either key the limit globally (a single bucket such as 60/min for
  `/mcp`, which still protects D1 and CPU) or, with OAuth, key it per user. **Verify what
  `cf-connecting-ip` actually is on a real Claude.ai call before choosing.**
- **CORS**: `createMcpHandler` defaults to wildcard CORS. Remote MCP clients are servers, not
  browsers, except the Inspector and MCP Apps iframes, so set `corsOptions` deliberately.
  `docs/security.md` explains why the API deliberately sends no CORS headers.
- `allowedHostnames`: the production host is a `workers.dev` name (see `README.md`), which the
  default covers. Set it explicitly anyway.
- Input bounds: zod enforces the same ranges as `parseFilter`. Any tool that fits b needs a
  bounded `mc` (for example 1.0–5.0), because a bin count sizes an array in `fmd`
  (`docs/security.md`).
- Never log `authInfo.token` or props (Cloudflare's note).

### Cost ($0 is the target; verify each line)

| Item | Free-plan allowance | Expected MCP use | Risk |
|---|---|---|---|
| Worker requests | 100k/day, shared with the page | tens/day | none |
| D1 rows read | 5M/day | each stats call scans ~800+ rows → ~6,000 calls/day before it matters | none at this volume |
| **Worker CPU** | **10 ms per invocation** | each stats call = the full scan + `computeStats` (like `/api/stats`), plus `McpServer` construction and zod schema setup **per request** | **the real risk; measure it** |
| Bundle size | the free-plan compressed-size limit (check the current figure) | `agents` + the SDK + zod added | check with `wrangler deploy --dry-run --outdir` |
| Durable Objects | not needed (stateless handler) | 0 | none |
| KV | free tier | only with OAuth, a few ops per login | none |
| Workers Logs | 200k events/day | one line per tool call if added | low |
| LLM tokens | n/a | **$0 to the owner**: the chat user's own Claude plan pays | none |

**CPU context**: fetch invocations measured median 5 ms, p99 20 ms, max 43 ms (2026-09-20,
`docs/ingest.md`). Cron ticks already run 3–4× over the 10 ms limit and survive only because
the overrun is infrequent. **Do not add a steady source of over-limit invocations.**
`pnpm logs cpu` groups by trigger, not by path, so measuring `/api/stats` (and later `/mcp`)
on its own needs either a path `groupBy` added to `scripts/logs.ts` or the Observability tab
filtered by URL. If a stats call is near 10 ms: select only the needed columns instead of
`SELECT *`, skip `bValueWindows` when a tool does not need windows, and keep the per-request
server factory light (define schemas at module scope and build only the server per request).

Cloudflare pricing and limits change; recheck them on the day.

## Order of work

0. **Decide and measure, before any code.**
   - The owner picks the access option (A/B/C/D) and the date convention (UTC or Bogotá).
   - Measure the `/api/stats` CPU per invocation in production. Record the Worker's current
     bundle size.
   - Recheck the versions in "The stack". Confirm the `agents` release works with this repo's
     pins: `compatibility_date` is held at 2026-08-20 and `vitest` at 4.x by
     `@cloudflare/vitest-pool-workers` (`docs/development.md`). **If `agents` needs a newer
     runtime date, that is a blocker to solve first.** TypeScript is 7.x; check that the SDK's
     types compile.
   - Write `docs/mcp.md`: intent, tools, guardrails, the access decision, cost. This is the
     house convention: docs before code.
1. **Refactor with no behaviour change.** Add `worker/query.ts`. Move `dailyCounts`,
   `dayStart`, the region stripping and the shared caveat strings to `core/`. All existing
   tests stay green, and the page looks identical (check with `agent-browser`).
2. **Skeleton.** Install the deps at the versions `agents` pins. Mount `/mcp` with one tool,
   `get_sequence_status`. Add a worker test that POSTs JSON-RPC to `/mcp` via `worker.fetch`
   (`tools/list`, `tools/call`, `server/discover`) against D1 seeded from `test/fixtures/`.
   Test a 2025-style stateless request as well as a 2026-07-28 one. Check locally with the
   Inspector against `pnpm dev`.
3. **Statistics tools** (2–5), each with a unit test in `worker/mcp/tools.ts` and a parity test
   against `/api/stats`. **Pin the fixture figures `docs/science.md` lists** (for example b =
   0.738 ± 0.032, n = 438 shallow; 0.816 ± 0.112, n = 90 deep; Utsu p ≈ 0.24 on production),
   using the fixture values the existing tests use.
4. **`list_events`** per the access decision, with a cap test.
5. **Guardrail tests**: caveats present in `es` and `en`, no forecast words, no tool can reach
   SGC (MSW `onUnhandledRequest: "error"` already enforces that; add an explicit case), the
   `dataQuality` flag set when the backfill is incomplete.
6. **Ship.**
   - Update `docs/api.md` (the `/mcp` exception to the same-origin rule), `docs/security.md`,
     `docs/operations.md` (any new log line), `README.md` (a feature line, the architecture
     Mermaid, the docs table) and the `CLAUDE.md` table (a row for `docs/mcp.md`).
   - Deploy. **Run `pnpm exec wrangler whoami` and confirm the account with the owner before
     the first deploy of this**, per `CLAUDE.md`.
   - Measure `/mcp` CPU in production over a day.
   - Connect Claude.ai as a custom connector and run the use-case table in Spanish.
     Screenshots are for the portfolio.
7. **Stretch, in rough order of interview value**: OAuth (option C), MCP Apps chart, prompts
   and resources, and an Analytics Engine dataset for tool calls (usage numbers to quote;
   `wrangler.jsonc` says the field positions of a dataset are its schema, so a new one is
   cleaner than appending to `sgc_ingest`).

Checks before finishing each step (`CLAUDE.md`): `pnpm typecheck`, `pnpm lint`,
`pnpm format:check`, `pnpm test`.

## Definition of done (first milestone)

- `/mcp` in production answers 2026-07-28 and 2025 stateless clients, with tools 1–5 (plus 6
  if the owner chose that).
- A Spanish conversation in Claude.ai answers the use-case table correctly. It gives b with
  its error and Mc, says the clusters cannot be told apart, and declines the forecast question.
- The CPU per `/mcp` invocation is measured and recorded in `docs/mcp.md`. It adds no steady
  over-limit load.
- Docs are updated. All four checks pass.

## Interview talking points this should produce

- The stateless 2026-07-28 spec lets a remote MCP server run as an ordinary HTTP handler on a
  free-plan edge Worker, with no Durable Objects or sessions. Compare that with the 2025
  `McpAgent` approach.
- Tool design for LLMs: pre-computed statistics with their errors, structured output with
  schemas, read-only annotations, deterministic cacheable listings, and bilingual caveats as
  data.
- **Guarding against confident wrong numbers**: the model never fits b, a half-loaded database
  is flagged, the forecast question is declined by design, and tests enforce it.
- The security trade-off: a deliberate exception to the same-origin rule, the rate limit keyed
  correctly for remote connectors, and (if built) OAuth with CIMD and RFC 9207.
- Cost engineering: a measured CPU budget on a free plan whose 10 ms limit this Worker already
  pressures, and why that shaped the tools.
- One shared pipeline, so the page, the REST API, the CLI and MCP cannot disagree, backed by a
  parity test.

## Open questions for the owner

1. Which access option: A, B, C or D? (Suggested: A, then C.)
2. `from`/`to` in UTC dates, as the API has them, or Bogotá dates, as the page shows them?
3. Should `get_b_value` offer the magnitude-type tab (`magScope`)? That moves `measure`'s
   logic to `core/`.
4. Does the researcher actually use Claude.ai or Claude Desktop, and which plan? Check whether
   custom connectors are available on it.
5. Is the MCP Apps chart in scope for the first milestone, or a stretch?
6. Should the researcher review the server instructions and caveat wording before it goes
   public, as `daily-summary.md` proposes for its prompt?

## Sources (fetched 2026-09-22)

- MCP blog, "The 2026-07-28 Specification": https://blog.modelcontextprotocol.io/posts/2026-07-28/
- MCP versioning: https://modelcontextprotocol.io/specification/versioning
- 2026-07-28 changelog: https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/changelog.mdx
- Cloudflare, "The next generation of MCP" (2026-08-06): https://blog.cloudflare.com/mcp-v2/
- `createMcpHandler` API reference: https://developers.cloudflare.com/agents/model-context-protocol/mcp-handler-api/
- Cloudflare, build a remote MCP server: https://developers.cloudflare.com/agents/model-context-protocol/guides/remote-mcp-server/
- MCP Apps overview: https://modelcontextprotocol.io/extensions/apps/overview
- Claude Code has no MCP Apps rendering: https://github.com/anthropics/claude-code/issues/95149
