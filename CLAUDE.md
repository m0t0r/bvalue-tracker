# bvalue-tracker

Read `README.md`, then the `docs/` file for the area you are changing, in full, before
changing it. They hold verified facts about the SGC data source, dead ends not to retry,
the scientific rules the page must follow, concurrency bugs already fixed, tooling gotchas
and interface conventions. Most of it cannot be inferred from the code.

| Changing | Read first |
|---|---|
| anything statistical, or copy that states a figure | `docs/science.md` |
| the SGC request, parser, cron cadence or request budget | `docs/sgc-data-source.md`, `docs/ingest.md` |
| ingest, D1 queries or indexes, `worker/plan.ts` | `docs/ingest.md` |
| routes, filters, CSV | `docs/api.md`, `docs/security.md` |
| the page: layout, copy, colour, motion | `docs/frontend.md`, `docs/performance.md` |
| logging, alerts, investigating production | `docs/operations.md`, `docs/incidents/` |
| deploy, CI, `wrangler.jsonc` | `docs/deployment.md` |
| tests, build, dependencies | `docs/development.md` ("Tooling gotchas") |

- Checks before finishing any change: `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and
  `pnpm test`. Fix lint errors rather than silencing them; `docs/frontend.md` ("Design-system
  lint") says how the design-system rules are meant to be satisfied and lists the approved
  exceptions.
- `agent-browser` (a CLI, already on PATH) is always available for looking at the
  real page: UI and copy reviews, accessibility checks, screenshots, before/after
  comparisons. Use it rather than reasoning about the rendered page from source.
  "Checking the page headlessly" in `docs/development.md` says how to run the page with
  data and without touching SGC.
- Deploys go to the Cloudflare account pinned in `wrangler.jsonc` (Worker `choco`).
  Run `pnpm exec wrangler whoami` and confirm the account with the user before a
  first deploy of anything new.
- The page is for a Spanish-speaking researcher: Spanish is the default UI language
  for this project only. Talk to the repo owner in English.
- `src/components/ui/*` is shadcn source with deliberate local modifications; do not
  overwrite it with the shadcn CLI without diffing.
- Do not loop requests against SGC (`bdrsnc.sgc.gov.co`). It is a government server;
  tests use the captured fixture in `test/fixtures/`.
- `curl` to SGC is refused by the agent permission classifier. A one-off check from off
  Cloudflare's network needs the repo owner to run it (`! curl -sS -D - -o /dev/null <url>`).
- The repo is public. Keep account names, account-specific dashboard URLs, local paths
  outside the repo and anything personal out of committed docs.
