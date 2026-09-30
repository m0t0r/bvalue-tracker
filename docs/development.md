# Development

## Code layout

| Path | What |
|---|---|
| `packages/seismo/` | `@bvalue/seismo`, the seismology library: Gutenberg–Richter statistics (`gr.ts`, including the one `computeStats` pipeline), mainshock detection (`mainshock.ts`), magnitude arithmetic in whole tenths (`magnitude.ts`), energy and moment ratios (`energy.ts`) and distances on the sphere (`distance.ts`). Knows nothing about SGC, zones or the page; tested on synthetic catalogues only. |
| `core/` | Shared, runtime-neutral logic about *this* project: SGC request + HTML parser (`seiscomp.ts`), the one admission gate every event passes through (`admit.ts`), the zones, the depth groups, the zone's mainshock with SGC's meaning of "reviewed" (`mainshock.ts`), CSV, CLI. Used by the Worker, the browser and Node. |
| `worker/` | Hono API (`index.ts`), the one module that decides what ingest is due (`plan.ts`), ingest mechanics (`ingest.ts`), D1 access (`db.ts`), response types shared with the page (`api-types.ts`), the daily USGS job (`external.ts`) and its digests of USGS's files (`usgs.ts`). |
| `src/` | React pages: shadcn/ui, TanStack Query/Form/Table v9, D3's maths with React's SVG for the monitor's three charts (`components/charts/fmd.tsx`, `b-over-time.tsx`, `magnitude-time.tsx`; Recharts left the repo on 2026-09-30, issue #126), MapLibre GL; D3's maths modules for `src/insights/`, the explanations page, whose claim rules (`claims.ts`) and copy are its own. `lib/i18n.tsx` holds the monitor's strings in `es` and `en`. |
| `migrations/` | D1 schema. |
| `scripts/` | Operator tools that are not part of the Worker: `logs.ts` reads production's logs from the terminal (`pnpm logs`); `fixture-server.ts` serves a build with no Worker behind it, for [render profiles](#profiling-react-renders); `insights-region.ts`, `insights-section.ts`, `insights-block.ts`, `insights-relief.ts`, `insights-history.ts` and `insights-sea-colour.ts` write the insights page's committed data (map outlines; the plate and the cuts; the 3D block's ground, its fine ground and its rupture plane; the past earthquakes of story step 2, from ISC-GEM; the colour of the block's sea, from ESA's Ocean Colour CCI), once, by hand. The 3D block's map image is baked in a browser instead: [The 3D block's map](#the-3d-blocks-map). |
| `test/`, `worker/test/` | Core tests (Node) and Worker tests (real D1 inside the Workers runtime). Parser fixtures are real SGC responses captured 2026-09-18; `api-events-2026-09-24.json` is production's `/api/events` for both zones at 2026-09-24 14:44 UTC, for the insights page's claim rules. `usgs-us6000tjl2-*` are USGS's files for the M7.4 as served on 2026-09-24: the search the daily job sends (`…-match-…`, the exact query `searchUrl` builds for SGC's mainshock), the detail GeoJSON, DYFI's 10 km cells, PAGER's cities and the OAF forecast. |
| `src/**/*.test.ts` | The page's own logic, in a third vitest project (`page`), on `happy-dom`. It lives beside the module it tests because `tsconfig.app.json` is the only project with the DOM lib, JSX and the `@` alias; the same file under `test/` would be typechecked by the Node project, which has none of them. |
| `docs/CLOUDFLARE_SPEC.md` | The original design spec, kept for history. Its §3 lists every verified fact about the SGC endpoint. |

## Local setup

```sh
pnpm install
pnpm db:migrate:local     # once, and again whenever database_id in wrangler.jsonc changes (see Tooling gotchas)
pnpm dev                  # page + Worker + local D1 on one port

# fill the local database: each call loads one missing week (6 calls on a fresh DB).
# The header is required: /api/* refuses a caller with no same-origin signal (see docs/api.md).
curl -X POST -H 'Sec-Fetch-Site: same-origin' http://localhost:5173/api/refresh

pnpm test                 # offline
pnpm test:live            # one test against the real SGC server
pnpm typecheck
pnpm lint                 # oxlint + @shadcn/lint + React's rules (docs/frontend.md, "Design-system lint", "React's lint")
pnpm format               # oxfmt; CI runs `pnpm format:check`
pnpm logs                 # production's own logs, from here (see docs/operations.md)
```

## CLI

```sh
pnpm cli fetch --out data/events.csv
pnpm cli bvalue --input data/events.csv --windows
pnpm cli bvalue --input data/events.csv --windows-out data/b-windows.csv
pnpm cli bvalue --input data/events.csv --mc 2.5 --manual-only --exclude-mainshock
pnpm cli bvalue --input data/events.csv --cluster shallow --windows   # always prints both clusters; --cluster narrows the windows
pnpm cli fetch --start 2026-09-01 --bbox=-77.4,4.1,-76.1,5.6 --out data/sep.csv
pnpm cli fetch --zone tolima --out data/tolima.csv                # the zone's own box and start date
```

`--bbox` is `lonMin,latMin,lonMax,latMax`; use the `=` form because the value starts with a minus.

`bvalue` always prints the mainshock it detects over the whole file (the same rule as the page, see
[the science](science.md#the-mainshock-detected-from-the-catalogue-never-pinned-from-2026-09-24)), and
`--exclude-mainshock` drops that one event, or nothing when there is none. A file that is itself a
date range gets that range's answer, which is why the line says how many events it looked at.

## The 3D block's map

The top of the 3D tab's block is an image of the monitor's map, baked once per theme
(`src/insights/block3d/basemap-{light,dark}.webp`). Redo it only if the block's bounds, the map style or
the pinned towns change:

1. `pnpm dev --port <p>`, then open `/src/insights/block3d/bake-basemap.html?theme=light` in
   `agent-browser` with `set viewport 2048 822 2` (the height is the block's Mercator height at that
   width; the page sizes its own map and prints it in the title). It reads OpenFreeMap and Mapterhorn
   directly, in dev only.
2. Wait until `get title` starts with `ready`, then `screenshot` (4096 × 1644 at scale 2).
3. `cwebp -q 78 <png> -o src/insights/block3d/basemap-light.webp`; the same with `theme=dark`.
4. Look at it before committing: the towns the block pins (`PINNED` in `shared.ts`) must be absent.

## The 3D block's fine ground

`src/insights/block3d/relief.bin.gz` is the block's ground every 0.01°, baked by
`pnpm tsx scripts/insights-relief.ts` (it needs `dwebp` on PATH, from Homebrew's `webp`, to read
Mapterhorn's tiles). It reads three of Mapterhorn's zoom-7 tiles for the land and `block.json`'s GEBCO
grid for the sea floor, checks that its encoding round-trips, and writes gzip. Redo it only if the
block's bounds change: `RELIEF` in `src/insights/block.ts` must cover `block.json`'s box, and the script
refuses to run if it does not. `test/relief.test.ts` holds the committed file to the grid.

## The 3D block's sea

- **Its colour** is `src/insights/block3d/sea-colour.json`, baked by
  `pnpm tsx scripts/insights-sea-colour.ts && pnpm format` from ESA's Ocean Colour CCI through NOAA
  PIFSC's ERDDAP (one ~6 MB request, no key). ERDDAP's grid is 0–360° east with latitude listed north
  to south; a query with negative longitudes answers an opaque 404 or 500. The script writes one line,
  which `pnpm format` then spreads out. Redo it for another box or a newer span of years.
- **Its swell** comes from `/api/sea`, which is empty in a fresh local database until the daily job
  has run. Apply the migrations (`pnpm db:migrate:local`), then run the job once against `pnpm dev`:
  `curl 'http://localhost:5173/cdn-cgi/handler/scheduled?cron=7+11+*+*+*'` (the port is `pnpm dev`'s).
  That is one request to Open-Meteo and USGS's daily run; **it never reaches SGC**. Without it the
  block draws its usual sea and the key says no forecast is at hand.
- **A camera anywhere, for a headless check**: in `pnpm dev` only, `?cam=x,y,z,tx,ty,tz` on
  `/insights?tab=3d` puts the viewer's camera at `x,y,z` looking at `tx,ty,tz` (km, x east, z south,
  y up; `?cam=-30,45,120,-170,0,10` is low over the open sea). `agent-browser`'s mouse wheel does not
  reach the canvas, so this is how to get a close-up.

## The map's placeholder pictures

`src/components/map-preview/{choco,tolima}-{light,dark}.webp` are the monitor map's placeholder: each
zone's opening view, without the events (see [the page](frontend.md#interface-conventions)). Redo them
when `VIEW`, the basemap style or the relief changes (all three in `map-style.ts`, which the live map
draws from too):

1. `pnpm dev --port <p>`, then open
   `/src/components/bake-map-preview.html?zone=choco&theme=light` in `agent-browser` (any viewport over
   1024 × 384). It reads OpenFreeMap and Mapterhorn directly, in dev only, and calls no API.
2. Wait until `get title` is `ready`, then write `window.baked` (a WebP data URL, quality 0.7) to
   `src/components/map-preview/choco-light.webp`; `eval 'window.baked'` prints it as a JSON string, and
   the part after the comma is base64. The same for each zone and theme.
3. Look at each before committing: 512 × 192, 5–13 kB, no dots.

## Profiling React renders

What React DevTools' Profiler tab shows (which components rendered in each commit, how often and for
how long) can be read from the terminal, so a change to how often components render comes with
numbers (issue #128). A browser extension's panel cannot be read through `agent-browser` or the
DevTools MCP, but everything in it comes from React itself. Three pieces:

1. **A profiling build: `PROFILE=1 pnpm build`.** The production bundle of `react-dom` records no
   render times. The flag swaps `react-dom/profiling` in for `react-dom/client`, in the page's code
   only, and leaves that code unminified so components keep their names (`reactProfiling` in
   `vite.config.ts`, which says why it is a `resolveId` hook with `enforce: "pre"` and not an alias).
   Without the flag the build is what it was, byte for byte. A profiling build must never be
   deployed, so it is made unable to be: it is the pages alone, in `dist-profile/`, built without the
   Cloudflare plugin, so it has no Worker and leaves `dist/` and `.wrangler/deploy/` (what
   `wrangler deploy` reads) as they were. A first version wrote it to `dist/client` with a warning in
   the build log, and a bare `wrangler deploy` after it would have shipped it (code review).
2. **A stand-in for the DevTools hook: `test/browser/react-profile.js`**, an `agent-browser`
   `--init-script`, so it is there before React loads (which is also what makes React time its
   renders). Its header has the commands: `__prof.on = true`, interact, `__prof.summary()`. It reads
   React's fibers, which are not public API; `src/lib/react-profile.test.ts` holds it to the React
   installed, so an upgrade that moves them fails a test rather than a profile.
3. **A server with no Worker behind it: `scripts/fixture-server.ts`.** It serves a build's files with
   brotli and answers `/api/*` from JSON captured once, by `GET`, from a dev server with a populated
   local database (`capture`, then `serve`; its header has both). Nothing in that setup can reach SGC,
   so the closed-guard bookkeeping of "Checking the page headlessly" below is not needed for a
   profile, and both sides of an A/B read the same catalogue however long it takes. `POST
   /api/refresh` is answered as the Worker answers when it stands down. It is for render profiles,
   not a stand-in for production: of `public/_headers` it keeps only the cache rule for hashed assets
   and the speculation rules' type, with no CSP, and it answers only as `localhost` or `127.0.0.1`.

   ```sh
   pnpm dev --port 5173 &                                  # a checkout whose .wrangler/ has data
   pnpm tsx scripts/fixture-server.ts capture              # GETs only; writes data/api-fixtures.json
   PROFILE=1 pnpm build
   pnpm tsx scripts/fixture-server.ts serve --dir dist-profile --port 4180
   agent-browser --session prof --init-script test/browser/react-profile.js open 'http://localhost:4180/insights?tab=questions'
   ```

**An A/B is the same steps on both builds**: `main` in a second checkout, built with the same flag
and served with `--dir <that checkout>/dist-profile --port 4181` from the same fixtures. Report the
median of three runs, with the commits and the components rendered beside the time. The counts are
exact from run to run (the questions tab's distance slider, five steps: 780 updates in 10 commits on
`main` at `aed8d13`, every run), while the time moved by 10–20 % between identical runs on an idle
laptop. Times are of an unminified build with no CPU throttle: they compare two builds, and are not
what a reader's phone spends.

Driving the page for a profile:

- **A synthetic `.click()` does not move a Radix tab or radio**: dispatch `pointerdown` and
  `mousedown` first. A slider: `focus()` it from a script, then `agent-browser press ArrowRight`
  (never a real Tab: see "Tooling gotchas").
- **`agent-browser open --enable react-devtools` with `react renders start/stop` is not this.** On a
  production build its names are minified and its time columns empty, and its mount counts did not
  agree between two identical runs (2026-09-30). Fine for a first look at a tree, not for an A/B.
- Let the page settle before turning the profile on (2.5 s after `open` was enough for `/insights`),
  or it includes the load's own commits.
- **A row of the summary is a component's name.** Components that share one are summed: every
  insights tab is `Tab`, and an arrow function passed straight to `memo` is `Anonymous`. Name the
  component before reading much into such a row.
- With the React DevTools extension in the browser (or `--enable react-devtools`), the script leaves
  the extension's hook alone and `__prof.summary()` says so in `err`. Use a browser without it.

## Tooling gotchas

- **React's own lint rules run in oxlint as a JS plugin under another name** (issue #129). oxlint
  implements `react-hooks` natively (rules of hooks, exhaustive deps) but not the rules backed by
  React Compiler, and it reserves the name, so `eslint-plugin-react-hooks` is loaded in
  `.oxlintrc.json` as `{ "name": "react-hooks-js", "specifier": "eslint-plugin-react-hooks" }` and its
  rules are `react-hooks-js/<rule>`, in the config and in a disable line alike. `pnpm lint` takes
  about 4 s with it, against 0.5 s before: the plugin runs the compiler's analysis over every
  component. What the rules are and which exceptions stand is in [the page](frontend.md#reacts-lint).
  The two classic rules run from the plugin as well: on oxlint's native `react/rules-of-hooks` and
  `react/exhaustive-deps` the run took 3.6 s, not worth a second implementation beside React's own.
  - **The plugin does not import ESLint**, but names it as a required peer, and pnpm then installs
    ESLint 10 and about 60 packages for nothing. `packageExtensions` in `pnpm-workspace.yaml` marks
    the peer optional. **Changing `packageExtensions` makes pnpm resolve every dependency again**, not
    only the one named: adding this one also moved `wrangler` from 4.136.1 to 4.142.0 in the lockfile
    (put back by hand, then checked with `pnpm install --frozen-lockfile`). Read
    `git diff pnpm-lock.yaml` after touching it, and keep a change of tool versions out of a PR that
    is about something else.
  - **It does not report what the compiler skips for its own limitations**, only what breaks React's
    rules. Those skips show in the build's log once the compiler is on (issue #130).

- **`packages/seismo` is a pnpm workspace package consumed as TypeScript source** (`exports` points
  at `src/index.ts`; there is no build step). Vite, the Worker bundle, `tsx` and vitest all compile
  it in place. Its own `tsconfig.json` has `lib: ["ES2022"]` and `types: []`, so a DOM or Node
  global in the library fails `pnpm typecheck` — that is what keeps it runtime-neutral. Its tests
  are the `seismo` vitest project. Import it as `@bvalue/seismo`, never by a relative path.
- **`Intl.DateTimeFormat.formatRange` changes shape with Node's ICU data**, so a test that pins its
  output can pass locally and fail in CI. en-GB wrote a same-month range "12–18 Sept" on Node 24.11
  (ICU 77) and "12 – 18 Sept" on CI's Node 24.21 (2026-09-26, PR #81). `fmtDayRange` builds the range
  from `fmtDay` and a bare day number instead. Pieces formatted one at a time (`format`, not
  `formatRange`) have been stable here.
- **`vitest` is held at 4.x**: `@cloudflare/vitest-plugin` (renamed from
  `@cloudflare/vitest-pool-workers` in its 1.0; the old name gets no releases) does not
  support 5 in 1.x. Support is [workers-sdk#15500](https://github.com/cloudflare/workers-sdk/pull/15500),
  due as its 2.0, which also moves the Worker tests to workerd's new module registry. Vite+
  1.0 pins Vitest 5, so moving to it waits for that too. `.github/dependabot.yml` ignores
  vitest majors for this reason; drop that rule when the plugin supports 5. Everything else
  is on latest.
- **`compatibility_date` cannot be newer than the test plugin's bundled runtime.** On the old
  pool (runtime 2026-08-15) 2026-09-01 errored. The plugin's 1.3.0 bundles 2026-09-26, and
  the Worker tests pass with that date (2026-09-28); the configs still say 2026-08-20.
- **Local D1 storage is keyed by `database_id`.** Change the id in `wrangler.jsonc`
  and local dev silently gets a new, empty database with no tables (`no such table:
  events`). Re-run `pnpm db:migrate:local` and refill.
- D1 is **not reset between tests** in this pool version; `worker/test` clears the
  tables in `beforeEach`. Tests call the Worker with `createExecutionContext()`
  because the refresh route uses `waitUntil`.
- **SGC is stubbed with MSW, in both test projects** — `msw/node`'s `setupServer` works
  inside the Workers pool as well as under Node (`nodejs_compat` is on). Handlers are
  registered for `SEISCOMP_ENDPOINT` and the server listens with
  `onUnhandledRequest: "error"`, so a test cannot reach `bdrsnc.sgc.gov.co` by accident.
  It replaced `vi.stubGlobal("fetch", …)` and a `fetchImpl` option on `FetchOptions` that
  existed only for tests; `fetchCatalog` now calls `fetch` directly. `msw` is `false` in
  `pnpm-workspace.yaml`'s `allowBuilds`: its build script only copies the browser service
  worker, which nothing here uses. `worker.fetch(...)` in `worker/test` is not a network
  call — it invokes the Worker's own handler, which is the system under test.
- **A plugin that reads the finished `index.html` must be `enforce: "post"`.** Vite 8 emits the
  page late, and a `generateBundle` hook in the normal order finds only `.assetsignore` in the
  client bundle. It was silent: the build passed and wrote no second zone page. `pnpm build`, then
  `ls dist/client/*.html`.
- **Under `pnpm dev` a page path with no file is the Worker's 404**, because the Cloudflare
  plugin applies `not_found_handling` in dev too, and it builds its request from
  `req.originalUrl`, so a middleware that rewrites `req.url` changes nothing. The zone pages'
  dev middleware serves the HTML itself through `server.transformIndexHtml`.
- **`test/live.test.ts` must stay unmocked.** It is the daily canary against the real SGC
  form. `pnpm test:live` runs that file alone, so no MSW server is ever loaded in it.
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
- **There is no chart library and no `ui/chart.tsx`** (2026-09-30, issue #126). The three charts are
  `d3-scale` and `d3-shape` with React's SVG, sharing `charts/svg-chart.tsx`; shadcn's `chart`
  component wraps Recharts, so `shadcn add chart` would bring the package back. Two tests still hold
  our tick rules to what Recharts 3.10.1 chose, from `test/fixtures/recharts-3.10.1-ticks.json`,
  recorded from its own functions before it was removed (`time-ticks.test.ts`,
  `magnitude-ticks.test.ts`): 300 label-thinning cases, and every one of 2,000 axis domains where
  Recharts gave whole tenths. The recording is tied to the tests' seeded generators, by run and by
  domain, so a generator is changed only together with the recorder
  (`test/fixtures/recharts-3.10.1-ticks.recorder.txt`, which says how to run it with the package
  installed in a scratch checkout).
- Each chart's `<title>` and `<desc>` are its text alternative.
- The frequency–magnitude chart draws a cumulative dot only where an event exists.
  A dot at every 0.1 step turned the lone M7.4 into 25 dots at N = 1, which read as data.
- **A chart drawn a new way is checked against the old build pixel by pixel** (issues #118, #125 and
  #126, when the three charts left Recharts; what Recharts cost, and its DOM measuring, is in
  [Performance](performance.md)).
  Serve `main` and the branch with `pnpm preview` on the same catalogue, take each card in both, and
  count the pixels that differ and by how much: rasterisation alone leaves a few hundred at 1–3/255
  (a grid line a step lighter), and anything over ~8/255 is a real difference. In agent-browser
  `screenshot <selector>` came out blank (all white, or all black in dark mode) for these cards, and
  two blank shots compare identical: take the viewport and crop it to the card's
  `getBoundingClientRect`, and look at one image before trusting a count. What a Recharts chart did
  by default and had to be kept is in [the page](frontend.md) ("Distribución frecuencia–magnitud"),
  including its keyboard layer, which only a keyboard walk shows. What issue #125 added to the method:
  - **Scan the tooltip a pixel at a time on both builds**, recording the cursor's x, the tooltip's text and
    the active dots wherever they change. Screenshots at a handful of points passed on "Valor b en el
    tiempo"; the scan showed Recharts reading the wrong window over 58 % of the plot, and four windows
    no pointer could reach. A synthetic `mousemove` on the drawing, two frames apart, drives both builds;
    run it as a job the page keeps going and poll for the result, since a single `eval` that long times out.
  - **When pixels differ, compare the two drawings' coordinates at full precision before anything else**
    (dump the SVG from both and diff the numbers). A grid line at 394.5 instead of Recharts'
    394.50000000000006 moved a pixel row; rounding a coordinate "for tidiness" is a change.
  - **A difference that also touches pixels outside the chart is the rasteriser's**: one case differed
    by up to 11/255 along a grid line, the edges of a shaded stretch, the card's corners and the CSV
    button's icon, with every coordinate equal, the same on every run of each build.
  - **Send arrow keys as in-page events** (`dispatchEvent(new KeyboardEvent("keydown", …))` on the focused
    drawing, which React handles like a real one): `agent-browser press ArrowLeft` and `press Enter` each
    came back to a blank relaunched browser mid-walk, on both builds, the same failure as the Tab key
    below.
  **A real Tab key press can hang headless Chrome on macOS** (2026-09-29): sent through the DevTools
  protocol (`Input.dispatchKeyEvent`) to a page with nothing focusable, the browser process sat at 100 %
  CPU in the system's key-shortcut handling (`NSMenu`) and stopped answering for good; the shared Chrome
  on :9222 had to be restarted. `agent-browser press Tab` on this page once came back to a blank
  relaunched browser too. Focus in the page instead (`element.focus()` from a script), then send the
  arrows and Enter, and measure in a Chrome of your own (`--remote-debugging-port` on a free port and a
  scratch `--user-data-dir`), not the shared one.
  **`pnpm preview` goes on serving the build it started with** (issue #126): after `pnpm build` the
  same process still answered with the old chunks, and a comparison came out "unchanged" against a
  build that had changed. Restart it after every build. **Match Recharts' number formatting before
  chasing a difference at a bar's edge**: it writes a bar's coordinates to four decimals, and the same
  bars written as full floats (24.379999999999995 for 24.38) came out a step apart along some edges,
  ~200 pixels on a phone's card; rounded the same way, the card was identical to the pixel. To compare
  a chart whose marks changed size on purpose, build once with the old size and compare that.
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
  the refresh button or `POST /api/refresh` is used. The daily USGS job never runs locally either,
  so `/api/context` answers all `null` there until a test or a stub says otherwise.
- **`scheduled()` runs only the patterns it knows** (`INGEST_CRON`, `PRODUCTS_CRON`); any other
  logs `unknown cron pattern` and does nothing, on purpose (an unplanned ingest would be an
  unplanned request to SGC). So `wrangler dev --test-scheduled` needs the pattern:
  `/__scheduled?cron=*/15+*+*+*+*` for an ingest tick, which reaches the real SGC, and
  `/__scheduled?cron=7+11+*+*+*` for the USGS job. A bare `/__scheduled` does nothing.
- **A worker test reads a non-code file with `?raw`** (`*.html?raw`, `*.json?raw`, `*.jsonc?raw`,
  declared in `worker/test/env.d.ts`): the Workers pool has no filesystem, and this is how
  `external.test.ts` reads `wrangler.jsonc` to hold the cron patterns to the code.
- Tailwind 4 already wraps `hover:` in `@media (hover: hover)`; do not add that guard.
- **Tailwind 4's `outline-none` sets `--tw-outline-style: none`**, so a later
  `focus-visible:outline-2` on the same element draws nothing. Leave `outline-none` off an element
  that shows focus with an outline.
- **`scale-*` sets the CSS `scale` property, not `transform`**: a transition must list `scale`, or
  the press snaps.
- **MapLibre's stylesheet loads after `index.css`** (it comes with the map's chunk), so overriding a
  rule of the same specificity needs `.maplibregl-map` in front.
- tw-animate's `slide-in-from-bottom-10` is 10 % of the element, not 2.5rem.
- `src/components/ui/*` is shadcn source that we **have modified** (focus rings,
  slider naming, `CardTitle` as `h2`, touch hit
  areas, press scale, no `transition-all`, the lint's extra `Button` sizes and variant and
  `Table`'s `size`, focus outlines on tab panels, the Sheet's `motion-safe:` slides, default `name`s on Slider and Switch (#73), the
  card header's grid). Re-adding a
  component with the shadcn CLI would overwrite those; use `--diff` first. oxfmt formats this
  directory in shadcn's own style (no semicolons, 80 columns) so that diff stays readable.
- **oxfmt leaves Markdown alone** (`**/*.md` in `.oxfmtrc.json`). It pads every table to its
  widest cell, which pushed these hand-wrapped docs' table rows past 140 columns and rewrote a
  closed postmortem without changing a word of it.
- **An `oxlint-disable-next-line` for a JSX attribute goes inside the tag**, as a `//` line
  directly above the attribute. A `{/* … */}` comment above the element stops matching as soon
  as oxfmt breaks the element's attributes onto their own lines.
- **Headless Chrome does not match `pointer: coarse`**, even with `agent-browser set device`,
  so the touch sizes cannot be seen that way. To measure them, rewrite the rules in the page:
  walk `document.styleSheets` and set every `CSSMediaRule` whose `media.mediaText` mentions
  `pointer: coarse` to `all`.
- **Checking the page headlessly**: `agent-browser` (CLI, on PATH) drives a real
  browser against `pnpm dev`; `agent-browser skills get core` is its own guide. Full-page
  screenshots often miss the charts and the map, so scroll and take viewport screenshots
  instead. A chart's marks are real DOM nodes — a dot on "Magnitud en el tiempo" is
  `path#<event id>`, and a mouse move within 8 px of it raises its tooltip. The map is a canvas: its popups cannot be reached
  by selector.
  **Give it data without touching SGC.** Copy a populated `.wrangler/` from another
  checkout, then, in the copy only, close the refresh guard and complete the back-fill:
  - **The guard is two checks, both counted over the zone's `refreshMinIntervalS` (15 min).**
    `refreshPlan` measures it from the newest run's `started_at`, the claim in `ingest()` from any
    run's `finished_at`. Setting `finished_at` to now (the old advice here) holds for fifteen
    minutes and then lets a focus refresh through to SGC. For a session, put both columns of each
    zone's newest row a month ahead (`started_at` a second before `finished_at`). The line under
    the refresh button then reads "Última consulta al SGC: dentro de N días" ("Consulta al SGC:
    dentro de ~N d" on a phone), which is the copy saying so. For screenshots with a realistic
    time, answer `/api/status` through `fault.js` with the real body and `finishedAt` moved back.
    Its rules are set from `localStorage`, so an init script that sets them and then runs
    `fault.js` (both in one file) needs no `eval`.
  - **A copy goes stale by itself.** `backfill.total` counts sweep chunks from the zone's start
    to *now* (`sweepChunks`; Chaparral's are one day), so a copy that was complete yesterday is
    `done < total` today, and opening the page starts the back-fill loop against SGC. An empty
    database is the extreme case: the page back-fills on load, in a loop, with no wait between
    requests. In the copy, give every missing chunk a successful `sweep` row with no events
    (`sweepChunks(<a month ahead>, zone)` lists the windows), future-dated like the row above.
    The page is then missing the days the copy never had, which no layout or timing check cares
    about.
  Check `/api/status?zone=` for **every** zone and confirm `backfill.done == backfill.total`
  before opening a browser on it, and again on another day. Do not click the refresh button in
  a loop.
  **A state the database will not produce is stubbed at the network, not faked in D1.**
  `agent-browser network route '**/api/status*' --body <json>` puts the page in any state
  — a failed last run, `backfill.done < total` — without touching the Worker. Stub
  `**/api/refresh` in the *same* session and before the first `open`: an incomplete
  back-fill makes `StatusBar`'s effect start the back-fill loop by itself, up to 40
  `POST /api/refresh` calls with no wait, and that is the one path that reaches SGC. This
  is how the back-fill and failure alerts were finally looked at (2026-09-20).
  **Profiling: Chrome DevTools MCP and `agent-browser` on one browser** (2026-09-26). The MCP
  server (`chrome-devtools-mcp`) gives performance traces with DevTools' own insights (LCP
  breakdown, layout-shift culprits, request chains, forced reflows) that `agent-browser` does not.
  Start one Chrome with `--remote-debugging-port=9222` and a throwaway `--user-data-dir`, register
  the server with `--browserUrl http://127.0.0.1:9222`, and `agent-browser connect 9222`: both then
  drive the same tabs. A newly registered MCP server is only loaded when the agent session starts.
  The server writes trace files only inside its workspace roots. **`agent-browser network route`
  covers only its own session's pages**, not tabs the MCP opens, so the D1 guard above is what
  keeps those away from SGC. Trace against `pnpm build && pnpm preview`, not `pnpm dev`: dev
  serves unbundled modules and says nothing about the shipped page.
  **Neither tool can show a prerender** (issue #107, 2026-09-29). Chrome refuses to prerender while a
  DevTools-protocol session is attached to the page's own target rather than through its tab target
  (`PrerenderingDisabledByDevTools`; `HasSessionsWithoutTabTargetSupport` in Chromium's
  `devtools_instrumentation.cc`), and on the shared Chrome something always is: a click then uses
  the prefetched HTML and reports `activationStart` 0. What worked is a private headless Chrome on
  another port and a small script on Node's own `WebSocket` that attaches to the tab
  (`Target.getTargets` with `filter: [{ type: "tab" }]`, then `Target.setAutoAttach` on that session,
  which also brings the prerender's own target). Resume a prerender target
  (`Runtime.runIfWaitingForDebugger`) before enabling anything on it: `Network.enable` on a paused
  one never answered, and the click waited for it. To fake a state, answer `/api/status` and
  `/api/refresh` with the `Fetch` domain on every session, the prerender's included, before it runs.
  **Never make the back-fill incomplete in the copied D1 to test this**: an incomplete back-fill
  skips the refresh throttle (`fastLane` in `worker/plan.ts`), so the closed guard above no longer
  holds and a refresh goes to SGC.
  **`getComputedStyle` returns `oklch()` here, not `rgb()`**, so anything parsing it for
  channel numbers silently reads the lightness as a red channel and reports nonsense
  ratios. Rasterise instead: `ctx.fillStyle = <colour>; ctx.fillRect(0,0,1,1)` on a 1×1
  canvas and read `getImageData`, which gives the sRGB the screen actually shows.
