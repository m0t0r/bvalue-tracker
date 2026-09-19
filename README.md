# sgc-swarm

**Live: https://choco.sgc-swarm.workers.dev** · raw data: [`/api/events.csv`](https://choco.sgc-swarm.workers.dev/api/events.csv)

Tracks the Chocó (Colombia) earthquake sequence that followed the M7.4 San José
del Palmar earthquake of 2026-08-10, and its Gutenberg–Richter b-value.

- **Source**: the Servicio Geológico Colombiano (SGC) "Consulta Experta SeisComP"
  form. One POST returns every event in a date range and bounding box with id,
  time, location, depth, magnitude and type, phases, RMS, GAP, hypocentral
  errors and review status.
- **CLI** (`core/`): fetch the catalogue to CSV and compute b-values.
- **Web app**: one Cloudflare Worker serving a React page and a JSON API, a D1
  database, and Cron Triggers that keep it up to date.

## Layout

| Path | What |
|---|---|
| `core/` | Shared, runtime-neutral logic: SGC request + HTML parser (`seiscomp.ts`), statistics (`gr.ts`), CSV, CLI. Used by the Worker, the browser and Node. |
| `worker/` | Hono API, cron handler, ingest rules, D1 access. |
| `src/` | React page: shadcn/ui, TanStack Query/Form/Table, Recharts, MapLibre. |
| `migrations/` | D1 schema. |
| `test/`, `worker/test/` | Core tests (Node) and Worker tests (real D1 in the Workers runtime). Parser fixtures are real SGC responses captured 2026-09-18. |
| `docs/CLOUDFLARE_SPEC.md` | Design spec, including every verified fact about the SGC endpoint. |

## Develop

```sh
pnpm install
pnpm db:migrate:local     # once
pnpm dev                  # page + Worker + local D1 on one port

# fill the local database: each call runs one cron tick (repeat ~6x on a fresh DB)
curl "http://localhost:5173/cdn-cgi/handler/scheduled?cron=*/15+*+*+*+*"

pnpm test                 # 47 tests, offline
pnpm test:live            # one test against the real SGC server
pnpm typecheck
```

CLI:

```sh
pnpm cli fetch --out data/events.csv
pnpm cli bvalue --input data/events.csv --windows
pnpm cli bvalue --input data/events.csv --mc 2.5 --manual-only --exclude-mainshock
pnpm cli fetch --start 2026-09-01 --bbox=-77.4,4.1,-76.1,5.6 --out data/sep.csv
```

`--bbox` is `lonMin,latMin,lonMax,latMax`; use the `=` form because the value starts with a minus.

## How it stays current

| Trigger | What it does |
|---|---|
| Cron `*/15 * * * *` | Re-reads the trailing 3 days. On a fresh database it also back-fills one 7-day chunk per tick. |
| Cron `5 * * * *` | Re-reads the least recently checked 7-day chunk since the mainshock, to catch late revisions. |
| `POST /api/refresh` (the button) | Trailing 3 days, at most once per 5 minutes; otherwise answers from the database. |

Ingest upserts by event id, only touches rows whose data changed, marks events
SGC stops returning as removed (never deletes), and changes nothing when the
fetch or parse fails. A response that would retire more than 20% of a window's
events is not trusted for removals.

API: `GET /api/events`, `/api/events.csv`, `/api/stats`, `/api/status`, `POST /api/refresh`.
Filters: `from`, `to`, `minMag`, `status`, `includeRemoved=1`, `excludeMainshock=1`, and `mc` on `/api/stats`.

## Deploy

The Worker is named `choco`; the D1 database keeps the project name `sgc-swarm`.

First time:

```sh
pnpm exec wrangler login
pnpm exec wrangler d1 create sgc-swarm     # put the printed database_id in wrangler.jsonc
pnpm db:migrate:remote
pnpm deploy
```

After that, pushes to `main` deploy through GitHub Actions (`.github/workflows/ci.yml`):
test → typecheck → build → D1 migrations → `wrangler deploy` → smoke test.

Repository settings needed:

- secret `CLOUDFLARE_API_TOKEN`: a token with *Workers Scripts: Edit* and *D1: Edit*
- secret `CLOUDFLARE_ACCOUNT_ID`
- variable `PRODUCTION_URL` = `https://choco.sgc-swarm.workers.dev` (optional; enables the post-deploy smoke test)

`sgc-canary.yml` runs the live SGC test daily so a change to their form is noticed.

## Reading the numbers

SGC publishes nothing below about M2.0, magnitudes mix several types, and recent
events can still be revised. The page defaults to the maximum-curvature Mc: the
goodness-of-fit estimator is fooled by the M2.0 cut-off and gives a b that is
biased low. A b-value below 1 describes the sequence; it is not a forecast.

## Notes for maintainers

- `htmlparser2` in streaming mode is deliberate. The SGC page never closes its
  `<center>` tags; DOM-building parsers do not finish on it.
- MapLibre 6's worker must be imported with `?worker&url`. A plain `?url` copy
  works in dev and breaks in production, because the worker imports a shared chunk.
- `vitest` is held at 4.x because `@cloudflare/vitest-pool-workers` requires it,
  and `compatibility_date` cannot be newer than that pool's bundled runtime.
