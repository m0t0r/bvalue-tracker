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
    chart it becomes (`placeholder`: an `h-80` skeleton by default; the map and the magnitude chart
    draw their real legend beside skeletons of their drawings, since a legend wraps differently at
    each width; the description and "Valor b en el tiempo"'s CSV button come without the chunk).
    A plain box of the wrong height would trade the blocking time for layout
    shift, which is the thing CLS counts.
  - A card that is already on screen (the b-over-time chart on a desktop) still loads
    immediately — one frame after the shell, instead of holding it up.
  - Anything above the b-value stays in the first chunk: the status bar, the groups card and
    the filters. So does the events table, whose placeholder cannot be given the right height
    cheaply (25 rows, and they wrap differently on a phone).
  - **Except the filters' info tip** (2026-09-27): Radix's Tooltip carries Popper and floating-ui,
    which nothing else loads at startup. In the first chunk the tip added 14 kB gzipped to both
    pages' startup JavaScript (176.2 → 190.2 kB on the monitor, 131.0 → 143.8 on `/insights`,
    which has no tooltip but imported a root `TooltipProvider`). Loaded after the first render
    instead (see [the page](frontend.md)), the startup JavaScript is 176.0 and 130.1 kB, and a
    36 kB chunk (13 kB gzipped) arrives at ~120 ms, after LCP. Interleaved cold loads of `pnpm
    preview` against a build of `main`, unthrottled, four each way at 390 px and three at 1280:
    LCP within a frame of `main` (medians 120 and 118 ms at 390), CLS 0, and at 1280 the same one
    long task on both, the charts and the map arriving (~80–95 ms at ~450 ms).
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
- **On a phone the LCP element is the header subtitle, and it is in the HTML** (issue #69,
  2026-09-28). Drawn by React, it could not paint before the whole bundle had downloaded and run.
  The build now writes the header into each zone's page (`src/static-shell.tsx`; how, in
  [the page](frontend.md)), and React replaces it with the same header at the same size. It had
  waited for a way to show the reader's own language without an inline script, which the CSP does
  not allow (no `'unsafe-inline'`, hash or nonce, and none added): the header is there in both
  languages, and a render-blocking classic script, a 0.5 kB file under `/assets/` (`src/boot.ts`),
  writes `<html lang>` and the theme before the first paint so the stylesheet shows the right one.
  - **Lighthouse A/B** against a build of `main` at `2e2909d` (b over time's key), devtools
    throttling, interleaved, same `.wrangler/` copy, every run checked for the build it loaded
    (`network-requests`: only this build asks for `boot-*.js`); medians of three:

    | | FCP | LCP | Speed Index | CLS |
    |---|---|---|---|---|
    | phone `/` | 5425 → 3283 ms | 5425 → 3283 ms | 6589 → 5897 ms | 0 → 0 |
    | phone `/choco` | 5416 → 3298 ms | 5416 → 3298 ms | 7123 → 6427 ms | 0 → 0 |
    | desktop `/` | 164 → 72 ms | 253 → 201 ms | 399 → 345 ms | 0 → 0 |
    | desktop `/choco` | 114 → 74 ms | 200 → 192 ms | 295 → 296 ms | 0 → 0 |

    The phone's LCP node is the static subtitle, reported detached once React has replaced it. Phone
    TBT went 268 → 281 and 291 → 319 ms; against the `main` before `2e2909d` it was 227 → 237 and
    277 → 276 ms, so it is at most React clearing the static copy, and within the runs' spread.
  - **On a desktop the LCP is "Valor b en el tiempo"'s description**, as before (below), in both
    builds. The static header paints first (FCP) but is not the LCP there even when it is the
    largest text: with the bundle blocked the static title is the LCP entry at first paint, at
    exactly React's size (19,851 px² at 1280 px); with it, React replaces that title within ~40 ms of
    the paint and Chrome records only React's node (buffered `largest-contentful-paint` entries,
    unthrottled). Against the `main` before `2e2909d`, where the header was desktop's LCP, it came
    122 → 109 ms on `/` and 113 → 106 ms on `/choco` (n = 6).
  - **`/insights` takes the head script and nothing else**, since its theme and language are decided
    there too: phone FCP 4471 → 4438 ms and LCP 9235 → 9182 ms, desktop LCP 172 → 172 ms (n = 3). The
    extra render-blocking request costs nothing measurable.
  - **A first A/B was spoiled by another session**, which took the branch's preview port mid-run and
    served `main` on it: five "branch" runs had no head script, and made desktop `/` read as 18 ms
    slower. Check each run's requests for the build it loaded, and serve both builds on ports
    nobody else uses.

  **On a desktop the LCP element is "Valor b en el tiempo"'s description** (the card is on screen at
  load and its two lines outweigh the one-line subtitle), which is why it is written into the card's
  placeholder (below). Between 2026-09-26 and `2e2909d` the header's title and subtitle were larger at
  1350 px and took its place.
