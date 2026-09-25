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

## The insights page (`/insights`, from 2026-09-24)

A second page explains the two zones to a reader in Pereira who is not a seismologist and feels
the larger events: where they come from, why it has not stopped, why Chaparral is different, and
what nobody knows. Two tabs tell it two ways ("La historia", a scrolling story, and "Preguntas",
the reader's own questions). Everything above still applies to it; this section is what is new.

- **No sentence about the data is fixed.** Every trend the page states is a rule in
  `src/insights/claims.ts` that picks one of a few pre-written sentences (`src/insights/copy.ts`)
  and fills in its figures, over the live catalogue, on every load. A rule that cannot decide
  returns a neutral case, and the page says less rather than something false. When a situation
  arises that no sentence covers (a clear mainshock in Chaparral, say), a person adds one. No
  language model writes or rewrites any of it (owner decision, 2026-09-24).
- **The rules, and why their thresholds are what they are:**
  - *Pace* (`pace`): a source's last 120 h at or above the zone's Mc against its median day since
    its first event. Quieter below half, busier above 1.5×. A sliding 120 h, not the last five
    calendar days, so the day in progress does not drag it down; the median, so one busy day does
    not set "usual". Two weeks of history before it has a usual pace at all. Earlier lulls are runs
    of days whose trailing five-day mean is under half the usual rate, and "recovered" means the
    mean came back to the usual rate before the next one — which is what lets the page say "it did
    this before and picked up again" only when it did.
  - *Decay* (`decay`): the last week at under a tenth of the first week's rate reads as an ordinary
    aftershock decay. Three weeks of history first.
  - *Where the strong events came from* (`recentStrong`): all from one source, three in four from
    one ("mostly"), or a mix. The threshold is the reader's, M4.0 by default: they say that is
    where they start to feel them, and the page never claims an event was felt.
  - *Drift* (`drift`): the median epicentre of the swarm's first day against the last 24 h. A
    movement is stated only when it exceeds both 1.5 km and the events' median horizontal location
    error, and always as a hint. Ten events at each end or nothing.
- **Measured on production, 2026-09-24 14:44 UTC** (the fixture `test/fixtures/api-events-2026-09-24.json`,
  every figure recomputed in Python): the shallow group ran **4.8 events a day** in the last 120 h
  against a median day of **10** (Mc 2.3) — quieter, but only just past the half-rate line, so the
  page states both figures. It did the same from **30 August to 9 September** and came back
  (14 September's five-day mean was 12). No M ≥ 4 in Chocó since **19 September 23:20 UTC**; all
  17 since the swarm began came from Chaparral, 17 of the week's 25. The deep group went from 10.9
  events a day in its first week to 0.3 in the last. The M7.4 holds over 99.9% of Chocó's moment;
  Chaparral's largest, M4.5, about 12–13% of the swarm's.
- **The two coincide in time, and the page must not connect them.** Chocó's shallow group quietened
  on the day the Chaparral swarm began. Nothing here tests a link, and two lines on one chart would
  read as one. The page names SGC's hypothesis about the M7.4 and Chaparral as SGC's, and says
  outright that timing is not cause.
- **Simplifications, each labelled where it appears:** energy ratios from log E = 1.5 M + const
  (31.6× a unit, 1000× two); recorded amplitude 10× a unit (Richter's definition; a rule of thumb
  for the other types); P ≈ 6.5 km/s and S ≈ 3.7 km/s for "the waves took about N seconds"; a 1/t
  curve anchored to the deep group's first day as "the typical aftershock shape (Omori's law)",
  never fitted; a relative ground-motion figure of 10^M ÷ distance only as an illustration of "why
  distance matters", **never as a prediction of shaking**. Converting magnitude and distance into
  felt intensity needs a published equation for intermediate-depth events, and `docs/ideas.md`
  still stands: do not write one from memory.
- **The plate is drawn only from Slab2, labelled as a model, with its uncertainty** (from
  2026-09-24; it replaced "no drawn plate": a schematic band was tried in the prototype, and its
  geometry was invented). The source is USGS's Slab2 (Hayes 2018, doi:10.5066/F7PV6JNV, public
  domain), South America model 02.23.18. The drawing shows three things: the plate's top, its
  body (top + Slab2's thickness), and a lighter band for Slab2's stated depth uncertainty about the
  top. The ground on top is GEBCO 2020 (doi:10.5285/a29c5465-b138-234d-e053-6c86abc040b9). Both are
  committed data (`src/insights/section.json`, from `scripts/insights-section.ts`), and nothing about
  the plate is drawn by hand. Slab2's metadata does not say what its uncertainty is (1σ or
  otherwise), so the page calls it only "the margin of error the model itself states".
  - **Chocó's cut is at 4.65° N**, between the groups' median latitudes (4.48 and 4.81). Events from
    4.3–4.99° N are projected onto it, so each group is drawn up to ~6 km off its own plate depth,
    well inside the ~22 km band. The page says so under the drawing.
