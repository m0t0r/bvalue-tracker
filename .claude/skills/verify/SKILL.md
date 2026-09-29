---
name: verify
description: Run the page locally with data and drive it in agent-browser, without reaching SGC, then check performance (LCP, CLS via Chrome DevTools MCP), design-system use (shadcn), usability by dogfooding, and the unhappy paths (errors, retries, edge cases) with evidence for the PR. Use to verify any UI change at its real surface, and any new feature or behaviour change before its PR is opened.
---

# Verifying a page change

Full background: "Checking the page headlessly" in `docs/development.md`.

Load the project `agent-browser` skill (`.claude/skills/agent-browser`) before driving the browser;
it is the guide for every `agent-browser` command below.

1. Data: copy a populated `.wrangler/` from another checkout into this one (and delete it when
   done). Cron Triggers do not fire under `pnpm dev`; `POST /api/refresh` is the only path to SGC.
2. `pnpm dev --port <free port>` in the background; wait until `curl localhost:<port>/insights` answers.
3. Stub the refresh route **before the first `open`**, in the same session:

   ```sh
   # The monitor stores the refresh answer as the zone's status: `{}` blanks the page
   # (`status.data.backfill` is undefined). Answer with the zone's real status instead.
   body=$(curl -s -H 'Sec-Fetch-Site: same-origin' "localhost:<port>/api/status?zone=tolima")
   agent-browser --session v network route '**/api/refresh*' --body "$body"
   agent-browser --session v set viewport 390 700   # phone
   agent-browser --session v open http://localhost:<port>/insights
   ```

4. Drive by refs from `snapshot -i`. Measure layout with `eval` (bounding rects, scrollHeight vs
   clientHeight) and screenshot into the scratchpad directory.

## Flows

- 3D viewer on a phone: tab "En 3D" → "Explorar en 3D" → "Leyenda" / "Ajustes" opens the bottom
  sheet. The sheet should be 80% of the viewport; the active `[data-slot=tabs-content]` scrolls;
  "Cerrar" beside the tabs closes it. Also try a short viewport (360×400).

## Gotchas

- In zsh, `ab="agent-browser --session v"; $ab ...` fails (no word splitting); use a function.
- Refs change after each state change; re-run `snapshot -i` before clicking.

## Every verification also covers

### 1. Performance (Chrome DevTools MCP)

