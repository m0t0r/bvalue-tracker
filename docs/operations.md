# Operations

## Debugging production

Everything below exists because two faults ran for hours with nothing to read. Start here
before guessing; the reasoning behind each piece is under
[Observability decisions](#observability-decisions).

Written-up incidents live in `.claude/incidents/`. The one to read first is
[2026-09-20](incidents/2026-09-20-ingest-outage-and-sgc-refusal.md): a 9-hour ingest
outage and the SGC refusal that followed it, with the measurements behind both — including
why this Worker has never fitted the free plan's 10 ms per-invocation CPU limit.

### The four places to look

| Where | Holds | Kept | Read it with |
|---|---|---|---|
| **Workers Logs** | Every line `worker/log.ts` writes, plus one invocation log per request with `$workers.cpuTimeMs`. | **3 days** (free plan) | `pnpm logs`, or the Worker's *Observability* tab |
| **Analytics Engine** (`sgc_ingest`) | One row per ingest run: lane, outcome, counts, duration, SGC status. | **3 months** | the [SQL API](https://developers.cloudflare.com/analytics/analytics-engine/sql-api/) |
| **D1 `ingest_runs`** | The same outcomes, authoritative, and what the page and the lane rules actually read. | forever | `wrangler d1 execute` |
| **`GET /api/health`** | `ingestAgeS`, `lastRunOk` — right now, from outside, with no credentials. | — | `curl` |

`pnpm logs` needs `CLOUDFLARE_API_TOKEN` to hold an API token with *Account · Workers
Observability · Read* — in the environment, or in `.env` (gitignored; copy `.env.example`).
The account comes from `wrangler.jsonc`, and `CLOUDFLARE_ACCOUNT_ID` only overrides it. A
`wrangler login` OAuth token is **not** enough — verified 2026-09-20, it answers 403
*Authentication error*, because its `workers_tail:read` scope is the live tail and not the
stored logs. The script says so when it happens.

**Nothing in `.env` may carry a `VITE_` prefix.** Vite reads that same file and inlines
every `VITE_`-prefixed value into the client bundle, which ships as a static asset —
`CLOUDFLARE_API_TOKEN` is invisible to the page, `VITE_CLOUDFLARE_API_TOKEN` would be
served to every visitor. Nothing this project runs in the browser needs a secret at all.

**None of this is needed to read the logs**, only to read them from a terminal: the
Worker's *Observability* tab in the dashboard queries the same data over an ordinary
browser login, and is the faster route for a one-off incident.

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
| `ingest ok` | info | a run finished cleanly | `runId`, `fetched`, `inserted`, `updated`, `removed`, `durationMs`, `sgcMs`, `sgcChars` |
| `ingest ok with a note` | warn | it worked, but skipped a removal or a bad row | `error` carries the note |
| `ingest failed` | error | SGC or D1 refused | `httpStatus`, `retryAfterS`, `error`, and on an HTTP refusal `sgcHeaders`, `sgcBody` |
| `reaped abandoned runs: an invocation was killed` | **warn** | a claimed run never wrote a result | `reaped` |
| `refresh stood down` | info | the button did nothing | `why`: `throttled`, `in flight`, `claim held` |
| `unhandled error` | error | a route threw | `err.stack`, `method`, `path` |
| `page error` | warn | the reader's browser threw | `page.message`, `page.stack`, `page.userAgent` |
| `ingest stood down: claim held` | debug | two runs raced for the same window | — |

### Symptom → what to ask

- **"The page is showing old data."** `curl $PRODUCTION_URL/api/health` first: `ingestAgeS`
  is the whole answer to *how* stale. Then `pnpm logs --since 6h --level error`. An
  `ingest failed` line with `httpStatus` means we were refused — read `sgcHeaders` before
  saying by whom; the 2026-09-20 refusal came from Cloudflare, not from SGC — the back-off is working as
  designed and the wide tick is still probing. **No error lines at all is the worse case**:
  look for `reaped abandoned runs`, which means invocations are being killed rather than
  failing.
- **"Invocations are being killed."** That is the 2026-09-20 fault, and `reaped` is the
  only signal for it. The invocation log for the killed tick carries the outcome and
  `$workers.cpuTimeMs`; `exceededCpu` there means the 10 ms limit, and the fix is the paid
  plan or a smaller `SWEEP_CHUNK_DAYS`. If CPU is fine, the suspect is memory — `sgcMs` and
  `sgcChars` on the *last* successful run of that lane say how large the responses had got.
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
  [the science](science.md)).

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

## Observability decisions

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
- **The dataset is auto-created; Analytics Engine is not auto-enabled.** Cloudflare's docs
  say only the first half, and `wrangler deploy --dry-run` cannot catch the second, so the
  CI run that shipped the observability work died at `code: 10089` after a clean build
  (verified 2026-09-20). It is one click per account, not per Worker or per dataset, and
  once done it stays done — see [Deployment](deployment.md).
- **`upload_source_maps` needs the build to emit a map**, and the map must be the Worker's
  only. `build.sourcemap` at the top level would also emit maps for the client bundle, and
  those are static assets: they would be published beside the page and hand over the whole
  source. It is scoped to the `choco` environment in `vite.config.ts`, which puts
  `index.js.map` in `dist/choco/` and nothing in `dist/client/`. Confirm on the first deploy
  by reading a stack trace in Workers Logs; the `--dry-run` output does not show it.

<a id="the-pages-own-failures"></a>
### The page's own failures

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
