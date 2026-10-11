# Deployment

The app is one Cloudflare Worker (`bvalue-tracker`) with a D1 database (`sgc-swarm`) and an Analytics
Engine dataset (`sgc_ingest`). It has **no Cron Triggers** since 2026-10-11, when the project moved to
syncing on demand ([Ingest](ingest.md#on-demand-only)): `wrangler.jsonc` states `"triggers": { "crons":
[] }`, and the first deploy carrying it removed the two that ran until then (the ingest every 15
minutes and the daily USGS job). Keep the empty list rather than deleting the key: a deploy with no
`triggers` key leaves whatever crons are in place. It runs on the Workers **free plan**.
The `sgc-swarm` names predate the project's rename to bvalue-tracker and are kept, because
renaming a D1 database means migrating its data.

## The domain

The site is at **<https://bvalue.site>**, since 2026-10-02: a Cloudflare zone on the free plan, in the
same account as the Worker. `routes` in `wrangler.jsonc` attaches the apex to the Worker as a
**Workers Custom Domain**, so Cloudflare keeps the DNS record and the certificate and every deploy
re-asserts them. Two things have to be true before a deploy carrying that route can succeed:

- **No other record at the apex.** Custom Domains refuse a hostname that already has DNS records;
  the registrar's parking `A` records were deleted for this reason. The deploy fails, it does not
  overwrite them.
- **The deploy token can edit Workers Routes on the zone.** The "Edit Cloudflare Workers" template
  has *Zone · Workers Routes · Edit*; its zone resources have to include `bvalue.site` (or all
  zones in the account).

Everything else about the zone is a dashboard setting, not code, so it is listed here so that a
reset can be noticed and a fork can copy it. As set on 2026-10-02, everything on the free plan:

| Area | Setting | Why |
|---|---|---|
| DNS | apex: the Worker's Custom Domain; `www`: `AAAA 100::`, proxied | `www` only exists to be redirected |
| Rules | Redirect Rule: `www.bvalue.site/*` → `https://bvalue.site/${1}`, 301, query kept | one name for the site; Redirect Rules cost no Worker invocation |
| SSL/TLS | Full (strict), Always Use HTTPS, minimum TLS 1.2, TLS 1.3, HSTS **off at the zone** | HSTS comes from `public/_headers` and `secureHeaders()`; a second copy from the zone would only duplicate it |
| DNSSEC | on, DS record at the registrar | the zone's answers are signed |
| Email | null MX, `v=spf1 -all`, DMARC `p=reject`, empty DKIM key | the domain sends and receives no mail, so nobody can send as it |
| CAA | `0 issue "letsencrypt.org"` | Cloudflare adds the other CAs Universal SSL uses itself |
| Security | WAF custom rule "scanner paths": `ends_with(path, ".php") or path contains "/.env" or path contains "/.git" or starts_with(path, "/wp-") or ends_with(path, ".env")`, Block | an asset miss runs the Worker (`not_found_handling: "none"`), so scanners spent invocations and log events on 404s |
| Security | Bot Fight Mode **off**, Browser Integrity Check on, security level medium | Bot Fight Mode cannot be bypassed on the free plan and would challenge `ingest-health.yml`'s `curl` and PageSpeed Insights |
| Speed | HTTP/3, 0-RTT, Brotli | 0-RTT is replay-safe here: Cloudflare only sends `GET`s early, and no `GET` changes anything |
| Analytics | Web Analytics, *Enable with JS Snippet installation* (the snippet is in the pages) | see [Operations](operations.md#the-domains-analytics) |
| Observability | Traces on, 10% sampled, persisted in Cloudflare | see [Operations](operations.md#the-domains-analytics) |

`.github/workflows/ci.yml` (the smoke test) and `ingest-health.yml` (run by hand) read
`PRODUCTION_URL`, which is `https://bvalue.site`.

## The old URLs

Two older names still answer, and both send the reader to the domain with a 301. A workers.dev
hostname is the Worker's name and is outside any zone, so Cloudflare's Redirect Rules and Bulk
Redirects cannot reach it: in both cases a Worker does it.

- **`bvalue-tracker.<subdomain>.workers.dev`**, the address from 2026-09 to 2026-10-02. The app
  Worker itself redirects its pages (`movedPage` in `worker/index.ts`): `run_worker_first` names
  `/`, `/choco` and `/insights` so that the Worker sees them, and on any host but the old name it
  hands them to the asset layer untouched. `/api/*` is not redirected, so a tab left open on the
  old name keeps working (a 301 would also turn its `POST /api/refresh` into a `GET`). Preview URLs
  (`<version>-bvalue-tracker.…`) never match. `workers_dev: true` is stated in `wrangler.jsonc`,
  because the name has to keep answering for this to work.
- **`choco.<subdomain>.workers.dev`**, the address until 2026-09, when the Worker was called
  `choco`. That name is still a Worker, `worker/redirect/`, which answers every request with a 301
  to the same path and query on `TARGET_ORIGIN` (its `vars`), now the domain, so an old link takes
  one hop. CI deploys it after the app, with `wrangler deploy -c worker/redirect/wrangler.jsonc`.
  It costs nothing extra on the free plan.
  - Its config states `"triggers": { "crons": [] }`. The first deploy under the old name
    replaced the old app Worker, and the empty list is what removed its ingest crons. Leave it
    in, so the redirect can never start polling SGC.

The account's workers.dev subdomain is shared by every Worker on the account. Changing it moves
both old hostnames, and the redirects stop catching them. A fork needs neither: drop
`worker/redirect/` and its CI step, `WORKERS_DEV_HOST` and the page paths in `run_worker_first`.

## Deploying your own copy

1. **Point `wrangler.jsonc` at your account.** It pins `account_id` so a deploy can never
   land in the wrong account; replace it with yours (`pnpm exec wrangler whoami` prints it).
   Replace `routes` with your own domain, or delete it to serve from workers.dev only, and set
   `CANONICAL_ORIGIN` and `WORKERS_DEV_HOST` in `vars` to match (or see "The old URLs").
2. **Create the database** with `pnpm exec wrangler d1 create sgc-swarm` and put the
   returned id in `d1_databases[0].database_id`, then run `pnpm types`.
3. **Enable Analytics Engine once per account**, before the first deploy that carries the
   `INGEST_ANALYTICS` binding: *Workers & Pages → Analytics Engine* in the Cloudflare
   dashboard. Until it is enabled, `wrangler deploy` uploads the assets, resolves the
   bindings, and *then* fails the version call with `code: 10089` — "You need to enable
   Analytics Engine". Creating a blank dataset from that page is the flow that flips the
   switch; name it `sgc_ingest` with binding `INGEST_ANALYTICS` so the dashboard matches
   `wrangler.jsonc` instead of leaving a stray empty dataset beside the real one. It stays
   invisible in the dashboard until the first ingest tick writes to it, which is normal.
4. Migrate and deploy:

```sh
pnpm exec wrangler whoami      # confirm the account before a first deploy of anything
pnpm db:migrate:remote
pnpm deploy
```

## The sync code

"Sincronizar ahora" (`POST /api/refresh`) asks for a 4-digit code, which lives in D1 and never in
the repo ([Security](security.md#the-sync-code-2026-10-11)). **Until it is set, every sync is refused
with a 503**: the guard fails closed. CI applies `0010_sync_guard.sql` on the deploy that carries it;
set the code right after, or apply the migration first (`pnpm db:migrate:remote`, which only adds two
tables) and set it before merging, so there is no window with sync off.

Set it, or change it, with this command. `read -s` keeps the code off the screen and out of the
shell's history, and the table refuses anything but exactly four digits:

```sh
read -rs "CODE?Sync code (4 digits): "; echo; pnpm exec wrangler d1 execute sgc-swarm --remote --command "INSERT INTO sync_code (id, code, updated_at) VALUES (1, '$CODE', datetime('now')) ON CONFLICT(id) DO UPDATE SET code = excluded.code, updated_at = excluded.updated_at"; unset CODE
```

(`read -rs "CODE?…"` is zsh; in bash, `read -rsp "Sync code (4 digits): " CODE`.) A changed code takes
effect at once: a page holding the old one is refused at its next press and asks for the new one,
without counting it as a wrong code. Only the code just replaced gets that; one from two changes back
counts as any wrong guess does.

Lift every lock and forget every caller's wrong codes, for an owner who has locked themselves out:

```sh
pnpm exec wrangler d1 execute sgc-swarm --remote --command "DELETE FROM sync_lockouts"
```

## Continuous deployment

Pushes to `main` run `.github/workflows/ci.yml`: typecheck → lint → format check → tests →
build, then on
`main` D1 migrations → `wrangler deploy` → smoke test. The deploy job needs these
repository settings:

- secret `CLOUDFLARE_API_TOKEN`: the "Edit Cloudflare Workers" template plus *Account · D1 · Edit*, limited to your account. Add *Account · Workers Observability · Read* to the same token — or a separate one — if you want `pnpm logs` to work; CI does not need it
- secret `CLOUDFLARE_ACCOUNT_ID`
- variable `PRODUCTION_URL` = the deployed URL, `https://bvalue.site` here, or `https://bvalue-tracker.<subdomain>.workers.dev` for a fork without a domain (optional; enables the smoke test)

The two secrets are set on the D1 migration and `wrangler deploy` steps only, never on the
job. `pnpm install` runs the build scripts of the dependencies allowed in
`pnpm-workspace.yaml`, and a job-level `env` would expose the deploy token to all of them. A
new step that needs the token gets its own `env`.

## Dependency updates

Dependabot (`.github/dependabot.yml`) opens weekly PRs for npm (pnpm) and GitHub Actions.
Each new release waits a 7-day cooldown first; security updates skip it. Security updates
need two repository settings, **Dependabot alerts** and **Dependabot security updates**
(in the repository's security settings), both on since 2026-09-24 and free for a public repository.
They are settings, not files, so a fork has to turn them on itself. Until that date both were
off, which meant nothing reported a known vulnerability and the "security updates skip it"
above never happened. Patch and minor
updates come as one grouped PR per ecosystem. Majors come one PR each. Majors are ignored
for `vitest` (held at 4.x, see [development.md](development.md#tooling-gotchas)) and
`@types/node` (tracks the Node LTS in CI and `engines.node`).

`dependabot-automerge.yml` merges a Dependabot PR **and deploys it** when all of these hold:
CI passed on its head commit, every commit on it is Dependabot's own signed commit, and
every `update-type` in the commit message is patch or minor. Anything else stays open for a
person, including a PR someone has pushed to. oxlint, oxfmt and `@shadcn/lint` release
often, and a patch or minor bump can add findings or change formatting. CI then fails on
`pnpm lint` or `pnpm format:check`, and the PR stays open until someone fixes it. It runs on `workflow_run`, not
`pull_request`, so it needs neither branch protection nor the repository's auto-merge
setting. A merge made with `GITHUB_TOKEN` does not fire `on: push`, so after merging it
dispatches CI on `main` itself, and the deploy still waits for that run's tests. That job is
also why `ci.yml` has a `workflow_dispatch` trigger and cancels only superseded PR runs,
never a `main` run that may be mid-deploy. A security update is a Dependabot PR like any
other: when it is a patch or minor bump it merges and deploys the same way, with no cooldown.

`audit.yml` runs `pnpm audit --prod --audit-level high` on every PR and push to `main`. It
covers `dependencies` only, the code that ships in the Worker or the page. An advisory in
dev tooling shows up as a Dependabot alert instead: it reaches neither, and one with no
upstream fix would keep a check red for weeks (on 2026-09-24, `sharp` under
`@cloudflare/vitest-pool-workers`, the Workers test package's old name, was exactly that).
**`shadcn` is a dev dependency** (from 2026-10-11): the page uses only its CSS (`@import
"shadcn/tailwind.css"`), which Vite bundles at build time, and nothing of its Node dependencies
ships. As a runtime dependency it failed this check with three high advisories under its CLI
(`@modelcontextprotocol/sdk`, `source-map-js`, and `braces`, which has no fix).
It is a separate workflow so that it flags without blocking. Auto-merge follows CI's
conclusion and the deploy needs CI's tests, and a new advisory must not hold back every
Dependabot update or a production fix.

## Scheduled checks

`security-txt.yml` fails weekly once `public/.well-known/security.txt`'s `Expires` is under 30
days away ([Security](security.md)).

Two checks lost their schedules on 2026-10-11 and run only by hand (`workflow_dispatch`); the
workflows are kept, and each says in its header what would put its schedule back:

- `sgc-canary.yml` runs the live SGC test, so a change to their form is noticed. It ran daily, which
  was a request to SGC no reader had asked for. Run it after a sync fails, to tell a change on SGC's
  side from a fault on ours.
- `ingest-health.yml` asks production how stale the catalogue is, and fails when a zone has gone an
  hour without a successful ingest. It ran every half hour and emailed on failure; with syncs on
  demand a catalogue hours or days old is normal, so it would fail on every run. Run it right after a
  sync to confirm it landed. It needs `PRODUCTION_URL` and nothing else.

## Propagation

A brand-new `workers.dev` hostname takes about a minute to resolve, and a new Custom Domain's
certificate a few minutes more; `curl` returns
`000` until then. That is propagation, not a failed deploy. A *new version* of an
existing Worker also takes a few seconds to reach every edge, so the smoke test can
still hit the version being replaced — which 404s any route the deploy is adding.
That is why its `curl` passes `--retry-all-errors`: plain `--retry` covers only
connection errors and 5xx, and the deploy that introduced `/api/health` failed on
its own first 404.
