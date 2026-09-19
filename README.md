# sgc-swarm

**Live: https://choco.sgc-swarm.workers.dev** · raw data: [`/api/events.csv`](https://choco.sgc-swarm.workers.dev/api/events.csv)

Tracks the Chocó (Colombia) earthquake sequence that followed the M7.4 San José
del Palmar earthquake of 2026-08-10 12:34:27 UTC, and its Gutenberg–Richter
b-value. Built for a Spanish-speaking seismologist, so the page is Spanish first
with an English toggle.

- **Source**: the Servicio Geológico Colombiano (SGC) "Consulta Experta SeisComP"
  form. One POST returns every event in a date range and bounding box with id,
  time, location, depth, magnitude and type, phases, RMS, GAP, hypocentral
  errors and review status.
- **CLI** (`core/`): fetch the catalogue to CSV and compute b-values.
- **Web app**: one Cloudflare Worker serving a React page and a JSON API, a D1
  database, and Cron Triggers that keep it up to date.

New to this repo, human or agent? Read [What we learned](#what-we-learned) before
changing anything. Most of it was found the hard way and is not visible in the code.

## Layout

| Path | What |
|---|---|
| `core/` | Shared, runtime-neutral logic: SGC request + HTML parser (`seiscomp.ts`), statistics (`gr.ts`, including the one `computeStats` pipeline), CSV, CLI. Used by the Worker, the browser and Node. |
| `worker/` | Hono API (`index.ts`), ingest rules (`ingest.ts`), D1 access (`db.ts`), response types shared with the page (`api-types.ts`). |
| `src/` | React page: shadcn/ui, TanStack Query/Form/Table v9, Recharts (via shadcn chart), MapLibre GL. `lib/i18n.tsx` holds every user-facing string in `es` and `en`. |
| `migrations/` | D1 schema. |
| `test/`, `worker/test/` | Core tests (Node) and Worker tests (real D1 inside the Workers runtime). Parser fixtures are real SGC responses captured 2026-09-18. |
| `docs/CLOUDFLARE_SPEC.md` | The original design spec. Its §3 lists every verified fact about the SGC endpoint. |

## Develop

```sh
pnpm install
pnpm db:migrate:local     # once, and again whenever database_id in wrangler.jsonc changes (see gotchas)
pnpm dev                  # page + Worker + local D1 on one port

# fill the local database: each call loads one missing week (6 calls on a fresh DB)
curl -X POST http://localhost:5173/api/refresh

pnpm test                 # 55 tests, offline
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
| Cron `*/15 * * * *` | Re-reads the trailing 3 days. While history is incomplete it also loads one missing 7-day chunk per tick. |
| Cron `5 * * * *` | Re-reads the least recently *attempted* 7-day chunk since the mainshock, to catch late revisions. |
| `POST /api/refresh` (the button) | While history is incomplete: loads one missing chunk per call. Otherwise: trailing 3 days, at most once per 5 minutes. Stands down if another run is in flight. |
| The open page | Re-reads `/api/status` every minute and `/api/events` every 5 minutes. |

Ingest upserts by event id, only touches rows whose data changed, marks events
SGC stops returning as removed (never deletes), and changes nothing when the
fetch or parse fails. A response that would retire more than 20% of a window's
events is not trusted for removals.

API: `GET /api/events`, `/api/events.csv`, `/api/stats`, `/api/status`, `POST /api/refresh`.
Filters: `from`, `to` (a bare date is inclusive of that day), `minMag`, `status`,
`includeRemoved=1`, `excludeMainshock=1`, and `mc` on `/api/stats`.

## Deploy

| Thing | Value |
|---|---|
| Worker name | `choco` |
| Cloudflare account | "AI-SDLC", pinned as `account_id` in `wrangler.jsonc` |
| D1 database | `sgc-swarm` |
| `workers.dev` subdomain | `sgc-swarm` (account-wide; shared by every Worker in the account) |

```sh
pnpm exec wrangler whoami      # confirm the account before a first deploy of anything
pnpm db:migrate:remote
pnpm deploy
```

Pushes to `main` run `.github/workflows/ci.yml`: typecheck → tests → build, then on
`main` D1 migrations → `wrangler deploy` → smoke test. **The deploy job fails until
these repository settings exist** (as of 2026-09-18 they do not; deploys have been
done from a laptop):

- secret `CLOUDFLARE_API_TOKEN`: a token with *Workers Scripts: Edit* and *D1: Edit*
- secret `CLOUDFLARE_ACCOUNT_ID`
- variable `PRODUCTION_URL` = `https://choco.sgc-swarm.workers.dev` (optional; enables the smoke test)

`sgc-canary.yml` runs the live SGC test daily so a change to their form is noticed.

A brand-new `workers.dev` hostname takes about a minute to resolve; `curl` returns
`000` until then. That is propagation, not a failed deploy.

---

## What we learned

### The SGC data source (verified live, 2026-09-18)

Endpoint: `POST https://bdrsnc.sgc.gov.co/paginas1/catalogo/Consulta_Experta_Seiscomp/consulta_sismo.php`,
form-encoded, no auth, cookies or CSRF token. Field names are in `buildFormBody`.

- **Dates must be `dd/mm/yyyy`.** Any other shape returns HTTP 200 with zero rows and no error.
- The date filter is date-only and the end date is inclusive. Whether it is
  evaluated in UTC or Colombia time is **not verified**, so ingest always queries
  one day wider on each side and filters by `time` itself.
- **No pagination and no row cap.** The swarm box since the mainshock is ~800 rows,
  ~0.8 MB, ~2 s. All of Colombia for 2026 was 9,917 rows, ~10 MB, ~49 s, in one response.
- **The server sometimes repeats a row.** `parseCatalogHtml` collapses duplicates
  and reports `duplicatesDropped`.
- **Use the bounding box, never the Departamento dropdown.** Posting
  `departamento=11-Chocó` returned 0 rows. The swarm box is `CHOCO_SWARM_BBOX`
  (lon −77.4..−76.1, lat 4.1..5.6).
- **The event id exists only inside link hrefs** (`fases.php?id_sismo=SGC2026pqqmro`),
  which are unquoted. The map link in the same row carries unrounded lat/lon/depth.
- The site's own CSV button (client-side DataTables) and "Generar Excel"
  (`descargar_exel_experta.php`, a plain GET returning .xlsx) both **omit the event
  id and the manual/automatic status**. That is why we scrape the HTML.
- `solutionStamp` is the `date=` parameter of the phases link. It looks like a
  last-modified time; its meaning and timezone are **not verified**. Use it only to
  detect that a row changed.
- Events are revised after the fact: `automatic` → `manual`, magnitude and location
  change, and events can be withdrawn.
- Coverage starts 2018-03-01 (stated on the form page).
- **SGC accepts requests from Cloudflare's network.** Confirmed from the deployed
  Worker; no proxy or GitHub Actions fallback is needed.
- The per-event page `https://www.sgc.gov.co/detallesismo/<id>/resumen` exists but
  returns 403 to `curl` without a browser user-agent.

Dead ends, do not retry:

- The ArcGIS layer `srvags.sgc.gov.co/.../catalogo_de_sismos_2/FeatureServer/0` is a
  **historical** catalogue: 1610 → 2020-12-30, M ≥ 3.5, 16,290 events. It has nothing
  for this sequence. Its `ESP_FECHA` field is null (dates are in `ESP_FECHA_LONG`)
  and it reports `supportsPagination: false`.
- `node-html-parser` (and DOM builders in general) **do not finish** on this page:
  it never closes its `<center>` tags, so the tree nests ~1,500 deep. `htmlparser2`
  in streaming mode parses the same 0.8 MB in ~25 ms. Keep it.
- There is no seismology, Gutenberg–Richter or usable QuakeML package on npm. The
  statistics in `core/gr.ts` are written and tested here.

### The science, and how not to mislead with it

- **The catalogue has a hard floor at M2.0** (67 events at M2.0, 2 below). The
  M0–M3 range the researcher first asked for does not exist in this source.
  Going below the catalogue needs waveform-level detection, not more scraping.
- **Default to the maximum-curvature Mc. The goodness-of-fit estimator is wrong
  here**: the M2.0 cut-off makes it pick Mc = 2.0, which gives b ≈ 0.67 against
  0.75 with MAXC Mc = 2.3. The page shows both and says why.
- **b over time must use one fixed Mc for all windows.** A floating Mc mostly
  measures the network's detection history.
- Treat b from fewer than 50 events as unreliable. The page flags it.
- Reference figures (2026-09-18, 786 events): MAXC Mc = 2.3 → **b = 0.750 ± 0.031**,
  n = 528. 150-event windows drift from ~1.0 in mid-August to ~0.58 in
  mid-September. Tests assert these against the fixture; live values move as SGC revises.
- The drop is larger than its error bars, so it is real *in this catalogue*. But:
  small events are missed right after a M7.4 (the early windows are the least
  reliable), magnitudes mix types (MLr_1 dominates; also MLv, Mw, M), and low b is
  common for intermediate-depth sequences. **A b-value below 1 describes the
  sequence. It is not a forecast, and the page must keep saying so.**
- **There are two clusters**, visible on the map: a shallower one (~40 km) under
  Istmina/Sipí that was still producing M4.6–4.9 events in mid-September, and the
  deep one (~100 km) around the mainshock. They probably deserve separate b-values;
  nothing computes that yet.
- It is a mainshock–aftershock **sequence**, not a swarm. The UI says "secuencia
  sísmica"; "enjambre" would read as technically wrong to a seismologist. The repo
  name predates that.
- **A half-filled database produces a confident, wrong number.** Production once
  showed b = 0.49 because it held only the trailing 3 days. `/api/status` now
  reports `backfill: {done, total}`, and the page warns and demotes b until history
  is complete. Keep that guard whenever ingest changes.

### Concurrency and failure lessons

Each of these was a real bug in production or in review:

- Cron and a visitor's refresh can ingest the same window at once. Inserts are
  therefore **upserts** (`ON CONFLICT(id) DO UPDATE`), and `/api/refresh` stands
  down while a run is in flight. Without both, the second run died on
  `UNIQUE constraint failed: events.id`.
- The in-flight window (150 s) must exceed the longest possible SGC request. The
  Worker caps its fetch at 45 s with one retry for that reason.
- An unfinished run is *in progress*, not *failed*. `lastRun` ignores rows without
  `finished_at`, or the page flashes "la última consulta falló" during every ingest.
- The back-fill fast lane (no 5-minute wait) is only open while SGC is answering.
  After a failed run everyone waits, so a broken SGC is never hammered.
- The sweep orders chunks by last **attempt**, not last success. Otherwise one
  chunk that keeps failing is retried forever and starves the rest.
- **Never let an error response be cached.** A 500 once went out with
  `cache-control: max-age`, and browsers kept showing it after the API recovered.
  Errors are `no-store`; `/api/events` is `no-cache` because the page refetches it
  right after a refresh.
- Look up existing ids in one `IN (...)` query, not one query per event. Per-event
  queries can exhaust the per-invocation subrequest limit on a big chunk.
- `excludeMainshock` filters by `MAINSHOCK_ID`, never by "the largest event in the
  result", which silently drops a real aftershock for any range without the M7.4.
- One statistics pipeline (`computeStats` in `core/gr.ts`) serves the page, the API
  and the CLI. When they were separate they disagreed (window step, end-date rule).
- Ingest runs under `waitUntil`, so closing the tab mid-refresh does not abandon it.
  A partial write is safe: upserts are idempotent and removals are written last.
- Never show a raw database or fetch error to a visitor. Plain message plus next
  step; the technical string goes in a collapsed `<details>`.

Still open: CPU time per invocation has **not been measured** on the Workers free
plan. Runs finish in 1–13 s of wall time. If a run ever fails with a CPU-limit
error, the fixes are the paid plan or smaller sweep chunks (`SWEEP_CHUNK_DAYS`).

### Tooling gotchas

- **`vitest` is held at 4.x**: `@cloudflare/vitest-pool-workers` does not support 5.
  For the same reason `compatibility_date` cannot be newer than the pool's bundled
  runtime (it errored on 2026-09-01; 2026-08-20 works). Everything else is on latest.
- **Local D1 storage is keyed by `database_id`.** Change the id in `wrangler.jsonc`
  and local dev silently gets a new, empty database with no tables (`no such table:
  events`). Re-run `pnpm db:migrate:local` and refill.
- D1 is **not reset between tests** in this pool version; `worker/test` clears the
  tables in `beforeEach`. Tests call the Worker with `createExecutionContext()`
  because the refresh route uses `waitUntil`.
- `wrangler.test.jsonc` exists because the real config has `assets` without a
  directory (the Vite plugin supplies it), which the test pool rejects.
- **MapLibre GL 6 ships its worker as a separate module** that imports a shared
  chunk. Import it with `?worker&url` and `setWorkerUrl`, with `worker: { format: "es" }`
  in `vite.config.ts`. A plain `?url` import works in dev and breaks in production.
  Without any of this the map's `load` event never fires and the map stays blank
  with no error.
- **TanStack Table is v9**, not the v8 that shadcn's data-table docs show:
  `useTable` + `tableFeatures({ rowSortingFeature, sortedRowModel, sortFns, … })`,
  state via the selector passed as `useTable`'s second argument (`table.state`),
  `table.FlexRender`. The package ships its own guides under
  `node_modules/@tanstack/react-table/skills/`. shadcn does not depend on it.
- **Recharts 3 renamed its tick class.** shadcn's chart CSS targets
  `.recharts-cartesian-axis-tick text`, which no longer matches, so axis labels fall
  back to `#666` and fail contrast in dark mode. `ui/chart.tsx` also targets
  `.recharts-cartesian-axis-tick-value`. Re-check this after regenerating the component.
- Recharts charts accept `title` and `desc`; we use them as the charts' text alternative.
- A `ScatterChart` with a time axis derives a single tick on its own. We pass
  explicit weekly `ticks`, shared with the bar chart below it.
- pnpm 12 blocks dependency build scripts. `pnpm-workspace.yaml` allows `esbuild`,
  `workerd` and `sharp`; without that, installs fail with `ERR_PNPM_IGNORED_BUILDS`.
- TypeScript is split into `tsconfig.app.json` (DOM), `tsconfig.worker.json`
  (Workers types) and `tsconfig.node.json`, because DOM and Workers globals conflict.
  Run `pnpm types` after changing `wrangler.jsonc`.
- Tailwind 4 already wraps `hover:` in `@media (hover: hover)`; do not add that guard.
- `src/components/ui/*` is shadcn source that we **have modified** (focus rings,
  slider naming, `CardTitle` as `h2`, chart tick selector, legend wrapping, touch hit
  areas, press scale, no `transition-all`). Re-adding a component with the shadcn CLI
  would overwrite those; use `--diff` first.
- Checking the page headlessly: full-page screenshots often miss the charts and the
  map; scroll and take viewport screenshots instead. Do not click the refresh button
  in a loop: it sends a real request to a government server.

### Interface conventions

Settled in a six-domain interface review (accessibility, layout, copy, typography,
colour, motion). Keep to them:

- **Spanish is the default** regardless of browser language; the toggle's choice is
  remembered per device. Every new string goes into both `es` and `en` in
  `src/lib/i18n.tsx`, which TypeScript enforces.
- **Decimal point everywhere** ("M7.4", "Mc = 2.0"), matching SGC, the CSV and every
  computed number. Never mix in decimal commas.
- Terms: "sismo" only for the mainshock, "evento" for catalogue entries, "valor b",
  "Mc / magnitud de completitud".
- **Red means something failed.** Cautions ("fewer than 50 events", "history
  incomplete") are neutral badges with a warning icon.
- De-emphasise with the secondary text colour, never with opacity: the b-value must
  stay readable exactly when it is least reliable.
- Order by importance: the b-value leads the page, above the filters. On a phone it
  must be within the first screen.
- A failed load shows the error only. It must never draw an empty dashboard that
  tells the reader to change their filters.
- Charts and the map redraw on every filter change, so they do not animate. Entry
  animation is limited to the once-per-load `.enter` rows and respects
  `prefers-reduced-motion`.
- The theme follows the operating system unless overridden; choosing the theme the
  system already uses clears the override (`src/lib/theme.ts`). The map rebuilds on
  theme and language change.
- Map colours stay as hex constants because MapLibre cannot parse the `oklch`
  tokens. Dots carry an outline that contrasts with the basemap, so neither end of
  the depth ramp disappears.
- Numeric table columns align to the trailing edge, use `tabular-nums` (set once on
  the page root) and a true minus sign (`fmtNum`).
- Every control has an accessible name; sliders get theirs through
  `aria-labelledby` on the thumb, which is the element with `role="slider"`.

Not yet verified by anyone: real screen-reader output, a physical touch device,
Safari, and the back-fill and ingest-failure alerts in their live states.

### Ideas discussed, not built

- **"Was it felt in Pereira?"** Apply an intensity prediction equation to each
  event (magnitude, hypocentral distance, depth → Mercalli intensity at a town). A
  rough pass suggested an event in these clusters needs about M4 to be noticed in
  Pereira (46–185 km away), M5 to be clearly felt, M6 to be strong. That pass used
  coefficients written from memory from a shallow-crust equation: **do not ship it**.
  Use an equation for intermediate-depth events and calibrate against SGC's
  "sismo sentido" reports.
- **"Will one be felt soon?"** Standard aftershock forecasting (Omori decay + the
  b-value, as USGS publishes) gives a probability of M ≥ X in the next N days, which
  the intensity step turns into a chance of felt shaking. The Istmina cluster is not
  decaying like a textbook sequence, so model the clusters separately. Present any
  such number as an unofficial estimate with its uncertainty, name SGC as the
  authority, and have the researcher check the method before it goes public.
- Per-cluster b-value, rate and depth over time; migration plots; cumulative
  seismic moment; filtering by RMS/GAP/location error; a view of SGC's revisions,
  which our database records and SGC does not publish.
- Notifications (for example M ≥ 4.5) are a small addition to the cron. Do not
  alert on b itself: it invites reading it as a warning.
- Cross-check against the USGS and ISC catalogues for the same box.
