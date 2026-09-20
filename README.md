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
| `core/` | Shared, runtime-neutral logic: SGC request + HTML parser (`seiscomp.ts`), the one admission gate every event passes through (`admit.ts`), statistics (`gr.ts`, including the one `computeStats` pipeline), CSV, CLI. Used by the Worker, the browser and Node. |
| `worker/` | Hono API (`index.ts`), the one module that decides what ingest is due (`plan.ts`), ingest mechanics (`ingest.ts`), D1 access (`db.ts`), response types shared with the page (`api-types.ts`). |
| `src/` | React page: shadcn/ui, TanStack Query/Form/Table v9, Recharts (via shadcn chart), MapLibre GL. `lib/i18n.tsx` holds every user-facing string in `es` and `en`. |
| `migrations/` | D1 schema. |
| `scripts/` | Operator tools that are not part of the Worker: `logs.ts` reads production's logs from the terminal (`pnpm logs`). |
| `test/`, `worker/test/` | Core tests (Node) and Worker tests (real D1 inside the Workers runtime). Parser fixtures are real SGC responses captured 2026-09-18. |
| `src/**/*.test.ts` | The page's own logic, in a third vitest project (`page`), on `happy-dom`. It lives beside the module it tests because `tsconfig.app.json` is the only project with the DOM lib, JSX and the `@` alias; the same file under `test/` would be typechecked by the Node project, which has none of them. |
| `docs/CLOUDFLARE_SPEC.md` | The original design spec. Its §3 lists every verified fact about the SGC endpoint. |

## Develop

```sh
pnpm install
pnpm db:migrate:local     # once, and again whenever database_id in wrangler.jsonc changes (see gotchas)
pnpm dev                  # page + Worker + local D1 on one port

# fill the local database: each call loads one missing week (6 calls on a fresh DB).
# The header is required: /api/* refuses a caller with no same-origin signal (see API).
curl -X POST -H 'Sec-Fetch-Site: same-origin' http://localhost:5173/api/refresh

pnpm test                 # 275 tests, offline
pnpm test:live            # one test against the real SGC server
pnpm typecheck
pnpm logs                 # production's own logs, from here (see Debugging production)
```

CLI:

```sh
pnpm cli fetch --out data/events.csv
pnpm cli bvalue --input data/events.csv --windows
pnpm cli bvalue --input data/events.csv --windows-out data/b-windows.csv
pnpm cli bvalue --input data/events.csv --mc 2.5 --manual-only --exclude-mainshock
pnpm cli bvalue --input data/events.csv --cluster shallow --windows   # always prints both clusters; --cluster narrows the windows
pnpm cli fetch --start 2026-09-01 --bbox=-77.4,4.1,-76.1,5.6 --out data/sep.csv
```

`--bbox` is `lonMin,latMin,lonMax,latMax`; use the `=` form because the value starts with a minus.

## How it stays current

