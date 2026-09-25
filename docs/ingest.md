# Ingest: how the catalogue stays current

There are two zones (`core/zones.ts`), each its own bounding box, start date and catalogue: the
**Chocó** sequence since the M7.4 of 2026-08-10, and the **Tolima** zone — the Chaparral swarm —
since 2026-09-20. Zones are named by department, as SGC's daily bulletin names the pair; the Tolima
box covers only the swarm near Chaparral, which is why its heading names the town. Below,
"Chaparral" is the swarm and `tolima` the zone id. Every event and every run carries its zone. The table below is Chocó's; Chaparral
differs as follows (`CADENCE` in `worker/plan.ts`, `SWEEP_CHUNK_DAYS` in `worker/ingest.ts`):

- **No fast lane.** It runs on the wide ticks only, :00 and :30, re-reading the trailing **1**
  day *with* removals — the fast lane forbids removals only because a quiet day holds too few
  events for `MAX_REMOVAL_SHARE`, and the swarm has run ~130 a day. It sweeps on the hour like
  Chocó, in **1-day** chunks from 2026-09-20.
- **Its button throttle is 30 minutes**, its own period, for the same reason Chocó's is 15.
- **Both zones run in the same cron invocation, one after the other** (Chocó first), each reading
  the history afresh. Still one cron pattern, never two requests to SGC at once.
- **What is shared and what is not** (`IngestHistory` in `worker/plan.ts`): a refusal streak, a
  429/503 cooldown, the in-flight guard and the refusal probe's hour are across zones, because SGC
  is one server answering one address — a 410 to Chocó's request is a 410 to Chaparral's, and once
  one zone has probed a refusing SGC this hour the other stands down. The probe allows five minutes
  of slack (`PROBE_SLACK_S`), because the second zone's request leaves seconds after the tick and
  an exact hour then lands just short. Whether the **last run failed** is per zone, as are the
  back-fill and the button's ordinary throttle: a timeout on Chaparral's larger response must not
  shut Chocó's fast lane.
- **Removal only ever considers the zone's own events** (`eventsBetween` takes the zone). A
  Chaparral response lacks every Chocó event; without that, the 20% guard would be the only thing
  standing between it and retiring the whole of Chocó, and the guard would only log a note.

