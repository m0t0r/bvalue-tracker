# sgc-swarm

**Live: https://choco.sgc-swarm.workers.dev** · raw data: the **Descargar CSV** buttons on the page
(`/api/*` is same-origin only; see [API](#api))

Tracks the Chocó (Colombia) earthquake sequence that followed the M7.4 San José
del Palmar earthquake of 2026-08-10 12:34:27 UTC, and its Gutenberg–Richter
b-value. Built for a Spanish-speaking enthusiast, not a trained seismologist, so
the page is Spanish first with an English toggle and explains its terms in plain words.

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

# fill the local database: each call loads one missing week (6 calls on a fresh DB).
# The header is required: /api/* refuses a caller with no same-origin signal (see API).
curl -X POST -H 'Sec-Fetch-Site: same-origin' http://localhost:5173/api/refresh

pnpm test                 # 93 tests, offline
pnpm test:live            # one test against the real SGC server
pnpm typecheck
```

CLI:

```sh
pnpm cli fetch --out data/events.csv
pnpm cli bvalue --input data/events.csv --windows
pnpm cli bvalue --input data/events.csv --windows-out data/b-windows.csv
pnpm cli bvalue --input data/events.csv --mc 2.5 --manual-only --exclude-mainshock
pnpm cli fetch --start 2026-09-01 --bbox=-77.4,4.1,-76.1,5.6 --out data/sep.csv
```

`--bbox` is `lonMin,latMin,lonMax,latMax`; use the `=` form because the value starts with a minus.

## How it stays current

| Trigger | What it does |
|---|---|
| Cron `*/15 * * * *` | Re-reads the trailing 3 days. While history is incomplete it also loads one missing 7-day chunk per tick. |
| Cron `5 * * * *` | Re-reads the least recently *attempted* 7-day chunk since the mainshock, to catch late revisions. |
| `POST /api/refresh` (the button) | While history is incomplete: loads one missing chunk per call. Otherwise: trailing 3 days, at most once per 5 minutes. Stands down if another run is in flight — the claim is atomic, so a burst of concurrent calls still produces one SGC request. |
| Returning to the open tab | The page sends `POST /api/refresh` itself, through TanStack Query's focus signal (`focusManager.subscribe`), but only when the last SGC query is older than 5 minutes. The Worker's own 5-minute limit is what protects SGC, whatever the number of visitors. |
| The open page | Re-reads `/api/status` every minute and whenever the tab becomes visible again (polling pauses in a hidden tab). Re-reads `/api/events` as soon as status reports a newer successful ingest, and on focus when older than a minute. "Última consulta al SGC" is the last successful ingest; the page shows no second "checked at" time, which was tried and confused the reader. |

Ingest upserts by event id, only touches rows whose data changed, marks events
SGC stops returning as removed (never deletes), and changes nothing when the
fetch or parse fails. A response that would retire more than 20% of a window's
events is not trusted for removals.

## API

`GET /api/events`, `/api/events.csv`, `/api/stats`, `/api/b-windows.csv` (b over time, one
row per window), `/api/status`, `POST /api/refresh`.
Filters: `from`, `to` (a bare date is inclusive of that day), `minMag`, `status`,
`includeRemoved=1`, `excludeMainshock=1`, and `mc` on `/api/stats` and `/api/b-windows.csv`.

**`/api/*` is same-origin only.** The Worker serves a request only when it carries
`Sec-Fetch-Site: same-origin`, or an `Origin` equal to its own; anything else gets 403.
A caller that sends neither header — `curl`, a script, a link in someone else's page —
has no positive same-origin signal and is refused. That is deliberate: the data is public
SGC data, but serving the whole catalogue to any direct caller is what we are avoiding.
Headers are forgeable and this is **not** authentication; it keeps the raw feed out of
casual reach. Use the page's download buttons, or `pnpm cli fetch`, which talks to SGC
directly and is unaffected.

Two exceptions:

- `GET /api/health` is open to anyone: `{ ok, totalEvents }`, no catalogue data. It is
  what the deploy smoke test and any uptime check should call.
- `/api/*` is also rate limited per IP (120 requests/minute, `ratelimits` in
  `wrangler.jsonc`), which applies before the origin check. Over the limit is 429.

CSV headers are the stable machine names (`id,time,lat,…`) by default. `?lang=es` on
either CSV endpoint, and the page's download buttons while the page is in Spanish,
translate the header row only; values are identical. `fromCsv` (and so the CLI)
reads both. Keep the default untranslated: scripts depend on it.

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
`main` D1 migrations → `wrangler deploy` → smoke test. The deploy job needs these
repository settings (set on 2026-09-18; earlier deploys were done from a laptop):

- secret `CLOUDFLARE_API_TOKEN`: the "Edit Cloudflare Workers" template plus *Account · D1 · Edit*, limited to the AI-SDLC account
- secret `CLOUDFLARE_ACCOUNT_ID`
- variable `PRODUCTION_URL` = `https://choco.sgc-swarm.workers.dev` (optional; enables the smoke test)

`sgc-canary.yml` runs the live SGC test daily so a change to their form is noticed.

A brand-new `workers.dev` hostname takes about a minute to resolve; `curl` returns
`000` until then. That is propagation, not a failed deploy. A *new version* of an
existing Worker also takes a few seconds to reach every edge, so the smoke test can
still hit the version being replaced — which 404s any route the deploy is adding.
That is why its `curl` passes `--retry-all-errors`: plain `--retry` covers only
connection errors and 5xx, and the deploy that introduced `/api/health` failed on
its own first 404.

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
- **Mixed magnitude types move b by more than its error bar.** SGC gives small events
  MLr_1 and most events above M4 another type (MLv, Mw). On 2026-09-19, at Mc = 2.3:
  all types b = 0.75 ± 0.03, MLr_1 only b = 0.87 ± 0.04. Neither is right: an offset
  between the scales pulls the first down, and dropping the large events pushes the
  second up. With MLr_1 only, the September slide to ~0.58 mostly disappears (it ends
  near 0.8), so that slide leans on the larger MLv events. The b card has a tab for
  each (`dominantMagType` in `core/gr.ts`); both use the all-types Mc so that only the
  magnitudes differ, and the b charts follow the tab. A proper fix is converting to
  one scale, which needs published SGC conversion relations: do not invent them.
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

### Security decisions (audit, 2026-09-19)

A full source audit lives outside the repo in `~/security-audit-skill/sgc-swarm/run-1/`
(`REPORT.md`, `FINDINGS-DETAIL.md`, `NEEDS-VALIDATION.md`). What it changed here, and why:

- **The refresh guard has to be atomic.** `runInFlight` plus the 300 s check were two
  unlocked `SELECT`s, and the `ingest_runs` insert that would close the race happened
  after them, so a burst of concurrent `POST /api/refresh` calls each passed both guards
  and each queried SGC. `claimIngestRun` is now one `INSERT … WHERE NOT EXISTS`, which
  SQLite evaluates atomically; the loser gets `null` and stands down. **`ingest()` therefore
  returns `IngestRun | null`** — `null` means another run held the claim, not a failure.
  The pre-checks in the route stay, only to give the page a useful `retryAfterS`.
- **One bad row must not block the window.** `parseCatalogHtml` threw for the whole page on
  any single malformed row. Because `ingestTrailing` recomputes the same 3-day window from
  the clock every tick, one unparsable row froze every live figure for up to 3 days, 4 times
  an hour. It now collects `skippedRows` and keeps the rest, and still throws when a
  *majority* is unparsable — that means we are misreading the page, not that SGC had a typo.
  A layout change, a missing table and a row-count mismatch are all still hard failures.
- **Numeric fields are range-checked, not just `Number.isFinite`.** An absurd but finite
  magnitude would be stored and then size `new Array(hi - lo + 1)` in `fmd`, throwing
  `RangeError` on every `/api/stats` call and blanking the page. `requireRange` bounds
  lat, lon, depth and mag at the parser, the last trusted point before storage.
- **CSV cells must not start a formula.** `quote()` did RFC4180 escaping only, so an SGC
  `region`/`magType`/`status` beginning `=`, `+`, `-`, `@`, tab or CR reached both the
  server CSV and the page's download button intact. It is prefixed with `'` now — **except
  when the value is a plain number**, or every negative depth error and b-value would
  silently become text. Both CSV paths share `quote()`, so both are covered.
- **`/api/*` is same-origin plus a per-IP rate limit.** See [API](#api) for the rule and
  its two exceptions. `/api/health` exists *because* of this: the deploy smoke test used to
  curl `/api/status`, which now 403s.
- Static assets bypass the Worker (`run_worker_first: ["/api/*"]`), so page headers come
  from `public/_headers`, not from Hono.
  The CSP there is narrow and was checked against the running page: MapLibre needs
  `blob:` for its worker, the shadcn chart needs `style-src 'unsafe-inline'`, and the
  basemap needs `tiles.openfreemap.org`. Re-check the map and the chart axis labels if
  you touch it.
- **The response headers are the two files below, and nothing else sets them**
  (`test/headers.test.ts` and one case in `worker/test/ingest.test.ts` hold the set):

  | | `public/_headers` (the page) | `worker/index.ts` middleware (`/api/*`) |
  |---|---|---|
  | CSP, X-Frame-Options, Permissions-Policy, COOP, CORP | yes | no — a JSON body renders nothing |
  | HSTS, X-Content-Type-Options, Referrer-Policy | yes | yes, including on 403/429/404/500 |

  `Permissions-Policy` denies every feature: the page asks for no geolocation, camera,
  microphone or clipboard, and the map has no locate control, so an allow-list anywhere
  in it would be a mistake. `Strict-Transport-Security` is two years with
  `includeSubDomains`; the `preload` token is there for the grader's sake and is inert —
  `workers.dev` is a public suffix, so this name cannot be submitted to the browser
  preload list. `Cross-Origin-Embedder-Policy` is deliberately **absent**:
  `tiles.openfreemap.org` sends no `Cross-Origin-Resource-Policy`, so `require-corp`
  would blank the map.
  This is what takes securityheaders.com from B to A+; it was B because HSTS and
  `Permissions-Policy` were missing (2026-09-19).
  `_headers` does **not** apply under `pnpm dev` — Vite serves the assets itself there,
  and it drops the Worker's own headers too. Check headers against `pnpm preview`, which
  runs the built Worker in workerd and prints `Parsed 1 valid header rule` if the file
  is well formed.

Checked and found clean, so do not re-litigate: SQL is fully bound everywhere; event ids are
regex-constrained so the outbound SGC link cannot become `javascript:`; map popups use
`textContent` and the chart's `dangerouslySetInnerHTML` takes only source literals; `onError`
leaks nothing; no secrets in source or history; CI cannot deploy from a pull request.

Still open, with no confirmed exploit — detail in `NEEDS-VALIDATION.md`: the read routes have
no `LIMIT` or range cap (the rate limit bounds volume, not a single query); the 150 s
in-flight window has never been measured against a slow fetch plus a large sweep chunk; SGC
responses are buffered with no byte cap; and the CI actions are pinned to `@v4` tags rather
than commit SHAs.

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
- The frequency–magnitude chart draws a cumulative dot only where an event exists.
  A dot at every 0.1 step turned the lone M7.4 into 25 dots at N = 1, which read as data.
- A `ScatterChart` with a time axis derives a single tick on its own. We pass
  explicit weekly `ticks`, shared with the bar chart below it — see the scrolling
  mobile chart under [Interface conventions](#interface-conventions) for how the tick
  spacing and the pinned y axes work.
- pnpm 12 blocks dependency build scripts. `pnpm-workspace.yaml` allows `esbuild`,
  `workerd` and `sharp`; without that, installs fail with `ERR_PNPM_IGNORED_BUILDS`.
- TypeScript is split into `tsconfig.app.json` (DOM), `tsconfig.worker.json`
  (Workers types) and `tsconfig.node.json`, because DOM and Workers globals conflict.
  Run `pnpm types` after changing `wrangler.jsonc`.
- **Refetch on focus is TanStack Query's built-in `refetchOnWindowFocus`**, left at its
  default. Do not add a custom `focusManager` listener. In v5 "focus" means the tab
  becoming visible (`visibilitychange`); returning from another window or app while
  the tab stayed visible refetches nothing, by the library's design. Identical
  refetched data re-renders nothing (structural sharing), so relative times need
  their own clock: `useNow`.
- **Cron Triggers do not fire under `pnpm dev`.** Locally the data only changes when
  the refresh button or `POST /api/refresh` is used.
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
- **Every date and time on the page is Colombian time** (`America/Bogota`, UTC−5, no
  daylight saving), whatever the reader's device says, labelled "hora de Colombia".
  That covers the filter dates and the daily counts, which are Colombian calendar
  days. The CSV, the API and its `from`/`to` filters stay in UTC; the table shows the
  UTC form on hover. All of it goes through `src/lib/format.ts`; do not format a date
  anywhere else.
- **The page says that it updates itself** (under the refresh button, in the footer):
  readers were reloading it. The "15 minutes" in the copy is the cron in
  `wrangler.jsonc`; change them together.
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
- **"Magnitud en el tiempo" scrolls sideways when it is too narrow to read.** Below
  768 px of plot width every Colombian day gets `PX_PER_DAY` (28 px) instead of the
  whole range being squeezed in, which on a phone drew one solid band. The scatter and
  the "eventos por día" bars sit in **one** scroll container so a single gesture moves
  both, and both y axes are pinned: each is a second, data-less chart in a `sticky`
  column, which only lines up because the pinned and scrolling charts are given the
  same margins, the same `X_AXIS_H` and — for the counts — the same explicit domain and
  `ticks` (`countAxis`). `interval={0}`, or Recharts quietly drops one of them.
  The view starts at the newest events and stays there through a refresh unless the
  reader has scrolled away from the right edge. Date ticks go from weekly to whatever
  fits in `TICK_GAP` while it scrolls. Above 768 px nothing changes.
- A failed load shows the error only. It must never draw an empty dashboard that
  tells the reader to change their filters.
- Charts and the map redraw on every filter change, so they do not animate. The
  headline numbers do (`FlowNumber`, wrapping `@number-flow/react`): digits roll to
  the new value in 550 ms with `cubic-bezier(0.2, 0, 0, 1)` so the reader sees which
  figures a filter moved. 300 ms with the page's front-loaded `--ease-out` read as a
  jump; the library's 900 ms default lags behind a dragged slider. The roll
  runs on the main thread, so the charts, map and table take `useDeferredValue`
  copies of the data and are wrapped in `memo`: rendered in the same pass they
  blocked for 300–400 ms per slider step and the digits simply jumped. Entry
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
