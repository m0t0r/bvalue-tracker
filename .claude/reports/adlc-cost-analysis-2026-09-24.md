# ADLC / software factory: cost analysis (2026-09-24)

This report estimates what it would cost to run Cloudflare's Agent Development Lifecycle
([blog post, 2026-08-04](https://blog.cloudflare.com/agent-development-lifecycle/)), or a
self-built "software factory", on Cloudflare. I read the source article, every page it links
to, one further hop into pages that carry pricing or measured data, and the current pricing
pages for every tool named. All pages were read on 2026-09-24. **No repo files other than
this report were changed.**

**Read this before relying on any figure.** Pages were read through WebFetch, which passes
them through a summarising model. Numbers matched across repeated fetches, but
spot-check the high-impact ones before committing budget. Those are: Traces billing from
2026-10-01, how Dynamic Workers are counted, the Opus 5.5 cache-read price, and the AI Gateway
logs change dated 2026-09-24. Figures marked *derived* are my own arithmetic. Figures marked ⚠
are stale, conflicting or come only from a third party.

## Summary

- **Model tokens are 90–97% of the bill.** The Cloudflare platform itself is small money:
  $5/month for Workers Paid, then cents per CI run or agent sandbox.
- **Expected monthly spend:** about $140–300 solo, $1.1k–2.7k for a 5-person team, and
  $11k–25k for 50 engineers. The range depends on the model mix.
- **Writing code is 60–70% of model spend.** Triage, review and scans are cheap, especially on
  open-weight models hosted on Workers AI.
- **The only measured cost per unit of agent work is Cloudflare's AI code reviewer: $1.19 per
  review** (median $0.98, P99 $4.45). Each merge request is reviewed 2.7 times on average, so
  that is about $3.20 per merge request.
- **Subscriptions cannot legally run an automated factory.** Anthropic's consumer terms and the
  paused Agent SDK credit rule it out, so budget at API rates.
- **Still unpriced or gated:** Flagship and `@cloudflare/ci` have no published price, and
  Artifacts is in closed beta (`@cloudflare/ci` needs it).

## 1. What the source article covers

The article defines no costs, token counts or models. It maps Cloudflare products onto
software development lifecycle stages. Every hyperlink it contains, grouped by stage:

| Stage | Tools named | Links |
|---|---|---|
| Plan / design / implement | Vite plugin, Rolldown, Oxc, local dev, Local Explorer, local traces, remote bindings, preview URLs | [Vite plugin](https://developers.cloudflare.com/workers/vite-plugin/), [Rolldown](https://rolldown.rs/), [Oxc](https://oxc.rs/), [local dev](https://developers.cloudflare.com/workers/local-development/), [Local Explorer](https://developers.cloudflare.com/workers/local-development/local-explorer/), [local tracing](https://blog.cloudflare.com/local-tracing/), [remote bindings](https://developers.cloudflare.com/changelog/post/2025-09-16-remote-bindings-ga/), [preview URLs](https://developers.cloudflare.com/workers/versions-and-deployments/preview-urls/) |
| Test | Browser Run, Vitest integration | [Browser Run](https://developers.cloudflare.com/browser-run/), [Vitest](https://developers.cloudflare.com/workers/testing/vitest-integration/) |
| Deploy | Flagship, gradual deployments | [Flagship](https://blog.cloudflare.com/flagship/), [gradual deployments](https://developers.cloudflare.com/workers/versions-and-deployments/gradual-deployments/) |
| Maintain / retire | Workers Logs, Agent Traces, Cloudflare MCP server (Code Mode), Dynamic Workers, Analytics Engine | [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/), [Agents and Agent Traces](https://blog.cloudflare.com/agents-on-cloudflare), [Code Mode MCP](https://blog.cloudflare.com/code-mode-mcp/), [Dynamic Workers](https://blog.cloudflare.com/dynamic-workers/), [Analytics Engine](https://developers.cloudflare.com/analytics/analytics-engine/) |
| Factory plumbing | `@cloudflare/ci` on Workflows, Artifacts, dynamic workflows, Flue | [CI on Workflows](https://blog.cloudflare.com/ci-workflows), [Workflows](https://developers.cloudflare.com/workflows/), [Artifacts blog](https://blog.cloudflare.com/artifacts-git-for-agents-beta/), [Artifacts docs](https://developers.cloudflare.com/artifacts/), [dynamic workflows](https://blog.cloudflare.com/dynamic-workflows/), [Flue](https://flueframework.com/), [Flue workflows guide](https://flueframework.com/docs/guide/workflows/#example-cloudflare-workflows) |
| Agents acting on accounts | Agents buying domains and subscriptions, temporary accounts | [Stripe Projects](https://blog.cloudflare.com/agents-stripe-projects/), [temporary accounts](https://blog.cloudflare.com/temporary-accounts/) |
| Companion posts | Standards enforcement, Astro triage | [engineering standards](https://blog.cloudflare.com/engineering-standards-enforcement), [Astro issue triage](https://blog.cloudflare.com/astro-issue-triage) |
| Background | RAND 1975 report | [RAND R1855](https://www.rand.org/pubs/reports/R1855.html) |

## 2. Measured data from the companion posts

### Cloudflare AI code reviewer

The standards-enforcement post links to [ai-code-review](https://blog.cloudflare.com/ai-code-review/)
(2026-04-20; data window 2026-03-10 to 04-09). That page has the only per-unit agent costs
anywhere in the post set.

- **Volume:** 131,246 review runs across 48,095 merge requests in 5,169 repositories.
  Reviews per merge request average 2.7; findings per review average 1.2.
- **Cost per review:** mean $1.19, median $0.98, P90 $2.36, P95 $2.93, P99 $4.45.
  - *Derived:* about $156k/month in total.
- **Duration per review:** median 3m39s, P90 6m27s, P95 7m29s, P99 10m21s.

Cost by risk tier. A trivial review also downgrades the coordinator to Sonnet.

| Tier | Size rule | Agents | Reviews | Avg | Median | P95 | P99 |
|---|---|---|---|---|---|---|---|
| Trivial | ≤10 lines, ≤20 files | 2 | 24,529 | $0.20 | $0.17 | $0.39 | $0.74 |
| Lite | ≤100 lines, ≤20 files | 4 | 27,558 | $0.67 | $0.61 | $1.15 | $1.95 |
| Full | >100 lines or >50 files | 7+ | 78,611 | $1.68 | $1.47 | $3.35 | $5.05 |

Models by tier:
- **Top tier:** Opus 4.7 and GPT-5.4, used for the coordinator only.
- **Standard tier:** Sonnet 4.6 and GPT-5.3 Codex, for code quality, security and performance.
- **Kimi K2.5:** documentation, release notes and AGENTS.md.

Tokens and share of cost:

| Tier | Input | Output | Cache read | Cache write | Share of cost |
|---|---|---|---|---|---|
| Top | 806M | 1,077M | 25,745M | 5,918M | 51.8% |
| Standard | 928M | 776M | 48,647M | 11,491M | 46.2% |
| Kimi K2.5 | 11,734M | 267M | 0 | 0 | 0.0% |

- The post states "~120B" tokens and an 85.7% cache hit rate.
  - ⚠ The four categories add up to about 131B.
  - ⚠ *Derived:* cache reads are 79.5% of input-side tokens, so the definition of the 85.7% figure is unclear.
- *Derived* average per review: about 21.9k uncached input, 16.2k output, 782k cache read and
  179k cache write. That is about 1.0M tokens, and it is profile "M" in §5.

Operations:
- Per-task timeout is 5 minutes (10 for code quality); the whole review times out at 25 minutes.
- A circuit breaker falls back between models, but only on 429/503 responses.
- Routing is controlled by a Worker plus KV, so a provider can be switched off in about 5 seconds.
- "Break glass" overrides were used 288 times (0.6% of merge requests).

### Cloudflare internal AI stack

From [internal-ai-engineering-stack](https://blog.cloudflare.com/internal-ai-engineering-stack/),
2026-04-20:
- **Users:** 3,683 internal users out of about 6,100 employees.
- **Traffic:** 20.18M AI Gateway requests a month; 241.37B tokens routed through AI Gateway;
  51.83B tokens on Workers AI.
- **Security agent:** "processes over 7 billion tokens per day on Kimi. That would cost an
  estimated $2.4M per year on a mid-tier proprietary model. But on Workers AI, it's 77% cheaper."
  - *Derived:* that is about $0.94/MTok blended for the proprietary model, and about $550k/year on Workers AI.

### Engineering standards enforcement

From [engineering-standards-enforcement](https://blog.cloudflare.com/engineering-standards-enforcement),
2026-08-04:
- **Code reviewer:** based on OpenCode, running on GitLab merge requests. Over four months it
  flagged about 230,000 violations and withheld approval about 16,000 times.
- **Spec reviewer:** a Worker using D1, AI Gateway and a Cron Trigger. It reviewed about 600
  specs in over 3,200 runs since May 2026.
- **Incident-report reviewer:** assessed more than 200 reports.
- **Cost:** no dollar or token figures for the spec or incident reviewers.

### Astro issue triage

From [astro-issue-triage](https://blog.cloudflare.com/astro-issue-triage), 2026-08-04:
- **Pipeline:** four phases (reproduce, diagnose, verify, fix), each run by a separate
  sub-agent. The phases pass their findings forward in a `report.md` file.
- **Where it runs:** GitHub Actions, via
  [triagebot-action](https://github.com/withastro/triagebot-action).
- **Models:** triage uses `@cf/moonshotai/kimi-k2.7-code` and verification uses
  `@cf/moonshotai/kimi-k2.6`, both on Workers AI.
- **Results:** open issues fell from over 200 to about 30 (an 85% cut).
- **Cost:** no tokens, dollars, run counts or durations are published.
- **Failure mode noted:** fixes for hot module reload (HMR) bugs caused regressions elsewhere
  where test coverage was missing.

### `@cloudflare/ci` (CI on Workflows)

From [ci-workflows](https://blog.cloudflare.com/ci-workflows), 2026-08-04:
- **Architecture:** pipelines are TypeScript on Workflows. Code lives in Artifacts, steps run in
  Sandbox containers, and the dependency cache is a sandbox snapshot in R2.
- **Self-healing:** a Think agent running on Durable Objects, using `kimi-k2.7-code`. The fix
  step is `step.do('heal', { retries: { limit: 0 }, timeout: '5 hours' }, …)`, and the fix lands
  on a `ci-autofix/<run-id>` branch.
- **Deploy-on-push guide:** uses `instance_type: "standard-4"` and `max_instances: 10`.
- **Pricing:** none published. The post asks readers to join the Artifacts private beta.
- **Numbers:** no run counts, durations or success rates.

### Agents and Agent Traces

From [agents-on-cloudflare](https://blog.cloudflare.com/agents-on-cloudflare), 2026-08-04:
- **Pricing:** "All tracing is currently free while in beta. Starting October 1, 2026, tracing
  pricing will be included as part of existing Workers Observability pricing."
- **Counting:** "Every span counts as an observability event." One agent turn produces
  several spans (`invoke_agent`, `chat`, `execute_tool`, `tool_approval`).

## 3. Cloudflare platform pricing

Prices are for the Workers Paid plan unless noted. Sources are the
`developers.cloudflare.com/<product>/…/pricing/` pages.

| Product | Included | Overage | Notes |
|---|---|---|---|
| Workers Paid plan | — | **$5/month** | Required for Containers, Sandbox, Dynamic Workers, Artifacts and `kimi-k2.7-code` |
| Workers requests | 10M/month | $0.30/M | |
| Workers CPU | 30M CPU-ms/month | $0.02/M CPU-ms | |
| Workflows steps | 500k/month | $0.80 per 100k | Billed since 2026-08-10; retries and rollbacks are not counted; sleeping or waiting uses no CPU |
| Workflows storage | 1 GB-month | $0.20/GB-month | State kept 30 days |
| Durable Objects | 1M requests, 400k GB-s | $0.15/M requests, $12.50/M GB-s | SQLite: 25B rows read and 50M rows written included |
| Containers / Sandbox, vCPU | 375 vCPU-min/month | $0.000020 per vCPU-s ($0.072/h) | Charged on **active** use; GA since 2026-04-13 |
| Containers / Sandbox, memory | 25 GiB-h/month | $0.0000025 per GiB-s ($0.009/h) | Charged on **provisioned** size while awake |
| Containers / Sandbox, disk | 200 GB-h/month | $0.00000007 per GB-s | Provisioned size |
| Container egress (North America / Europe) | 1 TB | $0.025/GB | Other regions $0.04–0.05/GB with 500 GB included |
| Browser Run | 10 browser-h/month; 10 concurrent | $0.09/h; $2 per extra concurrent browser | |
| Workers Logs and Traces (including Agent Traces) | 20M events/month | $0.60/M | 7-day retention; **traces billed from 2026-10-01** |
| Analytics Engine | 10M data points, 1M reads | $0.25/M, $1.00/M | **Billing not yet active** |
| Workers AI | 10k neurons/day free | $0.011 per 1k neurons | Per-token prices in §4 |
| AI Gateway | Core features free | Logs for accounts created on or after 2026-09-24 bill as Workers Logs | Unified Billing charges 5% on credits bought |
| Artifacts | 10k operations, 1 GB | $0.15 per 1k operations, $0.50/GB-month | Paid only; **closed beta** ⚠ (docs say closed beta, but the pricing page shows no beta caveat) |
| Dynamic Workers | 1,000 unique/month | $0.002 per Dynamic Worker per day | Beta waiver ended 2026-05-26; CPU includes startup; ⚠ "per month" and "per day" wording conflicts |
| Workers Builds | 6,000 build-min/month | $0.005/min | 4 vCPU, 8 GB, 20-minute timeout |
| R2 / KV / D1 / Queues | Generous | Standard | Not material at this scale |
| Flagship | — | **Not published** | Public beta since 2026-05-26; pricing promised near GA |
| `@cloudflare/ci` | — | **Not published** | Presumably the cost of its primitives (Workflows, Artifacts, Sandbox) ⚠ inference |
| Local dev, Local Explorer, local traces, Vitest (local), preview URLs, gradual deployments, temporary accounts | — | $0 or no published charge | Rolldown and Oxc are MIT-licensed |

Container instance types:

| Type | vCPU | Memory | Disk |
|---|---|---|---|
| lite | 1/16 | 256 MiB | 2 GB |
| basic | 1/4 | 1 GiB | 4 GB |
| standard-1 | 1/2 | 4 GiB | 8 GB |
| standard-2 | 1 | 6 GiB | 12 GB |
| standard-3 | 2 | 8 GiB | 16 GB |
| standard-4 | 4 | 12 GiB | 20 GB |

*Derived* job costs, after the included amounts are used up:

| Job | Cost per run |
|---|---|
| 10-minute CI run, standard-4, 50% CPU | $0.043 |
| 20-minute agent session, standard-2, 20% CPU | $0.024 |
| 20-minute agent session, standard-1, 20% CPU | $0.015 |

Cost facts that are easy to miss:
- **Remote bindings bill even in local dev.** Workers AI, Browser Run, Vectorize and Images are
  always remote.
- **Container memory and disk bill for as long as the instance is awake.** The sleep timeout is
  the cost lever.
- **Dynamic Workers are identified by ID plus code.** Changing either counts as a new Worker;
  reuse a stable ID with `.get()`.
- **Stripe Projects (agents buying services)** sets a default cap of $100/month per provider on
  what an agent can spend.

Efficiency claims that affect token spend:
- **Code Mode MCP:** "reduces the number of input tokens used by 99.9%" for the full Cloudflare
  API (1.17M → about 1,000 tokens).
- **Dynamic Workers:** converting an MCP server into a TypeScript API "can cut token usage by 81%".
- **Artifacts:** clones take 10–15 s instead of 90–100 s; the post's example claims 2,778
  sandbox-hours saved per 10k jobs a month.

## 4. Model pricing

All prices are $ per million tokens.

### Anthropic

From the [pricing page](https://platform.claude.com/docs/en/about-claude/pricing).

| Model | Input | Output | Cache read | 5-minute cache write |
|---|---|---|---|---|
| Fable 5.1 | $10 | $50 | $0.25 (0.025×) | $12.50 |
| Opus 5.5 | $4 | $20 | $0.20 (0.05×) | $5.00 |
| Opus 5 / 4.8 | $5 | $25 | $0.50 | $6.25 |
| Sonnet 5 | $2 | $10 | $0.20 | $2.50 |
| Haiku 4.5 | $1 | $5 | $0.10 | $1.25 |

Pricing rules:
- **Caching and batch:** 1-hour cache writes cost 2× input. Batch is 50% off and stacks with
  caching. US-only inference costs 1.1×.
- **Sonnet 5:** stays at $2/$10. The rise to $3/$15 planned for Sept 1 "will not occur".
- **Tokenizer:** the Claude 4.7+ tokenizer produces about 30% more tokens for the same text.

Hosted-agent pricing:
- **Managed Agents:** tokens at the rates above, plus **$0.08 per session-hour**, counted only
  while the session is running. No batch discount. Web search costs $10 per 1k searches.
  - ⚠ Some third-party posts quote $0.25/h.
- **Code execution tool:** 1,550 free container-hours per organization per month, then
  $0.05/hour.

### Other providers

| Model | Input | Cached input | Output | Source |
|---|---|---|---|---|
| GPT-6 Sol | $2 | $0.20 | $10 | [OpenAI](https://developers.openai.com/api/docs/pricing) (launched 2026-09-22) |
| GPT-6 Astra | $10 | $1 | $50 | OpenAI |
| GPT-6 Luna | $0.10 | $0.01 | $0.50 | OpenAI |
| GPT-5.4 | $2.50 | $0.25 | $15 | OpenAI |
| GPT-5.3 Codex | $1.75 | $0.175 | $14 | OpenAI |
| Gemini 3.1 Pro (preview) | $2 | $0.20 | $12 | [Google](https://ai.google.dev/gemini-api/docs/pricing) |
| Gemini 3.6–3.8 Flash | $0.75 | $0.075 | $3.75 | Google ⚠ promo price; doubles on 2027-01-01 |
| **Kimi K2.7-code (Workers AI)** | $0.95 | $0.19 | $4.00 | [Workers AI](https://developers.cloudflare.com/workers-ai/platform/pricing/) |
| Kimi K2.6 (Workers AI) | $0.95 | $0.16 | $4.00 | Workers AI |
| Kimi K2.5 (Workers AI) | $0.60 | $0.10 | $3.00 | Workers AI |
| GLM-5.3 (Workers AI) | $1.40 | $0.26 | $4.40 | Workers AI |
| GLM-5.3-flash (Workers AI) | $0.15 | $0.03 | $0.50 | Workers AI |
| DeepSeek V4-Pro (Workers AI) | $1.32 | $0.044 | $3.96 | Workers AI |
| DeepSeek V4-Flash (Workers AI) | $0.44 | $0.014 | $1.32 | Workers AI |
| gpt-oss-120b (Workers AI) | $0.35 | — | $0.75 | Workers AI |
| Kimi K2.7-code (OpenRouter) | $0.66 | $0.18 | $3.30 | [OpenRouter](https://openrouter.ai/api/v1/models) snapshot |
| Qwen3-Coder (OpenRouter) | $0.30 | $0.10 | $1.00 | OpenRouter |
| DeepSeek V4-Pro (DeepSeek first-party) | $0.66–1.32 | $0.022–0.044 | $1.98–3.96 | [DeepSeek](https://api-docs.deepseek.com/quick_start/pricing); off-peak is half price |

### Measured cost per task elsewhere

- **Claude Code** ([costs doc](https://code.claude.com/docs/en/costs)): about $13 per developer
  per active day and $150–250 per developer per month. 90% of users stay under $30/day. Agent
  teams use about 7× the tokens of a normal session.
- **Anthropic managed Code Review** ([docs](https://code.claude.com/docs/en/code-review)):
  $15–25 per review, about 20 minutes each.
- **Artificial Analysis Coding Agent Index v1.5** (hard tasks):
  - Opus 5.5 at max effort in Claude Code: $13.04 per task, about 15.6M tokens and 333k output.
  - Opus 5 at max effort: $10.79 per task.
  - GPT-6 Sol at max effort: $2.99 per task.
  - ⚠ The Opus figures come via a third-party page citing AA.
- **SWE-bench Verified, bash-only harness:** $0.07–0.75 per instance.
  - ⚠ Stale: the newest entry is 2026-02-26, and the minimal harness understates real repository context.
- **Cache hit rates in agent loops** ([Dirac](https://dirac.run/posts/cache-hit-rates-agents),
  from OpenRouter data): Anthropic first-party 79–89%, OpenAI about 93%, DeepSeek 87%,
  Moonshot 85%; Gemini varies widely.

## 5. Cost model

### Cost per agent run, by size

*Derived:* each model's list price applied to three token profiles. Units are millions of tokens.

| Profile | Uncached input | 5-minute cache write | Cache read | Output | Basis |
|---|---|---|---|---|---|
| S (small triage run) | 0.01 | 0.05 | 0.2 | 0.005 | Assumed |
| M (one review run) | 0.022 | 0.179 | 0.782 | 0.016 | Cloudflare reviewer average |
| L (hard issue to PR) | 0.2 | 0.5 | 14.3 | 0.333 | Shaped to AA Opus 5.5 max ($13, 15.6M tokens) |

| Model | S | M | L |
|---|---|---|---|
| Fable 5.1 | $1.02 | $3.46 | $28.48 |
| Opus 5 | $0.59 | $2.02 | $19.60 |
| **Opus 5.5** | $0.43 | $1.46 | $12.82 |
| Sonnet 5 / GPT-6 Sol | $0.23 | $0.81 | $7.84 |
| Haiku 4.5 | $0.12 | $0.40 | $3.92 |
| **Kimi K2.7-code (Workers AI)** | $0.12 | $0.40 | $4.71 |
| GLM-5.3 (Workers AI) | $0.16 | $0.56 | $6.16 |
| DeepSeek V4-Flash (Workers AI) | $0.04 | $0.12 | $0.95 |
| GLM-5.3-flash (Workers AI) | $0.02 | $0.06 | $0.70 |

How to read this table:
- **It shows orders of magnitude, not a model ranking.** Models use very different token counts
  for the same task: GPT-6 Sol measures $2.99 per task on AA, not $7.84.
- **Cache reads dominate agent loops.** Opus 5.5 reads cache at 0.05×, so on these loops it costs
  only about 1.6× Sonnet 5, and less than Opus 5.
- For Workers AI models, cache writes are priced at the input rate. Workers AI does not list a
  cache-write price ⚠.

### Unit costs used for the scenarios

These are the cost per attempt. Cost per *merged* change is cost per attempt ÷ success rate. I
assumed 0.6 success for frontier models and 0.5 for open models.

| Job | Frontier (Opus 5.5 / Sonnet 5) | Open (Kimi on Workers AI) |
|---|---|---|
| Implement an issue → PR | $6 (a typical task, about half the size of L) | $2.50 |
| One review run | $1.20 (Cloudflare measured) | $0.40 |
| Triage with a reproduction | $0.80 | $0.40 |
| CI self-heal | $1.50 | $0.40 |
| Nightly scan, per repository | $1.00 | $0.40 |

### Monthly scenarios

Model spend by mix:

| Scenario | Volume per month | All-frontier | Hybrid* | All-open |
|---|---|---|---|---|
| Solo | 20 agent PRs, 40 review runs, 15 triages, 5 CI fixes, 30 nightly scans | ~$300 | ~$235 | ~$135 |
| 5-person team | 150 agent PRs, 400 review runs, 150 triages, 100 CI fixes, 300 scans, 1,500 CI runs | ~$2,550 | ~$1,900 | ~$1,150 |
| 50 engineers | 10× the team | ~$25k | ~$19k | ~$11k |

\*Hybrid: frontier models write the code; Kimi does triage, review, fixes and scans.

Platform costs are in addition:
- **Solo:** about $5–10. The $5 plan plus container use, which barely exceeds what is included.
- **5-person team:** about $100–200.
  - Containers: CI about $65, agent sandboxes about $20.
  - Browser Run and Workflows: pennies.
  - Traces: within the included 20M events.
  - If CI runs on GitHub Actions instead: about $90 at $0.006/min.
- **50 engineers:** about $1–2k.

Conclusions:
- **Writing code is 60–70% of model spend.** In Cloudflare's reviewer, Kimi processed 11.7B
  input tokens and came to about 0% of cost.
- **For a team, the factory adds about $250–500 per developer per month** on top of
  interactive Claude Code seats ($150–250 per developer per month).
- **The biggest real cost is not modelled.** The ADLC post's thesis is that human
  review and ownership is now the bottleneck.

## 6. Subscriptions versus API

- **Anthropic consumer plans (Pro and Max):** the
  [Consumer Terms](https://www.anthropic.com/legal/consumer-terms) prohibit access "through
  automated or non-human means" other than by API key. The
  [Claude Code legal page](https://code.claude.com/docs/en/legal-and-compliance) says products,
  including those built on the Agent SDK, should use API keys.
- **The separate Agent SDK credit is paused.** It was announced 2026-05-13 and would have
  covered `claude -p`, the Agent SDK and Actions: Pro $20, Max 5x $100, Max 20x $200. It was
  paused on 2026-06-15 and was still paused on 2026-08-29.
  ([Help article](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan).)
- **The one grey area:** the Claude Code GitHub Action accepts `CLAUDE_CODE_OAUTH_TOKEN` for one
  person's own runs, within "ordinary, individual usage". For organisation-wide secrets the docs
  say to use an API key.
- **Enterprise:** $20 per seat plus usage at API rates, so it gives no token subsidy.
- **GitHub Copilot:** moved to usage-based AI Credits (1 credit = $0.01) on 2026-06-01.
  - Pro+ costs $39 for $70 of credits; Max costs $100 for $200.
  - Credits are charged at provider list prices, so this is roughly a 45–50% token discount for
    Copilot's cloud agent.
  - The cloud agent also uses Actions minutes, and agent PRs are charged to the human co-author.
- **OpenAI Codex:** the docs say CI should use an API key and pay API rates.
- **OpenCode Zen:** roughly list price plus the card fee (4.4% + $0.30).
- **OpenCode Go:** $10/month ⚠ limits only from a third party.
- **Other seat products, for comparison:**
  - Devin: Pro $20, Max $200, Team $80 + $40/user; overage at API pricing.
  - Cursor: Pro $20 to Ultra $200.
  - Factory: Pro $20 to Max $200.
- **Bottom line:** budget an always-on shared factory at API rates.

## 7. Risks

1. **Runaway loops.** The example self-heal step has a 5-hour timeout, and P99 review cost is
   3.7× the mean. Cap tokens or dollars on every agent step, using AI Gateway rate limits,
   Anthropic `task_budget`, Managed Agents session budgets or Stripe Projects per-provider caps.
2. **Reruns and retries.** Cloudflare reviews each merge request 2.7 times, and benchmark
   success is around 60%. Budget per merged change, not per run.
3. **Pricing changes in flight:**
   - Traces billing starts 2026-10-01.
   - AI Gateway logs changed 2026-09-24.
   - Flagship and `@cloudflare/ci` have no published price.
   - The Gemini Flash promotion ends 2026-12-31.
   - The Anthropic Agent SDK credit could return.
4. **Access:** Artifacts is in closed beta, and `@cloudflare/ci` depends on it. Kimi K2.7-code
   needs Workers Paid.
5. **Container sleep settings** control memory and disk spend.

## 8. Cheapest way to start

1. Run triage and review on **Kimi K2.7-code via Workers AI**, as Astro does. Expect about
   $20–50/month solo.
2. Use Opus 5.5 or Sonnet 5 only for writing code, and split work into tiers by risk, as
   Cloudflare's reviewer does (trivial reviews average $0.20).
3. Keep prompt caching on everywhere: stable prefixes, a deterministic tool order, and 1-hour
   TTL where turns wait on humans. Anthropic measured caching cutting agent-loop cost by
   2.5–3.7×.
4. Run nightly scans that are not tool loops through the Batch API (50% off). Use DeepSeek
   off-peak hours when using DeepSeek.
5. Prefer Code Mode or a typed API over large MCP tool lists to cut input tokens.
6. Set a hard monthly cap on day one. A solo factory at about **$150/month** is realistic.

## Sources not linked above

- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) and
  [limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Workflows pricing](https://developers.cloudflare.com/workflows/reference/pricing/)
- [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [Containers pricing](https://developers.cloudflare.com/containers/pricing/) and
  [Sandbox pricing](https://developers.cloudflare.com/sandbox/platform/pricing/)
- [Browser Run pricing](https://developers.cloudflare.com/browser-run/pricing/)
- [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/) and
  [Traces](https://developers.cloudflare.com/workers/observability/traces/)
- [Agents tracing](https://developers.cloudflare.com/agents/runtime/operations/observability/tracing/)
- [Analytics Engine pricing](https://developers.cloudflare.com/analytics/analytics-engine/pricing/)
- [AI Gateway pricing](https://developers.cloudflare.com/ai-gateway/reference/pricing/)
- [Artifacts pricing](https://developers.cloudflare.com/artifacts/platform/pricing/) and
  [limits](https://developers.cloudflare.com/artifacts/platform/limits/)
- [Dynamic Workers pricing](https://developers.cloudflare.com/dynamic-workers/pricing/)
- [Workers Builds limits and pricing](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/)
- [R2](https://developers.cloudflare.com/r2/pricing/),
  [D1](https://developers.cloudflare.com/d1/platform/pricing/),
  [Queues](https://developers.cloudflare.com/queues/platform/pricing/)
- [Flue sandboxes](https://flueframework.com/docs/guide/sandboxes/) and
  [Cloudflare target](https://flueframework.com/docs/guide/cloudflare-target/)
- [Claude Code GitHub Actions](https://code.claude.com/docs/en/github-actions)
- [GitHub Copilot billing change](https://github.blog/news-insights/company-news/github-copilot-is-moving-to-usage-based-billing/)
  and [Copilot model pricing](https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing)
- [GitHub Actions runner pricing](https://docs.github.com/en/billing/reference/actions-runner-pricing)
- [OpenCode Zen](https://opencode.ai/docs/zen/)
- [Artificial Analysis coding agents](https://artificialanalysis.ai/agents/coding-agents)