| Trigger | What it does |
|---|---|
| Cron `*/15 * * * *`, tick minute not divisible by 30 | **The fast lane.** Re-reads the trailing 1 day (`TRAILING_FAST_DAYS`), inserts and updates only. It never retires an event: a 1-day window holds a handful of events, too few for the `MAX_REMOVAL_SHARE` guard to engage, so one short response could retire real ones. It also stands down entirely while SGC is unwell — see [rate limits](#sgc-rate-limits-and-the-request-budget). |
| Cron `*/15 * * * *`, tick minute divisible by 30 | Re-reads the trailing 3 days, with removals. |
| Cron `*/15 * * * *`, tick minute 0 | The above, then re-reads the least recently *attempted* 7-day chunk since the mainshock, to catch late revisions. While history is incomplete this sweep runs on **every** wide tick instead of hourly. |
| `POST /api/refresh` (the button) | While history is incomplete: loads one missing chunk per call. Otherwise: trailing 3 days, at most once per 15 minutes. Stands down if another run is in flight — the claim is atomic, so a burst of concurrent calls still produces one SGC request. Since the throttle is the cron's own period and counts *any* run, a press usually stands down; that is the intended outcome and `refreshWait` says the reader already has the newest data rather than counting down. |
| Returning to the open tab | The page sends `POST /api/refresh` itself, through TanStack Query's focus signal (`focusManager.subscribe`), but only when the last SGC query is older than the throttle. The Worker's own limit is what protects SGC, whatever the number of visitors. |
| The open page | Re-reads `/api/status` every minute and whenever the tab becomes visible again (polling pauses in a hidden tab). Re-reads `/api/events` as soon as status reports a newer successful ingest, and on focus when older than a minute. "Última consulta al SGC" is the last successful ingest; the page shows no second "checked at" time, which was tried and confused the reader. |

The tick's own minute is `tickMinute(scheduledTime)`, which snaps to the nearest tick —
never to the nearest minute, because the dispatch is not punctual and that mistake cost a
day of wide ticks. `TICK_MS` in `worker/plan.ts` must equal the cron above. See [the lane note](#concurrency-and-failure-lessons).

Ingest upserts by event id, only touches rows whose data changed, marks events
SGC stops returning as removed (never deletes), and changes nothing when the
fetch or parse fails. A response that would retire more than 20% of a window's
events is not trusted for removals.

## API

`GET /api/events`, `/api/events.csv`, `/api/stats`, `/api/b-windows.csv` (b over time, one
row per window), `/api/status`, `POST /api/refresh`, `POST /api/client-error`.
Filters: `from`, `to` (a bare date is inclusive of that day), `minMag`, `status`,
`includeRemoved=1`, `excludeMainshock=1`, `cluster=shallow|deep` (anything else is a 400), and `mc`
on `/api/stats` and `/api/b-windows.csv`. With `cluster`, the statistics keep the Mc of the whole
filtered catalogue, as the page does.

**`/api/*` is same-origin only.** The Worker serves a request only when it carries
`Sec-Fetch-Site: same-origin`, or an `Origin` equal to its own; anything else gets 403.
A caller that sends neither header — `curl`, a script, a link in someone else's page —
has no positive same-origin signal and is refused. That is deliberate: the data is public
SGC data, but serving the whole catalogue to any direct caller is what we are avoiding.
Headers are forgeable and this is **not** authentication; it keeps the raw feed out of
casual reach. Use the page's download buttons, or `pnpm cli fetch`, which talks to SGC
directly and is unaffected.

Two exceptions:

- `GET /api/health` is open to anyone: `{ ok, totalEvents, ingestAgeS, lastRunOk }`, no
  catalogue data. It is what the deploy smoke test and any uptime check should call.
  **`ingestAgeS` — seconds since ingest last succeeded, `null` if it never has — is the
  field an external alarm reads**, and it is the only thing about this system that an
  outside caller can ask. Both real outages looked identical from outside without it: the
  Worker up, the page rendering, `/api/health` answering `ok`, and the catalogue nine
  hours stale. `.github/workflows/ingest-health.yml` is what asks.
- `/api/*` is also rate limited per IP (120 requests/minute, `ratelimits` in
  `wrangler.jsonc`), which applies before the origin check. Over the limit is 429.

`POST /api/client-error` takes `{ message, stack?, source?, path? }` from the page and
writes one `page error` log line. It stores nothing and touches no table. It is **not** an
open endpoint — it is under `/api/*`, so the same-origin check and the rate limit stand in
front of it exactly as they do for `/api/events` — and it reads only those four fields, out
of a body capped at 4 KB before anything is buffered. See
[the page's own failures](#the-pages-own-failures).

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

- secret `CLOUDFLARE_API_TOKEN`: the "Edit Cloudflare Workers" template plus *Account · D1 · Edit*, limited to the AI-SDLC account. Add *Account · Workers Observability · Read* to the same token — or a separate one — if you want `pnpm logs` to work; CI does not need it
- secret `CLOUDFLARE_ACCOUNT_ID`
- variable `PRODUCTION_URL` = `https://choco.sgc-swarm.workers.dev` (optional; enables the smoke test)

`sgc-canary.yml` runs the live SGC test daily so a change to their form is noticed.
`ingest-health.yml` asks production every half hour how stale the catalogue is, and fails —
which is to say, emails you — when it has gone an hour without a successful ingest. It needs
`PRODUCTION_URL` and nothing else.

A brand-new `workers.dev` hostname takes about a minute to resolve; `curl` returns
`000` until then. That is propagation, not a failed deploy. A *new version* of an
existing Worker also takes a few seconds to reach every edge, so the smoke test can
still hit the version being replaced — which 404s any route the deploy is adding.
That is why its `curl` passes `--retry-all-errors`: plain `--retry` covers only
connection errors and 5xx, and the deploy that introduced `/api/health` failed on
its own first 404.

## Debugging production

Everything below exists because two faults ran for hours with nothing to read. Start here
before guessing; the reasoning behind each piece is under
[Observability decisions](#observability-decisions).

### The four places to look

| Where | Holds | Kept | Read it with |
|---|---|---|---|
| **Workers Logs** | Every line `worker/log.ts` writes, plus one invocation log per request with `$workers.cpuTimeMs`. | **3 days** (free plan) | `pnpm logs`, or the Worker's *Observability* tab |
| **Analytics Engine** (`sgc_ingest`) | One row per ingest run: lane, outcome, counts, duration, SGC status. | **3 months** | the [SQL API](https://developers.cloudflare.com/analytics/analytics-engine/sql-api/) |
| **D1 `ingest_runs`** | The same outcomes, authoritative, and what the page and the lane rules actually read. | forever | `wrangler d1 execute` |
| **`GET /api/health`** | `ingestAgeS`, `lastRunOk` — right now, from outside, with no credentials. | — | `curl` |

`pnpm logs` needs an API token with *Account · Workers Observability · Read*
(`CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`). A `wrangler login` OAuth token is
**not** enough — verified 2026-09-20, it answers 403 *Authentication error*, because its
`workers_tail:read` scope is the live tail and not the stored logs. The script says so when
it happens.

```sh
pnpm logs                                  # the last hour, oldest first
pnpm logs --since 12h --level error        # just the failures
pnpm logs --since 3d --msg "ingest failed"
pnpm logs lanes --since 24h                # how many runs each lane made
pnpm logs cpu --since 24h                  # p50/p90/p99/max CPU per invocation
pnpm exec wrangler tail choco --format json  # live, for something happening now
```

### Every line the Worker writes

One JSON object per line. `level`, `time` and `msg` are always there; a line about a run
also carries `lane` and `trigger`.

| `msg` | Level | When | The fields that matter |
|---|---|---|---|
| `tick planned` / `tick stood down` | info | every cron tick | `tickMinute`, `lanes`, `sgcUnwell`, `backfill`, `inFlight` |
| `ingest ok` | info | a run finished cleanly | `runId`, `fetched`, `inserted`, `updated`, `removed`, `durationMs`, `sgcMs`, `sgcBytes` |
| `ingest ok with a note` | warn | it worked, but skipped a removal or a bad row | `error` carries the note |
| `ingest failed` | error | SGC or D1 refused | `httpStatus`, `retryAfterS`, `error` |
| `reaped abandoned runs: an invocation was killed` | **warn** | a claimed run never wrote a result | `reaped` |
| `refresh stood down` | info | the button did nothing | `why`: `throttled`, `in flight`, `claim held` |
| `unhandled error` | error | a route threw | `err.stack`, `method`, `path` |
| `page error` | warn | the reader's browser threw | `page.message`, `page.stack`, `page.userAgent` |
| `ingest stood down: claim held` | debug | two runs raced for the same window | — |

### Symptom → what to ask

- **"The page is showing old data."** `curl $PRODUCTION_URL/api/health` first: `ingestAgeS`
  is the whole answer to *how* stale. Then `pnpm logs --since 6h --level error`. An
  `ingest failed` line with `httpStatus` means SGC refused us — the back-off is working as
  designed and the wide tick is still probing. **No error lines at all is the worse case**:
  look for `reaped abandoned runs`, which means invocations are being killed rather than
  failing.
- **"Invocations are being killed."** That is the 2026-09-20 fault, and `reaped` is the
  only signal for it. The invocation log for the killed tick carries the outcome and
  `$workers.cpuTimeMs`; `exceededCpu` there means the 10 ms limit, and the fix is the paid
  plan or a smaller `SWEEP_CHUNK_DAYS`. If CPU is fine, the suspect is memory — `sgcMs` and
  `sgcBytes` on the *last* successful run of that lane say how large the responses had got.
- **"Nothing has reached SGC for ages and there are no failures."** `pnpm logs lanes
  --since 24h`. A healthy day is roughly four `fast` runs per `wide` one and a `sweep` on
  the hour. All `fast` and no `sweep` is the `tickMinute` fault returning; only `wide` and
  `sweep` means `sgcUnwell` is holding the fast lane down, so look for the 429/503 or the
  failed run that did it.
- **"The refresh button does nothing."** Usually correct behaviour: `refresh stood down`
  with `why: throttled` means a cron run happened within 5 minutes, which is most presses.
  `why: in flight` or `claim held` means a run was already talking to SGC.
- **"It broke in the browser."** `pnpm logs --since 24h --msg "page error"`. Nobody is
  watching that console — it is one researcher's tab — so this is the only record.
- **"Is `b` wrong?"** Not an observability question. Check `backfill` on any `tick planned`
  line: statistics from an incomplete history are confidently wrong (see
  [the science](#the-science-and-how-not-to-mislead-with-it)).

### The history that outlives the logs

Three days is shorter than this project's slowest fault. Anything older than that is in
Analytics Engine, one row per ingest run, for three months. The field positions are the
schema and are listed in `worker/analytics.ts` — **only ever append to them**; a query says
`blob2`, not a column name, so inserting a field in the middle silently re-labels every
point already written.

```sh
# Failed runs per lane, per day, over the last month.
curl "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/analytics_engine/sql" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" --data "
    SELECT toDate(timestamp) AS day, blob2 AS lane,
           SUM(double1) AS ok, COUNT() - SUM(double1) AS failed,
           quantile(0.9)(double6) AS p90_ms, MAX(double7) AS slowest_sgc_ms
    FROM sgc_ingest WHERE timestamp > NOW() - INTERVAL '30' DAY
    GROUP BY day, lane ORDER BY day DESC"
```

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
- **SGC accepted requests from Cloudflare's network, and then stopped** (2026-09-18 →
  2026-09-20). From 12:40 UTC on 2026-09-20 the deployed Worker got **410 Gone** on requests
  that had succeeded five minutes earlier, with no deploy in between, while the canary made
  the *same* request with the *same* user-agent from GitHub's runners and got a normal 200 at
  13:33. So the endpoint has not moved and the request is not malformed: the difference is
  the caller. Treat "our network can be refused" as a live possibility, and **the canary is
  the instrument that tells the two apart** — it reaches SGC from somewhere else. If a
  fallback is ever needed this is the shape of it; nothing is built yet.
- The per-event page `https://www.sgc.gov.co/detallesismo/<id>/resumen` exists but
  returns 403 to `curl` without a browser user-agent.
- **SGC publishes an event about 2–5 minutes after it happens** (measured 2026-09-19
  against production: every `first_seen_at` landed on a cron boundary, and the smallest
  origin-time-to-`first_seen_at` gap across the live-detected events was 5.0 min, with a
  second at 6.8 min). Our own cron was the larger delay, which is why it is 5 minutes.
  Polling faster than SGC publishes buys nothing, so **never go below 5**. We ran at 5 for
  one day (2026-09-19 → 20) and then went back to **15 deliberately** — not because 5 was
  too fast for SGC in any measured sense, but because SGC began refusing this Worker's
  address the next afternoon and ~120 requests/day is the load that had run for weeks
  without incident. The cost is median detection going from ~5 min back to ~10. Revisit it
  only once SGC has been answering us steadily again, and change the three constants
  together (see the budget below).
- Analyst-revised events can appear hours late — two events from 00:43 and 00:55 were
  first seen at 05:45 and 06:15. No polling rate fixes that; it is what the sweep is for.

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

### SGC rate limits and the request budget

No documented limit and none observed: `bdrsnc.sgc.gov.co/robots.txt` is a 404, so there
is no stated crawl policy, and no run has ever seen a 429 or a 503 from the form. That is
not a licence to hammer it — it means the Worker has to notice a limit if one ever appears.

- We send an identifying `user-agent` (`sgc-swarm-research/0.1`) and query with the
  bounding box and the narrowest window that answers the question.
- The budget: **~120 SGC requests/day, ~13 MB/day** — 48 narrow ticks, 48 wide ticks and
  24 sweeps. Measured, not guessed: a response is 7.7 KB of page chrome plus 1.00 KB per row
  (the two fixtures), and at the September 2026 rate the narrow span holds ~59 rows against
  the wide span's ~109 and a sweep chunk's ~173 — so ~67, ~117 and ~182 KB per request, and
  48·67 + 48·117 + 24·182 ≈ 13.2 MB. It is **not** the 16 MB/day of the original 15-minute
  config: that one had no narrow lane, so all 96 ticks pulled the wide span. Same request
  count, fewer bytes.
  Re-derive these if the sequence's rate changes; they scale with events per day.
  **Three constants decide this number and they have to agree**: the cron in
  `wrangler.jsonc`, `TICK_MS` and `WIDE_TICK_EVERY_MIN` in `worker/plan.ts`. When they did
  not, an hour silently became twelve requests with no removals and no sweep at all, for a
  day. The budget is a test now, not a paragraph: `plan.test.ts` walks a real hour of ticks
  at four dispatch offsets and counts what it sends.
  For reference, the 5-minute cadence we ran for one day was **~312/day, ~29 MB/day**, and
  the original 15-minute one **~120/day, ~16 MB/day**.
- Visitors do not add to that. `REFRESH_MIN_INTERVAL_S` counts *any* run, cron included,
  and **it is set to the cron's own period** so a press nearly always coincides with a tick
  that was going to happen anyway. That is what makes this bullet true rather than hopeful:
  drop the throttle below the cron and a reader with a fast finger adds requests the budget
  above never counted. **That number, not the number of people with the page open, is what
  bounds our load on SGC.**
- **Only a 5xx other than 503 is ever retried** (`retryableStatus` in `core/seiscomp.ts`).
  The retry loop exists for a flaky connection, and a status line is not one: SGC answered.
  429 and 503 are SGC asking us to stop, and retrying is the one thing that makes being rate
  limited worse; every other 4xx is a deterministic answer about the request itself, so a
  second identical request can only get the same answer and cost the server another one.
  `Retry-After` (seconds or HTTP date) is honoured.
- The status is stored on the run (`ingest_runs.http_status`, `retry_after_s`), not parsed
  back out of `error`, so rewording a message cannot quietly disable the back-off.
- `sgcUnwell` (`worker/plan.ts`) then stands the fast lanes down, on two independent rules. **Any** failed
  run holds it down until one succeeds — an HTTP status is no weaker a signal than a
  timeout, so 403 and 500 must not get a *bounded* wait where a timeout gets an open-ended
  one. A 429 or 503 additionally holds it down for `Retry-After` or 30 minutes **even once
  a later run has succeeded**, because being answered is not being welcome. The wide tick
  and the sweep keep running throughout, and are what let the fast lane back in.
- **A refusal thins the probe out; it never stops it** (`sgcRefusing` in `worker/plan.ts`).
  `sgcUnwell` above gates only the fast lanes, and the wide tick deliberately never stands
  down — so when SGC began answering **410 Gone** to the Worker on 2026-09-20 there was
  nothing in the back-off that covered it, and the probe would have knocked on a closed door
  **96 times a day, indefinitely**. 401, 403, 410 and 451 are a door held shut rather than a
  bad day: once one of them has persisted for `REFUSAL_GRACE_S` — **two wide ticks, derived
  from `WIDE_TICK_EVERY_MIN` and never written down** — the wide tick drops to one probe an
  hour, and so does the refresh button, since a press is the same request from the same
  address and the rule lives in `plan.ts` once rather than being restated at a caller.
  Writing that number down is how it broke: left at a literal 1800 s when the wide tick went
  to 30 minutes, the first tick after a failure landed exactly *on* the boundary, so the
  grace was unreachable and one transient 410 bought 90 minutes of silence — the freeze the
  rule exists to prevent. The other half of that was `sinceLastRunS` measuring from
  `finished_at`, so a run's own 1–13 s pushed the hourly probe past its tick as well.
  **These intervals are measured from when a run started**, because what they ration is
  requests leaving. `plan.test.ts` walks the single-410 timeline tick by tick. It
  is deliberately *not* a stand-down: a probe that stopped could never see SGC come back.
  429 and 503 stay out of that list; they have their own cooldown, which SGC itself names.
  A 5xx is their bad day and keeps the full rate, because the probe is what recovers from it.
- **The health rule reads a bounded window of runs** (`HEALTH_WINDOW_RUNS` = 12 in
  `worker/db.ts`, an hour of ticks). It is what tells one bad answer from a streak, and it is
  a fixed count on purpose: this is a hot query over a table that gains ~312 rows a day.
- **The cooldown is clamped to 5 minutes … 6 hours.** Both ends are load-bearing.
  `Retry-After: 0` — which an already-elapsed HTTP date parses to, and clock skew makes
  reachable — would otherwise compute a zero-length cooldown and switch the back-off off in
  precisely the case it exists for. At the other end `Number()` happily reads `"1e9"`, which
  would hold the lane down for decades.
- So an SGC rate limit we have never seen would throttle us back to the old 15-minute
  cadence or slower by itself, with nobody deploying a fix.

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
- **There are two clusters, and depth alone separates them** (`core/clusters.ts`, cut at
  `CLUSTER_DEPTH_KM` = 70). Measured on production, 2026-09-19, 799 events: depth is bimodal
  with a near-empty gap (286 events at 40–45 km; 5, 5, 1, 6 in the four 5-km bins from 55 to
  75 km; 33–39 per bin at 80–95 km), and the groups are also apart on the map — shallow at
  4.3–4.6 N, 76.6–76.8 W under Istmina/Sipí, deep at 4.7–4.9 N, 76.2–76.5 W around the
  mainshock (itself at 103 km). Any cut from 55 to 75 km moves shallow b by 0.003 and deep b by
  0.011; a test holds that on the fixture, so if SGC's revisions ever put a population on the
  cut, it fails. 70 km is used because it is also the conventional shallow/intermediate
  boundary. No lat/lon term and no clustering algorithm: the data does not need one and the
  page could not explain it.
  - Shared Mc 2.3: shallow **b = 0.732 ± 0.031** (n = 447), deep **b = 0.816 ± 0.112** (n = 90).
    Fixture figures, which the tests pin: 0.738 ± 0.032 (n = 438) and 0.816 ± 0.112 (n = 90).
    All were recomputed independently in Python.
  - **The two b-values cannot be told apart** (Utsu 1992 test, p = 0.24; `bDifference` in
    `core/gr.ts`). The page says that in words. "Two different b-values" is not the finding.
  - **The September slide in b is inside the shallow cluster and is not a mixing artefact**:
    1.08 ± 0.07 → 0.59 ± 0.04 over its own 150-event windows, stronger than in the mixture.
    The magnitude-type caveat above still applies inside the cluster: with MLr_1 only, the
    shallow windows end at 0.82. The split does not settle that, and the page must not imply it.
  - **What really differs is activity.** The deep cluster is a finished aftershock decay: 73 of
    its 90 events ≥ Mc came in the first week, none in the sixth, and its three M ≥ 4 events were
    all over by 13 August. The shallow cluster is all of the current activity and its large
    events are becoming more frequent (20 of its 25 M ≥ 4 events since 8 September). For a reader
    who is not a seismologist this is the useful part, so the "Dos grupos de eventos" card leads
    with it and the daily-count bars are stacked by cluster.
  - **Both clusters use the Mc of the whole filtered catalogue**, like the magnitude-type tabs,
    so only the population differs. `computeClusterStats` is the one place that rule lives; the
    page, `/api/stats?cluster=` and the CLI all go through it. Never call `computeStats` on a
    cluster's own events, which would give it its own Mc. The magnitude-type tab is the same rule
    and lives in `measure` in `src/lib/scope.ts` — see [the page's scope](#the-pages-scope). A cluster whose own maximum-curvature
    Mc is higher than the shared one gets a caution badge (b would be biased low); today both
    are 2.3.
  - The deep cluster has too few events for 150-event windows, and smaller windows (±0.11–0.16)
    say nothing a reader should act on. It gets one b with its error bar, and the chart says why.
  - "Low b is common for intermediate-depth sequences" used to be on the page as context for the
    slide. It was misplaced: the low b is in the *shallow* cluster. The caveat now describes the
    two groups instead.
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
- **…but a run past the in-flight window with no result is neither**, and until
  `reapAbandonedRuns` (`worker/db.ts`) nothing said so. `ingest()` records its own failures,
  so a row left open means the invocation itself was killed — out of memory, out of CPU, or
  evicted mid-fetch. Production did exactly that on **112 consecutive ticks, 02:50–12:05 UTC
  on 2026-09-20**: every reader asks about *finished* runs, so the newest one stayed a
  success from before the trouble, `sgcUnwell` stayed false, the fast lane kept its cadence
  into whatever was killing it, and the page showed no error at all while the catalogue went
  nine hours stale. `readHistory` now closes those books first — one `UPDATE`, dated the
  instant the run stopped counting as in flight, never later, so a row that sat open for
  hours does not push the visitor's throttle out by hours. Everything downstream then sees
  an ordinary failed run, and none of it needed a second rule. `ok = 0` with no `error` was
  the one state the schema allowed and nothing wrote.
  - **The cause of the kills is still unknown**, and the three-day log window that made it
    unanswerable is why the observability work happened. `reapAbandonedRuns` returning a
    non-zero count is now a **warn** — `reaped abandoned runs: an invocation was killed` —
    which is the one line that says an invocation of this Worker died rather than failed.
    Alert on it, and read it first in any report of stale data. The invocation log beside it
    carries `$workers.cpuTimeMs` and the outcome, which is what would name the cause.
- The back-fill fast lane (no throttle wait) is only open while SGC is answering.
  After a failed run everyone waits, so a broken SGC is never hammered.
- **One module decides what ingest is due, and both callers ask it** (architecture review
  candidate 02, 2026-09-19). `dueNow` in `worker/plan.ts` takes the clock and one reading of
  the run history and returns a plan — the steps to run, the claim's `minIntervalS`, and the
  `retryAfterS` to answer with. `scheduled()` and `POST /api/refresh` each call it once and
  then `runPlan`. It is pure, so every lane rule is tested in `worker/test/plan.test.ts`
  without a database. The rule that forced it: the route used to open its back-fill fast lane
  on `last === null || last.ok`, which ignores the cooldown a 429 or 503 asked for, so after a
  rate limit and a later success the button reached SGC with no wait while the cron's own fast
  lane was standing down. Both now read `sgcUnwell`. A closed lane costs the wait, not the
  chunk — the sweep still runs, and is what lets the lane open again. **Do not re-state an
  availability rule at a caller**; it belongs in `plan.ts`.
- `IN_FLIGHT_MS` (150 s) is defined once, in `plan.ts`. `runInFlight`'s default used to be a
  second literal `150_000`, so the pre-check the page is answered from could disagree with the
  atomic claim that actually holds.
- The sweep orders chunks by last **attempt**, not last success. Otherwise one
  chunk that keeps failing is retried forever and starves the rest.
- **There is exactly one cron pattern, and a second one cannot be added safely.** Every
  lane hangs off the one cron and is chosen by `scheduledTime`'s minute. At the 5-minute
  cadence a second pattern lands at
  best 120 s from this one — the furthest a non-multiple-of-5 minute can sit from a tick —
  and that is *inside* `IN_FLIGHT_MS` (150 s), so the two keep landing in each other's claim
  window: in one direction `claimIngestRun` drops a run silently, in the other the older run
  has aged out of the window and both query SGC at once. This bit the first version of the
  5-minute change, where the sweep sat on its own `7 * * * *`. The sweep now runs in the wide
  tick's own invocation, in sequence, which is race-free by construction. Two ingests in one
  invocation is already proven here: the back-fill path has always done it.
- **The lane is snapped to the nearest tick, not the nearest minute** (`tickMinute` in
  `worker/plan.ts`). `controller.scheduledTime` is **not** the round minute: production
  dispatches this Worker's five-minute cron at **:45 past**, verified in `wrangler tail`
  (`scheduledTime` 12:55:45.000Z, 13:00:45.000Z). Rounding that to the nearest *minute* read
  every tick as the minute after — and for a five-minute cron the minute after is never a
  multiple of 15. So from the deploy of the 5-minute cadence (2026-09-19 20:27 UTC) until
  this was found the next day, **every single tick took the fast lane**: 195 cron runs, all
  with a 1-day window, no removals ever applied and not one sweep — the newest `trigger =
  'sweep'` row was from before the deploy. Worse, the fast lane is the one lane that stands
  down when SGC is unwell, so there was nothing left to probe SGC and let it back in: the
  410 above stopped the Worker talking to SGC at all, and the only thing still reaching it
  was a reader pressing the button. `Math.round(t / 300_000) * 5 % 60` leaves 2.5 minutes of
  slack either side of the dispatch instead of 30 seconds. `tick()` in
  `worker/test/ingest.test.ts` dispatches at :45 by default so every lane test runs against
  the shape production sends; `plan.test.ts` walks a whole hour at four different offsets.
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

The account is on the **Workers free plan**, whose ceilings are 100,000 requests/day,
5,000,000 D1 rows read/day, 100,000 D1 rows written/day, 50 subrequests and 50 D1 queries
per invocation, and **10 ms CPU per invocation** — wall time is not the limit, and runs
finish in 1–13 s of it. 96 cron invocations a day, and the ~70k D1 rows read measured at
312, are nowhere near the daily allowances; 10 ms CPU is the one that could bite, and **polling more often does
not change per-invocation CPU**, so the cadence neither helps nor hurts it.

That ~70k only holds because `ingest_runs` is indexed for it. **Do not add a hot query
over `ingest_runs` without an index**: the table grows ~120 rows/day, and the four queries
that run on a tick — `readHistory`'s rate-limit lookup, `runInFlight`, `backfillProgress`
and `ingestSweep` — were full scans when the 5-minute cadence landed. **Every figure in this
paragraph was measured at that cadence** (312 invocations/day, 192 fast ticks, ~70k rows
read); at 96 invocations/day they are all roughly a third lower, and none of them was
re-measured, so treat them as the ceiling they were derived as.
Unindexed, that is ~5.4M rows/day at three months and ~21M at a year, i.e. through the
free plan's 5M and climbing. `migrations/0003` fixes it: `ingest_runs_rate_limited` is a
**partial** index holding only the runs SGC refused, so the ordinary case reads an empty
index rather than every run ever recorded, and `ingest_runs_sweep`'s column order makes
two more covering searches over the sweep rows alone. `runInFlight` was the one 0003 missed
— measured on production at 357 of 357 rows per call, on every tick *and* every
`POST /api/refresh` — and `migrations/0004` gives it, `claimIngestRun`'s own `NOT EXISTS`
and `reapAbandonedRuns` the same treatment: `ingest_runs_unfinished` is partial over
`finished_at IS NULL`, which normally holds one row or none. Check `EXPLAIN QUERY PLAN`
before adding a fifth; `worker/test/ingest.test.ts` asserts this one.

Still open: that 10 ms has **not been measured**, but it no longer needs a `wrangler tail`
left running to catch a tick. Workers Logs publishes `$workers.cpuTimeMs` on every
invocation log, so `pnpm logs cpu --since 24h` reports p50/p90/p99/max across a whole day
of ticks. **Run it and record the numbers here**, per lane. If a run ever fails with a
CPU-limit error, the fixes are the paid plan or smaller sweep chunks (`SWEEP_CHUNK_DAYS`).
Note that nothing inside the Worker can measure this: `Date.now()` does not advance between
I/O operations in workerd, so a span with no `await` in it always reads 0 ms. Wall time we
can measure and do (`durationMs`, `sgcMs`); CPU time only the runtime can see.

### Observability decisions

How to *use* any of this is under [Debugging production](#debugging-production). This is
why it is shaped the way it is. All of it was measured here, on 2026-09-20.

- **A log line is one JSON object, handed to `console` as an object.** Workers Logs
  extracts and indexes the fields of a single object argument and nothing else. Two
  arguments become an array; a string you assembled yourself becomes one opaque blob you can
  only grep. That one rule is the whole reason `worker/log.ts` exists, and it is what
  `worker/test/log.test.ts` pins.
- **pino was measured and rejected, twice over.** Imported plainly into this build it
  resolves to the *Node* build — Vite's Cloudflare plugin polyfills `sonic-boom` and
  `thread-stream` inline — which costs **+129 KB on a 197 KB Worker** and, worse, arrives in
  Workers Logs as the *string* `stdout: {"level":50,…}`, because the Node build writes
  through a `process.stdout` shim. None of its fields are queryable. Aliased to
  `pino/browser` with `browser: { asObject: true }` it behaves (+17.9 KB, one clean object),
  but that is two pieces of configuration with nothing to stop either being dropped — and
  **vitest already resolves a different pino build than the Vite build does**, so the tests
  would not be exercising the logger production runs. `worker/log.ts` is ~60 lines, costs
  nothing, keeps pino's shape (`level`/`time`/`msg`, child bindings) and is tested as the
  thing that ships. Do not re-litigate this without re-measuring.
- **`level` is a word, not pino's number.** The dashboard groups by literal values, and
  `level = "error"` reads as itself where `50` needs a lookup table. No `pid` or `hostname`
  either: there is no process and no host.
- **An `Error` is flattened by the logger, never by the call site.**
  `JSON.stringify(new Error())` is `{}`, so an un-flattened error is a line that says
  nothing at exactly the moment it matters. One level of `cause` is followed, because that
  is where `core/seiscomp.ts` puts SGC's HTTP status. Same reasoning as `admitEvent`: put
  the rule in the one place, not at every door.
- **The read routes log nothing per request, on purpose.** Their status and CPU time are
  already in the invocation log Cloudflare writes for free. The free plan allows 200,000 log
  events a day and an invocation log spends one of them; this Worker's own lines are 288
  cron ticks × 3–5, plus whatever the page polls. Adding a line to `/api/events` would
  double the bill for something we already have.
- **`Date.now()` does not advance between I/O in workerd.** So any span that contains no
  `await` measures 0 ms, and timing a parse inside the Worker is not possible. That is why
  `CatalogCost` records `bytes`, `fetchMs` and `attempts` but deliberately no parse time,
  and why CPU has to come from `$workers.cpuTimeMs`.
- **Which lane a tick took is a stored field, not something to infer.** `IngestLane` lives
  in `plan.ts` beside the rule that chooses it. For a day, 195 ticks in a row took the fast
  lane and nothing anywhere wrote that down; `pnpm logs lanes` is now a single query for it.
- **The free tier covers all of this.** Workers Logs: 200,000 events/day, 3 days, included
  on the free plan. Analytics Engine: 100,000 data points and 10,000 read queries a day,
  kept **3 months**, and currently not billed at all. Source maps: free. Tail Workers and
  Logpush are **paid-only** and are not used. Cloudflare has no Workers alert on the free
  plan either, which is why the alarm is a scheduled GitHub Actions job against
  `/api/health`.
- **Three days is shorter than this project's slowest fault**, which is the entire argument
  for the Analytics Engine dataset: one row per ingest run, ~350 a day, ~0.35% of the free
  allowance, and every run stays readable for a season. Its **field positions are its
  schema** — a query says `blob2`, not a name — so only ever append, and leave a dead slot
  empty rather than closing the gap.
- **`upload_source_maps` needs the build to emit a map**, and the map must be the Worker's
  only. `build.sourcemap` at the top level would also emit maps for the client bundle, and
  those are static assets: they would be published beside the page and hand over the whole
  source. It is scoped to the `choco` environment in `vite.config.ts`, which puts
  `index.js.map` in `dist/choco/` and nothing in `dist/client/`. Confirm on the first deploy
  by reading a stack trace in Workers Logs; the `--dry-run` output does not show it.

<a id="the-pages-own-failures"></a>
#### The page's own failures

Nobody is watching this page's console — it is one researcher's tab — so a MapLibre worker
that never loads, a Recharts crash or a hashed chunk that 404s after a deploy left the
reader with a broken page and left us with nothing. `src/lib/report-error.ts` posts to
`POST /api/client-error`, which writes one `page error` line and stores nothing.

- **It is not a third-party SDK and not an open endpoint.** Same-origin, our own Worker,
  nothing added to the CSP, no script from anyone else, no cookie or identifier. The route
  sits under `/api/*`, so the same-origin check and the 120/minute per-IP rate limit already
  stand in front of it; a caller without a same-origin signal gets 403 before the handler runs.
- **The body is capped at 4 KB while it is being read**, not after — the stream is abandoned
  at the limit rather than buffered and then rejected — and only four fields are read out of
  it. A log line is a place a reader's browser can put text, so the field list is closed.
- **One report per distinct message and five per page load.** A broken page breaks
  repeatedly, and a reporting loop would spend the log budget on one reader.
- It reports; it does not draw anything. An error boundary that shows the reader something
  useful is a separate question and is not what that file is for.

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
- **`/api/*` is same-origin plus a per-IP rate limit.** See [API](#api) for the rule and
  its two exceptions. `/api/health` exists *because* of this: the deploy smoke test used to
  curl `/api/status`, which now 403s.
- **`POST /api/client-error` is a write route that writes nothing.** It is the one route
  that takes a body from the reader, so: it inherits the same-origin check and the rate
  limit from `/api/*`; its body is capped at 4 KB *while being read*, so an oversized one is
  abandoned rather than buffered and then refused; and exactly four fields are read out of
  it, each only if it is a string. It reaches no table and no SGC request. See
  [the page's own failures](#the-pages-own-failures).
- **`/api/health` gained an age, not a catalogue.** `ingestAgeS` and `lastRunOk` say how
  fresh the data is, which an external alarm needs and no event is described by.
- Static assets bypass the Worker (`run_worker_first: ["/api/*"]`), so page headers come
  from `public/_headers`, not from Hono.
  The CSP there is narrow and was checked against the running page: MapLibre needs
  `blob:` for its worker, the shadcn chart needs `style-src 'unsafe-inline'`, and the
  basemap needs `tiles.openfreemap.org`. Re-check the map and the chart axis labels if
  you touch it.
- **The response headers are the two files below, and nothing else sets them**
  (`test/headers.test.ts` and one case in `worker/test/ingest.test.ts` hold the set):

  | | `public/_headers` (the page) | `worker/index.ts` middleware (every Worker route) |
  |---|---|---|
  | CSP, X-Frame-Options, Permissions-Policy, COOP, CORP | yes | no — a JSON body renders nothing |
  | HSTS, X-Content-Type-Options, Referrer-Policy | yes | yes, including on 403/429/404/500 |

  The middleware is `app.use("*")`, not `/api/*`, because the Worker also answers the 404
  for any path that matches no asset (see `not_found_handling` below).

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
  runs the built Worker in workerd and prints `Parsed 2 valid header rules` if the file
  is well formed (the second rule is the asset cache policy under [Performance](#performance)).
- **`not_found_handling` is `none`, not `single-page-application`.** There is one page and
  no client-side router, so the SPA fallback only meant that `/robots.txt`, `/favicon.ico`,
  `/llms.txt` and every crawler's guess answered **200 with the whole app** — a soft 404 that
  also made Lighthouse call robots.txt invalid. An asset miss now falls through to the Worker,
  whose catch-all answers `404 not found` as `text/plain`, with the three headers above.

Checked and found clean, so do not re-litigate: SQL is fully bound everywhere; event ids are
regex-constrained so the outbound SGC link cannot become `javascript:`; map popups use
`textContent` and the chart's `dangerouslySetInnerHTML` takes only source literals; `onError`
leaks nothing; no secrets in source or history; CI cannot deploy from a pull request.

Still open, with no confirmed exploit — detail in `NEEDS-VALIDATION.md`: the read routes have
no `LIMIT` or range cap (the rate limit bounds volume, not a single query); and the CI
actions are pinned to `@v4` tags rather than commit SHAs.

Two of the four are now *measurable* rather than settled, which is the point of
[Debugging production](#debugging-production): every ingest run records `sgcMs` and
`sgcBytes`, so how long SGC holds us and how large its responses get are now on the log
line and in the three-month analytics history. Read a week of them before choosing a byte
cap or changing `IN_FLIGHT_MS` — the two remaining questions are exactly "what do these
numbers actually do in production", and until today nothing was writing them down.

### Performance

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
    chart it becomes (`height`, defaulting to `h-80`; the map passes `h-[26rem]` for its canvas
    plus legend). A plain box of the wrong height would trade the blocking time for layout
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
- **The LCP element is the header subtitle**, and it is drawn by React, so LCP can never beat
  "bundle downloaded and executed" (~1.0 s even unthrottled). Putting a static header in
  `index.html` would fix that, and was left undone on purpose: the CSP has no `'unsafe-inline'`
  for scripts, so the shell could not read the remembered language, and an English reader would
  see the Spanish header until React mounted.
- **Measuring.** `pnpm build && pnpm preview`, then
  `lighthouse http://localhost:<port>/ --quiet --chrome-flags=--headless=new --only-categories=performance`,
  three times, median. Give the local database data and close the refresh guard first, as under
  [Tooling gotchas](#tooling-gotchas), or the page queries SGC. `preview` serves assets
  **uncompressed**, so its absolute numbers are pessimistic against production — compare runs
  with each other, not with a production score.
- The console must stay empty. The basemap style names sprite images OpenFreeMap does not
  ship (`circle-11`), which MapLibre warns about twice per load, so `event-map.tsx` answers
  `styleimagemissing` with an empty pixel. Real map errors still reach `console.error`.

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
- **SGC is stubbed with MSW, in both test projects** — `msw/node`'s `setupServer` works
  inside the Workers pool as well as under Node (`nodejs_compat` is on). Handlers are
  registered for `SEISCOMP_ENDPOINT` and the server listens with
  `onUnhandledRequest: "error"`, so a test cannot reach `bdrsnc.sgc.gov.co` by accident.
  It replaced `vi.stubGlobal("fetch", …)` and a `fetchImpl` option on `FetchOptions` that
  existed only for tests; `fetchCatalog` now calls `fetch` directly. `msw` is `false` in
  `pnpm-workspace.yaml`'s `allowBuilds`: its build script only copies the browser service
  worker, which nothing here uses. `worker.fetch(...)` in `worker/test` is not a network
  call — it invokes the Worker's own handler, which is the system under test.
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
  mobile chart under [Interface conventions](#interface-conventions) for how the tick
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
  the refresh button or `POST /api/refresh` is used.
- Tailwind 4 already wraps `hover:` in `@media (hover: hover)`; do not add that guard.
- `src/components/ui/*` is shadcn source that we **have modified** (focus rings,
  slider naming, `CardTitle` as `h2`, chart tick selector, legend wrapping, touch hit
  areas, press scale, no `transition-all`). Re-adding a component with the shadcn CLI
  would overwrite those; use `--diff` first.
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

### The page's scope

**One module owns what the page is narrowed to, and everything read off it**
(`src/lib/scope.ts`, architecture review candidate 03, 2026-09-19). A `Scope` is the filters form,
the depth group and the b card's magnitude tab; `pageView(events, scope, now)` derives the whole
page from it and is a plain function, so a test runs exactly what the page runs. `useScope` adds
only React — the state, three memo layers, the deferred copies and the two control objects the
groups card and the b card take. `App.tsx` is layout.

- **The rule it exists for: every fit the page shows is above the Mc of the whole filtered
  catalogue.** Narrowing to a depth group or to one magnitude type changes which events are counted
  and nothing else. `computeClusterStats` keeps the group half; `measure` keeps the magnitude half,
  which before this lived as one argument inside a component body — swap `clusters.all.mc` there for
  the reader's own `filters.mc` and one tab silently fits its own distribution. `pageView` is where
  that is now tested, across every group × tab combination.
  - The fixture in `src/lib/scope.test.ts` is **synthetic on purpose**. On the real catalogue every
    Mc estimate lands on 2.3, so the mistake passes unnoticed; that catalogue peaks at M2.4 while
    the commonest magnitude type and the deep group each peak at M2.0, and the swap reads as a
    different number. Reinstating the swap was checked to fail it.
- **Mc moves the figures and never the selection**, so the derivation is layered and each layer is
  given exactly the part of the scope it may read. `applyFilters` takes `EventFilters`, which has no
  `mc` field at all — the guard is in the type, not in a `mc: null` argument at the call site as it
  used to be. `selectBase` is keyed on the filters, `selectShown` on the group, `measure` on the
  rest. So dragging the Mc slider rebuilds no array, and choosing a group leaves `base` — the two
  daily strips in the groups card — untouched. Checked in a browser: after four steps of the Mc
  slider the MapLibre canvas and the table's first row are the same DOM nodes.
- The `page` vitest project runs on `happy-dom` with `@testing-library/react`, for that one seam.
  Everything else it holds is a pure function; do not reach for a renderer where `pageView` will do.

### Events per day

**One module counts events per Colombian day, and both charts that draw them ask it**
(`src/lib/daily-counts.ts`, architecture review candidate 06, 2026-09-19). `dailyCounts(events)`
returns one record per day — `start`, `shallow`, `deep`, `total` — plus two maxima. The stacked
"eventos por día" bars under "Magnitud en el tiempo" and the two per-group strips in the groups
card had each written their own version, and they disagreed. Do not add a third: `grep dayStart`
should only ever reach `format.ts` and this module.

- **It returns a flat array of days, not `from`/`to`/a day count.** Each day carries its own
  `start`, so the range is read off the array. An empty catalogue therefore has no range to
  misreport — the groups card's end labels used to compute theirs from a `from` of 0 and render
  "1 ene 1970". That path is dead today (`App.tsx` renders the card only when `base` is non-empty),
  and the guard in `DailyStrip` is what keeps it dead.
- **There are two named maxima, and which one a chart uses is a claim about its scale.**
  `maxTotal` is the busiest day's total and is the stacked bars' y axis; `maxCluster` is the most
  any one cluster had on a day and is the scale the two strips **share**, which is the whole point
  of the strips — one group going quiet while the other carries on has to be visible without
  reading a number. The review's finding was that the two implementations disagreed about what a
  single `max` meant. Do not collapse them back into one.
- **It assumes nothing about the order events arrive in.** It scans for its range rather than
  reading `events[0]` and `events[last]`, which is what `magnitude-time` used to do. One extra pass
  over ~800 events, and nothing breaks quietly if `/api/events` ever loses its `ORDER BY time`.
- **An event whose `time` cannot be parsed is left out, not thrown on.** It runs inside a render,
  there is no error boundary in `src/`, and the D1 read path is deliberately outside the admission
  gate (see [Security decisions](#security-decisions-audit-2026-09-19)), so one bad row must cost
  that event and not the dashboard. Both implementations it replaced dropped such an event
  silently; a bare `days[i]!` would have turned that into a white screen. Tests pin it.
- It takes a structural type rather than `StoredEvent`, and imports nothing with JSX or the `@`
  alias, so `test/` (the Node project) can hand it parsed fixture events — the same shape, and for
  the same reason, as `src/lib/format.ts`. Its tests are mutation-checked; the figures in them were
  counted independently in Python from the same 786 events.

### Interface conventions

Settled in a six-domain interface review (accessibility, layout, copy, typography,
colour, motion). Keep to them:

- **Spanish is the default** regardless of browser language; the toggle's choice is
  remembered per device. Every new string goes into both `es` and `en` in
  `src/lib/i18n.tsx`, which TypeScript enforces.
- **Every date and time on the page is Colombian time** (`America/Bogota`, UTC−5, no
  daylight saving), whatever the reader's device says. That covers the filter dates and
  the daily counts, which are Colombian calendar days. The CSV, the API and its
  `from`/`to` filters stay in UTC; the table shows the UTC form on hover. All of it goes
  through `src/lib/format.ts`; do not format a date anywhere else.
- **SGC ends every region with ", Colombia"**, which says nothing on a page about one
  Colombian sequence. `fmtRegion` in `src/lib/format.ts` strips it, and the table, the
  magnitude-chart tooltip and the map popup all go through it. The CSV and the API keep
  the region exactly as SGC gives it.
- **The zone is stated once, in the footer** (`timeNote`), and never repeated on an
  individual timestamp. It used to hang off every one of them — the two status-bar
  hints, the map popup, the magnitude and b-over-time tooltips, the table's column
  header, and "los días son días de Colombia" under the magnitude chart — which read as
  a disclaimer being restated rather than a fact. A new timestamp gets no zone label.
- **No relative time is counted in seconds, and no unit runs past the next one up.**
  `relativeTime` goes from "hace menos de un minuto" straight to whole minutes, to whole hours at
  60 minutes, to whole days at 24 hours. "hace 66 segundos" and "hace 86 minutos" both left the
  reader doing the arithmetic, and `useNow` ticks every 30 s, so a figure in seconds was stale as
  often as it was right. Under a minute it says so in words, which also answers the small negative
  a device clock running fast produces (it used to read "dentro de 5 segundos"). Days stay numeric
  — "hace 1 día", never "ayer": elapsed hours do not say which calendar day an event fell on, and
  the exact date is always beside it. Those two phrases are the **only** user-facing strings outside
  `i18n.tsx`, because `src/lib/format.ts` is also imported by the Node test project, which has
  neither the `@` alias nor JSX; `Record<Lang, string>` keeps both languages required there.
- **A time that identifies one event is a link to SGC's own page for it** (`sgcEventUrl` in
  `src/lib/format.ts`): the table's time column, and "Evento más reciente" in the status bar —
  which is why `/api/status` carries `newestEventId` beside `newestEventTime`. Both keep the UTC
  form on hover. A time that identifies no single event (the last SGC query) is not a link.
- **The page says that it updates itself** (under the refresh button, in the footer):
  readers were reloading it. The "15 minutes" in `autoUpdate` and `autoUpdateLong` is the
  cron in `wrangler.jsonc`, and `refreshWait`'s is `REFRESH_MIN_INTERVAL_S`, which is the
  same number for the reason given under the budget. `src/lib/i18n.test.ts` holds all three
  to it; change them together.
- **The failed-ingest alert names no interval at all, and that is the settled answer.** It
  named the cron's own rate, in the one state where the fast lane has stood down and the
  cron's rate is wrong. It was changed to the wide tick's rate instead, and within the hour
  SGC began refusing us and the probe dropped to hourly, so that was wrong too. Three lane rules decide that number and the reader can act on none of them, so
  `ingestFailedBody` promises a retry and stops there. What it must keep saying is "no hace
  falta recargar"; `src/lib/i18n.test.ts` holds both halves. Do not put a number back.
- **Three stand-down messages, three different truths.** `refreshWait` claims SGC answered
  within the last five minutes, so it may only appear when nothing has failed;
  `refreshStillFailing` replaces it beside the alert and must not tell the reader to press
  again, because while SGC is refusing us the Worker's own wait is an hour; `refreshFailed`
  is for the request from the *page* failing, which is a different thing again.
- **The refresh button standing down is good news, not a countdown.** The throttle is the
  cron's own period, so it refuses most presses, so `refreshWait` says the reader
  already has the newest data instead of asking them to wait N minutes. It is a timed
  factual claim, so it is hidden as soon as a run fails — otherwise it would sit on
  screen asserting a recent successful query right beside the "la última consulta falló"
  alert, and it sticks until the next press.
- **Decimal point everywhere** ("M7.4", "Mc = 2.0"), matching SGC, the CSV and every
  computed number. Never mix in decimal commas.
- Terms: "sismo" only for the mainshock, "evento" for catalogue entries, "valor b",
  "Mc / magnitud de completitud".
- **Red means something failed.** Cautions ("fewer than 50 events", "history
  incomplete") are neutral badges with a warning icon. A *badge* stays neutral; an
  **alert states itself with its own surface** — see the bullet below.
- **A status alert tints fill, border and title; a note does not.** The two failure
  alerts (the load error, "la última consulta al SGC falló") take `destructive`, the
  back-fill notice takes `caution`, and the two notes that are page chrome — "Cómo leer
  estas cifras" and the scope notice — stay on the neutral `bg-card`, which is also what
  keeps the notice looking like the fixed scope bar it hands over to. Each state is three
  tokens in `index.css` and no more (`-surface` the fill, `-edge` the border, `-strong`
  the title and its icon), one constant hue per ramp.
  - **What bounds the light fills is the description.** It stays on `--muted-foreground`
    in every variant, so only the line that names the state is coloured — and that grey
    clears 4.5:1 on white by just 4.73:1, so a fill any deeper takes it under AA. Hence
    fills at `oklch(0.988 …)`, about Tailwind's `*-50`, with the **border** carrying the
    colour at this size, as it does in the shadcn "custom colors" alert these follow.
    Dark mode has the headroom (the grey sits at 6:1) for a real step off `--card`.
    Measured in the browser, light then dark: caution title 4.77 and 10.40, failure title
    8.24 and 6.89, both descriptions 4.56–6.07, borders 1.36 and 2.12 against the page.
  - **The two `-strong` values are a fixed 0.11 apart in lightness**, red the darker in
    light mode and amber the lighter in dark. Both alerts can stand in the status bar at
    once, and their hues alone are 0.048 apart in OKLab for a tritanope — under the 0.10
    that reads as one colour. Lightness is what survives, as it does for the clusters.
    Colour is not the only channel here (the words and the icon differ), which is why the
    hue pair is allowed to be close where a chart's would not be.
  - Caution is **hue 80**: 52.7° from `--destructive` and 30.3° from the mainshock orange
    `--chart-2`, so it reads neither as a failure nor as the mainshock. Do not move it
    nearer either without redoing the measurements — `agent-browser` plus the canvas trick
    in [Tooling gotchas](#tooling-gotchas) reads the rendered pair straight off the page.
- De-emphasise with the secondary text colour, never with opacity: the b-value must
  stay readable exactly when it is least reliable. The destructive alert's description
  used to be `text-destructive/90`, which is the same mistake and is now the plain
  secondary colour.
- Order by importance: the b-value leads the page, above the filters. On a phone it
  must be within the first screen.
- **The status bar's stats are one wrapping row at every width**, never a two-column grid
  on a phone. The stats are not the same size — "Eventos" is three digits, "Evento más
  reciente" is "18 sept 2026, 17:08" — so equal halves broke the date across two lines
  below 480 px, which is every phone, leaving it two lines tall beside a number one line
  tall. Each stat is now as wide as its own longest line, and one that no longer fits
  beside its neighbour takes the next line whole: the date stays on one line down to
  320 px, and which stats share a line follows from the text rather than from a
  breakpoint. Nothing here needs revisiting when a stat is added, a figure grows a digit
  or a translation gets longer.
- **"Magnitud en el tiempo" scrolls sideways when it is too narrow to read.** Below
  768 px of plot width every Colombian day gets `PX_PER_DAY` (28 px) instead of the
  whole range being squeezed in, which on a phone drew one solid band. The bars themselves
  come from `dailyCounts` (see [Events per day](#events-per-day)). The scatter and
  the "eventos por día" bars sit in **one** scroll container so a single gesture moves
  both, and both y axes are pinned: each is a second, data-less chart in a `sticky`
  column, which only lines up because the pinned and scrolling charts are given the
  same margins, the same `X_AXIS_H` and — for the counts — the same explicit domain and
  `ticks` (`countAxis`). `interval={0}`, or Recharts quietly drops one of them.
  The view starts at the newest events and stays there through a refresh unless the
  reader has scrolled away from the right edge. Date ticks go from weekly to whatever
  fits in `TICK_GAP` while it scrolls. Above 768 px nothing changes.
- **Choosing a cluster narrows the whole page**, like a filter: "Ver solo este grupo" in the
  "Dos grupos de eventos" card. It is one of the settings the scope notice below names, and it sits
  outside the cards because a cluster can be emptied by the other filters, and the control must not
  vanish with it. The comparison was tried inside the b card
  first (as rows on its b scale): the card grew to ~1,400 px, the groups landed far below the
  fold and the chart beside it was left mostly empty, so it has its own card. Shallow is the
  page's blue and deep the teal (`--chart-1`, `--chart-4`) everywhere; orange stays the
  mainshock's. "Grupo", never "cúmulo" or "enjambre". The 7-day counts are counts: nothing in
  that card may read as a forecast.
- **What the page is narrowed by is said once, in two places** (`src/components/filter-scope.tsx`).
  `activeFilterChips` in `src/lib/filters.ts` is the single list: a setting earns a chip only where
  it differs from `DEFAULT_FILTERS`, so an untouched page produces none and neither presentation
  appears. Mc is in the list although it selects no events — it moves the b-value, and a Mc left on
  by hand is what a reader forgets. "Quitar filtros" clears the cluster *and* the filters form,
  which both go through `useScope`'s `clear`: `FiltersCard` is controlled, so the page owns the
  values and the form renders them. It used to be given a `resetSignal` to bump instead, and the
  reason that protocol existed is still a rule — **a reader's half-typed `from > to` must survive**.
  The form remembers the last object it handed up and compares by identity, so while it is invalid
  it emits nothing, `value` stays the last good object, and nothing resets underneath them.
  - The **notice** sits in the flow under the status bar. It is the accessible one and the only one
    in the tab order, laid out as one row wherever there is room, so the bar reads as the same
    object come back rather than a second thing.
  - The **bar** is fixed to the top of the window and **hands over from the notice**: it slides in
    once the notice has left the top of the window, and slides away when the reader comes back up
    to it. So exactly one of the two states the scope at any time, and the reader is never without
    it — which is the whole reason the bar exists, since everything below the fold is a chart drawn
    from a filtered catalogue. One `IntersectionObserver` on the notice decides it: no scroll
    handler, no pixel threshold, nothing running on a scroll frame. It watches `entry`, not
    `isIntersecting` alone, and requires `boundingClientRect.bottom <= 0` — a notice out of view
    *below* the fold, which is where a short screen starts, is not one the bar may stand in for.
    It is `aria-hidden` with its button out of the tab order, because it is a second view of a
    notice a screen reader has already read out and can still reach. The hand-over is the same
    pixel in both directions (checked in the browser, 2 px either side of it), so a reader parked
    exactly on that edge can wobble the bar in and out; a CSS transition retargets from wherever it
    is, so that reads as wavering rather than flashing, and it is not worth a scroll listener.
    - It was **shy** first — away on the way down, back on the way up, on a scroll-direction
      listener with 8 px of hysteresis. Two things were wrong with it: the reader lost the scope
      exactly while moving through the charts it applies to, and a 45 px move under a fade reads
      as the bar blinking rather than arriving. Do not reinstate the direction rule without the
      first problem's answer.
  - Its background is **opaque**, not a frosted pane: dense text and charts scroll under it, and a
    sentence ghosting through the line that states the scope defeats the point. The shadow is what
    separates it from the page and needs a solid surface; in dark mode the shadow does nothing and
    `border-b` carries it. Enter is 260 ms and leave 180 ms, **transform only** — a fade over the
    same time reads as an appearance, and it is the edge travelling that says the bar came from the
    top of the window. The hidden position is `calc(-100% - 1.5rem)`: `-100%` alone parks the bar
    off-screen but leaves `shadow-lg` hanging into the page as a grey band, and the 1.5rem clears
    it. Write the `calc` as `calc(-100%_-_1.5rem)` — CSS needs the spaces around the minus, and
    without them the utility is silently dropped and the bar never hides at all.
    `prefers-reduced-motion` drops the movement and fades instead. The curve is `--ease-slide`
    (`cubic-bezier(0.32, 0.72, 0, 1)`), not the page's `--ease-out`: `--ease-out` is tuned for a
    control answering a click and puts 90% of the travel in its first 95 ms, which over this
    distance is a pop. Measured in the browser, the bar now leaves the top edge at ~60 ms and
    lands at ~230 ms.
  - On a phone the bar shows the first chip and counts the rest (`+3`), and shortens the count to
    "639 de 786". Both are pure CSS at the `sm` breakpoint, so its height never changes as it slides.
- **The per-group daily strips in that card scroll sideways when narrow**, on the same idea as
  "Magnitud en el tiempo", and off the same `dailyCounts` (see [Events per day](#events-per-day)):
  below `MIN_BAR` (10 px) per day each day gets `PX_PER_DAY` (28 px), the
  strip starts at the newest day, each bar carries its count and every third day its date, and
  one gesture moves both strips. Every ancestor up to the tile needs `min-w-0`; without it the
  strip widens its tile instead of scrolling, the width it measures grows, and it flips back out
  of scrolling mode.
- "Detalle técnico" is one component (`technical-detail.tsx`, on shadcn `Collapsible`), used by
  the load error, the failed-ingest alert, the groups card and the b card. It takes a `className`
  for the body's type size: `text-sm` for prose meant to be read, the default `text-xs` for a raw
  error string. `CardDescription` caps itself at 75ch; a card that wants a full-width subtitle
  passes `max-w-none`.
- **The b card's fine print is collapsed** — the magnitude-scale caveat and the goodness-of-fit
  Mc. Open, it made the card half again as tall as "Valor b en el tiempo" beside it, and because
  the two share a grid row the chart was stretched to match: 189 px of its card was empty. Folded,
  the row is 569 px instead of 779 px. Fold nothing whose only other home is that card: the
  mixed magnitude types and "no es un pronóstico" stay in the open under "Cómo leer estas cifras",
  which is what makes hiding them here safe. The chart itself keeps its fixed `h-80` and stays
  centred in whatever height the row has; letting it grow to fill would steepen the slope of a
  b-value decline the page is careful not to oversell.
- **A chart grows into the space beside it only where the extra height cannot mislead.**
  Cards in a two-column row are stretched to the taller one, so a fixed-height chart leaves a
  void under its legend. "Distribución frecuencia–magnitud" therefore fills its card (`flex-1`
  with `min-h-80`) instead of sitting at `h-80` with ~90 px blank beneath it: both of its axes
  are read off the data, so the room only spreads its points out. "Valor b en el tiempo" is the
  counter-example directly above — with a pinned y axis, height is a claim about the slope.
- A failed load shows the error only. It must never draw an empty dashboard that
  tells the reader to change their filters.
- **A chart or the map arrives in its own card, already titled.** They are loaded on approach
  (`Deferred`, see [Performance](#performance)), so on a slow connection the reader first sees
  the card with its heading and a skeleton the size of the drawing. Never a bare grey box, and
  never a card that changes height when the drawing lands.
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
- **A `FlowNumber` has to measure like the text it replaces.** The library pads its box above and
  below by `round(nearest, var(--number-flow-mask-height, 0.25em) / 2, 1px) * 2` — room for the
  mask that fades a rolling digit out as it leaves the top or the bottom — and that padding is in
  the box, so the element stood taller than the plain text beside it: 32 px against 28 px at
  `text-xl`, 72 px against 48 px at `text-5xl`. In the status bar that dropped the "Eventos" hint
  4 px below the two hints next to it and put the count 2 px off their baseline, and it is where
  the b card's extra 24 px came from. `flow-number.tsx` takes the same amount back as a negative
  `margin-block`. The mask is drawn, not typeset, and nothing clips it, so it stays exactly where
  it was and only the measurement changes. Keep the expression in step with the library's, and
  do not reach for `--number-flow-mask-height: 0` instead: that deletes the fade.
- **The b card's marks travel on that same roll**, because a mark and the figure
  written beside it are one fact and a mark that jumped while the digits were still
  turning read as two events. `--ease-move` and `--duration-move` in `index.css` are
  `FlowNumber`'s `MOVE` written in CSS; change one and change the other. Every row
  figure on the scale is a `FlowNumber` too — the scale's end labels are not, since
  they are the ruler rather than a reading off it. Each mark rides a full-width layer
  moved by a percentage of its own width, so its position is a `transform`, and the
  error band is a full-width capsule cut by `clip-path: inset(… round 9999px)` —
  which keeps both ends a true half-circle at any width, where scaling one capsule
  flattens them into ellipses. Nothing there touches layout, so the marks keep
  gliding on the compositor through the render pass a filter change spends on the
  main thread, the same pass the digits already glide through; on `left`/`right`
  they froze in it while the digits rolled on.
- The theme follows the operating system unless overridden; choosing the theme the
  system already uses clears the override (`src/lib/theme.ts`). The map rebuilds on
  theme and language change.
- Map colours stay as hex constants because MapLibre cannot parse the `oklch`
  tokens. Dots carry an outline that contrasts with the basemap, so neither end of
  the depth ramp disappears. `--chart-2` is the one token in `index.css` written as hex
  for the same reason — `event-map.tsx` reads it through `getComputedStyle` for the
  mainshock ring. Everything else in that file is `oklch`; keep it that way.
- **The two clusters must differ in lightness, not only in hue** (colour review,
  2026-09-19). Shallow blue and deep grey were both mid-lightness — `oklch(0.575)`
  against `oklch(0.556)`, a measured 1.07:1 — and the one place they touch is the
  stacked "eventos por día" bars, where the boundary was invisible in light mode.
  The deep cluster moved off the recessive grey onto its own `--chart-4`, a teal
  (`oklch(0.4 0.068 195)` light, `oklch(0.85 0.085 195)` dark) set **60° from the
  blue in hue and 0.175 / 0.228 away in lightness**. Both halves are load-bearing:
  a teal at the blue's own lightness is a different colour to most readers and the
  *same* colour to a tritanope, because tritanopia takes the blue–teal difference
  away and leaves nothing behind. Lightness is what survives every kind of colour
  blindness, so any hue chosen here needs a lightness gap as well.
  `--chart-3` stays the recessive neutral and is now used by one thing only: the
  frequency–magnitude chart's per-bin squares, which must sit *below* the blue
  cumulative curve in emphasis. Do not merge the two back together.
- **Check a new chart colour against three pairs, under simulated colour blindness**,
  not just against the card. The deep cluster meets the shallow blue (they touch in
  the stacked bars), the mainshock orange (same scatter chart) and `--chart-3`. Measured
  as OKLab ΔE after a Viénot simulation, a pair below **0.10** reads as one colour, and
  the WCAG ratio will not tell you — it only sees lightness, so two hues at equal
  lightness score 1.0 whatever they look like. Today's worst case is 0.130 (light) and
  0.144 (dark). Candidates that failed, and are not worth retrying as they stand:
  teal, green and purple *at the blue's lightness* (0.02–0.08 against the blue), and
  plum, which is fine against the blue but lands on **0.006 against the mainshock star
  in dark mode for a tritanope** — the pair that is easiest to forget, since the two
  share the scatter chart. A throwaway prototype that shows all of this live is on the
  `prototype/cluster-colour` branch.
- `--chart-2` is `oklch(0.62 … 49.7)` in light and `oklch(0.719 … 49.9)` in dark —
  lighter in dark mode, as an accent on a dark ground should be. It was the other way
  round, and in dark mode it had exactly the blue's lightness. Its hue also sits 21°
  (light) and 28° (dark) from `--destructive`; it was 12° in light, close enough to
  read as red on a page whose rule is "red means something failed".
- `--chart-5` and the eight `--sidebar-*` tokens were deleted: nothing imported them,
  `--chart-4`/`--chart-5` had identical light and dark values, and `--sidebar-primary`
  was a vivid blue in dark against a neutral in light — a stock shadcn default that
  would have rendered wrong the day a sidebar was added.
- Numeric table columns align to the trailing edge, use `tabular-nums` (set once on
  the page root) and a true minus sign (`fmtNum`).
- Every control has an accessible name; sliders get theirs through
  `aria-labelledby` on the thumb, which is the element with `role="slider"`.

Not yet verified by anyone: real screen-reader output, a physical touch device, and
Safari. The back-fill and ingest-failure alerts have now been seen rendered, in both
themes, but against a **stubbed** `/api/status` (see [Tooling gotchas](#tooling-gotchas))
— not yet in a live state driven by SGC itself.

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
- Per-cluster depth over time; migration plots; cumulative
  seismic moment; filtering by RMS/GAP/location error; a view of SGC's revisions,
  which our database records and SGC does not publish.
- Notifications (for example M ≥ 4.5) are a small addition to the cron. Do not
  alert on b itself: it invites reading it as a warning.
- Cross-check against the USGS and ISC catalogues for the same box.
