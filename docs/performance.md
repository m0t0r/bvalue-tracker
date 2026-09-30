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
- **No `ETag` or 304 on `/api/events` either** (issue #71, declined 2026-09-29). `no-cache` with
  a validator would let a repeat request skip the body. It is not worth it, as measured in
  production over the 3 days Workers Logs keeps (`pnpm logs cpu --since 3d`, and the browser
  against production):
  - **The CPU is in the cron, not here.** `GET /api/events`: about 300 calls, a median of 7 ms
    (p90 14, max 25). The `*/15` ticks: 289, a median of 68 ms (p90 153, max 264), and 24 of
    them killed `exceededCpu`: 2026-09-27 07:30–12:00 and 09-27 23:30–09-28 05:30 UTC, nearly
    all wide ticks, most stopped at 10–11 ms, so the 10 ms limit was being enforced as on
    2026-09-20. All the catalogue reads together cost about a ninth of what the ticks cost, and
    none of the ~900 requests in those days ended `exceededCpu`. (The
    calculation counted 298 ticks where the invocation logs hold 289, the most `*/15` can fire in
    72 h, so its counts run a few per cent high; the medians are unaffected.)
  - **A 304 saves little.** It still needs a D1 read to compute the validator (`/api/context`,
    one primary-key read, costs 1 ms), so it saves about 5 ms of CPU, and only on a call where
    nothing changed. The page refetches events *because* status reports a new ingest, and at the
    swarm's rate Tolima's catalogue changes on most ticks. Wall time is D1's round trip (a
    median of 238 ms), which a 304 keeps. On the wire, Tolima's 1,018 rows are 427 kB raw and
    54 kB compressed.
  - **A wrong 304 is worse than the bytes.** It would show a researcher an old catalogue, so the
    validator would have to move on every insert, update and removal (removal stamps only
    `removed_at`) and cover every query parameter.
  - **Revisit** when `/api/events` has a median above 10 ms (its cost grows with a zone's row
    count), or when a request ends `exceededCpu`.
- **On a phone the LCP element is the header subtitle, and it is in the HTML** (issue #69,
  2026-09-28). Drawn by React, it could not paint before the whole bundle had downloaded and run.
  The build now writes the header into each zone's page (`src/static-shell.tsx`; how, in
  [the page](frontend.md)), and React hydrates it (issue #97, below; until then React replaced it
  with the same header, which proved to be the LCP again on a real connection). It had
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
  - **`/insights` took the head script and nothing else** (until issue #120, below), since its theme and
    language are decided there too: phone FCP 4471 → 4438 ms and LCP 9235 → 9182 ms, desktop LCP 172 → 172 ms (n = 3). The
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
    `media="(min-width: 1024px)"`, the zone's own on each zone page and all five on `/insights`
    (on `/insights` at every width since issue #108: the last sentence of this bullet).
    `src/lib/api.ts` builds its URLs from the same functions, since the browser hands a preload
    over only to a request for the identical URL. Desktop LCP on `/` went 544 → 173 ms and on
    `/choco` 512 → 183 ms. **Not on a phone:** preloaded there, the catalogue took the connection
    the scripts needed, and first paint came 1.0 s later on both zones (5.1 → 6.1 s) and 2.2 s later
    on `/insights` (4.2 → 6.4 s), for a story 1.3 s sooner. `fetchpriority="low"` did not help.
    With the `media` query, a phone's first paint is where it was (5.10 s on both builds). **`/insights`
    has preloaded at every width since issue #108** (2026-09-29, below): with brotli, and with its
    story's chunk preloaded too, the trade came out the other way.
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
    group, done 2026-09-28: the bullet on the story's render below), #71 (a validator for `/api/events`, declined 2026-09-29: the bullet on it above) and #72 (the map at first paint on desktop `/`, done
    2026-09-28: the bullet on the map's relief below).
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
- **The stylesheet comes before the bundle in every page's head** (`stylesheetBeforeBundle` in
  `core/page-data.ts`, 2026-09-28, from a PageSpeed run on production `/`). Vite writes it last, after
  the entry script and a dozen module preloads, so on a slow connection the one file the first paint
  waits for shared the line with all of them. It now sits just before the first module script, and
  still after the head script, which would otherwise wait for it (`withBootScript` in `vite.config.ts`;
  the code review caught a first version that put it above). Lighthouse, devtools throttling, `/`
  against a build of `main` at `dfa1e36`, same `.wrangler/` copy, interleaved, medians: phone (five
  runs) FCP and LCP 3344 → 3230 ms (every run: 3327–3355 against 3224–3247), Speed Index 6573 →
  6542 ms, TBT 265 → 268 ms, score 75 → 76; desktop (three runs) FCP 56 → 49 ms, LCP 186 → 179 ms.
  The first version, first in the head, measured the same through a proxy (3339 → 3226 ms).
  - **A first try at inlining the header's CSS was not kept** (issue #97, then done: the next
    bullet). With the rules the static header uses inlined by `beasties` (34 kB) and the stylesheet
    moved to the end of the body, a phone's first paint came at 1377 ms instead of 3339, but LCP at
    5422: the header painted in the fallback face, since Geist arrives ~1.7 s in, and React's copy of
    the subtitle, drawn in Geist and larger, became a new LCP.
