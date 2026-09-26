---
name: verify
description: Run the page locally with data and drive it in agent-browser, without reaching SGC, then check performance (LCP, CLS via Chrome DevTools MCP), design-system use (shadcn) and usability by dogfooding. Use to verify any UI change at its real surface.
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
   agent-browser --session v network route '**/api/refresh*' --body '{}'
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

Use the feature as the Spanish-speaking reader would, on a phone first, then desktop. For each
surface the change opens:

- Can it be **reached, used, and left**? Every sheet, dialog or panel needs a visible close,
  works with Escape, and returns focus.
- Does all content **fit or scroll**? Check a short phone viewport (360×400) and a normal one
  (390×700): nothing beyond the screen without a scroll container, nothing clipped behind the
  close button.
- Tap targets reachable with a thumb; keyboard-only path works; `snapshot -i` names make sense.
- Both themes, both languages (ES default, EN); copy reads naturally in Spanish.
- Walk the adjacent flows too (open → switch tab → resize past the breakpoint → close → reopen).

The 3D legend sheet bug (2026-09-26: sheet taller than the screen, no scroll, close button
off-screen) is the kind of issue this pass exists to catch before handover.

### 4. Error handling (every page the change touches)

Drive each case, screenshot it, and note whether the page says something useful in Spanish and
whether the reader can recover without a reload (retry, back online, next refetch).

| Case | How |
|---|---|
| Request fails on the network | `network route '**/api/<route>*' --abort` |
| Server answers 5xx or 429 | `test/browser/fault.js`: `{ match: "/api/<route>", status: 503 }` |
| Slow answer: a loading state, no layout shift | `fault.js` `{ match, delay: 5000 }` + DevTools MCP `emulate` (Slow 4G, CPU 4×) |
| Body that is not the expected JSON | `fault.js` `{ match, status: 200, body: "<html>" }` |
| Offline, then back online | `agent-browser offline on` / `off` |
| A failed last run, an unfinished back-fill | `network route '**/api/status*' --body <json>` (`docs/development.md`) |

`fault.js` is an init script, so start the session with it before the first `open`:
`agent-browser --session v --init-script test/browser/fault.js ...`; its header says how to set
rules (`localStorage.fault`, then `reload`). Keep the `/api/refresh` stub on throughout.

### Before/after screenshots (UI changes)

Take each "after" screenshot again on `main` (a worktree at `origin/main`, same viewport, same
steps, same theme and language) so the pair matches. Keep both in the scratchpad; the PR gets them
through the `before-and-after` skill (see `CLAUDE.md`).

Put each of these checks in the report, each with its own evidence (trace numbers, component
names, screenshots), even when the result is "held".