- **Above, inside or too close to call: a rule at each source's own place, never read off the
  drawing** (`plateSide` in `src/insights/plate.ts`, applied in `story/model.ts`). The inputs are
  the group's median epicentre and depth (or the mainshock's own), and Slab2 is interpolated there
  from a 0.1° grid. The **margin is Slab2's uncertainty plus the source's median depth error**,
  added, not combined in quadrature, so the rule leans towards "close". "Above" needs the depth
  more than one margin shallower than the plate's top; "inside" needs it more than one margin
  below the top and above the bottom; anything within a margin of either edge is "close". Slab2
  gives no separate uncertainty for the thickness, so the bottom takes the top's margin.
  - Measured on the 2026-09-24 fixture, recomputed in Python from Slab2's raw XYZ files:
    **shallow group above** (42.2 km against a plate top of 72.5 km; margin 22.1 + 5.8 = 27.9 km, so
    it clears the margin by only 2.4 km: if its median sinks ~3 km the page falls back to "close");
    **deep group close** (88.7 km, top 82.1 km, margin 28.3 km); **M7.4 close** (103.4 km at
    4.99° N, 76.29° W, top 82.6 km, margin 25.7 km); **Chaparral above** by 141 km (18.9 km, top
    160.2 km).
- **Chaparral has its own cut, at 3.86° N, and Pereira is not on it** (owner decision, 2026-09-24).
  Projecting the swarm onto Chocó's cut would have drawn it almost under Pereira, which is ~100 km
  to its north: false, and alarming. The cut says instead that Pereira lies "~{km} to the north, off
  the cut" (the swarm's median epicentre to Pereira, 106.5 km on the 2026-09-24 fixture). Its only
  surface place is Buenaventura, from DANE's DIVIPOLA centroid, ~2 km off the cut's latitude; a
  town is drawn on a cut only within 0.05° (~5.5 km) of it (`onCut` in `src/insights/region.ts`).
  - **Both cuts are drawn at one scale** (`frameSections` in `story/section.tsx`), set by the
    longer of the two (Chaparral's, ~330 km from the trench against Chocó's ~290 km), so the distance
    from each source down to the plate compares by eye. Under the swarm the plate's bottom (~222 km)
    runs past the 200 km frame and is clipped, which the frame's edge shows.
  - **"Much further from the plate than Chocó's groups" is a rule** (`facts.tolimaFarFromPlate` in
    `story/model.ts`): the swarm is crustal, above the plate by the plate rule, and at least twice
    (`FAR_FROM_PLATE`) as far above the plate's top as any Chocó source, a source inside or below
    the plate counting as zero. On the fixture: 141.3 km against the shallow group's 30.3. The
    sentence then says the swarm's earthquakes happen "on faults in the crust, far above the sinking
    plate". It does not call it "another kind of activity" than Chocó's: by the same rule Chocó's
    shallow group is above the plate too, and contrasting the swarm with "Chocó's groups" as if they
    were in it contradicted the plate step (code review, 2026-09-24). It says nothing about a link
    between the zones.
  - **The step is shown only with Chocó's plate step** (`model.tolimaCut`), since its sentence uses
    the margin and the band that step explains. Its note says, as Chocó's does, that the swarm is
    compared with the plate at its own place, not with the drawing: the cut stays at 3.86° N while
    the swarm's median can drift.
