# The SGC data source

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
- **The 410 is written on Cloudflare's network, and SGC's server never sees the request**
  (refused since 2026-09-20 12:40 UTC; the refusal's own body read at 16:00 UTC). The deployed
  Worker began getting **410 Gone** on requests that had succeeded five minutes earlier, with
  no deploy in between, while the canary made the *same* request with the *same* user-agent
  from GitHub's runners and got a normal 200 — at 13:33, and again on its 14:43 schedule. The
  difference is the caller, and **the canary is the instrument that tells the two apart**: it
  reaches SGC from somewhere else.
  - **Who wrote the refusal, from the probe** (run 364, 16:00:04 UTC; `pnpm logs --since 3h
    --msg "ingest failed"`). `sgcBody` is a 152-byte generic block page —
    `<title>Request Denied!</title>`, "If you have any questions, please contact the admin" —
    and `sgcHeaders` are `server: cloudflare`, `cf-ray: a3e20a72bc0fa126-SIN`,
    `cf-cache-status: DYNAMIC`, `connection: close`. An Apache origin cannot emit `cf-ray` or
    `cf-cache-status`; a Cloudflare edge adds them. Seven headers, and no `nel`, `report-to`
    or `alt-svc`, say it was synthesised there rather than proxied from an origin. The
    evidence cap is 24 headers (`EVIDENCE_HEADERS`), so that is all of them, not the first few.
  - **SGC is not behind Cloudflare.** `bdrsnc.sgc.gov.co` resolves — system resolver and
    1.1.1.1 alike — to `190.121.155.237`, SGC's own /26 at LACNIC and in none of Cloudflare's
    published ranges; `sgc.gov.co` and `www` are on AWS, the zone's nameservers are Route 53.
    Nothing of SGC's resolves into Cloudflare. So the rest of the internet, canary included,
    never touches Cloudflare on the way to SGC. **We are the exception**: a Worker `fetch()`
    resolves inside Cloudflare's network, which is the one place this request can be
    intercepted without SGC being involved.
  - Two candidate writers remain, and nothing observable from outside separates them: a
    Cloudflare zone covering this hostname inside the network (a domain can be added to an
    account and its nameservers never switched, and that zone's WAF still answers our
    subrequest), or Cloudflare's own block on Worker traffic to this destination. Cloudflare
    documents `cf.worker.upstream_zone` as the field a zone uses to block a *named* Worker's
    subrequests, so "aimed at us" stays possible under either. `cf-ray: a3e20a72bc0fa126` is
    the handle to quote when asking Cloudflare or SGC.
  - **It lifted by itself, and rate is the leading explanation** (revised 2026-09-22). The last
    410 was at 2026-09-21 07:31 UTC and the next probe, at 09:01, succeeded, with no change on
    our side. It began after 19 h 40 m at 12 requests/hour (the CPU-killed ticks still sent
    theirs) and ended after ~20 h at 1–2 an hour. It has not recurred at `*/15`. The earlier
    "not a rate limit, SGC never saw the requests" rests on an **untested** assumption: that a
    Worker subrequest to a non-Cloudflare origin comes back without `server: cloudflare` and
    `cf-ray`. If Cloudflare adds those headers anyway, SGC's firewall refusing Cloudflare's
    egress addresses fits the evidence equally well. Test it against any non-Cloudflare origin
    before quoting either writer.
  - Every outbound Worker request carries a `CF-Worker: sgc-swarm.workers.dev` header that
    we cannot remove, so a block need not be by address at all.
  - **The other end of the chain, confirmed from off Cloudflare's network** (a manual
    request from outside Cloudflare, 2026-09-20 16:16:53 UTC, while the Worker was being refused): the same URL answers
    `200 OK`, `Server: Apache/2.2.11 (Unix) mod_ssl/2.2.11 OpenSSL/0.9.8k DAV/2 PHP/5.2.9
    mod_perl/2.0.4 Perl/v5.10.0`, `X-Powered-By: PHP/5.2.9`, 7,351 bytes of form page — and
    not one `cf-*` header. SGC's own server is healthy and has no Cloudflare in front of it,
    so the 410 and the 200 are two different machines answering the same URL.
- The per-event page `https://www.sgc.gov.co/detallesismo/<id>/resumen` exists but
  returns 403 to `curl` without a browser user-agent.
- **SGC publishes an event about 2–5 minutes after it happens** (measured 2026-09-19
  against production: every `first_seen_at` landed on a cron boundary, and the smallest
  origin-time-to-`first_seen_at` gap across the live-detected events was 5.0 min, with a
  second at 6.8 min). Our own cron was the larger delay, which is why it is 5 minutes.
  Polling faster than SGC publishes buys nothing, so **never go below 5** — and while a tick costs more than 10 ms CPU, **never go below 15**, because `*/5` is what got the Worker CPU-killed on 2026-09-20 (see [the CPU budget](ingest.md#the-cpu-budget)). We ran at 5 for
  one day (2026-09-19 → 20) and then went back to **15 deliberately** — not because 5 was
  too fast for SGC in any measured sense, but because this Worker's requests began being refused
  the next afternoon — with Cloudflare headers on the refusal, though who wrote it is unconfirmed — and ~120 requests/day is the lower of the only two loads we
  have ever run. **It had not "run for weeks"**, as this paragraph once said: `ingest_runs`
  begins 2026-09-18 23:30 UTC, so the Worker's whole history with SGC before the refusal is
  ~37 hours — ~5 requests/hour for the first ~17, then 12/hour round the clock for 19 h 40 m
  (CPU-killed ticks still sent theirs), and the 410 arrived at the end of those. It lifted by
  itself ~20 h later at 1–2 probes/hour, and has not recurred at `*/15`. That is a correlation on a sample of one, not a
  measured limit, but no claim here that a cadence is "known safe" has evidence behind it.
  The cost is median detection going from ~5 min back to ~10. Revisit it
  only once per-tick CPU is under 10 ms (see [the CPU budget](ingest.md#the-cpu-budget)), and change the three constants
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

## SGC rate limits and the request budget

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
  down — so when **410 Gone** began coming back to the Worker on 2026-09-20 there was
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
