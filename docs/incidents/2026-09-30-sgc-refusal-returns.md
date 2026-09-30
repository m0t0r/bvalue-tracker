# Postmortem — 2026-09-30: the SGC refusal returns, and CPU kills at `*/15`

| | |
|---|---|
| **Status** | **A (410 refusal): ongoing** when this was written, 13:15 UTC. **B (CPU kills): stopped by itself** on 09-28; found while investigating A |
| **Severity** | A: S1 — no ingest for either zone. B: S2 — Tolima's wide ticks and every Chocó run lost for hours at a time; Tolima's fast lane kept the newest day current |
| **Date** | A: 2026-09-30 10:45 → (open). B: 2026-09-25 20:30 → 09-28 05:30 (all times UTC) |
| **Data loss** | None expected. The sweep re-reads history once ingest resumes |
| **Authors** | Maintainer, with a Claude Code session |
| **Blameless** | Yes |
| **Earlier incident** | [2026-09-20](2026-09-20-ingest-outage-and-sgc-refusal.md). Both faults there have now happened a second time, and both second occurrences contradict what that postmortem concluded |

The 2026-09-20 postmortem ended with two working rules: the refusal follows our request rate,
and `*/15` keeps the CPU overrun tolerated. **Neither held.** The refusal came back at a rate
that had run for six days without one, and 39 ticks were killed at `*/15`.

---

## Summary

**Incident A — the 410 again, with nothing of ours in front of it.** At 10:45:29 the Worker's
request to SGC came back **410 Gone** with the same 152-byte "Request Denied!" page as on
09-20. The request before it, at 10:30, had succeeded in the usual ~0.9 s. No deploy, no code
change and no change in request rate preceded it. SGC answered the canary normally from GitHub's
network at 13:09, while the Worker was being refused. The back-off did what it was written for:
eight refused requests in total by 12:30, then one probe an hour.

**Incident B — CPU kills at `*/15`.** D1 holds **39 abandoned runs** between 09-25 20:30 and
09-28 05:30, in four stretches. Every one is Tolima's first run on a wide tick (:00 or :30), the
heaviest ticks there are since the Tolima zone was added. Those still inside the log window on
09-29 ended `exceededCpu` at 10–11 ms. Nothing was written up at the time; the health alarm
failed once for it (09-28 05:12) and was not followed.

---

## Impact

- **A:** neither catalogue has updated since 10:30 on 09-30. The page stays up and shows its
  stale-data notice. The first refusal lasted ~20 hours; nothing says this one will match.
- **B:** on a killed wide tick Tolima's run dies and Chocó's, which comes after it in the same
  invocation, never starts. So for each stretch Chocó had no ingest at all and Tolima had no
  removals and no sweep. Tolima's fast ticks (:15, :45) were not killed, which is why the newest
  events kept arriving and the page looked healthy.
- No data was lost in either.

---

## Timeline

Every row is from D1 `ingest_runs`, Workers Logs or GitHub Actions.

| Time (UTC) | Event | Evidence |
|---|---|---|
| 09-21 09:01 | First refusal ends. 3.6–5.4 runs/hour for the next three days | D1 |
| 09-23 | Tolima zone added: two zones in one invocation, up to four requests on the hour | `1dee2f4` |
| 09-24 → 09-29 | 6.2–8.2 runs/hour. 8 when nothing is killed | D1 |
| 09-25 | Zones swap: Tolima takes every lane | `e81bad4` |
| **09-25 20:30** | **First abandoned run at `*/15`** (one tick) | D1 |
| 09-26 01:30 → 05:30, 10:30 → 13:00 | 15 wide ticks killed | D1 |
| 09-27 07:30 → 12:00 | 10 wide ticks killed | D1, Workers Logs (`exceededCpu`) |
| 09-27 23:30 → 09-28 05:30 | 13 wide ticks killed | D1, Workers Logs (`exceededCpu`) |
| 09-28 05:12 | Health alarm fails once; not followed | Actions |
| 09-28 05:30 → | No kill since | D1 |
| 09-29 10:45 | One SGC timeout (two attempts) | D1 run 1649 |
| 09-29 18:15 | One **522** from Cloudflare: SGC did not accept the connection | D1 run 1710, Workers Logs |
| 09-30 00:10 | Deploy (front-end work only) | deployments list |
| 09-30 10:30 | Last successful ingest, both zones, ~0.9 s from SGC | D1 runs 1840–1841 |
| **09-30 10:45:29** | **First 410** (Tolima fast lane). Incident A begins | D1 run 1842 |
| 11:00 | Four more 410s in three seconds: both zones' wide run and sweep | D1 runs 1843–1846 |
| 11:14 | Deploy (front-end work only), 29 minutes *after* the first 410 | deployments list |
| 11:30 | Two 410s. The refusal grace is over; the back-off engages | D1 runs 1847–1848 |
| 12:00 | Tick stands down | D1 (no run) |
| 12:30 | One probe: 410 | D1 run 1849 |
| 12:58 | Health alarm fails, 2 h 13 m after the first 410 | Actions |
| 13:09 | Canary dispatched by hand: SGC answers GitHub normally | Actions run 36719587714 |