- **The plate's motion: "about 5 cm a year, eastward", from GPS, cited on the page** (verified
  2026-09-24). GPS station MALO on Malpelo Island (4.0° N, 81.6° W, on the Nazca plate itself) moves
  53.1 ± 0.6 mm/yr east and 4.2 north relative to stable South America (53.3 mm/yr at ~085°), and
  46 mm/yr due east relative to the North Andean Block (Mora-Páez et al. 2019, *J. South Am. Earth
  Sci.* 89, 76–91, Tables 2–3, doi:10.1016/j.jsames.2018.11.002; `CONVERGENCE_SOURCE` in
  `src/insights/plate.ts`). Trenkamp et al. 2002 had 53.6 ± 2.1 (known only through Mora-Páez).
  Other published rates at 4.5° N, 78° W (EarthScope plate-motion calculator, Nazca relative to South
  America): GSRM 2.1 and ITRF2014 52–53 mm/yr; MORVEL 59 at 076°; NUVEL-1A 64. The geological models
  are faster, which DeMets et al. 2010 put down to Nazca slowing. The page uses the measured one.
  - It is **horizontal convergence**, so the copy says the plate "se mete por debajo, unos 5 cm al
    año", not that it sinks 5 cm a year. The arrow on both cuts runs along the plate's body under the
    plate label's line "se mete bajo Sudamérica, ~5 cm al año". That is fair along the slab too: the
    plate does not stretch as it goes down, so what enters at the trench at the convergence rate moves
    along the slab at about that rate. What the page must not say is that it drops 5 cm a year
    straight down. The note citing the source is shown whenever the drawing is, with or without a
    mainshock. The figure lives in one place (`CONVERGENCE_CM_PER_YEAR` in `src/insights/plate.ts`)
    and every string takes it as `{rate}`.
  - The rate is Malpelo's, ~500 km west of the trench. It is the plate's speed, not a measured slip
    rate on the Colombian trench, and the page does not call it one.
- **Checked and deliberately not on the page** (2026-09-24), so nobody researches them again:
  - *The Caldas tear* (Vargas & Mann 2013, BSSA 103(3), doi:10.1785/0120120328): an offset in the
    intermediate-depth seismicity north of the M7.4, placed at 5° N (Chiarabba et al. 2016) or 5.5° N
    (Wagner et al. 2017; Mora-Páez et al. 2019). Its nature is disputed (a tear in Nazca, the edge of
    the Panama indenter, or the edge of a Caribbean flat slab) and GPS shows no surface contrast
    across it. Too unsettled for a lay sentence.
  - *The Panamá–Chocó collision*: GPS puts its deformation north of 7.5° N, far from both zones.
  - *USGS's location for us6000tjl2* is 4.8836° N, 76.2182° W, 108.2 km, against SGC's 4.99° N,
    76.29° W, 103.4 km. The page uses SGC's, as it does everywhere, and quotes USGS only for its words.
- **USGS also says the M7.4 was "near the northernmost extent where intermediate depth earthquakes in
  the South America subduction zone are observed"**. The story relays it, attributed, under the same
  condition as the quote below. The Spanish keeps its terms ("sismos de profundidad intermedia", with
  USGS's own 70–300 km) rather than "at that depth", which would narrow what USGS said.
- **Where the plate cannot decide, USGS's own assessment is quoted, attributed and linked, and
  only for the event it is about.** USGS's tectonic summary for us6000tjl2 says the M7.4 "likely
  occurred within the subducting Nazca plate" "due to its depth", and that intermediate-depth
  earthquakes are "usually attributed to bending forces within the subducted slab". It also calls the
  rupture "primarily strike-slip". The story relays the first two as USGS's view (owner decision,
  2026-09-24), and only while the detected mainshock is SGC2026pqqmro (`USGS_ASSESSED` in
  `story/model.ts`), because the quote is about that event and no other. The rule's own answer
  stays on the page beside it: Slab2 alone cannot place the M7.4 inside the plate.
