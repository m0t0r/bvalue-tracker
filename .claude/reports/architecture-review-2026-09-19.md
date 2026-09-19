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
| 02 | `worker` | **Strong — verified** | Make one module decide what ingest is due now |
| 03 | `src` | Strong | Give the page one module for what it is scoped to |
| 04 | `src` | Strong | Give the page one module for when it asks the server |
| 05 | `worker` | Strong | Give the ingest run record one module |
| 06 | `src` | Strong (cheapest) | Make "events per Colombian day, by cluster" one module |
| 07 | `core` | Worth exploring | Give the statistics one selection interface |
| 08 | `core` | Worth exploring | Describe the event record once |

**01 is done** (branch `worktree-arch-01-event-gate`, 2026-09-19). **Next recommendation: 02**,
the other verified candidate. 08 now has somewhere to put the field table, and 07 can assume
its input is plausible.

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

- 01 is done. Everything below still stands.
- Checked and dropped: "constants exported with no importer" — true but trivial, they are
  used inside their own module.
- Candidates 03 and 07 overlap on the same line (`src/App.tsx:78`). Do 03 first; 07 then
  extends the same seam to the Worker and the CLI.
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

Candidate 01 is already done (core/admit.ts). I want to resume at step 3 of
/mattpocock-skills:improve-codebase-architecture — the grilling loop — on candidate 02.
Use the mattpocock-skills:codebase-design vocabulary exactly (module, interface,
implementation, depth, seam, adapter, leverage, locality).

Work in a worktree. Other sessions push to main, so fetch and rebase first.
Start by re-reading candidate 02's files, confirm the finding still holds,
then grill me on it.
```

Swap `02` for whichever candidate you want.
