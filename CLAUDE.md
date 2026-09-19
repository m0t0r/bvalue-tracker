# sgc-swarm

Read `README.md` first, in full. Its "What we learned" section holds verified
facts about the SGC data source, dead ends not to retry, the scientific rules the
page must follow, concurrency bugs already fixed, tooling gotchas and interface
conventions. Most of it cannot be inferred from the code.

- Checks before finishing any change: `pnpm typecheck` and `pnpm test`.
- Deploys go to the Cloudflare account pinned in `wrangler.jsonc` (Worker `choco`).
  Run `pnpm exec wrangler whoami` and confirm the account with the user before a
  first deploy of anything new.
- The page is for a Spanish-speaking researcher: Spanish is the default UI language
  for this project only. Talk to the repo owner in English.
- `src/components/ui/*` is shadcn source with deliberate local modifications; do not
  overwrite it with the shadcn CLI without diffing.
- Do not loop requests against SGC (`bdrsnc.sgc.gov.co`). It is a government server;
  tests use the captured fixture in `test/fixtures/`.