- **The 2026-09-26 review** (Chrome DevTools MCP traces, then a Lighthouse A/B against a build of
  `main`, same data, `--throttling-method=devtools`, three interleaved runs each; the numbers are
  medians):
  - **On a wide screen the page's API requests start from the HTML** (`core/page-data.ts`,
    `preloadPageData` in `vite.config.ts`): `<link rel="preload" as="fetch" crossorigin>` with
    `media="(min-width: 1024px)"`, the zone's own on each zone page and all five on `/insights`.
    `src/lib/api.ts` builds its URLs from the same functions, since the browser hands a preload
    over only to a request for the identical URL. Desktop LCP on `/` went 544 → 173 ms and on
    `/choco` 512 → 183 ms. **Not on a phone:** preloaded there, the catalogue took the connection
    the scripts needed, and first paint came 1.0 s later on both zones (5.1 → 6.1 s) and 2.2 s later
    on `/insights` (4.2 → 6.4 s), for a story 1.3 s sooner. `fetchpriority="low"` did not help.
    With the `media` query, a phone's first paint is where it was (5.10 s on both builds).
  - **"Valor b en el tiempo" brings its description into the placeholder**
    (`b-over-time-description.ts`, `Deferred`'s `description`), so the desktop's LCP text is drawn
    with the data rather than with the 300 kB chart chunk.
  - **The status bar is drawn with the page** (see [the page](frontend.md)): CLS on a phone 0.036 →
    0 on `/`, 0.035 → 0 on `/choco`. The price is the two date stats arriving with the catalogue
    instead of with `/api/status`: Speed Index on `/choco` on a phone 6.0 → 6.7 s against
    `preview`'s uncompressed 333 kB catalogue; brotli makes that gap about a fifth in production.
    Kept by the owner's choice: the shift moved the refresh button under the reader's finger.
  - **`/insights` fetches the opened tab's chunk at startup and reads it with `use`, not `lazy`.**
    `lazy` suspended once even on a chunk already downloaded, and React then held the tab back until
    300 ms after its fallback (`FALLBACK_THROTTLE_MS`): the trace showed the main thread idle from
    the data's arrival until a timer committed the story. **The tab is drawn from a
    `useDeferredValue` copy of the data**, which matters twice. The render runs as a transition, so
    it stays interruptible, as the `lazy` retry had been by accident (with `use` alone, TBT on the
    questions tab rose 210 → 361 ms). And on a desktop, where the preloaded data is there before the
    chunk, a transition that meets the unfinished chunk waits for it instead of committing the
    fallback, so the 300 ms hold does not come back through `use`. LCP, story / questions / 3D: on a
    phone 9.55 → 8.94 s, 9.71 → 9.07 s, 9.32 → 8.69 s (TBT 157 → 146, 212 → 210, 157 → 176 ms: the 3D
    scene now builds inside the measured window); on a desktop 425 → 124 ms, 497 → 200 ms, 495 → 167 ms.
  - What was left was issues #69 (static header, done 2026-09-28, above), #70 (the story's render cost: 1,261 SVG paths in one
    group), #71 (a validator for `/api/events`) and #72 (the map at first paint on desktop `/`).
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
  - The 3D tab (2026-09-25, `vite build`) is its own chunk, 110.9 kB (36.7 kB gzipped: OGL, the
    scene and `block.json`), plus one map image by theme (201 kB light, 116 kB dark), all loaded only
    when the tab opens. The shell went from 26.18 kB to 26.19 kB (the tab's name). three.js would have
    been 575 kB (144.9 kB gzipped) for the same scene; see [the page](frontend.md#the-3d-tab-en-3d-srcinsightsblock3d-from-2026-09-25).
  - The 3D viewer's panel (2026-09-26, `vite build` against `main`) took the 3D chunk from 111.9 kB to
    151.4 kB (37.0 → 49.8 kB gzipped): Radix Dialog for the phone's `Sheet`, `Tabs`, `ToggleGroup`,
    `Switch` and `Field`. Opening the viewer on a 4×-throttled phone measured 152 ms on both builds
    (Event Timing, a real key press). vaul would have added ~17 kB more; see [the page](frontend.md).
  - The raised mountains and the pins' distances (2026-09-26, `vite build` against `main`) took the 3D
    chunk from 147.5 kB to 153.1 kB (48.9 → 51.0 kB gzipped), plus the fine ground's file,
    `relief.bin.gz` (80 kB, fetched once per page when the 3D block is first drawn, after the map
    image; GEBCO's grid shows until it arrives). Raising or lowering the mountains is a uniform
    write, not a new mesh.
  - The live sea, its colour and the compass (2026-09-26, `vite build` against `main`) took the 3D
    chunk from 153.1 kB to 181.7 kB (51.0 → 60.1 kB gzipped): the water's shaders, `sea-colour.json`
    (~2.4 kB gzipped) and the copy. The shell did not move. One more same-origin request, `/api/sea`
    (~11 kB), goes out when the 3D tab first draws. The water is one more draw of a 36,000-vertex mesh
    a frame; its fragment shader sums up to 20 octaves, and fades the ones under a few pixels.
  - The felt-intensity question (2026-09-25, `vite build`) took the questions chunk from 66.9 kB to
    72.2 kB (22.2 → 23.9 kB gzipped), and the shell from 21.3 kB to 25.6 kB (8.5 → 10.0 kB gzipped):
    its rule and its sentences are in `claims.ts` and `copy.ts`, which the shell already loads. One
    more same-origin request, `/api/context`, a few hundred bytes, goes out with the catalogues.
  - The history step (2026-09-25, `vite build`) took the story chunk from 88.4 kB to 93.7 kB (27.2 →
    28.8 kB gzipped): `history.json` and its rules. The shell did not move.
  - USGS's forecast box (2026-09-25, `vite build`, against the same commit built without it) took the
    shell from 26.26 kB to 32.17 kB (10.17 → 12.22 kB gzipped), since its rule and sentences are in
    `claims.ts` and `copy.ts`, and the recheck rule (`context-refresh.ts`) is in `useInsights`; the
    questions chunk from 72.36 kB to 79.53 kB (23.95 → 25.86 kB gzipped) and the story chunk from
    93.78 kB to 94.23 kB (measured on top of the history step). The monitor did not move. No new request on load: the forecast was already
    in `/api/context`. On an open page, one more `/api/context` (a few hundred bytes) per daily job
    run after the forecast is due, on a return to the tab, for two days at most.
- **How sure b over time is** (2026-09-28, against a build of `main` with the same `.wrangler/` copy).
  Every Mc step now also fits the other magnitude reading and each window's own Mc: one step of
  `measure`'s statistics went from a median of 1.1 to 1.7 ms on Chocó and 0.9 to 1.9 ms on Tolima
  (p95 1.8 → 4.0 and 1.7 → 3.4 ms; Node, 200 steps from 2.0 to 3.9, same catalogue). The startup chunk
  grew 52.0 → 52.9 kB gzipped and all JavaScript 887 → 890 kB gzipped (`ReferenceArea` and the key).
  Lighthouse on `/choco`, emulated mobile, three interleaved runs each: score 64 → 69, LCP 6845 →
  5025 ms (the bimodal simulation below, not a gain), TBT 66 → 70 ms, CLS 0 on both.
  - **The Worker pays for `mcOwn` too, and that is kept** (code review, 2026-09-28). `computeStats` on
    the whole catalogue went 0.71 → 1.24 ms (Chocó) and 0.40 → 0.69 ms (Tolima), medians of 200 in
    Node. Only `/api/stats` and `/api/b-windows.csv` call it, on request; the ingest cron never does,
    and the page's CSV button builds its file in the browser. Half a millisecond per request is far
    from the CPU limit; making the field optional would put a flag on the one statistics pipeline
    the page, the API and the CLI share so they cannot disagree.
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
  **A change to what loads when needs `--throttling-method=devtools` and an A/B.** The default
  (simulated) mode replays a fast load on a model network and charges every request that started
  before a paint to that paint, whatever its priority; it scored the preloads above as costing a
  phone 0.8 s of first paint and could not tell `fetchpriority` apart, and it reads a larger
  download started after the paint (the map on desktop `/`) as a slower LCP. Devtools throttling
  really slows the connection. Build `main` in a second worktree with the same `.wrangler/` copy,
  serve it on another port, and alternate the two builds run by run. Its observed LCP and the
  trace's own timings (`audits.metrics…observedLargestContentfulPaint`) say what a browser did.
- **The map's relief shading is its heaviest download, and none of it is on the first load**
  (2026-09-24, `pnpm preview`). One map load fetches, for relief against basemap (vector tiles,
  style, sprites, glyphs): Chocó at 1280 px, 2 tiles, 391 kB against 189 kB; Chaparral, 1 tile,
  245 kB against 145 kB. Declared at their real 512 px, the same views took 6 tiles (985 kB) and
  4 (778 kB); see [the page](frontend.md#interface-conventions) for the 1024 declaration. Mapterhorn
  sends `max-age=604800`, so a repeat visit within the week fetches none. Opened without scrolling
  at Lighthouse's two viewports (412 × 823 and 1350 × 940), the map had not mounted after 10 s and
  no tile of either host had been requested, so the relief could not move a Lighthouse score on `/`.
  **That was Chocó's page, and no longer holds for `/` on a desktop** (2026-09-26): Tolima's page
  has no groups card, so its map row is within `Deferred`'s 600 px at 1350 × 940, and MapLibre, the
  tiles and the relief (~1.5 MB) load at first paint. It does not delay the paint in a browser, but
  Lighthouse's default simulated mode counts it against LCP: desktop `/` scores 86 there, `/choco`
  93. Whether to keep it is issue #72.
- The console must stay empty. The basemap style names sprite images OpenFreeMap does not
  ship (`circle-11`), which MapLibre warns about twice per load, so `event-map.tsx` answers
  `styleimagemissing` with an empty pixel. Real map errors still reach `console.error`.
