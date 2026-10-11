# API

`GET /api/events`, `/api/events.csv`, `/api/stats`, `/api/b-windows.csv` (b over time, one
row per window), `/api/status`, `/api/context`, `/api/sea`, `POST /api/refresh`, `POST /api/client-error`.
Every route but `/api/health` and `/api/sea` takes `zone=choco|tolima` (`core/zones.ts`). No `zone` is
Chocó, so every URL and script from before there were two zones keeps its meaning; any other value
is a 400. The downloaded CSVs are named after the zone (`sgc-tolima-events.csv`).

Filters: `from`, `to` (a bare date is inclusive of that day), `minMag`, `status`,
`includeRemoved=1`, `excludeMainshock=1`, `cluster=shallow|deep` (anything else is a 400), and `mc`
on `/api/stats` and `/api/b-windows.csv`. `excludeMainshock` drops the zone's detected mainshock
(`core/mainshock.ts`, [the rule](science.md#the-mainshock-detected-from-the-catalogue-never-pinned-from-2026-09-24)),
found over the zone's whole catalogue whatever range was asked for, and drops nothing while there is
none or while it awaits review. It reads the zone's rows unindexed on `mag`; only this parameter
asks, and the page never sends it. With `cluster`, the statistics keep the Mc of the whole
filtered catalogue, as the page does.

**The four catalogue routes answer from at most 20,000 events, and fail rather than truncate past
it** (`READ_ROW_CEILING` in `worker/index.ts`): a 500, `no-store`, with
`{ "error": "the catalogue has grown past 20000 events, more than one answer serves; narrow it with from and to" }`,
and a `read route over its row ceiling` log line. The ceiling counts the filtered rows before
`cluster` and `excludeMainshock`, so a narrower `from`/`to` still answers. It is ~18 times the largest
zone today; why it is a ceiling and not a page size is in [Security](security.md#the-read-routes-row-ceiling-2026-10-02).

**`/api/*` is same-origin only.** The Worker serves a request only when it carries
`Sec-Fetch-Site: same-origin`, or an `Origin` equal to its own; anything else gets 403.
A caller that sends neither header — `curl`, a script, a link in someone else's page —
has no positive same-origin signal and is refused. That is deliberate: the data is public
SGC data, but serving the whole catalogue to any direct caller is what we are avoiding.
Headers are forgeable and this is **not** authentication; it keeps the raw feed out of
casual reach. Use the page's download buttons, or `pnpm cli fetch`, which talks to SGC
directly and is unaffected.

Three exceptions:

- **A Lighthouse run Cloudflare has verified may read.** PageSpeed Insights' runner sends
  neither header, so it only ever scored the page's load-error state
  ([Performance](performance.md)). A `GET` or `HEAD` passes when the user agent contains
  `Chrome-Lighthouse` **and** Cloudflare sets `request.cf.verifiedBotCategory`. The user agent
  alone is a claim anyone can make; the category is Cloudflare's own verification of where the
  request came from, and a caller cannot set it. Other verified bots, Googlebot included, are
  still refused, and so is any `POST`: `/api/refresh` is the route that reaches SGC.
- `GET /api/health` is open to anyone: `{ ok, totalEvents, ingestAgeS, lastRunOk, zones }`, no
  catalogue data. It is what the deploy smoke test and any uptime check should call. `zones`
  carries `{ totalEvents, ingestAgeS, lastRunOk }` for each zone, and the top-level `ingestAgeS` is
  the **stalest** zone's — `null` while any zone has never succeeded — so an alarm that reads only
  that one field still fires when either zone goes stale.
  **`ingestAgeS` — seconds since ingest last succeeded, `null` if it never has — is the
  field an external alarm reads**, and it is the only thing about this system that an
  outside caller can ask. Both real outages looked identical from outside without it: the
  Worker up, the page rendering, `/api/health` answering `ok`, and the catalogue nine
  hours stale. `.github/workflows/ingest-health.yml` is what asks, by hand only since 2026-10-11:
  with syncs on demand a large `ingestAgeS` is normal, so it is a check to run after a sync, not an
  alarm.
- `/api/*` is also rate limited per IP (120 requests/minute, `ratelimits` in
  `wrangler.jsonc`), which applies before the origin check. Over the limit is 429.

`POST /api/client-error` takes `{ message, stack?, source?, path? }` from the page and
writes one `page error` log line. It stores nothing and touches no table. It is **not** an
open endpoint — it is under `/api/*`, so the same-origin check and the rate limit stand in
front of it exactly as they do for `/api/events` — and it reads only those four fields, out
of a body capped at 4 KB before anything is buffered. See
[the page's own failures](operations.md#the-pages-own-failures).

`GET /api/context?zone=` serves what USGS publishes about the zone's mainshock, as the USGS job last
stored it ([on a sync](ingest.md#usgs-and-the-sea-on-a-sync)): `{ dyfi, pager, forecast }`,
each `null` or `{ source, sgcEventId, sourceEventId, productUrl, sourceUpdatedAt, checkedAt,
digest }` (`ContextResponse` in `worker/api-types.ts`). It never fetches USGS itself; it is one
primary-key read of at most three rows, `no-cache` like the rest. The USGS job deletes rows matched
from any event other than the zone's mainshock, but only when it runs, so **a consumer shows a digest
only while `sgcEventId` is the zone's detected mainshock**. The route itself does not filter: that
would read the zone's events, unindexed on `mag`, on every load. `checkedAt` is when the job last saw
USGS's current version; an old one means nobody has synced, or USGS or the job has been failing, and
the page decides what that hides. The questions tab (`feltInPereira`) hides nothing on age: each figure it shows
carries its product's own date, and it drops a digest whose `sgcEventId` is not the detected mainshock.
The forecast (`usgsForecast`) does hide on age: from USGS's `nextUpdateAt`, or 14 days after issue
without one, and whenever it is not `reviewed` ([the science](science.md#the-insights-page-insights-from-2026-09-24)).
Credit "USGS" beside any figure from it (US public domain).

`GET /api/sea` (no `zone`: one sea for the block) serves Open-Meteo's marine forecast as a sync last
stored it ([the sea-state job](ingest.md#the-daily-sea-state-job)): `null` before the first
run, or `{ source, model, lat, lon, fetchedAt, hours }` (`SeaForecast` in `worker/api-types.ts`), each
hour `{ t, swell, swell2, wind }` and each train `{ heightM, fromDeg, periodS }` or `null`. It never
fetches Open-Meteo itself; one primary-key read, `no-cache`. Only the 3D tab asks, so it is not
preloaded. Credit Open-Meteo, with its link, wherever a figure from it is shown (CC BY 4.0).

**`POST /api/refresh` is "Sincronizar ahora", the one route that reaches SGC** (from 2026-10-11 the
only thing that does: there is no cron; [Ingest](ingest.md#on-demand-only)). One request runs one plan:
one missing history chunk while the zone is behind, with no throttle while SGC answers; once it has
caught up, the trailing window, at most once per 15 minutes counted from the zone's last run, plus one
revision chunk when the zone has had no sweep for an hour. A plan stops at a failed first step, so the
failure is the last run the answer reports. It answers the zone's status (as `/api/status` does) plus `refreshed`, whether SGC was
queried, and on a stand-down `retryAfterS`, the seconds until a press is worth anything: 5 while
another run is in flight, else what is left of the throttle, of a 429/503's cooldown or of a
refusal's hour. The page repeats it while the answer is still behind (at most 31 times per press).
`context=1` additionally refreshes USGS's products and the sea forecast when they are due (the sea
missing or older than 15 minutes, or product rows older than that), under `waitUntil` once the
press's own ingest has finished; a press that stands down asks them nothing. The page sends it on the
first request of a press only. A refresh without `zone` is Chocó's,
like every route.

`/api/status` (and so every refresh answer) carries `syncedThrough`, where the synced data stops (the
oldest gap's start while there is one, else the last successful run's end; null before any sync), which
the pages end every "last 7 days" at, and `backfill: { done, total, gaps }`: history chunks
loaded, of every chunk from the zone's start to now, and `gaps`, the missing ones that begin before the
zone's last successful run started. Every day without a sync adds a chunk to `total`; only `gaps` are
holes in what has been synced, and only they make the page warn that its figures are not
representative.

CSV headers are the stable machine names (`id,time,lat,…`) by default. `?lang=es` on
either CSV endpoint, and the page's download buttons while the page is in Spanish,
translate the header row only; values are identical. `fromCsv` (and so the CLI)
reads both. Keep the default untranslated: scripts depend on it.
