# Postmortem — 2026-09-20: ingest outage, then SGC refusal

| | |
|---|---|
| **Status** | **Both resolved.** A: cause identified. B: lifted by itself; writer still unconfirmed |
| **Severity** | S1 — ingest stopped entirely; the page served stale data with no external signal |
| **Date** | 2026-09-20 → 2026-09-21 (all times UTC) |
| **Duration** | A: 09-20 02:50 → 12:10 (9 h 20 m). B: 09-20 12:40 → 09-21 between 07:31 and 09:01 (~19–20 h) |
| **Total time without a successful ingest** | 09-20 02:50 → 09-21 09:01, apart from six successful ticks between 12:10 and 12:35: ~30 h |
| **Data loss** | None. See [Recovery](#recovery-and-current-state) |
| **Authors** | Repo owner, with Claude Code sessions |
| **Blameless** | Yes |
| **Revised** | 2026-09-22, after a final investigation. The first version's root cause for A was **wrong**; see [Corrections](#corrections-to-the-first-version) |

Two faults landed within ten hours of each other, on a day a large refactor series was being
merged, and they were first read as one regression caused by that work. They were not caused
by the code. **Both followed the one change made the day before: the cron moved from every 15
minutes to every 5.** That is established for A and is the leading explanation for B.

---

## Summary

**Incident A — CPU kills, caused by cadence.** Every cron tick needs 30–170 ms of CPU against the
free plan's 10 ms. Cloudflare tolerates that *when it is infrequent*. Its documentation says:
*"Each isolate has some built-in flexibility to allow for cases where your Worker infrequently
runs over the configured limit. If your Worker starts hitting the limit consistently, its
execution will be terminated."* At 4–5 ticks an hour the Worker ran over the limit on every
tick for ~72 hours in total and was never killed. At 12 ticks an hour it lasted ~10 hours
before Cloudflare started enforcing, and then killed all 112 ticks for 9 h 20 m. It is not
memory: across 1,426 logged invocations there is no `exceededMemory` outcome at all.

**Incident B — Cloudflare-side 410, most likely rate-triggered.** At 12:40, 30 minutes after A
lifted, the Worker's requests to SGC began coming back **410 Gone**, as a 152-byte "Request
Denied!" page that carries Cloudflare headers. It came after 19 h 40 m of sustained 12
requests/hour to SGC. The killed ticks still sent their request, so A did not lower that load.
The refusal lifted by itself ~19–20 h after it started, during which the Worker was down to one
or two probes an hour. The trigger fits a rate threshold with a cool-down. Nothing observed
contradicts that, but it is not proven, and who writes the refusal is still unconfirmed.

**Now:** cron at `*/15` since 09-20 ~14:15. Since the refusal lifted (09-21 09:01), there have
been 115 consecutive successful runs with no kills and no refusals. At 12:48 on 09-22,
`/api/health` reported `{"ok":true,"totalEvents":828,"ingestAgeS":166,"lastRunOk":true}`.

---

## Impact

- The catalogue did not update for ~30 hours (09-20 02:50 → 09-21 09:01), apart from six
  successful ticks between 12:10 and 12:35.
- The page stayed up and rendered throughout. **Both outages were invisible from outside**
  unless something asked `/api/health`.
- There was no reader-facing error. One researcher uses this page, and nobody was paged.
- No data was lost or corrupted. The catalogue went from 816 events during the outage to 828
  now: the sweep caught up by itself.

---

## Timeline

Every row is from D1 `ingest_runs` or from Workers Logs. The first version gave some times in
Colombia time (UTC−5), where the commits are stamped. Those rows are corrected here.

| Time (UTC) | Event | Evidence |
|---|---|---|
| 09-18 23:30 | First run recorded (`ingest_runs` id 1) | D1 |
| 09-18 23:30 → 09-19 17:00 | ~5 runs/hour (4 cron + 1 sweep, plus manual). No kills, no refusals. Ticks at 63–73 ms median CPU from 13:00, when the logs begin | D1, Workers Logs |
| **09-19 17:00** | **Cadence goes to `*/5`: 12 runs/hour**, flat, from here on | D1 |
| 09-19 20:xx | Version `1355e096` deployed. It stays live until 09-20 13:25 | Workers Logs |
| 09-19 17:00 → 09-20 02:45 | 12 ticks/hour, all over 10 ms (median 30–50 ms), all succeed | Workers Logs |
| **09-20 02:50** | **First `exceededCpu`.** Incident A begins, ~10 h into the `*/5` cadence | Workers Logs |
| 03:00 → 12:05 | 12 killed ticks/hour, each stopped at exactly 10 ms CPU, **wall time 3.0–4.4 s**: each one still sent its request to SGC and waited for the answer | Workers Logs |
| **12:10** | Kills stop. Same version, still `*/5`, ticks at 32–64 ms and succeeding. Incident A ends | Workers Logs |
| 12:35:46 | Last successful ingest | D1 |
| **12:40:46** | **First 410**, after 19 h 40 m at 12 requests/hour. Incident B begins | D1 |
| 13:25 | First deploy of the day (observability work) | Workers Logs |
| 13:33, 14:43 | GitHub canary requests SGC directly: **200** | Actions |
| ~14:15 | Cron back to `*/15`. The refusal back-off (`sgcRefusing`) cuts the load to about one wide probe and one sweep an hour | Workers Logs, D1 |
| 16:00:04 | First captured refusal body: `cf-ray: a3e20a72bc0fa126-SIN` | Workers Logs |
| 16:16:53 | Repo owner's laptop: **200** from `Apache/2.2.11`, no `cf-*` headers | manual curl |
| 17:10 → 09-21 05:01 | The refusal is identical from the MIA, SIN and FRA colos | Workers Logs |
| **09-21 07:31:17** | Last 410 | D1 |
| **09-21 09:01:49** | **First success in 20 h 21 m.** Incident B ends. It needed no change on our side | D1 |
| 09-21 09:01 → 09-22 12:46 | 115 runs, all ok. ~5 runs/hour, every tick 30–170 ms CPU (median ~60), **zero kills** | D1, Workers Logs |

---

## Incident A — root cause: consistent overrun, set by cadence

### The mechanism

Cloudflare's limits page (fetched 2026-09-22) describes the free plan's 10 ms CPU limit as a
per-invocation limit with **per-isolate tolerance**. Overruns are allowed "infrequently", and a
Worker that hits the limit "consistently" is terminated. So cadence decides whether a given
per-tick cost is tolerated.

### The evidence

All the data comes from Workers Logs, `$workers.cpuTimeMs` and `$workers.outcome`, with every
invocation from 09-19 13:00 to 09-22 13:00 pulled hour by hour (1,426 invocations):

| Period | Cadence | Tick CPU (median / max) | Hours sustained | Kills |
|---|---|---|---|---|
| 09-18 23:30 → 09-19 17:00 | ~5/h | 63–73 / 94 ms (from 13:00, when the logs begin) | ~17 | **0** |
| 09-19 17:00 → 09-20 02:50 | **12/h** | 30–50 / 73 ms | ~10 | 0, then enforcement |
| 09-20 02:50 → 12:10 | **12/h** | killed at 10 ms | 9 h 20 m | **112 of 112** |
| 09-21 09:01 → 09-22 13:00 | 4–5/h | ~60 / **170 ms** | 28 | **0** |

The last row decides it. Today's ticks cost *more* CPU than the ones that were killed, up to
17× the limit, and none has been killed in 28 hours. A cost the platform tolerates at 4 ticks
an hour triggered enforcement at 12.

Rolling-window check. The 6 hours before enforcement began held **72 over-limit invocations**.
The 6 hours before now hold **28**, with about the same total overage (1,804 ms then, 1,495 ms
now). No 12-hour window since recovery has more than 56 over-limit invocations; the 12 hours
before enforcement had 163. So the number of over-limit invocations separates the two states.
The overage in milliseconds does not.

Enforcement lifted at 12:10 after 9 h 20 m in which every tick was capped at exactly 10 ms, so
none of them ran over. That fits a tolerance that recovers once the consistent overrun stops.
Nothing on our side changed at 12:10.

### Ruled out

- **Memory.** No invocation in the log window has an `exceededMemory` outcome (outcomes: 1,306
  `ok`, 112 `exceededCpu`, 8 `canceled`, all 8 of them page fetches). D1 has no abandoned run
  before 02:50 on 09-20. The `res.text()` buffering hypothesis from the security audit is
  disproved.
- **A deploy.** `scriptVersion` was `1355e096` before, during and after both edges.
- **Code getting slower.** Ticks before, during and after the outage cost the same order of
  CPU. The recovered ticks cost more, and they are not killed.
- **Cold starts.** These do not explain it (measured in the first version, and unchanged).

### What is not known

- **The exact threshold.** We know 12/h at 30–50 ms tripped after ~10 h, and 4–5/h at up to
  170 ms has held for 28 h twice. Cloudflare does not publish the tolerance, so `*/15` is
  *observed* safe, not guaranteed safe. A heavier tick, such as a big back-fill chunk, or any
  return to a faster cadence moves us back towards the edge.

---

## Incident B — what is established, and what is not

### Established

1. **The refusal carried Cloudflare headers from several colos.** `sgcBody` is a 152-byte
   generic page (`<title>Request Denied!</title>`, "If you have any questions, please contact
   the admin"). `sgcHeaders` are `server: cloudflare`, `cf-ray`, `cf-cache-status: DYNAMIC`,
   `connection: close`. The same refusal came from SIN, MIA and FRA, so it was
   network-wide and not one PoP.
2. **SGC's own server stayed reachable directly.** The canary (13:33, 14:43) and a laptop
   (16:16:53) got 200 from `Apache/2.2.11` during the refusal. `bdrsnc.sgc.gov.co` resolves to
   `190.121.155.237`, SGC's own LACNIC range, which is not in Cloudflare's published ranges.
3. **It was not our code.** The outbound request was byte-identical to the build that worked,
   and `test/live.test.ts` calls the same `fetchCatalog` from GitHub and got 200 twice during
   the refusal.
4. **It followed sustained load and ended after load dropped.** The rate into SGC went from ~5
   requests/hour for ~17 h (no refusal), to 12/h for 19 h 40 m, with a refusal at the end. The
   killed ticks of Incident A still made their request: their wall time is ~3 s, the same as
   successful ticks. The rate then dropped to 1–2 probes/hour, and after ~19–20 h the refusal
   lifted. There have been no refusals in the 28 h since, at ~5/h.
5. **It needed nothing from us to end.** No deploy, no config change, no contact with SGC or
   Cloudflare. The hourly probe found the door open at 09:01:49.

### Not established

- **Who wrote the refusal.** The first version concluded that it was "written inside Cloudflare's
  network, SGC never saw the request". That conclusion depends on one assumption nobody tested:
  that a Worker `fetch()` to a *non-Cloudflare* origin comes back with the origin's own
  `server` header and no `cf-ray`. If Cloudflare puts `server: cloudflare`/`cf-ray` on such
  responses anyway, the 410 could equally be SGC's firewall refusing Cloudflare's egress
  addresses. The request would then have come from an address the laptop and the canary never
  use, which explains their 200s just as well. **Test before relying on either reading:** fetch
  any known non-Cloudflare origin from a throwaway Worker and look at the response headers. It
  needs no request to SGC.
- **Whether the rate caused it.** The timing fits a rate threshold with a cool-down of about a
  day, on either writer. It is one occurrence, and nothing has confirmed it.

"It is not our request rate" and "it is not SGC rate-limiting us" were both stated as
established in the first version. They are withdrawn. A flat, burst-free 12/h is still 2.4×
the rate that had run without trouble, and "their server never received the requests" rests
on the untested assumption above.

---

## Corrections to the first version

| First version said | Evidence now says |
|---|---|
| The 10 ms limit is strictly per invocation; "changing cadence cannot help, and in this case hurt slightly" | Wrong. Tolerance depends on how *often* the limit is exceeded. At `*/15` the Worker has run 28 h at up to 17× the limit with no kills. The only kills in its history happened at `*/5` |
| "What changed on 09-20 was enforcement", cause unexplained | Enforcement changed because 12 over-limit ticks an hour is "consistently" over the limit. The cadence change on 09-19 17:00 is the cause |
| "It is not our request rate" (B) | Not established. Rate is the leading explanation |
| "It is not SGC rate-limiting us … their server never received the refused requests" | Not established. It depends on an untested assumption about Worker subrequest headers |
| Worker first deployed 09-18 18:00; cadence changed 09-19 ~14:30 | 18:00 and 14:30 are Colombia time. In UTC: first run 09-18 23:30, `*/5` from 09-19 17:00 |
| The 5-minute cadence *lowered* CPU and so was harmless | Per tick it did cost less, and that was never the risk. The risk was how many ticks ran over |

The memory hypothesis was already withdrawn in the first version. This pass confirms that with
a complete outcome count, as listed above.

---

## Detection

Neither incident was detected when it happened. Both were found by reading logs afterwards.

1. `/api/health` said `ok: true` throughout, because `ok` describes the Worker, not the data.
   It now carries `ingestAgeS` and `lastRunOk`.
2. `ingest-health.yml` was added at 13:54, after both incidents had begun. It was switched off
   on 09-20 (`72a1009`) while the 410 stood. **It is still off**, even though the condition its
   comment gives for switching it back on (ingest succeeding again) has been true since 09-21
   09:01.
3. Scheduled Actions in this repo land about three hours late, so a 30-minute check cannot do
   the job it was written for.
4. Nothing measures CPU per invocation, or how often ticks exceed 10 ms.
5. The sweep lane had not run for ~24 h before the incident (the `tickMinute` fault). It was
   fixed in `3be794f` and has been confirmed in production.

---

## Recovery and current state

No data was lost. `sweepChunks` re-reads the sequence one 7-day chunk an hour, and SGC is an
archive, so an outage costs freshness, not history. Recovery was automatic. The refusal
back-off (`sgcRefusing`) kept probing once an hour, found the door open at 09-21 09:01:49, and
the fast lane came back on its own.

**Current state (09-22 13:00):** healthy. Cadence is `*/15` (~5 SGC requests/hour, ~120/day).
There have been 115 consecutive successful runs, 828 events, and the catalogue is 166 s old.
The CPU overrun is still there on every tick (median ~60 ms). It is tolerated at this cadence,
but the margin is unknown.

---

## What went well

- The canary is what showed that the caller was different, not the endpoint.
- The refusal body was captured (`8405883`) an hour before the probe that needed it.
- D1's run rows are permanent, and the whole two-day timeline was rebuilt from them.
- The back-off did exactly what it was written for. It stopped hammering, kept probing, and
  recovered with no one touching it. Cutting the load that far may also be what let the
  refusal expire.

## What went badly

- Two faults on a refactor day were read as one code regression.
- The first root-cause analysis took "per invocation" from the limits table and missed the
  documented tolerance, so it dismissed the one lever that mattered, cadence, as useless. That
  wrong lesson went into the README and into session memory.
- "Ruled out, with evidence" was written for two claims (B not rate, B not SGC) whose evidence
  had a gap. They were stated more strongly than the evidence supported.
- The alarm was written after the outage, and it is still switched off now that ingest works.

## Where we got lucky

- Both faults cleared themselves. We did not know then how to make either one clear.
- The logs from 09-19 13:00 onwards were still inside the 3-day retention window when this
  final pass ran. A day later, the comparison between cadences in Incident A could not have
  been made.

---

## Action items

| # | Action | Type | Priority | Status |
|---|---|---|---|---|
| 1 | **Never go below `*/15` while ticks exceed 10 ms.** Record it in README beside the "never go below 5" rule, which is about SGC publishing and a different thing | Prevent A | **P1** | Done (README, this revision) |
| 2 | Turn `ingest-health.yml`'s schedule back on. The condition in its own comment had been met since 09-21 09:01 | Detect | **P1** | Done (2026-09-22) |
| 3 | Test the header assumption behind "Cloudflare wrote the 410": a throwaway Worker fetches a known non-Cloudflare origin, and the response headers are read. No SGC request needed | Investigate B | P1 | Open |
| 4 | If #3 still points at Cloudflare, ask them about `cf-ray: a3e20a72bc0fa126-SIN`. **That log line expires ~09-23 16:00**; the MIA/FRA rays from 09-20 17:10 → 09-21 05:01 last a little longer | Investigate B | P2 | Open (optional now that B is over) |
| 5 | Reduce per-tick CPU so the tolerance is a margin and not a necessity. The flat row scanner (4.9× faster parse), and fewer rows per tick | Mitigate A | P2 | Open |
| 6 | Alert on over-limit *frequency*: a daily check of the share of scheduled invocations over 10 ms, and any `exceededCpu` at all | Detect | P2 | Open |
| 7 | Accept or fix the ~3 h lateness of scheduled Actions for the health alarm | Detect | P2 | Open |
| 8 | Off-network fetch (Actions posts parsed rows to an authenticated route). Worth having as the fallback if either fault returns. No longer urgent | Design | P3 | Open |

---

## Lessons

1. **Read the whole limit, not the table row.** "10 ms per invocation" came with a sentence
   about tolerating infrequent overruns, and that sentence decided the incident. The units of
   a limit matter, and so do its enforcement rules.
2. **An intervention that is followed by recovery has not been shown to cause it, and one ruled
   out on theory has not been ruled out.** Cadence was dismissed on first principles. The
   28-hour natural experiment afterwards showed it was the lever.
3. **Keep the refusal, not only the status.** The 152-byte body ended hours of guessing. A
   header-based attribution still needs its own assumptions tested.
4. **Own an instrument that reaches the dependency from somewhere else.** The canary is still
   the only reason the caller could be separated from the endpoint.
5. **An alarm that is switched off is not an alarm.** Set the condition for switching it back
   on, and put a date on checking that condition.

## Open questions

- Who wrote the 410: a Cloudflare-side rule, or SGC refusing Cloudflare's egress addresses?
  Action item 3 settles which one.
- What is Cloudflare's actual tolerance window for CPU overruns? It is unpublished. We have
  one point on each side of it.

## Evidence

- Workers Logs (3-day retention): per-invocation `$workers.outcome`, `cpuTimeMs`,
  `wallTimeMs`, `scriptVersion`, pulled hour by hour through the telemetry query API on
  2026-09-22 for 09-19 13:00 → 09-22 13:00. `pnpm logs --since 3d --msg "ingest failed"` gives
  the refusal lines with their cf-rays.
- D1 `ingest_runs` (permanent), ids 1–525: `wrangler d1 execute sgc-swarm --remote` from
  outside the repo with `env -u CLOUDFLARE_API_TOKEN`.
- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/
  (the "built-in flexibility … infrequently … consistently" passage).
- GitHub Actions: `sgc-canary.yml` runs of 09-19 14:30, 09-20 13:33 and 14:43 (all green).
