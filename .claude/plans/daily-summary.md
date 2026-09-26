# Plan: daily plain-Spanish summary

Status: proposal, not started. Written 2026-09-22.

## Goal

One short paragraph a day on the page, in plain Spanish, saying what the sequence did
yesterday: for example *"Ayer se registraron 14 sismos (12 en el grupo superficial, 2 en
el profundo). El mayor fue de magnitud 4,3 a las 03:12."* An optional language-model step
rewrites the facts more naturally. The page must never depend on the model.

## Why not TensorFlow.js or other ML

The data is ~800 structured rows, b is a closed-form estimator, and the page must be able
to explain everything it shows (`docs/science.md` turned down a clustering algorithm for
exactly that reason). ML earthquake forecasting is not credible and would break the page's
"not a forecast" rule. Waveform-level deep-learning detection (PhaseNet, EQTransformer) is
the one real ML use in seismology, but it is offline research work, capped by station
geometry, and does not change the b the page reports. A language model rewriting
facts that code has already computed is the only AI use that fits the page.

## Design

```
cron, 06:00 Bogotá tick (after ingest)
  │
  ├─ 1. buildDigest()      facts from D1: plain code, no AI, tested on the fixture
  ├─ 2. renderTemplate()   a fixed Spanish sentence from those facts (always works)
  ├─ 3. ask the model      "rewrite these facts in plain Spanish"
  ├─ 4. checkSummary()     every number must come from the digest, no forecast words
  │        pass → store the AI text      fail/error → store the template
  └─ 5. D1 `summaries` row ──▶ GET /api/summary ──▶ a card on the page
```

### 1. Digest: `core/summary.ts`

The code computes every fact. The model never computes anything.

```ts
export type Digest = {
  day: string;                                  // "2026-09-21", Bogotá date
  counts: { total: number; shallow: number; deep: number };
  largest?: { mag: number; magType: string; timeLocal: string; cluster: "shallow" | "deep" };
  countM4: number;
  vsLast7DayAvg: "más" | "menos" | "similar";   // decided by code, not by the model
  backfillDone: boolean;                        // false → no summary at all
};
```

- Clusters come from `core/clusters.ts` (`CLUSTER_DEPTH_KM`). Do not redefine the cut.
- **No b-value in the summary.** It is the figure most easily read as a warning. It stays
  on the b card with its caveats. The summary covers activity only, which `docs/science.md`
  calls the useful part for a non-seismologist.
- If `backfillDone` is false, produce nothing: a half-filled database gives confident,
  wrong numbers (see `docs/science.md`).
- Events SGC withdrew are excluded, as everywhere else.

### 2. Template: `src/lib/i18n.tsx`

`renderTemplate(digest, lang)` gives a fixed sentence in Spanish and English. It is the
fallback, and it is also the English version, so there is no second model call.

### 3. Model call: `worker/summary.ts`

Prompt (short, Spanish):

> Reescribe estos datos en 2–3 frases en español sencillo para una persona no experta.
> Usa solo los números que aparecen en los datos. No hagas pronósticos, no digas si algo
> es peligroso o probable, no des consejos. Datos: `{digest JSON}`

Use a timeout and do not retry. On any error, fall back to the template.

### 4. Guard: `checkSummary(text, digest)`

- Pull out every number in the output, handling the Spanish decimal comma ("4,3"). Each
  one must match a number in the digest.
- Reject a list of words: *pronóstico, predic-, probable, riesgo, peligro, alerta, se
  espera, podría…*
- Enforce a length cap and check the text is Spanish.
- On failure, store the template and log which check failed (`worker/log.ts`) so the
  model's failure rate is visible.

Unit-test the guard with made-up bad outputs: a wrong number, a forecast word, an English
reply, an empty string.

### 5. Storage and display

- Migration: `summaries(day TEXT PRIMARY KEY, text TEXT, source TEXT CHECK (source IN
  ('ai','template')), model TEXT, created_at TEXT)`.
- `GET /api/summary` returns the latest row. It follows the existing same-origin rule and
  rate limit (`docs/api.md`, `docs/security.md`).
- The page shows it in a card with the label *"Resumen redactado automáticamente a partir
  de los datos de SGC"*. Follow `docs/frontend.md` for the card.

### Scheduling

- It runs on one tick a day (06:00 Bogotá = 11:00 UTC), chosen from the tick in
  `worker/plan.ts` like the other lanes. **Do not add a second cron pattern** (see the
  comment in `wrangler.jsonc`).
- The row is written with `INSERT … ON CONFLICT(day) DO NOTHING`, so a repeated or
  overlapping tick cannot call the model twice.
- **Never call the model from a visitor request.** That is the rule that keeps the cost
  bounded.

## Cost

Estimate per summary: ~1,500 input tokens, ~300 output tokens.

| Option | Per summary | Per month (1/day) | Notes |
|---|---|---|---|
| Workers AI, Llama 3.3 70B ($0.293 / $2.253 per M) | ≈ $0.001 (~100 neurons) | **$0**, inside the free 10,000 neurons/day | Same Cloudflare account, no new key. Over the allowance on the free plan, calls fail rather than bill. |
| Claude Haiku 4.5 ($1 / $5 per M) | ≈ $0.003 | ≈ $0.09 | Better Spanish and follows rules more reliably. Needs an Anthropic API key (Worker secret) and billing. |
| Claude Sonnet 5 ($2 / $10 per M) | ≈ $0.006 | ≈ $0.18 | More than this task needs. |

Prices were checked on 2026-09-22 (Cloudflare Workers AI pricing page; Anthropic price
table). Recheck them before building.

Other costs:
- The Workers AI binding calls Cloudflare's servers even under `pnpm dev`, so local runs use
  real neurons. Tests must stub the model: no live calls, as with SGC.
- CPU: waiting for the model's reply does not count as CPU time. The digest and the guard
  are small. Running once a day keeps this away from the `exceededCpu` budget
  (`docs/ingest.md`).

**Recommendation:** Workers AI first: it costs $0 and has a hard cap. Switch to Haiku only
if the Spanish reads badly.

## Order of work

1. `buildDigest` + tests against `test/fixtures/`.
2. `renderTemplate` (es/en), the `summaries` migration, the daily tick, `/api/summary`, the
   page card. **Ship this as the template-only summary.** It already gives most of the value.
3. Add the Workers AI binding (`"ai": { "binding": "AI" }` in `wrangler.jsonc`), the model
   call and `checkSummary`, with the template as fallback.
4. Update `docs/` (api, frontend, ingest, science) to describe the summary and its rules.

Checks before finishing each step: `pnpm typecheck`, `pnpm test`, and a look at the page
with `agent-browser`.

## Open questions for the owner

- Confirm the Cloudflare account (`pnpm exec wrangler whoami`) before the first deploy that
  adds the AI binding.
- Should the researcher review the prompt and the forbidden-word list before it goes public?
- Show the summary for "yesterday" only, or also keep a short history of past days?