---

## Incident A — what is established, and what is not

### Established

1. **It is the same refusal.** `sgcBody` is byte for byte the 09-20 page (`<title>Request
   Denied!</title>`, "please contact the admin"), 152 bytes, `server: cloudflare`, `cf-ray`,
   `cf-cache-status: DYNAMIC`, `connection: close`. This time from LHR and EWR
   (`cf-ray: a432a36dbeed63fe-LHR` is the first).
2. **SGC is reachable from elsewhere.** The canary makes the same request with the same
   user-agent from GitHub's runners and passed at 13:09.
3. **Nothing of ours preceded it.**
   - Rate: 8 runs an hour, flat, in every hour of the two days before (D1, hour by hour).
   - Deploys: none between 00:10 and 11:14. Both were front-end work.
   - Code: `core/seiscomp.ts`, `worker/plan.ts` and `worker/ingest.ts` last changed on 09-25.
   - SGC's answers: 0.85–1.9 s for Tolima and 0.16–1.3 s for Chocó over the six hours before,
     with no slowing towards the end.
4. **The back-off worked.** Eight refused requests, then one an hour.

### The rate explanation no longer fits

| | Rate before | For how long | Refused |
|---|---|---|---|
| 09-18 → 09-19 | ~5/h | ~17 h | no |
| 09-19 → 09-20 | 12/h | 19 h 40 m | **yes** |
| 09-21 → 09-23 | 3.6–5.4/h | 3 days | no |
| 09-24 → 09-30 | 6.2–8.2/h | 6 days | **yes** |

Eight an hour ran for six days before the second refusal. A threshold on requests per hour that
8 crosses would have tripped on 09-24. Rows fetched do not fit either: the heaviest days were
09-24 to 09-26 (35,000–46,000 rows a day), and the refusal came after two days at ~23,000. So
**no single rule on our own traffic explains both refusals**, and "stay under 12 an hour" is not
protection. What remains possible: a slower or cumulative rule we cannot see, or a rule that is
not about our traffic at all.

### Who writes the refusal: SGC's side, not Cloudflare

**The header test was run on 09-30 at 13:28 UTC, and it removes the basis for "Cloudflare wrote
it".** A throwaway Worker (a `wrangler dev --remote` preview, never deployed, no request to SGC)
fetched three URLs on hosts that are not behind Cloudflare: `httpbin.org/status/410`,
`httpbin.org/get` and `api.github.com/zen`.

- **Every response came back with `server: cloudflare`, `cf-ray`, `cf-cache-status: DYNAMIC` and
  `connection: close`**, including GitHub's, whose own `server` header is `github.com`.
  Cloudflare replaces `server` and adds the rest on whatever a Worker fetches.
- **httpbin's own 410 came back with exactly the header set of SGC's 410**: those four plus
  `content-type`, `content-length` and `date`.
- So those headers say nothing about who wrote a response. The 09-20 conclusion "written on
  Cloudflare's network, SGC never saw the request" rested on them and is withdrawn.
- **What the origin sees of us** (httpbin echoes it): `Cf-Worker: sgc-swarm.workers.dev`, a
  `Cf-Ray`, `Cdn-Loop: cloudflare`, and a Cloudflare address as the caller. SGC can refuse
  Cloudflare's addresses, or that one header, and either looks the same from here.

The comparison that was made before the test agrees with it. The 522 of 09-29 18:16 is a response Cloudflare certainly wrote, to the same Worker, for the same
URL. Its headers are Cloudflare's error-page set: `cache-control: private, max-age=0, no-store…`,
`expires: Thu, 01 Jan 1970`, `referrer-policy: same-origin`, `x-frame-options: SAMEORIGIN`, and
no `cf-cache-status`. **The 410 has none of those**, and it does have `cf-cache-status:
DYNAMIC`, which Cloudflare puts on an answer that came back from an origin.

So the 410 is an answer from SGC's end, written by something in front of its Apache (the page
is not Apache's own 410). What is refused is either **Cloudflare's outgoing addresses, which
every Worker on Cloudflare shares**, in which case the trigger need not be our requests, or the
`Cf-Worker` header that names this account. Only SGC can say which, and Cloudflare has nothing
to answer for here.

