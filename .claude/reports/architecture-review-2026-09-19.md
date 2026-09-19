# Architecture review — 2026-09-19

Produced by `/mattpocock-skills:improve-codebase-architecture` against `bba4e9a`,
in the worktree `.claude/worktrees/arch-review` (branch `worktree-arch-review`).
**No repo files were changed.** Step 3 of that skill — the grilling loop — was not run.

Visual report: [`architecture-review-2026-09-19.html`](./architecture-review-2026-09-19.html)
(open it in a browser; it needs network for the Tailwind and Mermaid CDNs).

Vocabulary throughout is the `mattpocock-skills:codebase-design` glossary: **module,
interface, implementation, depth, seam, adapter, leverage, locality**.

## Candidates

| # | Area | Strength | Deepening |
|---|---|---|---|
| 01 | `core` | **Done — 2026-09-19** | ~~Admit events through one gate, not three~~ |
| 02 | `worker` | **Done — 2026-09-19** | ~~Make one module decide what ingest is due now~~ |
| 03 | `src` | **Done — 2026-09-19** | ~~Give the page one module for what it is scoped to~~ |
| 04 | `src` | Strong | Give the page one module for when it asks the server |
| 05 | `worker` | Strong | Give the ingest run record one module |
| 06 | `src` | Strong (cheapest) | Make "events per Colombian day, by cluster" one module |
| 07 | `core` | Worth exploring | Give the statistics one selection interface |
| 08 | `core` | Worth exploring | Describe the event record once |

**01, 02 and 03 are done** (branches `worktree-arch-01-event-gate`,
`worktree-arch-02-ingest-plan` and `worktree-arch-03-page-scope`, all 2026-09-19).
**Next recommendation: 04**, the other half of the page's coupling; 06 is still the cheapest win.
08 now has somewhere to put the field table, and 07 can assume its input is plausible — and 07 now
extends an existing seam rather than cutting one, since 03 landed `src/lib/scope.ts`.

## What 03 changed

`src/lib/scope.ts` is the module: a `Scope` is the filters, the depth group and the b card's
magnitude tab, and `pageView(events, scope, now)` derives the whole page from it as a plain
function. `useScope` adds only React. `App.tsx` went from 214 lines to 174 and is now layout.

- **The shared-Mc rule is verified in one test.** `measure` is where the magnitude tab's half of it
  lives, and `src/lib/scope.test.ts` pins it across every group × tab combination. Reinstating the
  swap the report predicted — `clusters.all.mc` → `filters.mc` at what was `App.tsx:78` — fails it,
  which was checked. The fixture is synthetic because the real catalogue's estimates all agree on
  2.3; this one peaks at M2.4 while the commonest magnitude type and the deep group peak at M2.0.
- **`Mc` cannot reach the selection at the type level.** `Filters` split into `EventFilters` plus
  `mc`, and `applyFilters` takes the narrower one, so the `mc: null` hack at the old `App.tsx:60`
  is gone and the memo key it protected is now a type. Writing the hook's layers against that split
  turned up something the report did not predict: choosing a depth group was handing the groups
  card a new `base` array. The selection is three layers now, not two, and a test holds each.
- **`resetSignal` is deleted, not documented.** `FiltersCard` is controlled. The rule the old
  protocol was protecting still holds and is now stated in README: a reader's half-typed `from > to`
  must survive, which the form does by comparing the last object it emitted by identity.
- `src/lib/use-stats.ts` is absorbed — `useStats` had one caller — and what is left is
  `src/lib/stats.ts`. `BScope`/`BScopeChoice` and `ClusterSelection` moved out of the components
  into the module whose interface they belong to.
- Out of the report's scope, asked for during the work: the `page` vitest project now runs on
  **happy-dom** with `@testing-library/react`, for the one seam that needs a renderer — that moving
  Mc hands the map, the table and the charts the same array. 213 tests pass, from 199.
- Checked in a browser against the captured catalogue, not reasoned from source: b = 0.75 ± 0.03 at
  Mc 2.3 with n = 528, the MLr_1 tab at 0.87 on the **same** Mc, Mc 2.7 reaching the card, the chart
  subtitle and the scope chip together, "Quitar filtros" clearing both the form and the group,
  "Restablecer" clearing only the form, an invalid date range surviving, and the MapLibre canvas and
  the table's first row surviving four steps of the Mc slider as the same DOM nodes.

## What 02 changed

`worker/plan.ts` is the module: `dueNow(caller, now, history) → IngestPlan`, pure, plus
`sgcUnwell` — the one availability rule — and every policy constant that used to be spread
across `index.ts` and `ingest.ts`. `readHistory` and `runPlan` (in `ingest.ts`) are the
adapter and the executor; `scheduled()` and `POST /api/refresh` each read once, plan once and
run the plan. `scheduled` went from 18 lines of lane arithmetic to 3.

- **The divergence is closed and covered twice.** `worker/test/plan.test.ts` pins it at the
  seam with no database; one case in `worker/test/ingest.test.ts` pins it at the route. Both
  fail against the old `last === null || last.ok`, which was checked by reinstating it.
