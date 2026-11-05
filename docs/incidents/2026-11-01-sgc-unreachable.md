# Postmortem — 2026-11-01: SGC's catalogue server stops answering anyone

| | |
|---|---|
| **Status** | **Ongoing** when this was written, 2026-11-05 22:00 UTC |
| **Severity** | S2 — no sync possible for either zone. The page stays up on the catalogue as of 2026-10-11, and says the last sync failed |
| **Date** | Began between 2026-10-11 22:05 and 2026-11-01 18:26 UTC (no request was sent in between); open |
| **Data loss** | None expected. The first press after SGC returns loads the missing chunks |
| **Authors** | Maintainer, with a Claude Code session |
| **Blameless** | Yes |
| **Earlier incidents** | [2026-09-20](2026-09-20-ingest-outage-and-sgc-refusal.md), [2026-09-30](2026-09-30-sgc-refusal-returns.md). Unlike both, this is not a refusal of Cloudflare: nothing gets an answer |

---

## Summary

Every "Sincronizar ahora" since 2026-11-01 has failed with **HTTP 522**: Cloudflare could not open a
TCP connection to `bdrsnc.sgc.gov.co`. The same host also timed out from GitHub's runners (the canary)
and from the maintainer's own connection, all on the evening of 2026-11-05. Three
unrelated networks failing the same way is SGC's server, or the path to it, being down. It is not a
block of Cloudflare's addresses, which is what the 410s of September were. Nothing on our side caused
it, and there is nothing on our side to fix.

---

## Timeline

| Time (UTC) | Event | Evidence |
|---|---|---|
| 10-11 21:59, 22:05 | Last successful syncs, Tolima then Chocó, ~1 s from SGC | D1 runs 3358–3361 |
| 10-11 → 11-01 | No press, so no request to SGC (support mode). Deploys on 10-14, 10-20, 10-27 | `wrangler deployments list` |
| **11-01 18:26** | **First failure**: Tolima chunk 2026-10-12, 522 after two attempts, 40 s | D1 run 3362 |
| 11-03 07:21 | Deploy (dependencies) | deployments list |
| 11-03 09:22 → 15:20 | Four presses, four 522s, each on the next missing day | D1 runs 3363–3366 |
| 11-05 21:39 | Sixth press, 522 (`cf-ray: a55f03b048933cca-MIA`) | D1 run 3367, Workers Logs |
| 11-05 21:44 | Canary dispatched by hand: `ConnectTimeoutError … bdrsnc.sgc.gov.co:443`, four attempts | Actions run 42115267513 |
| 11-05, after the canary | Maintainer's `curl` to the form page from their own connection: `Connection timed out after 30006 milliseconds` | session |

DNS was unchanged throughout: `190.121.155.237` from the system resolver, 1.1.1.1 and 8.8.8.8, still
SGC's own /26 at LACNIC. No announcement of an outage or a move was found on SGC's site.

---

## What is established

1. **The 522 was written by Cloudflare.** The body is `error code: 522` and the headers are Cloudflare's
   error-page set (`cache-control: private, max-age=0, no-store…`, `expires: Thu, 01 Jan 1970`,
   `x-frame-options: SAMEORIGIN`, no `cf-cache-status`), the same as the reference 522 of 09-29 in the
   [09-30 postmortem](2026-09-30-sgc-refusal-returns.md#who-writes-the-refusal-sgcs-side-not-cloudflare).
   SGC never answered.
2. **It is not a Cloudflare-only fault.** The canary (GitHub, Azure addresses) and a residential
   connection time out on connect too.
3. **The back-off did what it should.** Each press sent one request, retried once (522 is a 5xx other
   than 503, so `retryableStatus` retries it), recorded the failure and stopped. Six presses in five
   days is twelve connection attempts in all. Each press took the next never-attempted chunk, which is
   the sweep order working, not a fault.
4. **The page told the truth.** "La última sincronización con el SGC falló", the data as last synced,
   and "Última sincronización" dated 11 Oct.

## What is not

- When it began. Nothing reached SGC for three weeks before the first failure, so the start is
  anywhere in that span.
- Whether SGC is down or unreachable along a path all three networks share. From here the two look the
  same.

---

## Action items

| # | Action | Type | Priority | Status |
|---|---|---|---|---|
| 1 | Write to SGC with the window above. The 09-30 postmortem's item 3 is the same contact | Investigate | P2 | Open |
| 2 | Recheck SGC from off Cloudflare every few days: the canary, or the maintainer's `curl`. Not a loop: one request each | Close | P1 | Open |
| 3 | When a press succeeds again, record the date here and close this | Close | P1 | Open |
| 4 | A 522 / connect-timeout entry in [Operations](../operations.md), so the next one takes three checks instead of an investigation | Detect | P2 | Done (this write-up) |

If SGC comes back for everyone but the Worker, that is a block of Cloudflare's addresses, and the
off-network fetch deferred on 09-30 (item 1 there) is the decision to reopen. GitHub Actions is still
out for it, for the reasons given on 09-30.

## Lessons

1. **A 522 and a 410 are different questions.** A 410 is SGC refusing us; a 522 is nobody answering.
   The 522 kept from 09-29 is what made that a one-minute read.
2. **Three vantage points settle "us or them"**: the Worker's log line, the canary, and one request from
   the maintainer's own connection. All three are in [Operations](../operations.md) now.

## Evidence

- D1 `ingest_runs` ids 3358–3367 (permanent).
- Workers Logs: the `ingest failed` lines of runs 3362–3367 with `sgcHeaders` and `sgcBody`; they expire
  three days after each run.
- GitHub Actions: canary run 42115267513 (red, connect timeout).
