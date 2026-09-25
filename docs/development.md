# Development

## Code layout

| Path | What |
|---|---|
| `packages/seismo/` | `@bvalue/seismo`, the seismology library: Gutenberg–Richter statistics (`gr.ts`, including the one `computeStats` pipeline), mainshock detection (`mainshock.ts`), magnitude arithmetic in whole tenths (`magnitude.ts`), energy and moment ratios (`energy.ts`) and distances on the sphere (`distance.ts`). Knows nothing about SGC, zones or the page; tested on synthetic catalogues only. |
| `core/` | Shared, runtime-neutral logic about *this* project: SGC request + HTML parser (`seiscomp.ts`), the one admission gate every event passes through (`admit.ts`), the zones, the depth groups, the zone's mainshock with SGC's meaning of "reviewed" (`mainshock.ts`), CSV, CLI. Used by the Worker, the browser and Node. |
| `worker/` | Hono API (`index.ts`), the one module that decides what ingest is due (`plan.ts`), ingest mechanics (`ingest.ts`), D1 access (`db.ts`), response types shared with the page (`api-types.ts`), the daily USGS job (`external.ts`) and its digests of USGS's files (`usgs.ts`). |
| `src/` | React pages: shadcn/ui, TanStack Query/Form/Table v9, Recharts (via shadcn chart), MapLibre GL for the monitor; D3's maths modules for `src/insights/`, the explanations page, whose claim rules (`claims.ts`) and copy are its own. `lib/i18n.tsx` holds the monitor's strings in `es` and `en`. |
| `migrations/` | D1 schema. |
| `scripts/` | Operator tools that are not part of the Worker: `logs.ts` reads production's logs from the terminal (`pnpm logs`); `insights-region.ts`, `insights-section.ts` and `insights-block.ts` write the insights page's committed data (map outlines; the plate and the cuts; the 3D block's ground and rupture plane), once, by hand. The 3D block's map image is baked in a browser instead: [The 3D block's map](#the-3d-blocks-map). |
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
pnpm lint                 # oxlint + @shadcn/lint (see docs/frontend.md, "Design-system lint")
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

## Tooling gotchas

- **`packages/seismo` is a pnpm workspace package consumed as TypeScript source** (`exports` points
  at `src/index.ts`; there is no build step). Vite, the Worker bundle, `tsx` and vitest all compile
  it in place. Its own `tsconfig.json` has `lib: ["ES2022"]` and `types: []`, so a DOM or Node
  global in the library fails `pnpm typecheck` — that is what keeps it runtime-neutral. Its tests
  are the `seismo` vitest project. Import it as `@bvalue/seismo`, never by a relative path.
- **`vitest` is held at 4.x**: `@cloudflare/vitest-pool-workers` does not support 5.
  For the same reason `compatibility_date` cannot be newer than the pool's bundled
  runtime (it errored on 2026-09-01; 2026-08-20 works). Everything else is on latest.
  `.github/dependabot.yml` ignores vitest majors for this reason; drop that rule when
  the pool supports 5.
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
  client bundle. It was silent: the build passed and wrote no `tolima.html`. `pnpm build`, then
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
- **Recharts 3 renamed its tick class.** shadcn's chart CSS targets
  `.recharts-cartesian-axis-tick text`, which no longer matches, so axis labels fall
  back to `#666` and fail contrast in dark mode. `ui/chart.tsx` also targets
  `.recharts-cartesian-axis-tick-value`. Re-check this after regenerating the component.
- Recharts charts accept `title` and `desc`; we use them as the charts' text alternative.
- The frequency–magnitude chart draws a cumulative dot only where an event exists.
  A dot at every 0.1 step turned the lone M7.4 into 25 dots at N = 1, which read as data.
- A `ScatterChart` with a time axis derives a single tick on its own. We pass
  explicit weekly `ticks`, shared with the bar chart below it — see the scrolling
  mobile chart under [Interface conventions](frontend.md#interface-conventions) for how the tick
  spacing and the pinned y axes work.
- **Recharts silently drops a tick whose label would cross the edge of the plot**
  (`isVisible` in its `TickUtils`), and passing explicit `ticks` does not override it.
  That hid the first date on "Magnitud en el tiempo" — 10 August, the day of the
  mainshock, which sits exactly on the domain's left edge. The fix is `padding` on the
  `XAxis` (`FIRST_TICK_PAD`, half a date label wide): it moves the scale, so the label
  stays centred on its own day. `interval="preserveStartEnd"` also shows it, but by
  nudging the label inward, and the room it takes then costs the *second* tick on a
  phone — checked in a browser, since jsdom measures every label as 0 wide and hides
  nothing.
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
- `src/components/ui/*` is shadcn source that we **have modified** (focus rings,
  slider naming, `CardTitle` as `h2`, chart tick selector, legend wrapping, touch hit
  areas, press scale, no `transition-all`, the lint's extra `Button` sizes and variant and
  `Table`'s `size`, the chart legend's swatch colour through `--color-bg`). Re-adding a
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
  instead. Recharts marks are real DOM nodes — a scatter dot is `path#<event id>`, so a
  tooltip can be raised with `hover`. The map is a canvas: its popups cannot be reached
  by selector.
  **Give it data without touching SGC.** Copy a populated `.wrangler/` from another
  checkout, then, in the copy only, set the newest successful `ingest_runs` row's
  `finished_at` to now. That closes the Worker's refresh guard, so neither the page's
  focus refresh nor a click on the refresh button reaches the government server. An empty
  database is the dangerous one: the page back-fills on load, in a loop, with no wait
  between requests. Check `/api/status` and confirm `backfill.done == backfill.total`
  before opening a browser on it. Do not click the refresh button in a loop.
  **A state the database will not produce is stubbed at the network, not faked in D1.**
  `agent-browser network route '**/api/status*' --body <json>` puts the page in any state
  — a failed last run, `backfill.done < total` — without touching the Worker. Stub
  `**/api/refresh` in the *same* session and before the first `open`: an incomplete
  back-fill makes `StatusBar`'s effect start the back-fill loop by itself, up to 40
  `POST /api/refresh` calls with no wait, and that is the one path that reaches SGC. This
  is how the back-fill and failure alerts were finally looked at (2026-09-20).
  **`getComputedStyle` returns `oklch()` here, not `rgb()`**, so anything parsing it for
  channel numbers silently reads the lightness as a red channel and reports nonsense
  ratios. Rasterise instead: `ctx.fillStyle = <colour>; ctx.fillRect(0,0,1,1)` on a 1×1
  canvas and read `getImageData`, which gives the sRGB the screen actually shows.
