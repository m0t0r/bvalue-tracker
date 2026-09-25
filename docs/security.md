# Security decisions

A full source audit was run on 2026-09-19. What it changed here, and why:

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
- **Every event enters through one gate, `admitEvent` in `core/admit.ts`** (architecture
  review candidate 01, 2026-09-19). The range checks used to live inside `parseCatalogHtml`,
  so the other door was unguarded: `fromCsv` ended in `rec as unknown as SeismicEvent`, and
  `pnpm cli bvalue --input` on a hand-edited catalogue counted a magnitude of `"abc"` as an
  event while dropping it from the distribution, or threw `RangeError` on `1e7`. Both doors
  now hand their raw cells to the gate and it decides. Rules that belong to it, not to a
  caller: the field list, string coercion, the four bounds, the SGC id shape (which is what
  keeps `sgcEventUrl` from becoming a `javascript:` link) and "a UTC instant" — `new Date`
  rolls 30 February over into March rather than refusing it, so the gate reads the instant
  back out. **Do not add a check at a door**; add it there.
  - **A CSV rejects the whole file, the HTML page skips the row.** Deliberate, and not a
    symmetry worth fixing: `ingestTrailing` recomputes the same window every tick, so a
    stuck row freezes live figures, while a CSV is read once by someone who can edit it —
    and silently dropping rows would have the CLI print a confident b-value from a
    catalogue it had quietly edited.
  - **The D1 read path is deliberately outside the gate.** `parseCatalogHtml` is the only
    writer of `events` (no seed script, no `INSERT` in any migration, no admin route), while
    `toStored` sits on the full-table scan that `/api/events`, `/api/events.csv`,
    `/api/stats` and `/api/b-windows.csv` all share. Re-validating ~800 rows per request
    would spend the 10 ms CPU budget on a door nothing untrusted reaches.
- **Numeric fields are range-checked, not just `Number.isFinite`.** An absurd but finite
  magnitude would be stored and then size `new Array(hi - lo + 1)` in `fmd`, throwing
  `RangeError` on every `/api/stats` call and blanking the page. lat, lon, depth and mag are
  bounded to what the quantity can physically be. The solution-quality columns (phases, RMS,
  GAP, the three errors) are deliberately *not* bounded: they reach no array size, and SGC
  leaves them blank often enough that a missing one must not cost us the event.