Setup is in `docs/development.md` ("Profiling: Chrome DevTools MCP and `agent-browser` on one
browser"): one Chrome on `:9222`, `agent-browser connect 9222`, the MCP tools drive the same tab.
Earlier findings and method: `docs/performance.md`.

- Trace a cold load of every page the change touches (`performance_start_trace` with reload,
  then `performance_analyze_insight`). Report **LCP** and what the LCP element is, its breakdown
  (TTFB / load delay / load time / render delay), **CLS** with the shifting node, and long tasks.
- If the change adds interaction (a sheet, a tab, a slider), trace the interaction too and
  report INP-style latency and forced reflows.
- Compare against `main` under the same throttling (CPU 4×, Slow 4G), A/B, not one number.
  A regression goes in Findings with ⚠️ even when the feature works.
- Note bundle weight a change adds (a new dependency, a new lazy chunk).

### 2. Design-system use

- Load the `shadcn` skill before judging. The UI should be composed of `src/components/ui/*`
  and their variants, not hand-rolled equivalents (custom buttons, dialogs, drawers,
  toggles, tabs, raw colour classes instead of tokens).
- For every new element in the diff, ask: is there a shadcn component or variant for this?
  If yes and it isn't used, that's a finding; name the component.
- Check overrides passed into shadcn components actually win: a variant-prefixed default
  (e.g. `data-[side=bottom]:h-auto` in `sheet.tsx`) beats a plain class that tailwind-merge
  does not dedupe. Measure the rendered size; don't trust the className.
- `src/components/ui/*` has deliberate local changes; never regenerate with the CLI without a diff.
  Approved exceptions: `docs/frontend.md` ("Design-system lint").

### 3. Usability dogfooding (new features and UI changes)

Load agent-browser's own dogfood skill (`agent-browser skills get dogfood --full`) and follow its
explore-and-document loop, its issue taxonomy and its evidence levels, with these overrides for
this project:

- Its session starts with `open`; ours starts with step 3 above (the `/api/refresh` stub, and
  `fault.js` if faults are needed), in the same session, before the first `open`.
- Its output directory goes in the scratchpad directory, not `./dogfood-output/` in the repo.
- It says never to read the app's source. Explore the page without it, but section 4 lists its
  cases from the diff.
- Scope is the surfaces the change touches and the flows next to them, not the whole site.

Use the feature as the page's reader would (interested in the science, not a seismologist), on a
phone first, then desktop. For each surface the change opens:

- Can it be **reached, used, and left**? Every sheet, dialog or panel needs a visible close,
  works with Escape, and returns focus.
- Does all content **fit or scroll**? Check a short phone viewport (360×400) and a normal one
  (390×700): nothing beyond the screen without a scroll container, nothing clipped behind the
  close button.
- Tap targets reachable with a thumb; keyboard-only path works; `snapshot -i` names make sense.
- Both themes, both languages; copy reads naturally in each.
- Walk the adjacent flows too (open → switch tab → resize past the breakpoint → close → reopen).

The 3D legend sheet bug (2026-09-26: sheet taller than the screen, no scroll, close button
off-screen) is the kind of issue this pass exists to catch before handover.

### 4. Unhappy paths, with evidence for the PR (new features and behaviour changes)

**When.** Required for a new feature and for any change to what the page, a route, ingest, the
USGS job or the CLI does. A change with no new way to fail (docs, copy, styling that adds no
state, a dependency bump with no behaviour change, a refactor existing tests pin) skips the
drive, but the PR still says so in one line: `Unhappy paths: nothing new to fail, because <why>`.
The reviewer sees a decision either way, never a silence.

**List the cases from the diff first**, before driving anything. For every input the change does
not control (a fetch, a query parameter, SGC's HTML, a USGS or Open-Meteo answer, a D1 row, a
press repeated or made mid-request, a timer, a tab left hidden), ask how it goes wrong: fails,
slow, empty, malformed, too large, repeated, out of order, offline. Keep the cases the change can
reach, and say in one line which ones were dropped and why. Write them as rows of the PR table
below, then fill in what was observed.

**On the page.** Drive each case in the same session as section 3 and document it the dogfood
way: a screenshot per step, and a recording (`record start <file>.webm --contact-sheet`) when
the case is about timing (a retry, a backoff countdown, a slow answer, offline then back).
The contact sheet is a single PNG with timestamps, which fits a PR where a video would not.
Note whether the page says something useful in both languages and whether the reader can
recover without a reload (retry, back online, next refetch). Check `errors` and `console` after
each case.

| Case | How |
|---|---|
| Request fails on the network | `network route '**/api/<route>*' --abort` |
| Server answers 5xx or 429 | `test/browser/fault.js`: `{ match: "/api/<route>", status: 503 }` |
| Slow answer: a loading state, no layout shift | `fault.js` `{ match, delay: 5000 }` + DevTools MCP `emulate` (Slow 4G, CPU 4×) |
| Body that is not the expected JSON | `fault.js` `{ match, status: 200, body: "<html>" }` |
| Fails, then works (a retry recovers) | one `fault.js` rule `{ match, status: 503, once: true }` per failed attempt; `once` covers only the first match |
| Offline, then back online | `agent-browser set offline on` / `off` (also fires TanStack Query's refetch-on-reconnect) |
| A failed last run, an unfinished back-fill | `fault.js` `{ match: "/api/status", status: 200, body: <json> }` (a `network route` misses the preloaded request), and the `/api/refresh` stub answering the **same** JSON: the back-fill loop stores the refresh answer over it |

`fault.js` is an init script, so start the session with it before the first `open`:
`agent-browser --session v --init-script test/browser/fault.js ...`; its header says how to set
rules (`localStorage.fault`, then `reload`). Keep the `/api/refresh` stub on throughout. Faked answers
never reach the network log: read `window.faultLog` for what a rule answered, which is also the
evidence for how many attempts a retry made. A failed *refetch* (data already on screen) is
reached with `set offline on`, then `off`, once the data is over a minute old; a synthetic
`visibilitychange` does not trigger one headlessly.

**At a route.** Against `pnpm dev`, `curl -sS -i -H 'Sec-Fetch-Site: same-origin'
'localhost:<port>/api/<route>?...'`: an unknown `zone`, a bad filter value, `from` after `to`, an
empty range, no same-origin header (403). The evidence is the status line and the part of the
body that matters. The rules are in `docs/api.md`. Never send `POST /api/refresh` by hand.

**In ingest, the USGS job, the CLI.** None of these is ever made to fail against the real
service. Write a Vitest test with the fetch stubbed (SGC's 410 refusal, a 503, a timeout, a
truncated page, `test/fixtures/seiscomp-empty.html`) and, for retries, fake timers that show the
count and the waits. The evidence is the test's name and its output
(`pnpm test -t '<name>'`), ideally seen failing before the fix. A CLI path that fails offline
(a bad argument, a missing file) is run, and its output pasted.

**Evidence, strongest first:** a screenshot or contact sheet of the state; a command's output; a
test that pins it; at minimum, a description of how the case was provoked and what was seen. A
case with none of these is written as "not checked", never as "handled".

**In the PR**, between the before/after block and "How it was checked", replace only this block
(read the body first, as `before-and-after` does). The rows show the shape, not real results:

```markdown
<!-- unhappy-paths:start -->
## Unhappy paths

| Case | How it was provoked | What happened | Evidence |
|---|---|---|---|
| <route> answers 503 | `fault.js` 503, 390 px, ES | <what the reader saw; recovered how> | ![<case>](./captures/unhappy-<case>.png) |
| Retry recovers | two `fault.js` 503 rules with `once`, then real | <attempts seen in `faultLog`; data shown without a reload> | ![<case> timeline](./captures/unhappy-<case>-contact.png) |
| Bad `zone` | curl | <status line, error body> | <details><summary>output</summary>…</details> |
| SGC refuses (410) | Vitest, fetch stubbed | <what the run records> | `<file> › <test name>` |

Dropped: <case>, because <why>.
<!-- unhappy-paths:end -->
```

Keep the images in `captures/` (untracked, no whitespace in names) and publish with
`gh pr edit <n> --body-file <body> --attach ./captures/<file>.png ...`, which uploads them and
rewrites the matching `./captures/...` references. Then open the rendered PR and confirm that no
local path is left. When the PR is amended, rerun what the amend touched and replace the block.

### Before/after screenshots (UI changes)

Take each "after" screenshot again on `main` (a worktree at `origin/main`, same viewport, same
steps, same theme and language) so the pair matches. Keep both in the scratchpad; the PR gets them
through the `before-and-after` skill (see `CLAUDE.md`).

Put each of these checks in the report, each with its own evidence (trace numbers, component
names, screenshots), even when the result is "held".