- **The header paints from the HTML alone, and stays the phone's LCP** (issue #97, 2026-09-28).
  - **Production's phone LCP was React's header, not the static one.** `pnpm preview` serves the
    stylesheet uncompressed (131 kB), and it arrived after Geist, so the static header painted in Geist
    and React's copy, the same size, did not count again. With brotli, as the edge sends it (20 kB),
    the stylesheet lands first, the header paints in the bare `sans-serif` fallback, and React's copy
    in Geist is larger: 22,110 against 23,529 px², mostly the line height (a line is 1.3 em in Geist,
    ~1.0 in Helvetica or Arial). One cold load of production `/` (Slow 4G, 4× CPU, DevTools MCP): first
    paint 2228 ms, Geist at 2314 ms, LCP 2972 ms on React's subtitle. **Measure load order behind a
    brotli proxy**, or `preview` hides this kind of race (below, "Measuring").
  - **A stand-in face cut to Geist's measure** (`index.css`, see [the page](frontend.md)) made the two
    copies nearly the same size but could not make them equal: a wrapped paragraph's box is as wide as
    its longest line, and the two faces break lines at different words, so the stand-in's box ranged
    0.90–1.13 of Geist's across 320–1350 px and the four strings. `/choco` in English at 412 px (25,185
    against 25,392 px²) still took LCP at React's mount, 3156 ms. It stays, for the font swap: the
    header breaks into as many lines in both faces in 42 of 44 cases, so it keeps its height when Geist
    arrives ([the page](frontend.md) lists the two it does not, and why fontaine could not replace it).
  - **So React hydrates the static header** (`src/lib/hydrate.ts`): no new element, no second LCP
    entry, whatever the widths. `/choco`, same load: one LCP entry, at first paint, 1692 ms, its
    element still in the page.
  - **And the header's CSS is inlined** (`withInlineStylesheet` in `core/page-data.ts`, `headerCss` in
    `vite.config.ts`): `index.css` compiled by Tailwind for exactly the class names in the static
    header, 32 kB (6.2 kB more HTML with brotli: 3.2 → 9.4 kB), in a `<style>` where the stylesheet
    was; the stylesheet at the end of the body, where it holds up only the module scripts, which wait
    for it. The page's CSP already allowed inline styles, and a `<link>` in the body needs no script to
    load it. Checked in DevTools with the stylesheet disabled against it enabled, every header element
    and its `::before` and `::after`: the same computed style in both themes at 412 px (touch) and 1350
    px. A first build missed the buttons' `[&_svg…]` rules, since React writes `&` as `&amp;` in the
    HTML (`classAttributes`), and the link to `/insights` shifted 4 px when the stylesheet landed. `/choco`,
    same load: FCP = LCP 1348 ms.
  - **Lighthouse A/B** against a build of `main` at `1fe45c5`, devtools throttling, both builds behind
    the same brotli proxy, same `.wrangler/` copy, interleaved, every run checked for the build it
    loaded (its stylesheet's hash); medians, phone five runs, desktop seven:

    | | FCP | LCP | Speed Index | TBT | CLS | Score |
    |---|---|---|---|---|---|---|
    | phone `/` | 1672 → 1343 ms | 3165 → 1343 ms | 3208 → 3106 ms | 249 → 227 ms | 0 → 0 | 87 → 95 |
    | phone `/choco` | 1676 → 1344 ms | 3166 → 1344 ms | 3469 → 3229 ms | 306 → 269 ms | 0 → 0 | 85 → 93 |
    | phone `/insights` | 3050 → 3063 ms | 4723 → 4729 ms | 4128 → 4135 ms | 38 → 38 ms | 0 → 0 | 76 → 76 |
    | desktop `/` | 56 → 52 ms | 187 → 190 ms | 331 → 333 ms | 33 → 46 ms | 0 → 0 | 100 → 100 |
    | desktop `/choco` | 57 → 56 ms | 203 → 197 ms | 289 → 290 ms | 7 → 5 ms | 0 → 0 | 100 → 100 |
    | desktop `/insights` | 113 → 102 ms | 145 → 134 ms | 136 → 125 ms | 0 → 0 ms | 0 → 0 | 100 → 100 |

    Every phone run of the branch had its LCP between 1326 and 1382 ms, against 3132–3183 on `main`.
    The desktop differences are within the runs' spread (`main`'s `/choco` alone ran 177–229 ms), and
    its LCP is the page's, not the header's (above). The phone rows are from the build before the
    scrollbar's room (below) and before `useHydrated` became a layout effect, so the page commits in
    hydration's frame; three phone runs after both gave the same (`/` 3154 → 1343, `/choco` 3153 →
    1342 ms).
  - **A hydrated header can shift where a redrawn one could not.** The first A/B read CLS 0.005 on
    both zones on a desktop: when the page mounted under the header, the scrollbar appeared and the
    centred header moved ~8 px aside. React's new header had been drawn in that same frame, and a new
    element is not a shift. The monitor now keeps the scrollbar's room from the first paint
    (`scrollbar-gutter: stable`, on the monitor only: /insights locks scrolling in its 3D viewer, and
    Radix's lock adds that room itself). A phone's scrollbar takes none.
  - **Declined in the code review (2026-09-28):** *inlining only what the header uses.* About a
    third of the 32 kB is `index.css`'s page rules (the map's controls, the charts', the entry
    animations), which a split of `index.css` into a header part and a page part would leave out; the
    brotli'd HTML is 9.4 kB with them, and the split would put the header's rules in a second file to
    keep in step. *Fixing Radix's scroll lock rather than scoping the gutter to the monitor:* the
    monitor has no modal; `index.css` says what to do when one is added.
  - **What a phone paints first is unchanged**: `agent-browser` as an iPhone 14, `main` with its bundle
    blocked against the branch with its bundle and its stylesheet blocked, in {light, dark} × {es, en}
    × {`/`, `/choco`}: 0 pixels differ in all eight. With a desktop's scrollbar at 390 px the branch's
    header sits the scrollbar's width in, which is where both builds' headers end up once the page
    scrolls.