One reading is not excluded by the test: a Cloudflare zone for this hostname answering with a
custom block page. Nothing supports it, and the 522 shows what a Cloudflare-written page to this
Worker looks like.

---

## Incident B — CPU kills at `*/15`

| Stretch (UTC) | Killed | Ticks |
|---|---|---|
| 09-25 20:30 | 1 | wide |
| 09-26 01:30 → 05:30 | 9 | wide |
| 09-26 10:30 → 13:00 | 6 | wide |
| 09-27 07:30 → 12:00 | 10 | wide |
| 09-27 23:30 → 09-28 05:30 | 13 | wide |

- **Only wide ticks died.** On 09-20 every tick died, at 12 an hour. Here the fast ticks between
  the killed ones survived, so enforcement fell on the heaviest invocations and not on all of
  them.
- **The ticks had grown.** Over the three days to 09-30 the cron's CPU was median 67 ms, p90
  156, max 264, against the ~60 / 170 the 09-20 postmortem called tolerated. The Tolima zone
  tripled the rows a tick on the hour parses ([the CPU budget](../ingest.md#the-cpu-budget)
  predicted this on 09-23 and asked for a measurement a day later; it was not taken).
- **It stopped without a change from us**, as it did on 09-20. Tolima's daily rows fell from
  ~46,000 on 09-25 to ~23,000 on 09-28, which fits lighter ticks, but that is a correlation.
- **Detection.** `reaped abandoned runs` is the line meant to announce this. `pnpm logs --since
  3d --level warn` on 09-30 returned no lines, although runs were reaped inside that window. Not
  yet explained.

---

## What went well

- The back-off, again: no hammering, hourly probe, no action needed to recover.
- The refusal body and headers were in the log line, and a Cloudflare-written 522 from the day
  before was still inside the 3-day window to compare against.
- D1's run rows gave the whole rate history and every killed run, including the ones the logs
  had already dropped.
- The canary separated the caller from the endpoint in under a minute.

## What went badly

- Two conclusions of the last postmortem were written as rules on a sample of one each.
- The kills of 09-25 → 09-28 ran for three days unreported. They were noticed on 09-29 while
  measuring something else, and not written up.
- The measurement the CPU budget asked for after adding Tolima was never taken.
- The alarm fired 2 h 13 m into A. GitHub ran the `7,37 * * * *` schedule 3–6 hours apart all
  week.
- On the 11:00 tick four requests went out after the tick before had already been refused.

---

## Action items

| # | Action | Type | Priority | Status |
|---|---|---|---|---|
| 1 | Fetch SGC from off Cloudflare's network while the Worker is refused (item 8 of 09-20). Costed on 09-30: no money on GitHub Actions, but GitHub's terms forbid Actions "as part of a serverless application", and it adds a write route and a token to keep alive. **Not building it for now** (maintainer decision, 09-30): wait up to 24 hours for the refusal to lift, then decide | Prevent A | P1 | Deferred |
| 2 | Run the header test (item 3 of 09-20) | Investigate A | **P1** | Done (09-30): the headers are Cloudflare's on every Worker fetch; the 410 is SGC's side |
| 3 | Write to SGC: the page says "contact the admin". Ask what rule answers 410 to Cloudflare's addresses or to the `Cf-Worker` header. Now the only route to an answer | Investigate A | **P1** | Open |
| 4 | After a refusal status, run none of the tick's remaining steps | Mitigate A | P2 | Open |
| 5 | Cut per-tick CPU on the wide ticks, or take Tolima's sweep off the hour (the knobs in the CPU budget) | Prevent B | **P1** | Open |
| 6 | Find why the `reaped abandoned runs` warning was not in Workers Logs | Detect B | P1 | Open |
| 7 | An alarm that does not depend on GitHub's schedule (item 7 of 09-20) | Detect | P2 | Open |
| 8 | Record when A ends, and how | Close | P1 | Open |

---

## Lessons

1. **One occurrence gives a hypothesis, not a rule.** "Rate-triggered" and "`*/15` is safe" were
   each one data point. The second data point contradicted both.
2. **A fault that clears itself still needs writing up the day it is seen.** B was visible on
   09-26 and became a line in a session's notes on 09-29.
3. **Keep a known-Cloudflare response to compare a suspect one against.** The 522 did more to
   place the 410 than a week of reasoning about headers.
4. **A dependency that can refuse one network needs a second way in.** Both refusals were
   invisible from everywhere except Cloudflare.

## Evidence

- D1 `ingest_runs` ids 1071–1849 (permanent).
- Workers Logs (3 days): `pnpm logs --since 24h --level error` for the 410 lines and the 522
  of run 1710; both expire by 10-03.
- GitHub Actions: canary run 36719587714 (13:09, green); health run 36718345873 (12:58, red).
