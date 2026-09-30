# Research: an instant /insights (2026-09-30)

Prototype in this worktree (branch `worktree-research+instant-insights`, uncommitted), switched per
browser by `?proto=<flags>` on any page (kept in localStorage; `?proto=` clears):

| Flag | What it does | Where |
|---|---|---|
| `tq` | TanStack Query's per-query persister (`experimental_createQueryPersister`) on IndexedDB (idb-keyval); `/insights` restores before its first render, then refetches | `src/lib/tq-persist.ts` |
| `data` | the same by hand, on Cache Storage (superseded by `tq`: same numbers) | `src/lib/local-first.ts` |
| `warm` | "preheating": the monitor, once idle, asks for what `/insights` needs (the other zone's catalogue, Chocó's context); stored answers are restored instead of fetched | `src/main.tsx` |
| `pre` | the monitor, once idle, prefetches the files `/insights` loads (read off its HTML) | `src/main.tsx` |
| `sw` | a service worker: the three pages' HTML stale-while-revalidate, their assets precached | `public/sw.js` |
| `noskel` | hide the skeleton while local data exists (wired to `data` only, not `tq`: untested) | `src/index.css`, `src/lib/startup.ts` |
| `nodefer` | diagnostic only | `src/insights/app.tsx` |

`scripts/fixture-server.ts` gained `--tls DIR` (HTTP/2), `--latency`, `--api-delay`, `--rules` and
`--html-cache`. The harness is `scripts/research/nav-timing.mjs` (private headless Chrome over CDP,
tab-target attach so prerender works; its header says how to launch Chrome and the server), and
`scripts/research/filmstrip.mjs` picks screencast frames for a filmstrip. None of this branch is meant
to merge as is: it is the prototype the implementation issue points at.

Owner's answer on staleness (2026-09-30): old figures on screen for one or two seconds before the
refetch replaces them are acceptable; half a second is a great experience.

## Setup

Production from this machine, 2026-09-30: HTML 304 ≈ 105 ms, `/api/events` TTFB ≈ 460–490 ms after the
request; a warm repeat visit to `/insights` showed the skeleton 192 → 672 ms, all of it the data wait.
Modelled as HTTP/2, 100 ms on every answer, 350 ms more on `/api/*`. Click = the monitor loaded, 3.5 s
idle, press 100 ms on "What is happening?". Time = click (or navigation start) → the story's hero
painted (LCP). Medians of 5 (desktop, 1350 × 940) or 3 (phone, 412 × 823, CPU ×4).

## Results

| Monitor → /insights (click) | desktop | phone ×4 |
|---|---|---|
| no speculation rules (Safari, Firefox) | 621 | 726 |
| conservative prerender (production today) | 525 | 638 |
| + local data only (`data`) | 625 (no gain: the monitor holds one zone) | |
| + preheating (`data,warm`) | 289 | |
| + preheating + insights' chunks (`data,warm,pre`) | 189 | |
| same with TanStack's persister (`tq,warm,pre`) | 190 | 355 |
| same + conservative prerender | 116 | 374 |
| same + service worker (`sw`) | 89 | 254 |
| moderate prerender (#115), hover 300 ms, + local data | 338 (bug, below) | |
| eager prerender, no local data | 509 | |
| HTML `stale-while-revalidate` header + local data | 186 (no gain over 189) | |

| Repeat visit to /insights | desktop | phone ×4 |
|---|---|---|
| today | 639 | 726 |
| local data (`tq`; `data` 225) | 229 | 495 |
| local data + service worker | 124 | |
| local data + HTML `stale-while-revalidate` header | 221 (no gain) | |

## Findings

- **Store speed is not the question.** Both catalogues (865 + 1,036 events, 0.8 MB of JSON) read back
  in 6–9 ms at CPU ×4 from IndexedDB, Cache Storage, localStorage or the HTTP cache alike.
- **The HTTP cache already holds `/api/events`** (`no-cache`, no validator): `fetch(url, {cache:
  "only-if-cached", mode: "same-origin"})` returns it in 2–3 ms. But while the HTML's preload for the
  same URL is in flight, the read waits for it (Chrome's cache lock: 262 ms), so it cannot be the store
  without dropping the preloads.
- **TanStack Query does this natively.** `experimental_createQueryPersister` stores one entry per query
  hash, so the monitor's `["events", zone]` is the entry `/insights` restores; `restoreQueries` fills the
  cache before the first render, `refetchOnRestore` revalidates. Needs `@tanstack/query-persist-client-core`
  at the same version as `@tanstack/react-query` (lockstep: 5.104.0 for both) and ~2 kB of code with
  idb-keyval. `PersistQueryClientProvider` (whole-client blob) is the wrong shape here: the monitor's blob
  would overwrite `/insights`' one.
- **Preheating is what makes the click fast**, not the store alone: without it `/insights` found only
  one zone locally and waited as before.
- **Hydration trap:** data present in React's first render would not match the static skeleton in the
  HTML; the prototype holds the tab until `useHydrated`.
- **Everything the first render shows must come from the same snapshot.** With only the catalogues
  local, the story drew at ~400 ms (phone) and the back-fill notice (from `/api/status`) arrived ~100 ms
  later above it and pushed it down: a new layout shift. Persist status too, or reserve its slot.
- **A prerender that runs early holds the story's chunks behind the API preloads.** With a 1.5 s hover,
  the chunks (from cache, transfer 0) finished only after the catalogues' network answers (~690 ms), so
  local data gave no gain; conservative (entry after activation) did not have this. Fix before
  combining #115 with local data (e.g. `fetchpriority="high"` on the story's modulepreloads; untested).
- **HTTP `stale-while-revalidate` on the HTML did nothing** for navigations in Chrome here.
- **The phone floor is now CPU:** with data and files local, ~250–300 ms of bundle evaluation and the
  story's render remain at ×4.

## Not done

Offline and API-failure behaviour with local data (the existing stale notice should cover it: untested),
Safari/Firefox, the `noskel` flag with `tq`, a max-age policy for drawn data, real devices.