- **The 3D block's ground and rupture plane** (`src/insights/block.json`, from
  `scripts/insights-block.ts`, 2026-09-24; drawn by the "En 3D" tab from 2026-09-25). The ground is GEBCO 2020 every
  0.05° over the Slab2 box, the same source and rounding as the cuts: where Chocó's cut (4.65° N)
  meets it, every shared point is equal, and a test holds that. The 0.05° spacing (~5.5 km) steps
  over peaks: the grid's highest node is 4,610 m, 3 km west of the Nevado del Ruiz's 5,321 m summit. The plane is USGS's
  finite-fault model for us6000tjl2 (product `us6000tjl2_1`, version 1, `reviewed`, pinned by its
  URL): strike 225.6°, dip 71.8°, rake 33°, 150 × 66 km in 25 × 11 patches of 6 × 6 km, from
  82.3 km to 144.9 km deep, 4.05–5.12° N. Recomputed in Python from the raw file. Before any of it
  is drawn:
  - **Three locations for one earthquake.** The model is built around its own hypocentre, 4.987° N,
    76.082° W, **125 km**; USGS's catalogue has 4.8836° N, 76.2182° W, 108.2 km; SGC has 4.99° N,
    76.29° W, 103.4 km. SGC's is 23 km across and 22 km above the model's. Drawn as USGS places it,
    the plane does not pass through the page's mainshock dot; moving it to SGC's would draw a plane
    USGS never published. Label it "modelo del USGS" and say the locations differ; do not shift it.
  - **The largest slip is far from the hypocentre**: 3.98 m in the patch 94–99 km deep at about
    4.47° N, 76.49° W, ~70 km south-west of the hypocentre along the strike. A finite-fault model's
    slip is poorly resolved in detail; show where it slipped most as the model's, not as a measured
    fact, or show the plane plain.
  - **Show it only while the detected mainshock is SGC2026pqqmro**, as with `USGS_ASSESSED`: the plane
    is about that event and no other.
  - **The plane is not fitted to the plate.** Its top edge is flat at 82 km, while Slab2's plate top
    along that edge runs from ~97 km at the NE end to ~74 km at the SW end: the plane starts ~15 km
    above the plate's top at one end and ~8 km inside it at the other, both within Slab2's ~24 km
    uncertainty. The model's top is set by its hypocentre and width. Do not draw or describe the
    rupture as starting at the plate's surface.
- **The 3D tab's rules** (from 2026-09-25):
  - **One exaggeration for everything vertical**, ground and depth alike, always written on the block
    ("A escala real" at ×1). It opens at ×2; at ×1 the relief of 4–5 km barely shows against 240 km.
  - **The rupture is named in plain words**: "donde se rompió la roca", "la zona naranja", never
    "ruptura" alone (the owner, not a seismologist, could not tell what the orange slice was). Its
    key states its length, depth range and largest slip from `block.json`, and the offset between
    USGS's hypocentre and SGC's from the data (`blockModel`: 23 km east and 22 km deeper on the
    fixture). The stronger the orange, the larger the slip; the key says it is USGS's model.
  - **Events are drawn through the plate**, so where a group sits against the plate is read from its
    position in the side views, not from being hidden; the page's own plate rule still decides
    "above/inside/close" in words, on the story's cuts.
  - **The key names the snapped depths** (`commonDepths`, at least 20 events at one exact depth; 60 at
    42.9 km, 54 at 39.9 and 32 at 45.9 on the fixture), because in 3D they look like layers.