- **`IN_FLIGHT_MS` has one definition.** `runInFlight`'s `withinMs = 150_000` now reads it.
- **Lane policy is verified without D1**: 17 of the 199 tests are pure, and `fastLaneBlocked`'s
  D1-backed cooldown cases became `sgcUnwell` cases. What is left in `ingest.test.ts` is the
  wiring — that the rows `readHistory` reads really do drive the lanes.
- Out of the report's scope, asked for during the work: SGC is now stubbed with **MSW** in both
  test projects, replacing `vi.stubGlobal("fetch", …)` and the `fetchImpl` option on
  `FetchOptions`, which existed only for tests and is deleted.

## What 01 changed

`core/admit.ts` is the gate: `admitEvent(raw) → SeismicEvent`, throwing `EventRejected`.
`requireRange` and `requireNum` left `seiscomp.ts`, which shrinks to reading HTML shape;
`fromCsv`'s `rec as unknown as SeismicEvent` is gone. Both doors hand raw cells to the gate.
Beyond the reproduced failure it also closes the id shape (`sgcEventUrl` cannot become a
`javascript:` link whichever door the id came by), the timestamp (`new Date` rolls
30 February over into March rather than refusing it), and missing or foreign CSV columns.
53 tests were added; 188 pass.

Two scope decisions, so they are not re-litigated — both are also recorded in README:

- **A CSV rejects the whole file; the HTML page still skips the row.** Asymmetric on purpose.
  `ingestTrailing` recomputes the same window every tick, so a stuck row freezes live figures
  for up to 3 days; a CSV is read once by someone who can edit it, and skipping rows would
  have the CLI print a confident b-value from a catalogue it had quietly edited.
- **The third door, `toStored`, is deliberately left outside the gate.** `parseCatalogHtml`
  is the only writer of `events` — no seed script, no `INSERT` in any migration, no admin
  route — while `toStored` sits on the full-table scan shared by `/api/events`,
  `/api/events.csv`, `/api/stats` and `/api/b-windows.csv`. Re-validating ~800 rows per
  request would spend the 10 ms CPU budget on a door nothing untrusted reaches. The diagram
  below therefore over-draws: the gate has two doors, not three.

## The two verified findings

**01 — the CSV door is unguarded.** *(Fixed; kept for the record.)*
`requireRange` (`core/seiscomp.ts:59-73`) is applied
only inside `parseCatalogHtml` (`:188-191`). `fromCsv` (`core/csv.ts:69-82`) ends in
`rec as unknown as SeismicEvent` with no validation, and `toStored` (`worker/db.ts:27-35`)
trusts the row. Reproduced in the worktree, feeding `fromCsv` output to `computeStats`:

```
mag cell "abc"  -> mag: NaN  -> computeStats ok: count=2, b=undefined
mag cell "1e7"  -> mag: 1e7  -> computeStats THREW: RangeError - Invalid array length
```

The `RangeError` is `new Array(hi - lo + 1)` at `core/gr.ts:25` — exactly the failure
README's security-audit section records `requireRange` as having fixed. It is reachable
through the door `pnpm cli bvalue --input …` uses.

**02 — one availability rule, stated twice.** `/api/refresh` gates its back-fill fast lane
on `last === null || last.ok` (`worker/index.ts:213`). `fastLaneBlocked`
(`worker/ingest.ts:179-186`) applies that rule *and* a 429/503 cooldown. So after SGC
rate-limits us and a later run succeeds, the cron fast lane stands down while the refresh
button still reaches SGC. Narrow — it needs `backfill.done < backfill.total` — but it is
the rule README is most careful about, and no test covers the combination.
`runInFlight`'s `withinMs = 150_000` (`worker/db.ts:149`) is a second copy of
`IN_FLIGHT_MS` (`worker/ingest.ts:36`).

## Notes for whoever continues

- 01, 02 and 03 are done. Everything below still stands.
- Checked and dropped: "constants exported with no importer" — true but trivial, they are
  used inside their own module.
- Candidates 03 and 07 overlapped on the same line (`src/App.tsx:78`). 03 is done, so 07 now
  extends `src/lib/scope.ts`'s seam to the Worker and the CLI rather than cutting a new one.
- 08 buys locality, not leverage — no caller's interface shrinks. `core/admit.ts` is where
  its field table goes.
- Nothing here re-opens a decision README settles: the single cron pattern, the one
  `computeStats` pipeline, the atomic claim, the `ingest_runs` indexes, deferred loading,
  the shy scope bar, or `src/components/ui/*`.
- The skill's own `HTML-REPORT.md` scaffold specifies `cdn.tailwindcss.com`, which **no
  longer resolves** (`curl` returns `000`). This report uses
  `https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4` instead.

## Prompt to resume in a new session

```
Continuing an architecture review of sgc-swarm from an earlier session.
Read README.md in full first, then .claude/reports/architecture-review-2026-09-19.md
for the candidates and what was already verified.

Candidates 01, 02 and 03 are already done. I want to resume at step 3 of
/mattpocock-skills:improve-codebase-architecture — the grilling loop — on candidate 04.
Use the mattpocock-skills:codebase-design vocabulary exactly (module, interface,
implementation, depth, seam, adapter, leverage, locality).

Work in a worktree. Other sessions push to main, so fetch and rebase first.
Start by re-reading candidate 04's files, confirm the finding still holds,
then grill me on it.
```

Swap `04` for whichever candidate you want.
