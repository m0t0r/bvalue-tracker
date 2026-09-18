# sgc-swarm

Fetches the Servicio Geológico Colombiano (SGC) earthquake catalogue for the
Chocó sequence that followed the M7.4 San José del Palmar earthquake
(2026-08-10), and computes Gutenberg–Richter b-values from it.

Source: the SGC "Consulta Experta SeisComP" form. One POST returns every event
in a date range and bounding box, with id, time, location, depth, magnitude and
type, phases, RMS, GAP, hypocentral errors and review status.

## Use

```sh
pnpm install
pnpm test                      # 32 tests, offline, against a captured real response
pnpm test:live                 # one test against the real SGC server
pnpm typecheck

pnpm cli fetch --out data/events.csv                  # swarm bbox, 2026-08-10 → today
pnpm cli fetch --start 2026-09-01 --bbox=-77.4,4.1,-76.1,5.6 --out data/sep.csv
pnpm cli bvalue --input data/events.csv --windows     # Mc, b ± σ, FMD, b over time
pnpm cli bvalue --input data/events.csv --mc 2.5 --manual-only --exclude-mainshock
```

`--bbox` is `lonMin,latMin,lonMax,latMax`. Use `--bbox=...` with the equals sign,
since the value starts with a minus.

## Layout

- `src/seiscomp.ts` request building, fetch with retry, HTML parsing
- `src/gr.ts` frequency–magnitude distribution, Mc (max curvature, goodness of fit), Aki–Utsu b with Shi–Bolt error, b over sliding windows
- `src/csv.ts`, `src/types.ts`, `src/cli.ts`
- `test/fixtures/` real SGC responses captured 2026-09-18
- `docs/CLOUDFLARE_SPEC.md` spec for the hosted web page

## Reading the numbers

SGC publishes nothing below about M2.0, magnitudes mix several types, and recent
events can still be revised. Prefer the max-curvature Mc: the goodness-of-fit
estimator is fooled by the M2.0 cut-off and gives a b that is biased low. A
b-value below 1 is a description of the sequence, not a forecast.
