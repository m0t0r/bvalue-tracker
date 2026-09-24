# Performance

Measured 2026-09-19 (Lighthouse 13, emulated mobile: slow 4G, 4× CPU). Production scored
**44** — FCP 3.7 s, LCP 5.2 s, TBT 2.1 s, TTI 7.5 s — while desktop scored 96. The whole
difference was JavaScript: one 917 kB chunk plus MapLibre, all of it executed before anything
could be drawn. The rules below are what fixed it; median of 3 runs against `pnpm preview`,
same machine, same data: **46 → 75**, FCP 6.2 → 4.1 s, LCP 6.2 → 4.4 s, TBT 676 → 46 ms,
TTI 14.5 → 8.5 s, CLS unchanged at 0.007. SEO went 91 → 100, accessibility and best
practices stayed at 100.

- **The heavy cards are fetched when the reader nears them, not at load**
  (`src/components/deferred.tsx`). Recharts (~1.3 MB of sources, with its own redux/immer/d3
  stack) and MapLibre (~1.0 MB) are most of what this page ships, and every card that needs
  them sits below the b-value: on a phone the map's top edge is ~4,200 px down. `Deferred`
  mounts its child once an `IntersectionObserver` says it is within 600 px, so the shell and
  the b-value paint first. Deferring the map alone halved TTI; moving the three charts out as
  well took the main chunk from 922 kB to 472 kB (276 → 142 kB gzipped) and did the rest of
  the blocking time.
  - The placeholder is **the same card with the same title** and a skeleton the height of the
    chart it becomes (`height`: `"chart"`, the default, is `h-80`; `"map"` is `h-104`, the
    map's canvas plus legend). A plain box of the wrong height would trade the blocking time for layout
    shift, which is the thing CLS counts.
  - A card that is already on screen (the b-over-time chart on a desktop) still loads
    immediately — one frame after the shell, instead of holding it up.
  - Anything above the b-value stays in the first chunk: the status bar, the groups card and
    the filters. So does the events table, whose placeholder cannot be given the right height
    cheaply (25 rows, and they wrap differently on a phone).
- **The latin font subset is preloaded** by a small plugin in `vite.config.ts` that reads the
  hashed file name out of the bundle. Everything on this page is text, so the largest paint
  waits for that file; once the shell painted earlier than the font arrived, the swap from the
  fallback face became the page's whole layout shift — it roughly tripled CLS in the run that
  first showed it. Preloading it put CLS back where it was. Latin only — the other subsets are
  for text this page never renders.
- **`/assets/*` is cached for a year, `immutable`** (`public/_headers`). Vite puts a content
  hash in every name there, so a changed file is a new URL. Without the rule the asset layer
  answers `max-age=0, must-revalidate` and every repeat visit revalidates the bundle, the
  stylesheet and the font. `index.html` must stay on the revalidating default: it is the file
  that points at the hashed ones.
- **No `compress()` or `cache()` middleware in the Worker, on purpose** (checked 2026-09-22).
  Cloudflare's edge already compresses Worker responses: `/api/events` in production answers
  `content-encoding: br`. `compress()` would spend Worker CPU to produce gzip, which is worse
  than brotli, and CPU is the one budget this Worker runs short of
  ([the CPU budget](ingest.md#the-cpu-budget)). `cache()` uses the Cache API, which is kept
  per data centre, and `cache.delete` purges only the data centre it runs in. The page must
  get the new body right after a refresh (every API route is `no-cache` for that reason), so
  there would be no way to invalidate a cached copy everywhere. A cached response would also
  be up to 15 minutes stale by design.
- **The LCP element is the header subtitle**, and it is drawn by React, so LCP can never beat
  "bundle downloaded and executed" (~1.0 s even unthrottled). Putting a static header in
  `index.html` would fix that, and was left undone on purpose: the CSP has no `'unsafe-inline'`
  for scripts, so the shell could not read the remembered language, and an English reader would
  see the Spanish header until React mounted.
- **Nothing is drawn under the loading skeleton** (`settled` in `App.tsx`). The skeleton is a
  viewport tall so that nothing below it is on screen when the dashboard replaces it. A failed
  load replaces it with a short alert instead, and whatever sat underneath was pulled up into
  view: the "Cómo leer estas cifras" note moved 0.119 of CLS on every failed load (measured
  2026-09-24, API aborted, phone and desktop alike). That note and the footer now wait until the
  catalogue has either loaded or failed; measured the same way, 0. A 4xx is also no longer retried
  (`shouldRetry` in `src/lib/api.ts`), so a refused load shows its error at once rather than after
  TanStack's three backed-off retries, ~7 s.
- **PageSpeed Insights is let through the same-origin check by name.** Its runner (Google's ASN,
  `Chrome-Lighthouse` in the user agent, Cloudflare `verifiedBotCategory` "Search Engine
  Optimization") sends neither `Sec-Fetch-Site` nor `Origin`, so the check answered every
  `/api/*` call 403 and PSI scored the load-error state. Seen on 2026-09-24 in the invocation logs:
  PSI reported mobile 85 with CLS 0.153 and desktop 69 with CLS 0.609, while local Lighthouse against
  production the same morning gave 95 (CLS 0.003) and 99 (CLS 0.002) with both calls answering
  200. [API](api.md) has the exception that fixed it. If PSI's console audit shows 403s again,
  its runner has changed what it sends: read the invocation log before trusting the score. The
  page has no CrUX field data, so PSI's "real users" panel is empty.
- **`/insights` is its own entry, so it costs the monitor nothing** (2026-09-24, `pnpm build`): the
  monitor's initial JavaScript went from 539.5 kB to 541.5 kB (its header link and two strings), and
  D3 appears in no chunk it loads. `/insights` starts at 364 kB — mostly React and the shared UI, the
  same chunks the monitor preloads — and each tab is a lazy chunk on top.
  - The Slab2 plate and its data (`section.json`) took the story chunk from 76.0 kB to 94.1 kB
    (24.1 → 28.9 kB gzipped) on 2026-09-24, `vite build`. Nothing else moved. Chaparral's cut and the
    two locator maps took it to 99.9 kB (30.4 kB gzipped) the same day; its data was already in
    `section.json`.
- **Measuring.** `pnpm build && pnpm preview`, then
  `lighthouse http://localhost:<port>/ --quiet --chrome-flags=--headless=new --only-categories=performance`,
  three times, median. Give the local database data and close the refresh guard first, as under
  [Tooling gotchas](development.md#tooling-gotchas), or the page queries SGC. `preview` serves assets
  **uncompressed**, so its absolute numbers are pessimistic against production — compare runs
  with each other, not with a production score. Add `--blocked-url-patterns='*/api/refresh*'` as
  a second guard: refresh is the one route that reaches SGC. Lighthouse's simulated LCP on preview
  is bimodal (4.4 s or 6.5 s for the same build, first run usually the low one), so take five runs
  and compare medians. The load-error state is not reachable this way — Lighthouse ends the trace
  before the retries do — so check it in `agent-browser` with `network route '**/api/*' --abort`
  and a buffered `layout-shift` `PerformanceObserver` read after ~10 s.
- The console must stay empty. The basemap style names sprite images OpenFreeMap does not
  ship (`circle-11`), which MapLibre warns about twice per load, so `event-map.tsx` answers
  `styleimagemissing` with an empty pixel. Real map errors still reach `console.error`.
