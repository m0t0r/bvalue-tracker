# API

`GET /api/events`, `/api/events.csv`, `/api/stats`, `/api/b-windows.csv` (b over time, one
row per window), `/api/status`, `POST /api/refresh`, `POST /api/client-error`.
Every route but `/api/health` takes `zone=choco|tolima` (`core/zones.ts`). No `zone` is
Chocó, so every URL and script from before there were two zones keeps its meaning; any other value
is a 400. The downloaded CSVs are named after the zone (`sgc-tolima-events.csv`).

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
  hours stale. `.github/workflows/ingest-health.yml` is what asks.
- `/api/*` is also rate limited per IP (120 requests/minute, `ratelimits` in
  `wrangler.jsonc`), which applies before the origin check. Over the limit is 429.

`POST /api/client-error` takes `{ message, stack?, source?, path? }` from the page and
writes one `page error` log line. It stores nothing and touches no table. It is **not** an
open endpoint — it is under `/api/*`, so the same-origin check and the rate limit stand in
front of it exactly as they do for `/api/events` — and it reads only those four fields, out
of a body capped at 4 KB before anything is buffered. See
[the page's own failures](operations.md#the-pages-own-failures).

CSV headers are the stable machine names (`id,time,lat,…`) by default. `?lang=es` on
either CSV endpoint, and the page's download buttons while the page is in Spanish,
translate the header row only; values are identical. `fromCsv` (and so the CLI)
reads both. Keep the default untranslated: scripts depend on it.