| Trigger | What it does |
|---|---|
| Cron `*/15 * * * *`, tick minute not divisible by 30 | **The fast lane.** Re-reads the trailing 1 day (`TRAILING_FAST_DAYS`), inserts and updates only. It never retires an event: a 1-day window holds a handful of events, too few for the `MAX_REMOVAL_SHARE` guard to engage, so one short response could retire real ones. It also stands down entirely while SGC is unwell — see [rate limits](sgc-data-source.md#sgc-rate-limits-and-the-request-budget). |
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

## Concurrency and failure lessons

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
  - **The cause was the CPU limit, not memory** — measured from Workers Logs on 2026-09-20,
    two days before the window closed. `$workers.outcome` over 02:00–13:00 UTC: **112
    `exceededCpu`** against 58 `ok`, and 112 is exactly the number of abandoned runs. The
    long-standing hypothesis in the security audit — `res.text()` buffering an unbounded SGC
    response and running the isolate out of memory — is **wrong**; no invocation ran out of
    memory. Do not add a byte cap on that reasoning.
    - It was not a deploy: `$workers.scriptVersion.id` is the same `1355e096` before, during
      and after. It was not a code path that got slower either — successful scheduled runs
      used a median of **34 ms** CPU in the six hours before and **40 ms** during, while the
      killed ones died at a median of **10 ms**. A fixed 10 ms ceiling cannot let a 40 ms run
      finish, so what changed was the *enforcement*, not the work.
    - **The real lesson is worse than the outage.** This Worker's cron invocations normally
      need 34–40 ms of CPU, three to four times the free plan's documented **10 ms**. It
      survives because Cloudflare tolerates *infrequent* overruns — and after ~10 hours of
      12 over-limit ticks an hour at `*/5`, it stopped tolerating them for nine hours on
      2026-09-20, and every single tick died: 12 killed per hour, 03:00–11:00, not one
      success. Nothing in the code prevents that happening again. See
      [the CPU budget](#the-cpu-budget).
  - `reapAbandonedRuns` returning a non-zero count is now a **warn** — `reaped abandoned
    runs: an invocation was killed` — which is the one line that says an invocation of this
    Worker died rather than failed. Alert on it, and read it first in any report of stale
    data. The invocation log beside it carries `$workers.outcome` and `$workers.cpuTimeMs`,
    which is what named the cause above.
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
- **There is exactly one *ingest* cron pattern, and a second one cannot be added safely.** (The
  daily USGS job has a pattern of its own, `7 11 * * *`, which is safe because it never claims a
  run or talks to SGC; see [the daily USGS job](#the-daily-usgs-job).) Every
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
- `excludeMainshock` drops the zone's detected mainshock, found over the zone's **whole**
  catalogue (`zoneMainshock` in `core/mainshock.ts`), never "the largest event in the
  result", which silently drops a real aftershock for any range without the mainshock.
  `worker/test/ingest.test.ts` holds a day whose largest event "stands clear" within it.
- One statistics pipeline (`computeStats` in `packages/seismo/src/gr.ts`) serves the page, the API
  and the CLI. When they were separate they disagreed (window step, end-date rule).
- Ingest runs under `waitUntil`, so closing the tab mid-refresh does not abandon it.
  A partial write is safe: upserts are idempotent and removals are written last.
- Never show a raw database or fetch error to a visitor. Plain message plus next
  step; the technical string goes in a collapsed `<details>`.

The account is on the **Workers free plan**, whose ceilings are 100,000 requests/day,
5,000,000 D1 rows read/day, 100,000 D1 rows written/day, 50 subrequests and 50 D1 queries
per invocation, and **10 ms CPU per invocation** — wall time is not the limit, and runs
finish in 1–13 s of it. 96 cron invocations a day, and the ~70k D1 rows read measured at
312, are nowhere near the daily allowances; 10 ms CPU is the one that could bite, and **the
cadence decides whether it does** — see [the CPU budget](#the-cpu-budget).

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

**Doing that check found the fifth, and it was the biggest of them: `lastRun`.** It had
never been indexed at all, while being the most frequently asked question here —
`/api/status` calls it twice and the open page re-reads `/api/status` *every minute*, so
this ran on every poll from every reader. `lastRun(false)` was a full table scan;
`lastRun(true)` used `ingest_runs_ok` and then materialised every ok = 1 row into a
temporary b-tree to sort it, which at three months is ~28,000 rows read to answer "what
happened last?". `migrations/0005` adds two partial indexes over `finished_at IS NOT NULL`,
both keyed `id DESC` so neither query sorts anything. **Two, not one**, and that is the
lesson worth keeping: a single `(id DESC, ok)` index serves both queries when it is the
only candidate, and stops serving the `ok = 1` half the moment `ingest_runs_ok` is in the
picture, because the planner prefers that one's equality seek and keeps the sort. Run
`EXPLAIN QUERY PLAN` against the **whole index set**, never against the index you just
wrote in isolation.

<a id="the-cpu-budget"></a>
### The CPU budget

**Measured 2026-09-20, and it is the most serious thing in this file.** `$workers.cpuTimeMs`
over 24 hours of production, 878 invocations — taken while the cron was still `*/5`, so the
counts are ~2.6× what `*/15` now produces. **The per-invocation figures below are unaffected
by the cadence**: they are what one tick costs, and one tick does the same work either way.

| | n | median | p90 | p99 | max |
|---|---|---|---|---|---|
| **scheduled** (cron ticks) | 268 | **26 ms** | 54 | 81 | **94 ms** |
| **fetch** (page + API) | 568 | 5 ms | 10 | 20 | 43 ms |
| — successful scheduled only | 156 | **37 ms** | 59 | 81 | 94 ms |

**A cron tick normally uses three to four times the free plan's 10 ms limit**, and the
busiest uses nine. It survives because that ceiling is not enforced continuously — and on
2026-09-20 it was, for nine hours, and **every tick died**: 112 `exceededCpu` invocations,
12 an hour from 03:00 to 11:00 UTC, not one success. Same code version throughout. That is
the outage in [Concurrency and failure lessons](#concurrency-and-failure-lessons), and
nothing in the code stops it recurring — the Worker is living on unenforced headroom.

**The cadence is what decides whether that overrun is tolerated** (corrected 2026-09-22; this
paragraph used to say the opposite). Cloudflare's limits page says each isolate has "built-in
flexibility" for a Worker that "infrequently runs over the configured limit", and that one
"hitting the limit consistently" is terminated. The only kills in this Worker's history came
~10 h into the `*/5` cadence (12 over-limit ticks an hour). At `*/15` it has run 28 h straight
(2026-09-21 09:00 → 09-22 13:00) at a median ~60 ms and up to **170 ms** per tick, heavier than
the ticks that were killed, with **zero** `exceededCpu`. So: **never go below `*/15` while a
tick costs more than 10 ms.** That is observed safe, not guaranteed. The tolerance is
unpublished, so cutting per-tick CPU is still the real fix. Full measurements are in the
[2026-09-20 postmortem](incidents/2026-09-20-ingest-outage-and-sgc-refusal.md).

**The Tolima zone adds to every wide tick's work, and most to the hourly one** (2026-09-23,
not yet measured). At the swarm's ~130 events a day the tick on the hour now parses Chocó's wide
window and sweep chunk (~280 rows) *plus* Chaparral's (~330 + ~520), ~1,100 rows where it used to
be ~280; the :30 tick ~440 where it was ~110. How often a tick goes over the limit is unchanged —
every tick already does — and frequency is what the only kills tracked. The size of one tick is
not what was measured: 170 ms was tolerated, and nothing says where the ceiling is. **Read
`pnpm logs cpu --since 24h` a day after this ships.** The knobs, in the order to reach for them:
Chaparral's sweep off the hour or less often, then its padding, then the swarm cooling down.

The fetch side is fine: `/api/status`, the route the open page polls every minute, is 3 ms
median and 16 ms max, and `/api/refresh` is 6 ms median.

The choice was the paid plan or getting a tick under 10 ms, and **the decision is to stay on
the free plan** (maintainer decision, 2026-09-20). So the work is to get a tick under 10 ms, and the
first step is to find where the 26 ms goes rather than guess: the candidates are
`parseCatalogHtml` over ~0.8 MB of HTML and the `computeStats` pipeline, neither of which
has been profiled, and the wide tick does two ingests in one invocation while the sweep
parses the largest chunk (`SWEEP_CHUNK_DAYS`). `pnpm logs lanes` plus the new `lane` field
is what makes that attributable, now that a tick says which lane it took.

Nothing has been done about it yet. Until something is, the Worker keeps running over the
limit and the 2026-09-20 outage can repeat at any time, with the only warning being
`reaped abandoned runs` in the logs and the stale-catalogue alarm in
`.github/workflows/ingest-health.yml`.

`pnpm logs cpu --since 24h` reproduces the table above. Note `p50` is not a valid operator
in that API — it is `median`; `p90`, `p95`, `p99`, `avg`, `min`, `max`, `sum`, `stddev` and
`count` all work.

That figure is **per trigger — cron against fetch — and not per lane**, and no query gets
per-lane out of it: `cpuTimeMs` is on the invocation log, `lane` is on the lines the Worker
writes, and all three lanes hang off the one `*/5` cron, so they share a trigger. The
sweep is the lane worth isolating, since it is the one with a `SWEEP_CHUNK_DAYS` knob;
`pnpm logs lanes` gives its ticks, and their invocations can be matched by timestamp.
Note that nothing inside the Worker can measure this: `Date.now()` does not advance between
I/O operations in workerd, so a span with no `await` in it always reads 0 ms. Wall time we
can measure and do (`durationMs`, `sgcMs`); CPU time only the runtime can see.

<a id="the-daily-usgs-job"></a>
## The daily USGS job (from 2026-09-24)

`worker/external.ts` fetches what USGS publishes about each zone's mainshock and stores a small
digest in D1 (`external_products`, `migrations/0007`) for `GET /api/context`
([API](api.md)). It exists for the insights page's felt-intensity card and the USGS aftershock
forecast (plan Parts A and D). All three are on the insights page's questions tab: DYFI and PAGER in
"¿Qué tan fuerte se sintió?", the forecast in "¿Viene uno más grande?".

- **Its own cron, `7 11 * * *`, once a day, and its own invocation.** The pattern lives in
  `core/products.ts` with `lastProductsRun`, because the insights page asks for USGS's next forecast
  only once a run could have stored it; change the pattern and the run time there together.
  `scheduled()` branches on
  `controller.cron`: `INGEST_CRON` (`worker/plan.ts`) runs the ingest, `PRODUCTS_CRON` runs this,
  and any other pattern is logged as `unknown cron pattern` and runs **nothing**. Without that
  guard a mistyped pattern would have been an extra ingest, and so an extra request to SGC, at a
  minute the lanes were never designed for. `worker/test/external.test.ts` holds both constants to
  `triggers.crons` in `wrangler.jsonc`. The claim-window rule above does not apply: this job claims
  no ingest run and never talks to SGC. Minute 7 keeps it off the quarter hours anyway.
- **Once a day is enough.** Six weeks after the M7.4 its felt reports grow slowly, and the forecast
  is updated about weekly (`nextForecastTime` in the file).
- **Which USGS event: matched, never pinned.** For each zone whose mainshock is **found**
  (`zoneMainshock`, the rule in [the science](science.md#the-mainshock-detected-from-the-catalogue-never-pinned-from-2026-09-24)),
  one FDSN search within ±60 s, 100 km and one magnitude unit below SGC's own time, place and size.
  Exactly one result is the event; none or several stores nothing and logs `usgs: no single match`
  with the candidates. A zone with no found mainshock (Chaparral today) asks USGS nothing.
- **Per run**: the search, the event's detail GeoJSON, then only the product files that changed:
  DYFI `dyfi_geo_10km.geojson`, PAGER `json/cities.json` and OAF `forecast.json` (the names as
  published for us6000tjl2 on 2026-09-24). USGS versions its product URLs, so a URL equal to the
  stored one is not downloaded again; the row's `checked_at` moves and nothing else. USGS lists a
  product's preferred version first, and that is the one taken. Five subrequests at most per zone
  against the 50 allowed.
- **Only USGS's host is ever fetched.** The detail and product URLs come out of USGS's own answer;
  each must be `https://earthquake.usgs.gov/…` or it is refused (`usgsUrl`), and a redirect is a
  failure, never followed (`redirect: "manual"`), since the check holds for the first hop only.
- **A failure keeps what was there.** USGS down, a product missing, or a file a digest cannot read
  leaves that row as it was, with its old `checked_at`, and the other products and zones still run.
  Each digest throws rather than guessing: a DYFI cell that is not a `Polygon`, or a PAGER city
  without numeric coordinates, would otherwise read as "nobody in Pereira answered" and overwrite a
  real figure. **Then the first error is rethrown**, as the ingest's `scheduled()` does, so
  Cloudflare records the invocation as failed; a job that swallowed its errors would look "ok" for
  weeks. Every outcome is also a log line ([Operations](operations.md)).
- **A digest leaves with its mainshock.** Each row names the SGC mainshock it was matched from
  (`sgc_event_id`), and every run first deletes the zone's rows matched from any other event, or all
  of them when the zone has no found mainshock, so no reader can show the M7.4's felt reports or
  forecast for a later, larger event. That happens before anything that can fail. Within the day
  before the next run the page still checks `sgcEventId` against the mainshock it detects itself.
- **A change to a digest reaches stored rows.** Each row carries `digest_version`
  (`DIGEST_VERSION` in `worker/usgs.ts`); a row from older code is rebuilt although USGS's URL has not
  changed. Bump it whenever a digest's shape or rules change: PAGER for the M7.4 is final, so its URL
  may never change again.
- **CPU, measured 2026-09-24** in Node's V8 on the captured files (workerd cannot time a span with
  no I/O in it, see [the CPU budget](#the-cpu-budget)): parsing and digesting everything, cold, as
  on a day when every product changed, **3–4 ms**; warm 0.7 ms. An ordinary day parses only the
  search and the 70 kB detail, **~0.2 ms**, and its unchanged rows' `checked_at` move in one batch. The largest file is DYFI's 208 kB of 10 km cells.
  Production's `pnpm logs cpu` after the first run is the real check.
- **Cost**: one cron invocation a day, up to five subrequests, a few D1 rows written, and one read
  of at most three rows per `/api/context` call. Against the free plan's allowances above, nothing.
- **Tests**: `worker/test/usgs.test.ts` (each digest against the captured files, figures recomputed
  in Python) and `worker/test/external.test.ts` (the cron and the route end to end, USGS stubbed by
  MSW: one, none and several matches, the unchanged-URL skip, a row from older digest code, USGS
  down, a redirect, a malformed file, one zone failing before the next, a mainshock replaced, a zone
  with no mainshock, an unknown cron pattern).
