# Deployment

The app is one Cloudflare Worker (`choco`) with a D1 database (`sgc-swarm`), an Analytics
Engine dataset (`sgc_ingest`) and one Cron Trigger. It runs on the Workers **free plan**.

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

Pushes to `main` run `.github/workflows/ci.yml`: typecheck → tests → build, then on
`main` D1 migrations → `wrangler deploy` → smoke test. The deploy job needs these
repository settings:

- secret `CLOUDFLARE_API_TOKEN`: the "Edit Cloudflare Workers" template plus *Account · D1 · Edit*, limited to your account. Add *Account · Workers Observability · Read* to the same token — or a separate one — if you want `pnpm logs` to work; CI does not need it
- secret `CLOUDFLARE_ACCOUNT_ID`
- variable `PRODUCTION_URL` = the deployed URL, e.g. `https://choco.<subdomain>.workers.dev` (optional; enables the smoke test)

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