- **CSV cells must not start a formula.** `quote()` did RFC4180 escaping only, so an SGC
  `region`/`magType`/`status` beginning `=`, `+`, `-`, `@`, tab or CR reached both the
  server CSV and the page's download button intact. It is prefixed with `'` now — **except
  when the value is a plain number**, or every negative depth error and b-value would
  silently become text. Both CSV paths share `quote()`, so both are covered.
- **`/api/*` is same-origin plus a per-IP rate limit.** See [API](api.md) for the rule and
  its three exceptions. The newest (2026-09-24) lets a Cloudflare-verified Lighthouse run read,
  so PageSpeed Insights can measure the real page. It was chosen over admitting every verified
  bot, which would have handed the catalogue to commercial SEO crawlers too. `/api/health` exists *because* of this: the deploy smoke test used to
  curl `/api/status`, which now 403s.
- **`POST /api/client-error` is a write route that writes nothing.** It is the one route
  that takes a body from the reader, so: it inherits the same-origin check and the rate
  limit from `/api/*`; its body is capped at 4 KB by Hono's `bodyLimit()` before the handler
  reads it (a declared `Content-Length` over the cap is refused unread, and a chunked body is
  abandoned as it crosses the cap); and exactly four fields are read out of
  it, each only if it is a string. It reaches no table and no SGC request. See
  [the page's own failures](operations.md#the-pages-own-failures).
- **`/api/health` gained an age, not a catalogue.** `ingestAgeS` and `lastRunOk` say how
  fresh the data is, which an external alarm needs and no event is described by.
- Static assets bypass the Worker (`run_worker_first: ["/api/*"]`), so page headers come
  from `public/_headers`, not from Hono.
  The CSP there is narrow and was checked against the running page: MapLibre needs
  `blob:` for its worker, the shadcn chart needs `style-src 'unsafe-inline'`, the
  basemap needs `tiles.openfreemap.org`, and the map's relief shading needs
  `tiles.mapterhorn.com` in `connect-src` only: MapLibre fetches elevation tiles and decodes
  them with `createImageBitmap` (or, where that is missing, through a `blob:` URL, which
  `img-src` already allows), never from the host through an `<img>`.
  Re-check the map and the chart axis labels if you touch it. `test/headers.test.ts` fails
  if `event-map.tsx` names a tile host the CSP does not allow: `pnpm dev` ignores
  `_headers`, so a missing host would only show in production, as a map without that layer.
- **The response headers are the two files below, and nothing else sets them**
  (`test/headers.test.ts` and one case in `worker/test/ingest.test.ts` hold the set):

  | | `public/_headers` (the page) | `worker/index.ts` `secureHeaders()` (every Worker route) |
  |---|---|---|
  | CSP, Permissions-Policy | yes | no — a JSON body renders nothing |
  | X-Frame-Options | `DENY` | `SAMEORIGIN` (Hono's default) |
  | HSTS, X-Content-Type-Options, Referrer-Policy, COOP, CORP | yes | yes, including on 403/429/404/500 |

  The Worker side is Hono's `secureHeaders()` with its defaults, which also adds a few
  inert legacy headers (`X-XSS-Protection: 0`, `X-DNS-Prefetch-Control`, and so on). The
  one override is HSTS, so both files make the same two-year promise. It is `app.use("*")`,
  not `/api/*`, because the Worker also answers the 404 for any path that matches no asset
  (see `not_found_handling` below).
- **No `cors()` and no `csrf()` middleware, on purpose.** `/api/*` is for the page, which is
  same-origin, so it sends no CORS headers at all and the browser refuses cross-origin
  reads by default. Adding `cors()` could only loosen that. Hono's `csrf()` checks only
  unsafe methods with a form content type (`urlencoded`, `multipart`, `text/plain`), and
  the same-origin gate in front of `/api/*` already refuses every such request, and every
  `GET` too. It would never fire. The gate stays hand-written because no built-in covers
  safe methods.

  `Permissions-Policy` denies every feature: the page asks for no geolocation, camera,
  microphone or clipboard, and the map has no locate control, so an allow-list anywhere
  in it would be a mistake. `Strict-Transport-Security` is two years with
  `includeSubDomains`; the `preload` token is there for the grader's sake and is inert —
  `workers.dev` is a public suffix, so this name cannot be submitted to the browser
  preload list. `Cross-Origin-Embedder-Policy` is deliberately **absent**:
  neither `tiles.openfreemap.org` nor `tiles.mapterhorn.com` sends
  `Cross-Origin-Resource-Policy`, so `require-corp` would blank the map.
  This is what takes securityheaders.com from B to A+; it was B because HSTS and
  `Permissions-Policy` were missing (2026-09-19).
  `_headers` does **not** apply under `pnpm dev` — Vite serves the assets itself there,
  and it drops the Worker's own headers too. Check headers against `pnpm preview`, which
  runs the built Worker in workerd and prints `Parsed 2 valid header rules` if the file
  is well formed (the second rule is the asset cache policy under [Performance](performance.md)).
- **`not_found_handling` is `none`, not `single-page-application`.** Every page is a real
  file (`index.html`, and one per zone the build writes, such as `tolima.html`), so the SPA fallback only meant that `/robots.txt`, `/favicon.ico`,
  `/llms.txt` and every crawler's guess answered **200 with the whole app** — a soft 404 that
  also made Lighthouse call robots.txt invalid. An asset miss now falls through to the Worker,
  whose `notFound` handler answers `404 not found` as `text/plain`, with the headers above.

- **The daily USGS job fetches only `https://earthquake.usgs.gov/`.** Its detail and product URLs
  are read out of USGS's own answer, so each is checked against that origin before it is fetched
  (`usgsUrl` in `worker/external.ts`), and a redirect is treated as a failure rather than followed,
  because that check holds for the first hop only; a response can never point the Worker anywhere
  else. It runs
  server-side, so the page's CSP is unchanged. Each fetch has a 20 s timeout, and each digest reads
  only the fields it names and throws on anything else, so a malformed file stores nothing.

Checked and found clean, so do not re-litigate: SQL is fully bound everywhere; event ids are
regex-constrained so the outbound SGC link cannot become `javascript:`; map popups use
`textContent` and the chart's `dangerouslySetInnerHTML` takes only source literals; `onError`
leaks nothing; no secrets in source or history; CI cannot deploy from a pull request.

Still open, with no confirmed exploit: the read routes have
no `LIMIT` or range cap (the rate limit bounds volume, not a single query); and the CI
actions are pinned to major tags (`checkout@v7`, `setup-node@v7`, `pnpm/action-setup@v6`,
all on the `node24` runtime) rather than commit SHAs. Dependabot keeps them and the npm
dependencies current, and patch/minor updates merge and deploy with no review; the 7-day
cooldown and the signed-commit check are the guards (see
[deployment.md](deployment.md#dependency-updates)).

**One of the four is now answered, and the answer is no.** "SGC responses are buffered with
no byte cap" was carried as a memory risk, and it was the leading explanation for the
2026-09-20 kills. It was wrong: those invocations died `exceededCpu`, not out of memory —
see [Concurrency and failure lessons](ingest.md#concurrency-and-failure-lessons). Nothing here has
ever been observed running out of memory. A byte cap may still be worth having as a guard
against a pathological response, but **do not add one believing it fixes the outage**, and
size it from a week of real `sgcChars` rather than from a guess.

The other two are now *measurable* rather than settled, which is the point of
[Debugging production](operations.md#debugging-production): every ingest run records `sgcMs` and
`sgcChars`, so how long SGC holds us and how large its responses get are now on the log
line and in the three-month analytics history. Read a week of them before changing
`IN_FLIGHT_MS` — and until today nothing was writing them down.

**`sgcChars` is characters, not bytes on the wire**, and a byte cap sized from it would sit
*below* the real payload and start refusing good responses: SGC's pages are Spanish, and
every accented character is two UTF-8 bytes to this number's one. It is still the right
figure for the memory question behind that cap, because it is what the isolate is holding.
Counting true bytes would mean encoding the whole ~0.8 MB string a second time, which is
the one thing the 10 ms CPU budget cannot afford.
