# The science, and how not to mislead with it

- **The catalogue has a hard floor at M2.0** (67 events at M2.0, 2 below). The
  M0–M3 range the researcher first asked for does not exist in this source.
  Going below the catalogue needs waveform-level detection, not more scraping.
- **Default to the maximum-curvature Mc. The goodness-of-fit estimator is wrong
  here**: the M2.0 cut-off makes it pick Mc = 2.0, which gives b ≈ 0.67 against
  0.75 with MAXC Mc = 2.3. The page shows both and says why.
- **b over time must use one fixed Mc for all windows.** A floating Mc mostly
  measures the network's detection history.
- Treat b from fewer than 50 events as unreliable. The page flags it.
- Reference figures (2026-09-18, 786 events): MAXC Mc = 2.3 → **b = 0.750 ± 0.031**,
  n = 528. 150-event windows drift from ~1.0 in mid-August to ~0.58 in
  mid-September. Tests assert these against the fixture; live values move as SGC revises.
- The drop is larger than its error bars, so it is real *in this catalogue*. But:
  small events are missed right after a M7.4 (the early windows are the least
  reliable), magnitudes mix types (MLr_1 dominates; also MLv, Mw, M), and low b is
  common for intermediate-depth sequences. **A b-value below 1 describes the
  sequence. It is not a forecast, and the page must keep saying so.**
- **Mixed magnitude types move b by more than its error bar.** SGC gives small events
  MLr_1 and most events above M4 another type (MLv, Mw). On 2026-09-19, at Mc = 2.3:
  all types b = 0.75 ± 0.03, MLr_1 only b = 0.87 ± 0.04. Neither is right: an offset
  between the scales pulls the first down, and dropping the large events pushes the
  second up. With MLr_1 only, the September slide to ~0.58 mostly disappears (it ends
  near 0.8), so that slide leans on the larger MLv events. The b card has a tab for
  each (`dominantMagType` in `packages/seismo/src/gr.ts`); both use the all-types Mc so that only the
  magnitudes differ, and the b charts follow the tab. A proper fix is converting to
  one scale, which needs published SGC conversion relations: do not invent them.
