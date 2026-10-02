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
- Static assets bypass the Worker, so page headers come from `public/_headers`, not from Hono.
  The three pages run worker-first since 2026-10-02, only so the old workers.dev name can be
  redirected ([Deployment](deployment.md#the-old-urls)); the Worker hands them to `env.ASSETS`
  before Hono, so they get `_headers` and nothing of `secureHeaders()`. Checked against
  `pnpm preview`: `X-Frame-Options: DENY` alone, the CSP and `Speculation-Rules` all present.
  The CSP there is narrow and was checked against the running page: MapLibre needs
  `blob:` for its worker, the header's CSS inlined in each page's HTML needs `style-src
  'unsafe-inline'` (issues #97 and #120: compiled at build time from `index.css` for the header's own
  classes, nothing from a request or the catalogue; so do the two `style="outline:none"`
  attributes Radix puts on the static header's tab panel. What React sets at runtime, a chart's
  positions included, goes through the CSSOM, which the CSP does not restrict. shadcn's chart, which
  injected a `<style>` per chart, needed the keyword first and left with Recharts on 2026-09-30; a
  hash for the one inlined block in its place has not been tried), the
  basemap needs `tiles.openfreemap.org`, and the map's relief shading needs
  `tiles.mapterhorn.com` in `connect-src` only: MapLibre fetches elevation tiles and decodes
  them with `createImageBitmap` (or, where that is missing, through a `blob:` URL, which
  `img-src` already allows), never from the host through an `<img>`.
  Re-check the map and the chart axis labels if you touch it.
  **The explainers' logos are files of this site** (`src/components/explainer/logos/`, issue #144), so
  `img-src 'self'` covers them and no reader's browser asks another host for an image. Only SGC's logo
  is shown: it is in the public domain on Wikimedia Commons (PD-textlogo), with the trademark caution
  that goes with it, which the card respects by saying only that this page's events come from SGC's
  public catalogue. USGS forbids its identifier to other organisations without written permission
  (usgs.gov, "Use of the trademarked USGS identifier by non-USGS organizations"), and ISC publishes no
  policy for ISC-GEM's. Those get their short name in a neutral tile, never in their colours. (Checked
  too, for sources the page names without a card: ESA forbids its logo without written permission,
  esa.int's branding FAQ; GEBCO and Open-Meteo publish no policy.) A link's preview is words written here, not the
  destination's own preview fetched from it: nothing is scraped, and SGC is not asked for anything.
  **One script comes from another host: Cloudflare Web Analytics' beacon** (2026-10-02), a
  `<script type="module">` at the end of `index.html` and `insights.html` (so `choco.html` too).
  `script-src` names its host, `https://static.cloudflareinsights.com`, not its path, so a versioned
  beacon URL still loads; it reports to `https://cloudflareinsights.com`, in `connect-src`.
  `test/headers.test.ts` fails if a page loads a script from a host the CSP does not allow, since
  `pnpm dev` would never show the block. It sets no cookie and stores no identifier, and its
  `data-cf-beacon` token is public by design: Cloudflare counts a report only from bvalue.site (and
  its subdomains), so localhost and preview URLs load it and are not counted. The edge's "automatic
  setup" was tried first and added nothing to this Worker's pages (checked 2026-10-02, three pages,
  uncached); the dashboard is set to snippet installation so the edge never adds a second copy. The
  owner chose it over edge analytics alone for the real readers' Core Web Vitals
  ([Operations](operations.md#the-domains-analytics)).
  **Declined: an `integrity` attribute on it** (2026-10-02). Mozilla Observatory grades the domain
  A+ (125) and takes its only 5 points off for that. Cloudflare's Web Analytics FAQ: "There is no
  current way to safely apply an `integrity` attribute because we do not support version-pinning our
  beacon script"; only their automatic injection adds one, and it never reached these pages. Pinning
  a versioned beacon URL copied from another site would rest on something unsupported that can
  vanish, and would freeze out Cloudflare's own security fixes to the beacon. What bounds the script
  instead: the CSP lets it load only from that one host and report only to `cloudflareinsights.com`,
  and nothing on the page depends on it. Revisit if Cloudflare starts pinning versions.
  **There is no inline script, and none is allowed** (no `'unsafe-inline'`, hash or nonce in
  `script-src`). The head script that sets the page's language and theme before the first paint
  (`src/boot.ts`, 2026-09-28) is a same-origin file under `/assets/`, which `'self'` already covers.
  The static header written into each zone's HTML is React's own render of the header at build time,
  from the page's fixed strings, with nothing from the catalogue or the request in it. `test/headers.test.ts` fails
  if `event-map.tsx` names a tile host the CSP does not allow: `pnpm dev` ignores
  `_headers`, so a missing host would only show in production, as a map without that layer.
  The 3D tab (`src/insights/block3d`) needs nothing more: WebGL is not a CSP directive, and its map
  is a same-origin image baked in advance, so it never reaches OpenFreeMap or Mapterhorn from a
  reader's browser. Only the dev-only bake page does (`bake-basemap.html`, not in the build). Its
  labels and pins are DOM built with `textContent`; the two `innerHTML`s are fixed SVG with nothing
  interpolated from data: the pin's and the compass rose's (whose letters are set with `textContent`).
  Its sea's forecast comes from the Worker (`/api/sea`), and its sea's colour is committed data, so the
  sea adds nothing to the CSP either.
  **The speculation rules come as a file named in a response header** (issue #107, 2026-09-29):
  `Speculation-Rules: "/speculation-rules.json"` on the three pages, and the file served as
  `application/speculationrules+json` (both in `public/_headers`), so the CSP is unchanged. Chrome
  fetched and applied them with the CSP above in force (checked in Chrome 153 through the DevTools
  protocol's `Preload.ruleSetUpdated` and a prerender that activated); the `'inline-speculation-rules'`
  source is only for rules inline in the HTML, which this page has none of. The rules name the three
  pages and nothing else, never `/api/*` (`test/headers.test.ts`). **A prerendered page runs its
  scripts before the reader opens it**, so it must not reach SGC until it is opened
  (`src/lib/prerender.ts`). Before that, a press on the monitor's link in `/insights` that slid off it
  started the back-fill loop and posted `/api/refresh` from a page nobody saw, 151 ms after the press;
  and opening a prerendered monitor counted as a return to the tab, so it sent a focus refresh an
  ordinary load never sends. Two rules now, each at the one place it can hold:
  - **`postRefresh` waits for activation** (`whenActivated`), whoever calls it, so no caller, present
    or future, can send the request from an unopened page. The back-fill starts on a prerendered page
    and its first request leaves when the reader opens it, as on an ordinary load.
  - **A return to the tab is the tab shown again after being hidden** (`useReturnToTab`). Opening a
    prerendered page makes it visible, which TanStack Query reports as focus, but no hide came first.
    A first version subscribed to the focus signal only from the render after `prerenderingchange`,
    which held in Chrome 153 (checked) but only because of the order Chrome sends the two events in;
    the code review (2026-09-29) had it rest on nothing instead.
  A prerender's other requests are reads, and carry `Sec-Fetch-Site: same-origin` like the page's own
  (every one answered 200), within the same 120-a-minute limit. **Declined in the code review:**
  *holding back the page's own error reports* (`POST /api/client-error`) until activation: a prerender
  that fails is the same bug on the same code, the report writes a log line and nothing else, and one
  held back would be lost whenever the reader slid off the link. *Not refetching `/api/status` on
  opening* (its `refetchOnWindowFocus: "always"` fires then): it is 0.3 kB, and it keeps the line under
  the refresh button current when the prerender is older than a press.
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
  `includeSubDomains` and `preload`. On the old workers.dev name the token was inert, since
  `workers.dev` is a public suffix; `bvalue.site` is a registrable domain and qualifies for the
  browser preload list (hstspreload.org: HTTPS on the apex, `http://` redirected to `https://` on
  the same host, which "Always Use HTTPS" does, and this header). Submitting it is the owner's
  call: a listing ships inside browsers, takes months to undo, and holds every future subdomain to
  HTTPS. `Cross-Origin-Embedder-Policy` is deliberately **absent**:
  neither `tiles.openfreemap.org` nor `tiles.mapterhorn.com` sends
  `Cross-Origin-Resource-Policy`, so `require-corp` would blank the map.
  This is what takes securityheaders.com from B to A+; it was B because HSTS and
  `Permissions-Policy` were missing (2026-09-19).
  `_headers` does **not** apply under `pnpm dev` — Vite serves the assets itself there,
  and it drops the Worker's own headers too. Check headers against `pnpm preview`, which
  runs the built Worker in workerd and prints `Parsed 2 valid header rules` if the file
  is well formed (the second rule is the asset cache policy under [Performance](performance.md)).
- **`not_found_handling` is `none`, not `single-page-application`.** Every page is a real
  file (`index.html`, and one per zone the build writes, such as `choco.html`), so the SPA fallback only meant that `/robots.txt`, `/favicon.ico`,
  `/llms.txt` and every crawler's guess answered **200 with the whole app** — a soft 404 that
  also made Lighthouse call robots.txt invalid. An asset miss now falls through to the Worker,
  whose `notFound` handler answers `404 not found` as `text/plain`, with the headers above.

- **The domain (2026-10-02) adds what a workers.dev name could not have.** Each is a zone setting,
  listed in [Deployment](deployment.md#the-domain):
  - **It cannot be used to send mail.** The registrar's email forwarding was removed; a null MX,
    `v=spf1 -all`, an empty DKIM key and DMARC `p=reject` tell receivers to refuse any message
    that claims to be from it.
  - **DNSSEC**, so a resolver can tell a forged answer for the domain from Cloudflare's.
  - **CAA**, so only the CAs Cloudflare uses can issue a certificate for it.
  - **A WAF custom rule** blocks the paths scanners try at the edge: any path ending `.php` or
    `.env`, containing `/.env` or `/.git`, or starting `/wp-`. It began narrower (`/.env*` and
    `/.git*` at the root only) and was widened the same day, when the Worker's logs showed
    `/api/.env`, `/app/.env` and `/config/.env` still reaching it. They found nothing before, but each was a Worker invocation and a log event, because
    an asset miss runs the Worker.
  - **Bot Fight Mode stays off.** On the free plan it cannot be skipped for a path or an agent, and
    it would challenge `ingest-health.yml`'s `curl` and PageSpeed Insights, which `/api/health` and
    the Lighthouse exception exist for.
  - **`/.well-known/security.txt`** (RFC 9116, `public/.well-known/`) points to GitHub's private
    vulnerability reporting, which is on for the repository. Its `Expires` is a year ahead and
    has to be moved before it passes (next: 2027-10-01). `.github/workflows/security-txt.yml`
    fails every Monday from 30 days before, which emails the owner; a test would have blocked
    deploys instead.
  - **Secret scanning and push protection are on** for the repository. Its two extras, validity
    checks and non-provider patterns, are not offered to it: GitHub accepted the request to turn
    them on and left them off (2026-10-02).
- **The daily USGS job fetches only `https://earthquake.usgs.gov/`.** Its detail and product URLs
  are read out of USGS's own answer, so each is checked against that origin before it is fetched
  (`usgsUrl` in `worker/external.ts`), and a redirect is treated as a failure rather than followed,
  because that check holds for the first hop only; a response can never point the Worker anywhere
  else. It runs
  server-side, so the page's CSP is unchanged. Each fetch has a 20 s timeout, and each digest reads
  only the fields it names and throws on anything else, so a malformed file stores nothing.
- **The daily sea-state job fetches one fixed URL** (`SEA_URL` in `worker/sea.ts`, Open-Meteo's
  marine API), nothing built from a response, with a 20 s timeout and redirects refused. It runs
  server-side, so no reader's address reaches Open-Meteo and the CSP is unchanged. `digestSea` keeps
  only numbers, range-checked, and the page shows them as React text; `/api/sea` sits behind the same
  origin check and rate limit as the rest of `/api/*`.
- **The page shows USGS's numbers and none of its strings.** The felt-intensity question renders
  intensities and counts as React text, never DYFI's cell label or PAGER's city name, and its link
  to USGS is built from `sourceEventId` only when it matches `^[a-z]{2}[a-z0-9]{1,20}$`
  (`feltInPereira`), so a stored id cannot turn the link into another path or scheme. The link to
  SGC's felt-report form is a fixed constant. Both are navigations, so the CSP is unchanged. The
  forecast box (`usgsForecast`) is held to the same: USGS's probabilities, counts and dates as text,
  none of the file's strings (its `injectableText` and window labels are never shown; the labels only
  select windows), and its link to `/oaf/forecast` built from `sourceEventId` under the same pattern.

Checked and found clean, so do not re-litigate: SQL is fully bound everywhere; event ids are
regex-constrained so the outbound SGC link cannot become `javascript:`; map popups use
`textContent`; nothing in `src/` uses `dangerouslySetInnerHTML` (shadcn's chart did, and is gone); `onError`
leaks nothing; no secrets in source or history; CI cannot deploy from a pull request.

**The CI actions are pinned to commit SHAs** (2026-10-02), each with its release in a comment
(`actions/checkout@3d3c42e… # v7.0.1`). A major tag such as `@v7` is a pointer its owner, or
whoever takes over the owner's account, can move; the deploy job holds the Cloudflare token, and
a patch or minor Dependabot bump merges and deploys with no review, so a moved tag would have run
in that job unseen. A SHA cannot be moved. Dependabot reads the comment and proposes SHA and
comment together, so the pins stay current through the same 7-day cooldown and signed-commit
check as before (see [deployment.md](deployment.md#dependency-updates)). A new step takes a SHA
too: `gh api repos/<owner>/<action>/commits/<tag> -q .sha`.

### The SGC response cap (2026-10-02)

**The Worker reads at most 8 MiB of an SGC response** (`SGC_MAX_BYTES` in `worker/ingest.ts`,
enforced by `fetchCatalog`'s `maxBytes`). Past it the run fails, recorded and logged like any other
failure (`ingest failed`, `error: "SGC response passed the 8388608-byte cap; abandoned unread past
it"`), and nothing in `events` changes. It is enforced while the body is read, as
`/api/client-error`'s `bodyLimit` is: a declared `Content-Length` over the cap is refused before a
byte is read (`declared N bytes, over the 8388608-byte cap; not read`), and a body without one is
abandoned the moment it crosses it, never buffered and then rejected. It is not retried: the same
request would only make SGC send the same page twice. A refusal's body, kept only as evidence, is
read no further than 16 KiB.

**It does not fix the 2026-09-20 outage, and was not added to fix it.** "SGC responses are buffered with no
byte cap" was carried as a memory risk and was the leading explanation for those kills; they were
`exceededCpu`, not memory (see
[Concurrency and failure lessons](ingest.md#concurrency-and-failure-lessons)), and nothing here has
ever been observed running out of memory. The cap is a guard against a pathological response: an
endless body, or a page that ignored our box. SGC sends ~10 MB for all of Colombia in 2026, and the
ingest files every event of a response under the zone it asked for, so that page would have been
both a memory risk and a catalogue polluted with the rest of the country.

**How it was sized, from real responses.** The task was a week of `sgcChars`. Analytics Engine has
no size field (it had `sgcMs`, never `sgcChars`, though this file said both were in the three-month
history), so the size came from two sources:

| Source | Window | Runs | Largest |
|---|---|---|---|
| `pnpm logs --msg "ingest ok"`, `sgcChars` | 3 days to 2026-10-02 | 40 lines, against 275 ok runs in Analytics Engine over the same days (#180) | **503,562 chars**, a Tolima sweep of 496 events; p99 the same |
| Analytics Engine `sgc_ingest`, `double2` (events per response) | 30 days | 1,544 ok runs | **669 events**, a Tolima sweep (p99 669); Tolima's wide and fast lanes ≤ 514, Chocó ≤ 279 |

The 40 logged runs fit **7.7 kB of page plus 998 characters an event** (997–1,000 across every run
over 50 events), so 669 events is ~0.68 M characters. **Characters are bytes here, almost exactly**:
SGC's rows are ASCII, and the captured page is 796,900 characters and 796,922 bytes, its 22 two-byte
characters (á, í, °) all in the page's chrome. 8 MiB is therefore ~12 times the largest page of the
month, and still ~6 times it if every character were two bytes, which is the allowance
`sgcChars` asked for. A swarm several times busier than September's still fits; a tick that parsed
8 MiB of HTML would take ~250 ms of CPU at htmlparser2's ~25 ms for 0.8 MB, so the 10 ms budget
would fail it long before the cap did.

**The log line now carries `sgcBytes` beside `sgcChars`, and Analytics Engine keeps it as
`double10`**, so the next sizing can read a season of bytes instead of reconstructing them. The bytes
are counted off the stream's own chunks as they are decoded, so they cost no second encode of the
page, which is what kept a byte count off the line before: encoding the decoded ~0.8 MB string again
is the one thing the 10 ms CPU budget cannot afford. The read decodes the chunks with `TextDecoder`
(UTF-8, as `Response.text()` does), not `res.text()`, and joins them once. In Node's V8, on the
captured page in 16 KiB chunks, both take 0.66 ms (300 runs each, warm); workerd cannot time a span
with no I/O in it, so production's `pnpm logs cpu` is the real check.

**`sgcChars` is characters, not bytes on the wire.** It is what the isolate holds once the page is
decoded; `sgcBytes` is what the cap counts. Size a byte cap from bytes.

`sgcMs`, on the log line and in Analytics Engine (`double7`), is what to read before changing
`IN_FLIGHT_MS`; see [Debugging production](operations.md#debugging-production).

### The read routes' row ceiling (2026-10-02)

**`/api/events`, `/api/events.csv`, `/api/stats` and `/api/b-windows.csv` answer from at most 20,000
events** (`READ_ROW_CEILING` in `worker/index.ts`), and past it they fail out loud: a 500,
`no-store`, `{ "error": "the catalogue has grown past 20000 events, more than one answer serves;
narrow it with from and to" }`, and a `read route over its row ceiling` line at error with `zone`,
`ceiling` and `path`. The query asks for one row more than the ceiling (`LIMIT 20001`), so it knows
without counting first, and holds a request to that many rows whatever the catalogue holds.

- **A ceiling, never a page size.** Every one of these routes serves the zone's whole filtered
  catalogue, and the statistics need all of it: an answer from the first 20,000 events would be a
  confident, wrong b-value, and a truncated CSV a quietly short download. A query-level `LIMIT` with a
  "truncated" flag was the alternative; it would have needed every consumer (the page, the CSV
  buttons, scripts) to handle a partial answer, for a state that should never happen. A refusal needs
  nothing of them: the page shows its load error after its usual retries, and the log line says why.
- **What it guards is the catalogue's growth, not a caller.** The audit's wording, "no `LIMIT` or
  range cap", read as if a caller could widen a query. No filter can: `from`, `to`, `minMag`,
  `status`, `cluster` and `excludeMainshock` only narrow, `includeRemoved` adds back the zone's own
  withdrawn rows, and every query is one zone's. So the largest answer is the zone's whole catalogue, which
  the page itself asks for on every load. The per-IP rate limit (120 a minute) still bounds how often.
- **Why 20,000.** On 2026-10-02 Tolima had 1,109 events and Chocó 891 (`/api/health`); the ceiling
  is ~18 and ~22 times those. A row costs ~1.4 KB in V8 as D1's row, the mapped event and its JSON
  together (measured in Node on synthetic rows, 2,000 and 50,000 alike), so 20,000 is ~30 MB of the
  isolate's 128 MB, leaving room for D1's own copy of the result. **The CPU budget meets a growing
  catalogue first**: the Worker's fetch invocations ran ~5 ms median when Chocó held ~800 events (see
  [the CPU budget](ingest.md#the-cpu-budget)), and grow with it. At Tolima's ~90 events a day the
  ceiling is about seven months away; long before then the page's whole-catalogue design needs a
  look, and this line is the tripwire if it gets none.
- **Not on `/api/status` or `/api/health`**: they read a `COUNT(*)` and single rows, never the
  catalogue. `excludeMainshock`'s lookup reads two rows (`LIMIT 2`).
