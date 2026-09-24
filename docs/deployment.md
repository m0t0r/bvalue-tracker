# Deployment

The app is one Cloudflare Worker (`choco`) with a D1 database (`sgc-swarm`), an Analytics
Engine dataset (`sgc_ingest`) and one Cron Trigger. It runs on the Workers **free plan**.
The `sgc-swarm` names predate the project's rename to bvalue-tracker and are kept, because
renaming a D1 database means migrating its data.

## Deploying your own copy

1. **Point `wrangler.jsonc` at your account.** It pins `account_id` so a deploy can never
   land in the wrong account; replace it with yours (`pnpm exec wrangler whoami` prints it).
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

## Continuous deployment

Pushes to `main` run `.github/workflows/ci.yml`: typecheck → lint → format check → tests →
build, then on
`main` D1 migrations → `wrangler deploy` → smoke test. The deploy job needs these
repository settings:

- secret `CLOUDFLARE_API_TOKEN`: the "Edit Cloudflare Workers" template plus *Account · D1 · Edit*, limited to your account. Add *Account · Workers Observability · Read* to the same token — or a separate one — if you want `pnpm logs` to work; CI does not need it
- secret `CLOUDFLARE_ACCOUNT_ID`
- variable `PRODUCTION_URL` = the deployed URL, e.g. `https://choco.<subdomain>.workers.dev` (optional; enables the smoke test)

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
`@cloudflare/vitest-pool-workers` was exactly that). It is a separate workflow so that it
flags without blocking. Auto-merge follows CI's conclusion and the deploy needs CI's tests,
and a new advisory must not hold back every Dependabot update or a production fix.

## Scheduled checks

`sgc-canary.yml` runs the live SGC test daily so a change to their form is noticed.
`ingest-health.yml` asks production every half hour how stale the catalogue is, and fails —
which is to say, emails you — when it has gone an hour without a successful ingest. It needs
`PRODUCTION_URL` and nothing else.

## Propagation

A brand-new `workers.dev` hostname takes about a minute to resolve; `curl` returns
`000` until then. That is propagation, not a failed deploy. A *new version* of an
existing Worker also takes a few seconds to reach every edge, so the smoke test can
still hit the version being replaced — which 404s any route the deploy is adding.
That is why its `curl` passes `--retry-all-errors`: plain `--retry` covers only
connection errors and 5xx, and the deploy that introduced `/api/health` failed on
its own first 404.