- **There are two clusters, and depth alone separates them** (`core/clusters.ts`, cut at
  `CLUSTER_DEPTH_KM` = 70). Measured on production, 2026-09-19, 799 events: depth is bimodal
  with a near-empty gap (286 events at 40–45 km; 5, 5, 1, 6 in the four 5-km bins from 55 to
  75 km; 33–39 per bin at 80–95 km), and the groups are also apart on the map — shallow at
  4.3–4.6 N, 76.6–76.8 W under Istmina/Sipí, deep at 4.7–4.9 N, 76.2–76.5 W around the
  mainshock (itself at 103 km). Any cut from 55 to 75 km moves shallow b by 0.003 and deep b by
  0.011; a test holds that on the fixture, so if SGC's revisions ever put a population on the
  cut, it fails. 70 km is used because it is also the conventional shallow/intermediate
  boundary. No lat/lon term and no clustering algorithm: the data does not need one and the
  page could not explain it.
  - Shared Mc 2.3: shallow **b = 0.732 ± 0.031** (n = 447), deep **b = 0.816 ± 0.112** (n = 90).
    Fixture figures, which the tests pin: 0.738 ± 0.032 (n = 438) and 0.816 ± 0.112 (n = 90).
    All were recomputed independently in Python.
  - **The two b-values cannot be told apart** (Utsu 1992 test, p = 0.24; `bDifference` in
    `packages/seismo/src/gr.ts`). The page says that in words. "Two different b-values" is not the finding.
  - **The September slide in b is inside the shallow cluster and is not a mixing artefact**:
    1.08 ± 0.07 → 0.59 ± 0.04 over its own 150-event windows, stronger than in the mixture.
    The magnitude-type caveat above still applies inside the cluster: with MLr_1 only, the
    shallow windows end at 0.82. The split does not settle that, and the page must not imply it.
  - **What really differs is activity.** The deep cluster is a finished aftershock decay: 73 of
    its 90 events ≥ Mc came in the first week, none in the sixth, and its three M ≥ 4 events were
    all over by 13 August. The shallow cluster is all of the current activity and its large
    events are becoming more frequent (20 of its 25 M ≥ 4 events since 8 September). For a reader
    who is not a seismologist this is the useful part, so the "Dos grupos de eventos" card leads
    with it and the daily-count bars are stacked by cluster.
  - **Both clusters use the Mc of the whole filtered catalogue**, like the magnitude-type tabs,
    so only the population differs. `computeClusterStats` is the one place that rule lives; the
    page, `/api/stats?cluster=` and the CLI all go through it. Never call `computeStats` on a
    cluster's own events, which would give it its own Mc. The magnitude-type tab is the same rule
    and lives in `measure` in `src/lib/scope.ts` — see [the page's scope](frontend.md#the-pages-scope). A cluster whose own maximum-curvature
    Mc is higher than the shared one gets a caution badge (b would be biased low); today both
    are 2.3.
  - The deep cluster has too few events for 150-event windows, and smaller windows (±0.11–0.16)
    say nothing a reader should act on. It gets one b with its error bar, and the chart says why.
  - "Low b is common for intermediate-depth sequences" used to be on the page as context for the
    slide. It was misplaced: the low b is in the *shallow* cluster. The caveat now describes the
    two groups instead.
- It is a mainshock–aftershock **sequence**, not a swarm. The UI says "secuencia
  sísmica"; "enjambre" would read as technically wrong to a seismologist. The repo
  name predates that.

## The Chaparral swarm (second zone, from 2026-09-23)

- **It is a swarm, and the page calls it one** ("enjambre sísmico"), which is also SGC's word: the
  reverse of the Chocó rule above. Measured from SGC's catalogue on 2026-09-23 (446 events in the
  zone's box): it began **2026-09-20 08:27 UTC**; the box held 25 events in the eight and a half
  months before. 3.78–3.91 N, 75.68–75.57 W, **12–25 km deep** (crustal); daily counts 32, 116,
  152, then 147 by 20:09 UTC on the 23rd. Dozens of M3.5–4.2 events and **no dominant event** —
  the largest, M4.5 (SGC2026stzmyx), came on day four. SGC's own page gives its depth only as
  "superficial (< 30 km)"; the catalogue's 3.96 km sits outside the swarm's 12–25 km and may move.
- **b is already measurable**: MAXC **Mc = 2.7, b = 0.96 ± 0.05, n = 269**, 150-event windows
  0.91–0.99 (`pnpm cli bvalue` on that catalogue). An ordinary value; it says nothing either way
  about what the swarm will do, and the page says so.
- **The depth groups are Chocó's and do not apply here.** The swarm is one crustal population, so
  the groups card, its legend and its tooltip text are Chocó-only (`depthClusters` in
  `core/zones.ts`). It has **no clear mainshock** (0.3 between its two largest events; see the
  rule below), so no ring, no star and no "excluir sismo principal" — for as long as that holds.
- The commonest magnitude type is **MLr_2** (387 of 447), not Chocó's MLr_1; the b card's tab picks
  it from the data (`dominantMagType`). The mixed-types caveat applies here too.
- **Connection to Chocó: SGC's preliminary hypothesis, not a finding.** SGC has said the M7.4 may
  have changed the stress field in the crust and helped reactivate faults near Chaparral, ~150 km
  away, six weeks later. The page states it as SGC's hypothesis. Nothing here tests it, and no
  chart may imply it does: two zones on one timeline show timing, not cause.
- **Do not put a probability of a larger event on this tab.** SGC's public position is that many
  events do not mean a large one is coming. The copy says swarms go either way and points to
  SGC's daily bulletins for official information.
## The mainshock: detected from the catalogue, never pinned (from 2026-09-24)

- **The rule, as the page states it**: the largest event is the mainshock when an SGC analyst has
  reviewed it (`status = manual`) and it exceeds every other event in the zone by at least **1.0**
  (`MAINSHOCK_MIN_GAP` in `core/mainshock.ts`, over `assessMainshock` in `packages/seismo`). Withdrawn
  events do not count; automatic ones do, both ways. A larger automatic event is never passed over
  for a smaller reviewed one: if it would stand clear it is **awaiting review** ("automático, en
  revisión"), and if not there is no mainshock. An automatic event close in size stops a reviewed one.
  A tie, or fewer than two events, is no mainshock. No clustering algorithm and no time window: the
  zone's box from its start date is the sequence, for the reason the depth groups have none.
- **Only the two largest events decide it**, in any order (a property test holds that), which is
  what lets `excludeMainshock` on the API read `ORDER BY mag DESC LIMIT 2` instead of the catalogue.
- **Why 1.0.** It is the exact inverse of the usual swarm definition, "several events within one
  magnitude unit of the largest" (Holtkamp & Brudzinski 2011, EPSL), and real swarms sit far below
  it (0.10 ± 0.09, range 0–0.36, in Puerto Rico: Ventura-Valentín & Brudzinski 2022, SRL 93). Båth's
  mean is 1.2 (Båth 1965); Shcherbakov & Turcotte (2004, BSSA 94) found 1.16 ± 0.46 over ten
  California mainshocks, **4 of them below 1.0**. So the rule is conservative in one direction only:
  from published means and spreads, roughly **35–65% of genuine mainshock–aftershock sequences
  fall below 1.0** (50–80% below 1.2, which by construction misses half). That is a normal
  approximation; no paper states the fraction directly. **A zone without one has "no clear
  mainshock", which is not the same as being a swarm**: the status bar says "Ninguno claro", never
  "enjambre". The owner chose 1.0 over 1.2 on this basis (2026-09-24).
- **An energy-share test was considered and not added.** "The largest released more than all the
  others together" (≥ 50% of the moment) is too weak alone: in a two-event cluster any positive gap
  passes it. At 80–90% it would match a gap of about 0.6–0.85, and on the real Chaparral swarm a new
  event just clearing 1.0 (M5.5) would already hold 81% of the zone's energy — it adds a second
  sentence and changes no answer.
- **Magnitude types are compared as SGC publishes them.** A published SGC conversion to Mw exists
  (Arcila et al. 2020, *Modelo nacional de amenaza sísmica*, doi:10.32685/9789585279469; applied in
  Montejo et al. 2023, *Boletín Geológico* 50(1), only to Mw ≥ 3.5), but its coefficients were not
  checked and nothing is published for the MLr/MLv variants the catalogue uses. Do not invent one.
  Mixing ML and Mw plus 0.1 rounding may move a gap by ±0.2–0.3; that is an estimate, not a figure.
  The rule also cannot fire below a largest event of M3.0, given the catalogue's M2.0 floor.
- **Compared in whole tenths.** In floating point 4.6 − 3.6 is 0.9999999999999996, and 37 pairs
  between M2 and M9 fail `>= 1.0` that way — M4.6 over M3.6 is a size the swarm could produce.
- **Measured** (local copy, 2026-09-23): Chocó's Mw 7.4 (SGC2026pqqmro) stands **2.5** above the two
  MLv 4.9 of 14 September — found, with nothing pinned; the fixture test recomputes it, and Python
  agrees in exact decimals. Chaparral's M4.5 (type `M`, 3.96 km) stands **0.3** above three MLr 4.2.
- **The label is retrospective and is recomputed on every read, never stored.** A later, larger
  event takes it, and the old mainshock becomes a foreshock ("sismo premonitor"; USGS: "an earthquake
  cannot be identified as a foreshock until after a larger earthquake in the same area occurs").
  The rule is the last caveat under "Cómo leer estas cifras" on both tabs.
- **Chocó is detected too, not pinned** (owner decision, 2026-09-24). The price: a large, mislocated
  automatic event in the box would leave no clear mainshock — the ring, the star and "excluir" gone,
  "Ninguno claro" in the status bar — until SGC reviews or withdraws it. That is the rule working.
- **What follows the detection**: the "Sismo principal" stat in the status bar (always shown, in
  every state), the map's ring and its legend sentence, the star on "Magnitud en el tiempo", a
  marker on "Valor b en el tiempo", "Excluir sismo principal" and its chip, and the caveat that small
  events are missed right after the mainshock. All read one answer, computed over the zone's whole
  catalogue, never over the filtered view.
- **Renaming a zone is not automatic.** "Enjambre" → "secuencia" is a scientific claim and SGC's
  wording should lead it; `SHARE_META` is also baked into `tolima.html` at build time, so no runtime
  rename could reach a link preview. It is a code change made by a person. Until then, while
  something stands clear or awaits review on the Tolima tab, its caveats swap SGC's swarm line for
  "Mientras el SGC no la describa de otra forma, esta página la sigue llamando enjambre."
- **A half-filled database produces a confident, wrong number.** Production once
  showed b = 0.49 because it held only the trailing 3 days. `/api/status` now
  reports `backfill: {done, total}`, and the page warns and demotes b until history
  is complete. Keep that guard whenever ingest changes.