- **The story draws only the scenes the reader is near** (issue #70, 2026-09-28). The story renders
  twice at load: the hero and every step's text when the data arrives (the LCP is the hero's intro,
  at every width), then the pinned drawing once a `ResizeObserver` has measured its box. That second
  pass drew every scene at once, hidden ones included: ~3,600 SVG nodes, 1,825 of them the shared dot
  layer and ~1,100 Chaparral's close-up, as one task of ~390 ms on a 4× phone (171 ms of script, then a
  style recalculation of 137 ms over 3,596 elements, layout and paint), after the LCP. The drawing sits
  below the 80svh hero, so none of it is on screen at load.
  - **A scene's drawing mounts from the step before its first one, and stays** (`mounted` in
    `story/index.tsx`, from the steps' own order): 3,978 → 2,439 elements at load. The map, its dots
    and the scene titles are the first scene's, so they are all still drawn.
  - **The drawing's first render is a transition** (`useSize` sets the size in `startTransition`), so
    React's part of it yields; the style and layout of what it adds are still one piece.
  - **Nothing is drawn, or computed for the drawing, before the box is measured**: the map's and the
    cuts' framing ran once on a zero-sized box.
  - **`insights()` computes Mc and b only** (`headlineStats` in `@bvalue/seismo`, which `computeStats`
    takes its own from). The whole pipeline was half of `insights()`'s time (4.6 ms, 2.6 of them
    `computeStats`, in Node on 853 + 973 events), for two numbers, and it runs every minute.
  - Lighthouse, devtools throttling, `/insights` against a build of `main` at `dfa1e36`, same
    `.wrangler/` copy, interleaved, five runs each, medians, every run checked for the build it loaded:
    phone TBT 258 → 81 ms, score 54 → 59, LCP 10.50 → 10.49 s; desktop LCP 159 → 149 ms, TBT 0 on
    both, CLS 0 everywhere. **The phone's LCP does not move because it waits on the network**, not
    the render: `preview`'s uncompressed catalogues (~770 kB for both zones) take seconds at 1.6 Mbps.
    Cold loads through the DevTools protocol, 4× CPU, no network throttling, seven interleaved runs
    each: the longest task 216 → 129 ms, the time from the data to the LCP 220 → 195 ms.
  - **What was left was per dot, not per load**: each of the 1,825 dots carried its own inline position
    and transition, which no two elements share. Inserted into a detached SVG at 1× CPU, the dots took
    21.7 ms of style, and 57.1 ms when every dot moves (a scene turn); positioned by `cx`/`cy`
    attributes with no transition, 2.7 and 2.6 ms. Issue #94 moved them to a canvas: the next bullet.
  - **The forced reflows DevTools flags on this page add no work** (Radix's `useSize` in the felt
    step's slider, Presence in the tab panels): they pull the page's first layout forward into React's
    commit, and the frame's own layout after them is under a millisecond. They do make that task
    longer, which TBT counts; on the monitor it is larger (issue #95).
- **A link between the pages is prerendered from the moment it is pressed** (issue #107, 2026-09-29).
  Each page is its own entry, so the monitor's link to `/insights` (and `/insights`' link back) was a
  full navigation: new HTML, the bundle's start-up, new API requests. `public/speculation-rules.json`,
  named by a `Speculation-Rules` header on the three pages (`public/_headers`; why a header, in
  [Security](security.md)), has Chrome prerender a link to `/`, `/choco` or `/insights` at
  `conservative` eagerness: on pointer or touch down, ~100 ms before the click. The page it opens has
  begun loading, and its HTML is already there. Safari and Firefox ignore it.
  - **Click A/B, monitor → `/insights`**, against a build of `main` at `bfa9024`, same `.wrangler/`
    copy, both behind the brotli proxy, interleaved, five runs each; LCP counted from the navigation
    (`main`) or from activation (the branch). A private headless Chrome driven over the DevTools
    protocol (why not the shared one: [development](development.md#tooling-gotchas)), a press held
    100 ms, and on a desktop a 400 ms hover first. Every branch run activated a prerender
    (`activationStart` ≈ 105 ms); no run of `main` did. Medians:

    | | `main` | prerender, conservative (kept) | prefetch, moderate | prerender, moderate |
    |---|---|---|---|---|
    | desktop, 40 ms / 10 Mbps | LCP 508, FCP 176 ms | LCP 379, FCP 21 ms | LCP 456, FCP 124 ms | LCP 32, FCP 32 ms |
    | phone, 150 ms / 1.6 Mbps, CPU ×4 | LCP 2788, FCP 1308 ms | LCP 2142, FCP 695 ms | LCP 2260, FCP 776 ms | LCP 2139, FCP 695 ms |

    On the phone the 100 ms head start covers the HTML's round trip and little else: `/insights`
    still waits for its catalogues on the slow connection, so LCP is 2.1 s after activation. Its
    `moderate` column is `conservative` again, since there was no hover to wait on; Chrome for
    Android reads `moderate` from where the reader stops scrolling instead, which headless Chrome
    does not do, so that column says nothing about a real phone. `moderate` on a desktop is a
    200 ms hover, and the page was whole before the click (LCP at activation).
  - **What a prerender the reader never opens costs** (pressed, then slid off the link; desktop, same
    browser, shared chunks already cached by the page it came from): `/insights` from the monitor,
    139 kB (both catalogues, 65 kB, and the story's chunks); the monitor from `/insights`, 109 kB (its
    bundle and its zone's catalogue). No `/api/refresh`: see the gate in [Security](security.md).
  - **The monitor's own load does not change.** Lighthouse, phone `/`, devtools throttling, through
    the proxy, interleaved, five runs each, every run checked for the build it loaded (its
    `index-*.js`, and whether it asked for `speculation-rules.json`): FCP = LCP 1353 → 1353 ms, Speed
    Index 3182 → 3166 ms, TBT 322 → 329 ms, score 92 → 92, CLS 0 on both. The rules are one 0.3 kB
    request after the page's own, cached for an hour (the code review: on the asset layer's default
    every load revalidated it, a round trip on a phone).
  - **All three pages stay eligible for the back/forward cache**, `/insights` on its story, questions
    and 3D tabs too, each scrolled through so its map, charts or scene had mounted: left for
    `/robots.txt` and brought back, each came back with a marker set on `window` before leaving still
    there. A page with an `unload` listener, as a control, was reported not restored
    (`UnloadHandlerExistsInMainFrame`).
- **The story's dots are a canvas, and a scene turn no longer stalls a phone** (issue #94,
  2026-09-29; `story/dots.tsx`, see [the page](frontend.md)). The cost was not where the issue put it.
  Each dot was an SVG `<circle>` with a CSS transition on `translate`, and SVG children are not moved on
  the compositor: every frame of the one-second glide, the renderer's Layerize step (sorting what was
  painted into compositor layers) took ~230 ms on a 4× phone with all 1,874 dots gliding, on top of the
  turn's first style pass (~140 ms). The glide showed about five frames. The dots are now drawn on one
  `<canvas>` between two SVGs, glided in JavaScript on the same curve, delay and length, and nothing is
  drawn between turns. A frame of the glide costs the canvas a median of 3.0 ms at 4× (p90 3.8 ms).
  - **Chaparral's replay renders its ~1,000 dots once.** `useProgress` still sets state every frame
    for 3.6 s, but `TolimaScene` builds each dot's two looks (shown, not yet) once per drawing and
    only picks one per frame, so React skips every dot whose element has not changed. The DOM writes
    are the same as before (2,036 `class` changes over the replay on both builds).
  - Measured against a build of `main` at `bfa9024`, `pnpm preview` behind a proxy that served
    production's `/api/events` of 2026-09-29 (1,875 events: 858 in Chocó, 1,017 in Chaparral), Chrome
    DevTools MCP, 390 × 844 phone at 4× CPU. Frames the page drew (requestAnimationFrame) and long
    animation frames in the 2.5 s after the scroll that turns the scene, three fresh loads per build,
    interleaved:

    | Turn | `main` | Canvas |
    |---|---|---|
    | map → Chocó's cut | 51–53 frames, 7–8 over 50 ms, up to 400 ms | 152 frames, none over 17 ms |
    | Chocó's cut → the clocks | 56–60 frames, 6–8 over 50 ms, up to 433 ms | 150–152 frames, none over 33 ms |
    | Chaparral's map → its cut | 102–120 frames, 2–4 over 50 ms, up to 233 ms | 145–149 frames, 0–1 over 50 ms, up to 83 ms |
    | Chaparral's replay (4 s) | 218–236 frames, 0–1 over 50 ms | 239–240 frames, 0–1 over 50 ms |

    One DevTools trace of each turn, the profiler's own start-up task left out: map → Chocó's cut
    had seven tasks over 50 ms on `main` (119–451 ms; the first 140 ms of style and 237 of Layerize,
    each later frame 263–366 ms) and none on the canvas (the step's two renders, 31 and 32 ms).
    Chaparral's cut had five (62–241 ms, 336 ms of style in all) and none (39 ms at most, 59 ms of
    style). The replay, two pairs taken back to back: 3.8–4.2 s of main thread on `main`, 1.8–2.0 s
    of it paint, against 2.4–2.5 s and 0.74–0.78 s; the hidden dots no longer sit in the SVG the
    replay repaints every frame. The one frame left over 50 ms at Chaparral's cut is the next scene
    (the felt calendar) mounting as the reader nears it, not the dots.
  - **Trust only back-to-back pairs here.** The Chrome the MCP drives is shared with other sessions,
    and one replay trace of each build taken minutes apart read the other way round (paint 495 ms on
    `main`, 922 on the canvas); counting the DOM writes on both showed they were the same work.
  - **The turns look the same**: `agent-browser` at 390 × 844 in light, dark and light with reduced
    motion, and at 1280 × 800, `main` against the canvas, the map, both cuts and the last step at rest:
    at most 37 pixels differ (0.01 %, edges of the dots). 350 ms into a turn 0.3–1.3 % differ, the
    canvas further along, because `main`'s glide starts after its long task. With reduced motion the
    shot mid-turn equals the one at rest on both. Switched with the page's theme button, the map is
    1 pixel from a page opened in dark.
- **"Valor b en el tiempo" measures no text in the DOM, and draws once** (issue #96, 2026-09-29). On a
  phone (412 × 823) the card's top is ~480 px under the fold, inside `Deferred`'s 600 px, so Recharts'
  chunk is fetched and the chart drawn during the load. Its first render wrote every label it might draw
  into a hidden span and read the span's box, a layout each time: 43 strings on Tolima's page at 412 px,
  none now (counted by wrapping `getBoundingClientRect` in the page):
  - **The date axis picks from every point, not from dates.** With `scale="time"` Recharts takes each
    window's end as a candidate tick, then the dashed line's own windows, and keeps a label only where it
    clears the next one by `minTickGap`, measured. `preserveEndTicks` (`charts/time-ticks.ts`, tested)
    now runs the same rule over the same candidates in the same order, with widths from a canvas
    (`measureText`, no layout), and the chart passes the result as `ticks` with `interval={0}`, which
    Recharts draws as given. Without a 2D canvas it leaves the choice to Recharts, as before. A test
    holds it to Recharts' own `getTicks` (its DOM measure stubbed) over 300 random cases, so a Recharts
    release that changes the rule fails there; the candidates' order and the chart's margins are
    Recharts' too, and are what the browser comparison below checks.
  - **The grid ran that rule too**, for vertical lines the chart does not draw (`vertical={false}`): 23
    measurements. `NO_VERTICAL_LINES` (`charts/chart-grid.ts`) asks for none, on all three charts.
  - **Each tick's `Text` measured its words** to wrap a label that never wraps, because the axis hands it
    its own width; `tick={{ width: undefined }}` stops that.
  - **`ResponsiveContainer` drew the chart once at 320 × 200** (its first guess) before drawing it at its
    real size. The plot's size was already read in the chart's ref callback; the chart is now drawn only
    after it, with that size as `initialDimension`, so it is drawn once.
  - The texts are unchanged: every label, tick value and "b = 1" at the same position and width as on
    `main`, both zones and languages at 320, 390, 412, 768, 1024 and 1280 px (the SVG's `getBBox`), and
    at 390 px after a resize, a language switch, the MLr_2 tab, Mc moved, Mc moved until the windows ran
    out and back (the plot drawn again, which waits for its own size), one depth group, the web font
    blocked, no canvas, and a four-day catalogue whose labels carry the hour, with the dashed line and
    without it (one magnitude type: the last label then sits on the chart's right edge, where Recharts
    pulls it back inside, and `preserveEndTicks` does the same). Screenshots of all three
    charts, both themes, 320/390/1280 px: 72 of 72 identical to the pixel. The shared chunk is now
    named `chart-grid-*.js` (it takes a name from one of its modules).
  - **Lighthouse A/B** against a build of `main` at `f46512d`, devtools throttling, `pnpm preview` behind
    a brotli proxy serving production's catalogues, interleaved, five runs each, every run checked for
    the build it loaded; medians (the build before the code review, whose changes only took work away):

    | | TBT | LCP | Score | CLS |
    |---|---|---|---|---|
    | phone `/` | 281 → 259 ms | 1351 → 1346 ms | 93 → 94 | 0 → 0 |
    | phone `/choco` | 304 → 277 ms | 1350 → 1350 ms | 92 → 93 | 0 → 0 |
    | desktop `/` | 23 → 19 ms | 199 → 198 ms | 100 → 100 | 0 → 0 |
    | desktop `/choco` | 2 → 0 ms | 204 → 202 ms | 100 → 100 | 0 → 0 |

  - **Not done: loading the chart only on screen on a phone** (owner's call, 2026-09-29). With
    `Deferred`'s margin at 0 below `lg`, the chunk left the load: phone TBT 272 → 170 ms on `/` and
    295 → 192 ms on `/choco` (score 94 → 97 and 93 → 96, same A/B, the chart fetched in none of the
    branch's runs). But a reader scrolling to the card at 400 px/s then saw its skeleton for 0.44 s on
    Fast 4G and 1.39 s on Slow 4G (4× CPU), where the chart had been drawn before they got there. The
    chunk's evaluation (~35 ms at 4×, building Recharts' store) and the render (~150 ms) are what stays
    in a phone's load window; issue #118 asks whether Recharts is worth them.
  - **Declined in the code review (2026-09-29):** *choosing the labels again once Geist has loaded.* A
    label measured before then is in the stand-in face, which is cut to Geist's width (with the font
    blocked, both builds chose the same labels, 42 px wide against 43), and Recharts' span did not
    measure again either; choosing again would draw the whole chart a second time, inside a phone's
    load. *Sharing `src/insights/measure.ts`:* it pads widths by 3 % and guesses one without a canvas,
    to reserve room, where this must match Recharts' measure exactly or fall back to it. *`clientWidth`
    over `getBoundingClientRect`:* the latter is what `ResponsiveContainer` reads on mounting, and
    matching it is what keeps the chart drawn once; the row's entry transition only translates.
- **`/insights` asks for everything its hero needs from the HTML, at every width** (issue #108,
  2026-09-29). On a phone the story's hero (its intro, the LCP at every width) came ~1.7 s after the
  first paint. It needs three things: the bundle, the data and the story tab's chunk. Only the bundle
  started from the HTML: the data waited for the bundle to run (the `media` query above), and so did
  the story's chunk, which `app.tsx` imports when its module runs (`chunks[readTab()]()`). Vite
  preloads only what an entry imports statically.
  - **The data alone moved nothing.** Preloaded at every width (A/B on one build, the HTML rewritten by
    the proxy, three runs each), the catalogues were in by 3.3 s instead of 4.7, and LCP went 4.80 →
    4.76 s: the story's chunk, asked for at 3.4 s, was now the last thing to arrive. The chunk alone
    gave 4.54 s, both together 4.28. `fetchpriority="low"` on the data changed nothing: Chrome held the
    requests back to ~2.1 s, and first paint was as late.
  - **So the page preloads both**: the five API requests with no `media` (`preloadTags(INSIGHTS_LOAD,
    null)`), and the story's chunk with every chunk it imports that the entry does not
    (`chunkPreloads` in `core/page-data.ts`, `preloadStoryTab` in `vite.config.ts`, which reads them off
    the bundle, so a new import is preloaded with no change here). The monitor's pages are
    byte-for-byte what they were.
  - **It is always the story's chunk, whatever the tab.** The HTML is the same file for all three tabs,
    and only a script could choose by the query string. The other two tabs gain anyway: the questions
    chunk shares most of the story's imports (d3's time and scale modules, the projection, the region
    outlines). **Declined in the code review (2026-09-29):** having the head script (`src/boot.ts`)
    preload the tab in `?tab=`. It is the one script that decides the language and the theme and nothing
    else ([the page](frontend.md)), and it is bundled before the page's chunks exist, so the build would
    have to hand it their names in the HTML. The 3D tab, which uses least of the story's code, still
    paints its LCP 0.24 s sooner (below); its Speed Index is 31 ms later, within the runs' spread.
  - **Lighthouse A/B** against a build of `main` at `3e3d5a2`, devtools throttling, both behind the
    brotli proxy, same `.wrangler/` copy, interleaved, every run checked for the build it loaded (only
    the branch starts `/api/events` and `story-*.js` at ~0.6 s; the two builds' assets are identical);
    medians, five runs unless said:

    | | FCP | LCP | Speed Index | TBT | CLS | Score |
    |---|---|---|---|---|---|---|
    | phone `/insights`, English | 3102 → 3482 ms | 4952 → 4326 ms | 4242 → 3930 ms | 0 → 0 ms | 0 → 0 | 74 → 77 |
    | phone `/insights`, Spanish | 3103 → 3492 ms | 4960 → 4330 ms | 4268 → 3938 ms | 0 → 0 ms | 0 → 0 | 74 → 77 |
    | phone `?tab=questions` (3) | 3107 → 3485 ms | 5277 → 5004 ms | 4449 → 4472 ms | 166 → 159 ms | 0 → 0 | 70 → 71 |
    | phone `?tab=3d` (3) | 3098 → 3485 ms | 5030 → 4790 ms | 4965 → 4996 ms | 278 → 283 ms | 0 → 0 | 67 → 66 |
    | desktop `/insights` | 114 → 113 ms | 159 → 156 ms | 146 → 142 ms | 0 → 0 ms | 0 → 0 | 100 → 100 |
    | phone `/` | 1352 → 1346 ms | 1352 → 1346 ms | 3163 → 3155 ms | 276 → 274 ms | 0 → 0 | 93 → 93 |

    Every phone story run of the branch had its LCP between 4318 and 4355 ms, against 4932–4990 on
    `main`. Spanish needs `--accept-lang=es-CO` in the Chrome flags; `--lang` does not reach
    `navigator.languages` in headless Chrome, and a first Spanish set measured English (checked by the
    LCP element's text). On a desktop `main` ran 145–159 ms three times and 436–450 ms twice, when the
    story's chunk came in after the data; the branch, 143–159 ms every time.
  - **The price is the skeleton, ~0.38 s later on a phone**, on every tab: the catalogues (64 kB with
    brotli) and the story's chunks (~85 kB) now share the connection with the bundle. The reader's
    wait is for the story, not for the skeleton, and it comes 0.6 s sooner.
  - **What is left is bytes.** With everything preloaded the main thread idled from 3.5 to 4.2 s
    (a trace of a cold load at Lighthouse's phone settings): every request starts at ~0.6 s and they
    share 1.6 Mbps, the last one ends at 4.16 s, and the hero paints ~130 ms later. The issue's other
    two ideas were not built. *Painting the hero's text from the HTML* would need a static `/insights`
    shell hydrated by React, as the monitor's header is (issues #69, #97): the page's header and tabs,
    and the hero's kicker and intro, with slots of their final height for the count and the sentences
    the data decides. It is the step left if the story must come sooner. (Issue #120 has since put the
    header and the skeleton in the HTML, below; the hero is still drawn with the data.) *A smaller request for the
    hero* would save at most the catalogues' 64 kB (~0.35 s at 1.6 Mbps), for a new route and a second
    source of the same figures.
  - **A load that fails is unchanged** (checked in `agent-browser` at 412 px, with `/api/*` answering 503
    through the proxy): the preloaded 503 is handed to the page's first request, which TanStack then
    retries at 1, 3 and 7 s as before, and the load error follows; with the API back, "Reintentar" draws
    the story. The console stays empty on all three tabs at 412 and 1350 px (no unused preload), and each
    load makes five API requests, one per URL.
  - A prerender of `/insights` from the monitor (issue #107, above) fetches what it did (the catalogues
    and the story's chunks), now from its HTML.
- **`/insights` paints its header and skeleton from the HTML** (issue #120, 2026-09-29), as the
  monitor's header does (issues #69 and #97, above; how, in [the page](frontend.md)). Its HTML was an
  empty `#root`, so a phone showed a blank screen until the bundle had downloaded and run, and #108's
  preloads, sharing the connection with the bundle, made that ~3.5 s. The header's CSS is inlined
  (33 kB, `headerCss` over this page's own header, so the monitor's inlined CSS is what it was), the
  stylesheet moves to the end of the body, and React hydrates the copy. The HTML goes from 0.9 to 8.9 kB
  with brotli. The monitor's pages keep their header and CSS; their HTML changes only in the hashes of
  the chunks the two pages share and in the order of one module preload (the table's note).
  - **Lighthouse A/B** against a build of #108's branch at `5a9ef9f` and of `main` at `f46512d`,
    devtools throttling, all three behind the brotli proxy, same `.wrangler/` copy, interleaved, five
    runs each, every run checked for the build it loaded (the entry script tells this branch from the
    other two, and only #108 and this branch start `story-*.js` at ~0.6 s); medians, `main` → #108 →
    this branch:

    | | FCP | LCP | Speed Index | TBT | CLS | Score |
    |---|---|---|---|---|---|---|
    | phone `/insights`, English | 3098 → 3500 → 1352 ms | 4995 → 4348 → 4343 ms | 3318 → 2768 → 3100 ms | 0 → 0 → 7 ms | 0 | 75 → 78 → 84 |
    | phone `/insights`, Spanish | 3125 → 3497 → 1357 ms | 5001 → 4350 → 4349 ms | 3342 → 2813 → 3099 ms | 0 → 0 → 9 ms | 0 | 75 → 78 → 84 |
    | phone `?tab=questions` | 3105 → 3483 → 1352 ms | 5254 → 4994 → 4973 ms | 3530 → 3350 → 3427 ms | 154 → 151 → 172 ms | 0 | 72 → 72 → 78 |
    | phone `?tab=3d` | 3110 → 3492 → 1360 ms | 5088 → 5000 → 4998 ms | 3672 → 3633 → 3455 ms | 251 → 243 → 252 ms | 0 | 70 → 69 → 76 |
    | desktop `/insights` | 106 → 106 → 56 ms | 152 → 151 → 153 ms | 92 → 100 → 118 ms | 0 | 0 | 100 |
    | phone `/` | — → 1372 → 1352 ms | — → 1372 → 1352 ms | — → 3119 → 3110 ms | — → 283 → 260 ms | 0 | — → 93 → 94 |

    Every phone run of this branch painted between 1344 and 1404 ms, against 3462–3519 on #108. The
    LCP is the story's hero at every width, as before, and waits on the data and the story's chunk, not
    on the header. Hydrating the copy costs 7–21 ms of TBT on a phone. The monitor's row is from the
    build after the code review, when both pages came to mount through one `mountPage` and the
    monitor's HTML changed only in chunk hashes and in where `react-dom`'s module preload sits among
    the others; five more story runs on that build gave the same (FCP 1357, LCP 4344 ms).
  - **Speed Index reads the skeleton as a step back.** Speedline scores a frame by how far its colour
    histogram has moved from the first frame's towards the last one's. The blank page before the
    bundle is the page's own background, which the finished story mostly is, so #108's blank screen
    scored 81 % complete from 1.6 s; the header and skeleton score 73 %, since the skeleton's grey
    block is in no finished frame (#108's own skeleton drops to 73 % when it appears at 3.5 s). On the
    story tab that is +0.3 s of Speed Index for a page that shows more at every moment from 1.35 s:
    the filmstrips of the three builds, frame by frame, have the header on screen 2.1 s sooner and the
    story at the same time.
  - **Measured first on a trace** (Chrome DevTools MCP, 412 × 823, Slow 4G, CPU ×4, a cold context): the
    first paint is the static subtitle, and the only render-blocking request left is the head script,
    as on the monitor. The static subtitle stays the same node through hydration (its buffered
    `largest-contentful-paint` entry's element is still connected once the story is up).
- **"Distribución frecuencia–magnitud" is drawn without Recharts** (issue #118, 2026-09-29;
  `charts/fmd.tsx`, how it keeps the chart the same in [the page](frontend.md)). Recharts is the heaviest
  code the monitor runs after MapLibre: its shared chunk (`chart-grid-*.js`) is 309 kB (87 kB gzipped),
  most of it its own state machine (Redux Toolkit, Immer, react-redux, es-toolkit, a vendored d3).
  The chart is now `d3-scale` and `d3-shape`, already the `/insights` page's, and React's SVG.
  - **Bytes** (`vite build`, each chunk's static imports beyond the monitor's entry, gzip 9): the chart
    fetched first on a page that has loaded no other chart, 115.1 → 14.0 kB. The monitor's startup did not
    move (182.0 → 181.6 kB), nor `/insights`' (132.6 → 132.5 kB; its questions tab 68.4 → 69.0 kB, as
    three smaller shared d3 chunks). **Recharts' chunk still loads**, for the other two charts; all three
    charts together beyond startup went 134.3 → 129.9 kB. The bytes go with the last of them.
  - **The render** (phone 412 × 823, 4× CPU, `pnpm preview` of `main` at `b22b968` and of this, the same
    catalogue behind the proxy, a private headless Chrome; the page scrolled so that the card enters
    `Deferred`'s 600 px margin and the map below it does not; main-thread work in the 3 s after the
    scroll, from a trace; seven interleaved pairs per zone):

    | | Tasks | Longest task | Long animation frames |
    |---|---|---|---|
    | Tolima | 204–266 → 61–98 ms | 146–188 → 8–10 ms | one of 157–199 ms → none |
    | Chocó | 267–292 → 71–81 ms | 200–217 → 9–11 ms | one of 210–226 ms → none |

    About 60–80 ms of each window is the page's own work, the same on both. Recharts' frame was its store
    and selectors (`chart-grid-*.js`, 69–110 ms of script) and its layout reads; this chart's script is
    ~10 ms. The same pairs against `main` at `becf3af`, before the rebase, gave the same (Tolima 218–243 →
    68–78 ms). One Chrome DevTools MCP trace each way, Tolima, agreed (271 → 122 ms, longest 201 → 26 ms;
    MCP traces carry their own overhead, so the scripted pairs are the figures).
  - **The load** (Lighthouse, devtools throttling, both builds behind the brotli proxy, interleaved, every
    run checked for the build it loaded; medians). A phone never fetches this chart during the load (its
    card is below `Deferred`'s margin), so the phone rows are a check that nothing else moved; on a
    desktop `/` draws it at load, `/choco` does not:

    | | TBT | LCP | Score | CLS |
    |---|---|---|---|---|
    | phone `/` (5 runs) | 224 → 225 ms | 1346 → 1346 ms | 95 → 95 | 0 → 0 |
    | phone `/choco` (9 runs) | 246 → 250 ms (235–277 against 238–303) | 1343 → 1348 ms | 94 → 94 | 0 → 0 |
    | desktop `/` (5 runs) | 27 → 0 ms (19–34 against 0 in every run) | 200 → 184 ms | 100 → 100 | 0 → 0 |
    | desktop `/choco` (5 runs) | 0 → 0 ms | 190 → 196 ms | 100 → 100 | 0 → 0 |

  - **Why D3, and not another library** (issue #118's question; a standalone benchmark of this one chart,
    Tolima's bins, 360 × 380, drawn five ways, each a Vite build, cold loads in a private headless Chrome at
    412 × 823 and 4× CPU, seven round-robin rounds, medians; an empty React page draws in 127 ms):

    | | JS beyond React (gzip) | Load to drawn | Longest frame | An element per point | Keyboard layer |
    |---|---|---|---|---|---|
    | Recharts 3.10 | 105.8 kB | 401 ms | 254 ms | yes | yes |
    | D3 (`d3-scale`, `d3-shape`) + React SVG | 11.3 kB | 134 ms | none over 50 | yes | ours to write |
    | visx 4 | 23.7 kB | 166 ms | 59 ms | yes | ours to write |
    | uPlot 1.6 | 22.6 kB | 191 ms | 64 ms | no, a canvas | no |
    | Chart.js 4.5 (+ annotation plugin, 13 kB) | 68.1 kB | 204 ms | 75 ms | no, a canvas | no |

    The canvas libraries are fast, but a canvas has no DOM for the tooltip, the keyboard layer, the text
    alternative or the headless checks here, all of which would be ours to rebuild around it, and
    Chart.js' tooltip is drawn on the canvas and cannot reach an empty bin. visx is D3 with React
    components on top: twice the bytes and a little slower, for axes and a tooltip hook we would still
    have to bend to Recharts' layout and keyboard behaviour. D3 was already in the repo, for `/insights`.
    A warm hover showed its tooltip within ~9 ms in every library.
  - **Recommendation: migrate the other two charts too** (issues #125, "Valor b en el tiempo", ~3–4 h,
    done 2026-09-30: the next bullet; and #126, "Magnitud en el tiempo" with its day choosing, ~5–7 h,
    after which Recharts is removed). Keeping Recharts and trimming it (`initialDimension`, explicit ticks, done in #96) cannot
    remove its store's evaluation or its render.
- **"Magnitud en el tiempo" is drawn without Recharts** (issue #126, 2026-09-30;
  `charts/magnitude-time.tsx`, what it keeps and what it fixed in [the page](frontend.md)). It was the
  heaviest of the three: two Recharts charts and two more that existed only to draw a pinned axis, with
  up to a thousand dots each wrapped in three layers of Recharts' own elements.
  - **The render** (phone 412 × 823, 4× CPU, `pnpm preview` of `main` at `aed8d13` and of this on the
    same catalogue, a private headless Chrome; each run a fresh context, stepped down the page until
    every card above is drawn, then scrolled so this card enters `Deferred`'s 600 px margin; the main
    thread's work over the next 3 s, from `Performance.getMetrics`, and the long tasks and long
    animation frames the page itself reports; seven interleaved pairs per zone, ranges and medians):

    | | Tasks | Script | Longest task | Long animation frames |
    |---|---|---|---|---|
    | Tolima (1,037 events) | 563–660 → 82–99 ms (633 → 85) | 438–511 → 32–43 ms | 397–456 ms → none in 6 runs, 52 ms in one | one of 402–461 ms → none in 6, 55 ms in one |
    | Chocó (809 events) | 547–619 → 75–87 ms (590 → 83) | 416–476 → 30–35 ms | 351–413 ms → none over 50 ms | one of 356–419 ms → none |

    Recharts' chunk was already evaluated in these runs (a phone draws "Valor b en el tiempo" first), so
    the ~400 ms task is this chart's render alone: on `main` a reader scrolling down a phone met a
    frozen page for that long as the card arrived. The table is the build before the code review; two
    pairs per zone after it gave 85–102 ms against 559–642.
  - **Bytes** (`vite build`, gzip 9, this chart's chunks beyond what the page has at startup): 114.7 →
    15.8 kB, its own chunk 13.7 → 5.7 kB. The monitor's startup is unchanged (on both builds, 119.2 kB
    for the entry's static imports). **Recharts' bytes had not left with this change alone**: "Valor b en
    el tiempo" still imported it, and with one user Rolldown folded the 298 kB (83 kB gzipped) into that
    chart's chunk (`b-over-time-*.js`, 333 kB, 91.7 kB gzipped). All three charts together beyond
    startup: 130.1 → 119.2 kB. Issue #125 (the next bullet) then took that chart off Recharts.
  - **The load is unchanged**, since no page draws this chart during its load: its card is below
    `Deferred`'s margin on a phone and on a desktop. One Chrome DevTools MCP trace each way (Tolima,
    412 × 823, Slow 4G, 4× CPU, a reload): LCP 761 → 727 ms, CLS 0 → 0, and no forced reflow from the
    chart. Lighthouse, devtools throttling, straight against both previews (uncompressed, so not to be
    set beside the brotli-proxy tables above), interleaved, five runs each, every run checked for the
    build it loaded; medians:

    | | TBT | LCP | Score | CLS |
    |---|---|---|---|---|
    | phone `/` | 278 → 271 ms | 1351 → 1350 ms | 88 → 89 | 0 → 0 |
    | phone `/choco` | 281 → 286 ms | 1346 → 1350 ms | 89 → 89 | 0 → 0 |
    | desktop `/` | 0 → 0 ms | 182 → 193 ms | 100 → 100 | 0 → 0 |
    | desktop `/choco` (4 runs of `main`, one failed to start) | 2 → 1 ms | 217 → 204 ms | 100 → 100 | 0 → 0 |
- **"Valor b en el tiempo" is drawn without Recharts too, and no page's load fetches Recharts any more**
  (issue #125, 2026-09-30; `charts/b-over-time.tsx`, how it keeps the chart the same and what it fixes in
  [the page](frontend.md)). This is the chart in a phone's load window (issue #96, above), so its render was
  what a phone's TBT still paid. It was measured against `main` at `aed8d13`, where "Magnitud en el tiempo"
  was still on Recharts too, below `Deferred`'s margin at load on a phone and on a desktop, on both zones:
  Recharts' chunk was fetched in 0 of 40 Lighthouse runs of this build against 20 of 20 of `main`. That
  chart left Recharts the same day (issue #126, the bullet above), so **no chart imports Recharts now**:
  built together, no chunk of either page contains it (`b-over-time-*.js` 3.7 kB, `magnitude-time-*.js`
  6.0 kB, `fmd-*.js` 2.5 kB gzipped). The package, `ui/chart.tsx` and the two tests that hold our tick
  rules to Recharts' own are still in the repo; removing them is what is left of #126. The figures below
  are this change's own, measured before the two met.
  - **Bytes** (`vite build`, each chunk's static imports beyond the monitor's entry, gzip 9): this chart
    fetched first on a page that has loaded no other chart, 112.9 → 14.4 kB; its own chunk 11.6 → 3.1 kB.
    All three charts together beyond startup 130.1 → 119.5 kB. The monitor's startup (182.0 kB) and
    `/insights`' (133.1 kB) did not move.
  - **The load** (phone 412 × 823, 4× CPU, no network throttling, `pnpm preview` of `main` at `aed8d13` and
    of this, the same catalogue behind the proxy, a private headless Chrome, a fresh context per load; long
    tasks and the moment the chart is on screen, measured in the page; seven interleaved pairs per zone):

    | | Long tasks over 50 ms, summed | The chart's own task | Chart drawn at |
    |---|---|---|---|
    | Tolima | 204–248 → 134–167 ms (medians 212 → 151) | 114–134 ms → none over 50 | 839–899 → 729–778 ms |
    | Chocó | 161–258 → 115–174 ms (medians 189 → 148) | 108–126 ms → none over 50 | 836–900 → 708–787 ms |

    Every load of `main` had four long tasks, the last of them the chart's render; every load of this had
    the first three, which are the page's own: two of ~55–60 ms and the dashboard's render, 148–226 ms on
    `main` and 162–214 ms here (medians 192 → 198 ms on Tolima, 165 → 189 ms on Chocó; it was not looked
    into whether the chart's render, now short, falls inside it). One Chrome DevTools MCP trace each way (Tolima, a reload at 4× CPU) agreed: on `main` a
    163 ms task, 91 ms of it in Recharts' chunk, and a 48 ms one evaluating that chunk; here the chart's
    render is an 18 ms task and nothing in the load is over 30 ms.
  - **Lighthouse A/B** against a build of `main` at `aed8d13`, devtools throttling, both behind the brotli
    proxy, interleaved, five runs each, every run checked for the build it loaded (its `index-*.js`);
    medians (the build before the code review; three more phone runs of the reviewed build are under
    the table):

    | | TBT | LCP | Speed Index | Score | CLS |
    |---|---|---|---|---|---|
    | phone `/` | 297 → 198 ms (254–303 against 172–219) | 1350 → 1349 ms | 3330 → 3328 ms | 93 → 96 | 0 → 0 |
    | phone `/choco` | 315 → 223 ms (269–362 against 185–246) | 1354 → 1351 ms | 3336 → 3343 ms | 92 → 95 | 0 → 0 |
    | desktop `/` | 0 → 0 ms | 219 → 198 ms | 262 → 236 ms | 100 → 100 | 0 → 0 |
    | desktop `/choco` | 0 → 1 ms | 219 → 206 ms | 269 → 260 ms | 100 → 100 | 0 → 0 |

    The reviewed build, phone only, three interleaved runs: `/` 284 → 184 and 191 ms (its third run
    reported no TBT and is left out; `main` ran 275–338), `/choco` 296 → 222 ms (286–341 against
    212–262); LCP 1344 → 1350 and 1348 → 1348 ms, CLS 0, Recharts fetched in 6 of 6 runs of `main` and
    none of this.

    On a desktop the LCP is this card's description, drawn with the data as before, and the medians'
    13–21 ms are within what one build's runs spread over: `/` ran 199–557 ms on `main` and 179–239 ms
    here, `/choco` 206–242 and 191–212 ms.
- **Measuring.** `pnpm build && pnpm preview`, then
  `lighthouse http://localhost:<port>/ --quiet --chrome-flags=--headless=new --only-categories=performance`,
  three times, median. Give the local database data and close the refresh guard first, as under
  [Tooling gotchas](development.md#tooling-gotchas), or the page queries SGC. `preview` serves assets
  **uncompressed**, so its absolute numbers are pessimistic against production — compare runs
  with each other, not with a production score. Worse, it can turn a race around: uncompressed, the
  131 kB stylesheet arrived after the 29 kB font on `preview`, and on production (20 kB) before it,
  which hid for a day that production's phone LCP was React's header (issue #97). For a change to
  what loads when, put a small proxy in front of `preview` that brotli-compresses text responses, as
  the edge does, and measure through it. Add `--blocked-url-patterns='*/api/refresh*'` as
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
  93.
  - **Since issue #72 (2026-09-28), from `lg` the map is fetched only once it is on screen**
    (`margin="0px"` on its `Deferred` from 64rem; below that it keeps the 600 px), and its placeholder
    is a 5–13 kB picture of the view it opens on (see [the page](frontend.md#interface-conventions)). The map's top is at 1117 px on `/` at
    1350 × 940, 177 px under the fold; on `/choco` at 1604. Measured against a build of `main`,
    `pnpm preview`, same data, runs interleaved, medians, `/` at 1350 × 940 unless said:

    | Setting (runs each) | LCP | TBT | Score | Speed Index |
    |---|---|---|---|---|
    | Desktop preset, devtools throttling (5) | 99 → 106 ms | 56 → 35 ms | 100 → 100 | 241 → 243 ms |
    | Same, CPU ×4 (5) | 256 → 256 ms | 462 → 356 ms | 80 → 85 | 578 → 532 ms |
    | Phone, devtools throttling (3) | 5.35 → 5.36 s | 220 → 239 ms | 60 → 59 | 7.19 → 7.22 s |

    The desktop page downloads 1602 kB before any scrolling instead of 3157. At CPU ×4 the five runs
    scored 83–85, against 78–82 on `main`. A phone is unchanged within noise: it gets the picture (13.8 kB, at
    8.3 s, long after the paint) and 1.1 kB more in the first chunk. It keeps the 600 px margin: those
    phone runs had a margin of 0 at every width, which Lighthouse cannot see, since it never scrolls.
    The code review saw it: five screens down, the map would have started loading only when the reader
    reached it, over a mobile connection, where 600 px of scrolling had given it a head start before. An earlier A/B without the picture (a plain skeleton, same margin) gave similar
    desktop figures (CPU ×4: TBT 578 → 396 ms, score 77 → 83), and at 1.6 Mbps / 150 ms (devtools
    throttling, 5 runs) the same first paint (5.45 s both), Speed Index 6.88 → 6.52 s. Scrolled to on a fast connection, the map took ~0.55–0.6 s
    to finish its tiles, the time the picture now covers.
  - **The 86 above no longer reproduces.** Default simulated mode scored desktop `/` 95 on `main`
    with the map loading at first paint, and 95 without it (simulated LCP 1.31 s both, 3 runs each),
    after the perf review's preloads. It is the CPU ×4 runs, not the default ones, that tell the two
    builds apart: MapLibre's start-up work (~220 ms of script at ×4 in a DevTools trace, in tasks
    under 50 ms each) lands in the load window.
  - **Check which build a port serves before trusting an A/B.** The first run of this one compared
    `main` with `main`: the variant's `pnpm preview --strictPort` had failed on a port another
    session's preview held, and every request went to that one. Compare the `index-*.js` the page
    names with the one in `dist/client/assets/`. And a rebuild under a running `pnpm preview` is
    not served: it keeps the asset list it started with, and the new bundle answers 404 (a blank page
    with no error in the console). Restart it after every build.
- The console must stay empty. The basemap style names sprite images OpenFreeMap does not
  ship (`circle-11`), which MapLibre warns about twice per load, so `event-map.tsx` answers
  `styleimagemissing` with an empty pixel. Real map errors still reach `console.error`.