- **"¿Qué tan grande?": the M7.4 against past Colombian earthquakes** (story step 2, from 2026-09-25;
  it replaced "Un solo sismo liberó casi toda la energía", the M7.4 against its own aftershocks, at the
  owner's request: readers measure it against the earthquakes they remember, Armenia 1999 and 1995).
  Committed data, `src/insights/history.json`, from `scripts/insights-history.ts`; the rules are in
  `src/insights/history.ts`. Checked on 2026-09-25:
  - **The magnitudes are ISC-GEM's** (doi:10.31905/D808B825, CC BY-SA 3.0, so `history.json` is too),
    read through ComCat's `catalog=iscgem`. ComCat's preferred magnitudes mix types: its 1979 Eje
    Cafetero event is an mb 6.4, while ISC-GEM recomputes it as **Mw 7.2**. Only ISC-GEM puts 1906 and
    1999 on one scale. ISC-GEM through ComCat ends on 2021-12-31.
  - **Compared in whole tenths, like the mainshock rule.** The script rounds ISC-GEM's hundredths half
    up on the written decimal (6.35 → 6.4, 8.45 → 8.5; `toFixed(1)` gives 6.3 and 8.4) and keeps the
    published value beside it. Every ratio the page states comes from the tenth the reader sees: the
    first version showed "M6.3" beside a ratio computed from 6.35.
  - **The picked events are a person's choice, and the page says so** ("una selección de los
    conocidos"): 1906 Ecuador–Colombia coast Mw 8.45, 1979 Tumaco 8.09, 1979 Eje Cafetero 7.2, 1994 Páez
    6.78, 1995 Neira 6.53, 1995 Calima 6.35, 1999 Armenia 6.14, 1983 Popayán 5.64. Against the M7.4, in
    shown tenths: Armenia 89×, Calima 32×, Neira 22×, Páez 8×, Eje Cafetero 2×, Popayán 500× less
    energy; Tumaco 11× and 1906 45× more.
  - **"The largest in the region" is a separate claim, against the whole record, never the list**:
    everything of M ≥ 6.5 within 250 km of Pereira in ISC-GEM, then ComCat's own catalogue after 2021,
    the M7.4 (us6000tjl2) left out. The maximum is the **1979 Eje Cafetero event, Mw 7.2**; next are
    2004 (7.19) and 1991 (7.18), both offshore Chocó. The M7.4 is 0.2 above it, so the title says
    "el más grande de la región en {years} años de registros" only while the detected mainshock is
    SGC2026pqqmro and stands at least a tenth clear (`largestInRegion`). The owner's estimate was that
    the M7.4 was much bigger than anything before: true against the remembered events, and **not**
    against 1979, which was also intermediate-depth (110 km) and ~30 km from it. The step says both.
  - **Colombia has had far larger earthquakes, and the step shows them** (its second part, the two
    larger events drawn at one scale with the rest). Leaving them out would have let "the largest"
    read as the largest in Colombia.
  - **History is context, not a forecast**: the note says so, and the second part says their having
    happened says nothing about when another will. No recurrence interval, no "due".
  - The 1979 location (ISC-GEM 4.73° N, 76.16° W) is ~32 km from SGC's M7.4 and ~18 km from USGS's;
    the older locations carry errors of that order, which the note states. "Near the same place and
    depth" is within 50 km and 30 km (`HISTORY_NEAR_KM`, `HISTORY_NEAR_DEPTH_KM`).
  - **What code review changed (2026-09-25)**, each held by a test:
    - "The largest in the region" also needs the mainshock rule to have **found** it (reviewed), as
      the old "Un solo sismo…" title did: an unreviewed magnitude may move.
    - The years count to the **mainshock's** year (122), not to the reader's clock. Otherwise the
      title would grow a year every January with no new data behind it.
    - The mainshock's magnitude is taken to the tenth too, so both sides of every ratio are what the
      reader sees.
    - Ratios below 3 keep one decimal (`fmtTimes`): a one-tenth gap is 1.4×, which "unas 1 veces" hid.
    - The record's span in the note comes from `history.json`, not from the copy.
    - Years go through `fmtYear` (America/Bogota), because Colombia ran on UTC−4 in 1992–93.
    - The second part's lead sentence names no place, because a revised mainshock can move an inland
      event (1979 Eje Cafetero, at M7.1) into the "larger" list. Each item names its own place.
- **Distances are straight-line from Pereira to the focus** (`hypocentralKm`), the one that matters
  for the waves: all three sources sit 105–130 km away, although the M7.4 was 69 km away on the
  map, because it was 103 km deep.
- **USGS's products for the M7.4, as the daily job reads them** (re-fetched 2026-09-24 for
  us6000tjl2; `worker/usgs.ts`, [the daily USGS job](ingest.md#the-daily-usgs-job)). DYFI and PAGER
  are on the questions tab (below), and so is the forecast (the last rule in this section). The facts:
  - *DYFI*: the 10 km cell that contains Pereira's point has **CDI 8 from 41 responses**, of 1,249
    in total. DYFI labels that cell **"Dos Quebradas"**, not Pereira; the two cells it labels
    "Pereira" lie just west of the city (CDI 7.7 from 10, 7.3 from 2). The page's point decides the
    cell, not DYFI's label, and copy must not name the cell by DYFI's label as if it were the city.
  - *PAGER*: its own Pereira, 0.2 km from the page's point, has a modelled **MMI 8.43**. The
    product's `review-status` is `automatic`. That is modelled shaking, not a report.
  - *The forecast* (OAF, `review-status` `reviewed`): issued 2026-09-21 18:03 UTC, next update due
    **2026-09-28 16:00 UTC** (`nextForecastTime`). Its `expireTime` is **a year** after issue, so it
    is no guide to staleness; the staleness rule reads `nextForecastTime`. Figures as the plan
    quoted them: P(M ≥ 5) 2.65% in a day, 14.78% in a week, 43.47% in a month, 89.37% in a year;
    P(M ≥ 6) 6.09% in a month, 26.23% in a year. The model's own b = 1.0 on Mc 4.45, in a 125.4 km
    circle around 4.57° N, 76.69° W.
- **"¿Qué tan fuerte se sintió?": USGS's intensities for Pereira, relayed, never computed** (question 2
  on the questions tab, from 2026-09-25; `feltInPereira` in `src/insights/claims.ts`). It answers
  for one real event what "Why do I feel it?" only explains, so it predicts nothing and the rule
  above against turning magnitude and distance into intensity stands. The rules:
  - **Only for the mainshock the page detects.** Each digest shows only while its `sgcEventId` is
    the zone's `found` mainshock (`mainshockId`); awaiting review or none, the question is not asked.
    A later, larger mainshock never shows the M7.4's figures in the day before the job drops them.
  - **Two figures, each said for what it is**: what people reported (DYFI's CDI for the 10 km cell
    holding Pereira's point, with its number of responses) and what PAGER's model estimates for the
    city (its MMI). The model's sentence says it "estima que … sacudió Pereira", never that it was
    felt: a model reports nothing. DYFI's label for the cell ("Dos Quebradas") is never shown, and
    no other USGS string is either.
  - **Written as USGS writes them**: the level is the whole number, as a Roman numeral, with USGS's
    perceived-shaking term from its ShakeMap and PAGER legends (not felt, weak, weak, light,
    moderate, strong, very strong, severe, violent, extreme; I to X+). **The Spanish terms ("no
    sentido … extremo") are the page's translation**, so the Spanish never puts them in quotes and
    the caption says so; the English quotes USGS's. The decimals are in the caption, to one place,
    and **the level is rounded from that shown decimal** (`intensityLevel`): a 7.46 shown as 7.5 is
    VIII, never a VII beside "7.5". Levels are kept to I–X+ before anything compares them, since PAGER
    can pass X and the page draws every such level as X+.
  - **Agree or differ is decided on the numerals the reader sees**, not on the decimals: the same
    numeral, one apart ("casi coinciden"), or N apart with who is higher, and a sentence saying
    why that is common (the model gives typical shaking at the distance; a report depends on the
    ground, the building and the floor). On 2026-09-24 both are VIII.
  - **A cell answered by fewer than 5 people is not shown** (`FELT_MIN_RESPONSES`). **DYFI publishes
    no such threshold** (checked 2026-09-25: its scientific background page and USGS's 20-year review of
    DYFI, doi:10.3389/feart.2020.00120, give none, and its 10 km file keeps single-response
    cells, 149 of 260 for the M7.4), so 5 is the page's own rule, and the tile says "fewer than 5
    answered" in the figure's place. With neither figure, the question is not asked.
  - **Credited to USGS in every sentence that states a figure** (the comparison as "los reportes y el
    modelo del USGS"), dated from the product's own
    update time, and linked to USGS's event page. The question also points to SGC as the
    authority and to its form for reporting a felt earthquake.
- **"¿Viene uno más grande?" relays USGS's aftershock forecast; the page computes none** (from
  2026-09-25; `usgsForecast` in `src/insights/claims.ts`, the box in `questions/forecast.tsx`). The
  reader's real question is whether another big one is coming, and a reviewed, official answer with
  its uncertainty is more honest than "nobody knows" alone. The method is USGS's (an ETAS model on
  ComCat, reviewed by a USGS seismologist at each update), so `docs/ideas.md`'s demand that the
  researcher check a forecast's method applies to one built here, and none is. The wording was
  reviewed by the owner before it was built. **"No es un pronóstico" is about the page's own
  figures**: the b-value and every count stay descriptions, and the footer says "las cifras que
  calcula esta página". The rules:
  - **Only a reviewed forecast, only for the mainshock the page detects, only while fresh.** Shown
    while the digest's `sgcEventId` is the zone's `found` mainshock, its `review-status` is
    `reviewed` (an automatic one is hidden; owner, 2026-09-25), and the clock is before USGS's
    `nextForecastTime`; without one, before 14 days from issue (two missed weekly updates). The
    file's `expireTime` is a year after issue and is ignored. A stale box is hidden, never greyed, at
    the due time to the millisecond: the page's clock is rounded to the minute, so `useInsights` also
    re-renders at the due time itself (the code review found a replaced forecast staying up to 90 s).
    **Known gap, kept on purpose** (code review, 2026-09-25): the daily job (`7 11 * * *`) stores
    USGS's next forecast only on its next run, and USGS publishes about two hours after the nominal
    time, so the box is missing for up to about a day each week (on the fixture, from 28 Sept 16:00
    UTC to the job of the 29th). A grace period would show a probability USGS has already replaced;
    the fix, if the gap matters, is for the job to fetch soon after `nextUpdateAt`. For the same
    reason a page left open across `nextUpdateAt` drops the box then. It then asks `/api/context`
    again on a return to the tab, but only once a job run has finished since the due time (the job's
    schedule is `core/products.ts`, shared with the Worker's cron), so a reader flipping tabs through
    the gap sends nothing the server could not answer; after a failed attempt, 10 minutes before the
    next; and for two days past the due time at most (`contextRecheckDue` in `context-refresh.ts`).
    So the page shows USGS's next forecast once the job has stored it, without a reload.
    Chocó only: the page asks USGS for nothing about Tolima, where SGC's position rules out a
    probability of a larger event (above).
  - **USGS's windows start at the forecast's start, not today** (2026-09-21 16:00 UTC for all four
    on the fixture), so a window is named by its dates ("entre el 21 sept y el 28 sept"), never "the
    next week"; an ended window is dropped, and nothing is rescaled to the days left, which would be
    computing a forecast. **The week and the month only, at M5 and M6** (owner, 2026-09-25): the year
    window is the most alarming and least useful, and M4+ invites reading every M4 as felt. The month
    adds one sentence for USGS's "as large as the mainshock or larger" (0.33 % on the fixture), named
    by the window's two dates like the rows, and only while the month window itself is shown.
  - **The words never say more than the number.** A whole percent, never a decimal (43.47 % claims a
    precision a model lacks); under 0.5 % "menos del 1 %", from 99.5 % "más del 99 %". Beside it a
    natural frequency **worked out from the percentage shown**, so one shown figure always gets one
    phrase (the code review found 19.6 % and 20 % both shown "20 %" but read "1 de cada 5" and "2 de
    cada 10"): from a shown 95 % "casi seguro"; from 20 %, "unas k de cada 10", k the shown percent in
    tenths (45 % is 5); below, "alrededor de 1 de cada N", N = 100 ÷ the shown percent, whole under 20
    and one significant figure from 20 (a shown 6 % is 16.7, so "1 de cada 17"; 2 % is "1 de cada
    50"). Under 1 %, shown only as "menos del 1 %", N comes from the probability itself (0.33 % is
    "1 de cada 300"), and below 0.1 % it is "menos de 1 de cada 1000". Counts are written as the page
    writes counts (`fmtInt`: "1000"). "4 de cada 10" for 15 % would be too coarse and "1 de cada 2" for
    43 % would overstate it; tests hold every band edge, one phrase per shown percent over the whole
    range, and each frequency within 5 points and a factor of 1.5 of the percentage beside it. The most likely
    count and USGS's range are said as "lo más probable es que no haya ninguno, aunque según el USGS
    podría haber hasta 3"; the range's "95 %" is left out (a reader would take it for a second
    probability) and USGS's page, linked, states it. One line explains "4 de cada 10" with a
    frequency the box shows.
  - **A magnitude at the source is not shaking in Pereira.** One sentence says almost all of Chocó's
    events are over N km away in a straight line: the largest multiple of 10 km that at least 95 % of
    them lie beyond (110 on the fixture, where 95.9 % do; 76.6 % are over 120). Not a group's median,
    which half its events are nearer than (the first version used it, and the code review caught
    "más de" claiming it of every source), nor the nearest event, a 62.8 km outlier. It adds that an
    M5's waves arrive much weakened, **but only from 100 km** (`FAR_FROM_KM`): the claim was weighed at
    the ~110 km Chocó is today, and a catalogue that brought the figure down (the code review imagined
    "más de 0 km") would make it false, so nearer than that the box keeps only "a magnitude is not
    shaking here". The distance is worked out once per catalogue (`chocoReach`), not every minute. It
    points to "¿Qué tan fuerte se sintió?"
    for the M7.4. It never says the forecast's M5 will be that far: **USGS's circle (125.4 km around
    4.57° N, 76.69° W) reaches Pereira**, 113 km from its centre. No intensity is given for a
    hypothetical M5 (the rule above against a felt-intensity equation stands).
  - **Its limits are stated in the box**: one circle holding both of Chocó's groups (said only while
    both groups' median epicentres are inside it), so it cannot say which one; USGS's catalogue at
    M ≥ 4.45, not SGC's, so its figures cannot be checked against the page's counts; and its b = 1.0
    against the page's (0.74 at Mc 2.3 on the fixture). USGS's background page says it "usually"
    keeps the generic b and fits only the productivity, so the page says the model "uses" b = 1.0,
    never that it computed it. `M4.45` is written as USGS gives it.
  - **Attributed and bounded.** Its own box headed "El USGS publica este pronóstico", with USGS's
    issue date, its reviewer and its next update; nothing of the page's is drawn inside it; SGC is
    named as the authority for what to do, and the box gives no advice of its own. The number never
    travels without its caveats: nothing in share previews, the monitor, notifications or the MCP
    server. The story's "Lo que nadie sabe" adds one line pointing to the question, under the same
    conditions (`usgsForecast` again).

