# Friction log

Agents working on this repo record here anything that slowed or blocked them, so the
workflow can be fixed at its source: a doc that was wrong, missing or hard to find, a tool
or command that failed, a permission refusal, a check that gave a misleading result, a step
that had to be worked out by hand, an instruction that contradicted another.

Duplication you load into your context is friction too. When a doc, skill, plan or
instruction you read repeats something you already loaded elsewhere, and the repeat adds
nothing (same facts, same rule, same steps), log it: it costs every agent context and
drifts out of date when only one copy is edited. Name both places in the issue and, as the
suggested fix, which copy should stay and what the other should link to instead.

Each friction gets a GitHub issue with the details and a one-line entry here that links to
it. The issue is where the fix is discussed and tracked; this file is the running list.

## Logging a friction

1. Look for an open issue on the same friction:
   `gh issue list --label friction --search "<keywords>"`. If one exists, add a comment
   with your occurrence (date, task, what happened) and add a dated line under its entry
   below instead of steps 2 and 3.
2. Open an issue with the `friction` label, titled with the one-line summary, and the body
   below: `gh issue create --label friction --title "<summary>" --body-file <file>`.
3. Add an entry at the bottom of "Entries" in the branch you are working on:
   `- YYYY-MM-DD: <summary> (#<issue number>)`.
4. Say in your final message to the user that you logged it, with the issue link.

Issue body:

```markdown
**Task:** what you were doing, and the branch or PR.

**Friction:** what happened, with the exact error or command output, and the commands or
steps that reproduce it.

**Cost:** what it took to get past it (time, retries, a workaround), or that it is unresolved.

**Workaround:** what you did instead, so the next agent can do the same until it is fixed.

**Suggested fix:** the doc, tool, config or instruction to change, if you can tell.
```

The repo and its issues are public: leave out account names, account-specific URLs, local
paths outside the repo and anything personal.

## Entries

- 2026-10-02: Worktree sessions refuse compound commands and heredoc scripts as too complex to verify (#169)
  - 2026-10-02: again in an Agent-tool worktree, for sourcing `.env` before a `curl` and for a Python heredoc
- 2026-10-02: Analytics Engine docs: no response size in sgc_ingest, and the example query's quantile() is rejected (#179)
- 2026-10-02: pnpm logs returned 40 of 275 successful ingest runs over three days, with no sign it was a sample (#180)
