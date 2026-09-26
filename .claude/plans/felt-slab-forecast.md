# Plan: felt intensity, the real plate, terrain, and the USGS aftershock forecast

Status: **in progress. Part B is complete and on `main`** (PRs #50, #52, #54, 2026-09-24). **Unit S,
the external-products store, is PR #56** (open, not merged, 2026-09-24). **Unit C, the hillshade, is
PR #57** (open, CI green, 2026-09-24; #56 and #57 merge cleanly with each other). *(Both are on `main`
since; see git log.)* **Unit A, the felt question, is PR #59** and **unit E0, the 3D block's data, PR #58**
(both merged by 2026-09-25). **E1, the 3D prototype, is built** on `prototype/3d` (never merged); the
owner picked variant D on 2026-09-25, see "Done: E1". **The 3D tab (E2) is PR #60, merged.** **D, the
USGS forecast, is PR #61** (open, 2026-09-25), built from the owner-approved wording in
`.claude/plans/forecast-wording.md`. Every unit of this plan is now built. The USGS, EMSC and Slab2 figures in the
parts below come from research passes on 2026-09-24 (live requests to USGS, EMSC, GitHub, ArcGIS,
EarthScope and datos.gov.co; none to any `*.sgc.gov.co` host). **Re-fetch every figure before it
goes into copy, a test or a doc.**

## Progress (update this at the end of every session)

### Shipped for review: D, USGS's aftershock forecast (PR #61, open, 2026-09-25)

Branch `feat/insights-forecast`, worktree `.claude/worktrees/forecast` (kept; its local branch is
named `worktree-forecast`, the pushed one `feat/insights-forecast`), one commit (amend on review).
**Merging deploys it**; nothing server-side changes.

- **Owner's decisions (2026-09-25):**
  - The six open questions in `forecast-wording.md` went with its recommendations: M5+ and M6+,
    the week and the month, the ≥ M7.4 line for the month only, automatic forecasts hidden, no
    "95 %", "M4.45".
  - **Placement:** a box *inside* the existing "¿Viene uno más grande?" rather than the drafted
    separate question, which read as a near-duplicate beside it.
  - **TDD seams:** the rule and the sentences, with no renderer.
- **Code:**
  - `usgsForecast`, `naturalFrequency` and `wholePercent` in `claims.ts`; `forecast*` sentences in
    `copy.ts`.
  - `questions/forecast.tsx`, with its copy in `questions/copy.ts` `bigger.forecast`.
  - `useInsights` returns `forecast` for both tabs.
  - The story's scene 7 has `unknown.bigger/forecast/floor`.
  - Docs: science.md (the rules and the known gap), frontend, api, security, performance, ideas.
- **Reviews:**
  - `/better-writing`: 5 applied.
  - `/security-review`: none.
  - `/code-review`: 8 findings, 6 fixed. The 2 declined are the weekly gap between USGS's
    `nextUpdateAt` and the daily job storing the new forecast, and the box dropping on an open page
    at that time. Both are documented in science.md.
- **Later the same day (owner's asks):**
  - Revalidation on a return to the tab, in `src/insights/context-refresh.ts`. The rule
    `contextRecheckDue` checks again only after the daily job has run since the due time; the job's
    schedule is now `core/products.ts`, shared with the Worker. Question 2 is fixed by the first
    answer (`keepFeltFromFirst`).
  - All 10 findings of the third `/code-review` resolved. One phrase per shown percent, so "2 %" is
    now "1 de cada 50" and "6 %" is "1 de cada 17". The box leaves at the exact due time. The
    distance clause shows only from 100 km (`FAR_FROM_KM`). `chocoReach` is cached per catalogue.
    There is a Safari scroll fallback (untested: no WebKit available).
  - Before/after screenshots are in the PR body. CI is green and GitHub reports the PR `MERGEABLE`
    and `CLEAN`.
- **Open for the owner:**
  - Merging #61.
  - The hourly-check PR, which closes the weekly gap (up to ~1 day). Explained to the owner: the
    `7 11 * * *` pattern becomes `7 * * * *` on the same trigger. Each run is one D1 read, and it
    asks USGS only when the stored forecast is past due. The job costs ~0.2 ms CPU and never
    touches SGC, so the `*/15` rule for ingest ticks does not apply.
  - Removing the kept worktrees: `forecast`, and still `block-data`, `external-products`,
    `hillshade`, `felt-pereira`.
- **Lessons:**
  - The Edit tool decodes ` ` in its input into the literal character. Run
    `perl -CSD -pi -e 's/\x{00A0}/\\u00A0/g' <files>` after editing copy, or the repo's visible
    escapes turn invisible. Perl patterns with accented letters need `use utf8`, so use the Edit tool
    for accented Spanish instead.
  - The worktree guard refuses `agent-browser eval`, a session named `fc` (a shell builtin), and
    compound or piped commands. Use `scrollintoview`/`get text` and one plain command per call.
  - agent-browser 0.38.1's element screenshots (`screenshot <selector> <path>`) come out blank
    white on this page, even for an element fully in view. Instead, read `get box <selector>` while
    scrolled to the top (the box is then in page coordinates), take `screenshot --full`, and crop
    with `sips -c <h> <w> --cropOffset <y> <x>`. This is how PR #61's before/after was made.
  - USGS's event page serves the forecast tab at `/earthquakes/eventpage/<id>/oaf/forecast`
    (rendered and checked in agent-browser; WebFetch only sees the app's shell).
  - USGS's OAF background page says it "usually" keeps the generic b, p and c and fits only the
    productivity: say the model "uses" b = 1.0, never that it computed it.

### Shipped for review: the 3D tab (PR #60, merged 2026-09-25)

Branch `feat/insights-3d`, worktree `.claude/worktrees/insights-3d`, one commit (amend on review).
**Merging deploys it.** Built from the E1 prototype and the owner's picks: variant D's layout (turning
preview → full-screen viewer with five views), **OGL** (36.7 kB gz chunk), the baked monitor map,
the solid plate with events drawn through it, map pins, the block's size on its edges, and a
"¿Qué estás viendo?" key in plain words (owner asked; the rupture is "donde se rompió la roca").
Both languages. Placement: its own tab "En 3D" (`?tab=3d`), opening at ×2 with the replay in the
drawer — chosen by the agent when the owner said "ship it"; change on the owner's word. Code in
`src/insights/block3d/` (`shared.ts` tested, `scene.ts`, `index.tsx`, `copy.ts`, the bake page).
Docs: frontend.md "The 3D tab", science.md "The 3D tab's rules", development.md "The 3D block's map",
performance.md, security.md. Reviews: /code-review 10 fixed, /security-review none, /better-writing
2 HIGH + 6 fixed. **Still not measured: the owner's phone fps.**

Teardown done: prototype worktree removed (its branch stays on GitHub as `prototype/3d`, the record
of the four variants and the three.js build), dev servers and browser sessions closed. **Left for the
owner** (the agent's permission classifier refused removing other sessions' worktrees): the merged
worktrees `block-data`, `external-products`, `hillshade`, `felt-pereira` and their branches.

### Done: Part B, the cut view (all merged to `main` on 2026-09-24)

| PR | Commit on main | What it shipped |
|---|---|---|
| #50 | b44d30c | The Slab2 plate and GEBCO ground on Chocó's cut; the "¿Dentro de la placa o encima?" step and the `plateSide` rule |
| #51 | 5c601e2 | A background halo on the "Lo que nadie sabe" question marks (owner request, off-plan) |
| #52 | 7b34012 | Chaparral's cut at Chocó's scale, a locator map on each cut, Buenaventura on the coast |
| #54 | f7f673b, 5391a8f | The plate's motion (~5 cm a year, GPS, cited), its arrow, USGS's "northernmost extent" line |

**Where things live now**, for anyone building on the cuts (E0/E1 reuse all of it):

- `src/insights/section.json` (from `scripts/insights-section.ts`): the 0.1° Slab2 subgrid (top,
  thickness, uncertainty) over lat 3.5–5.3, lon −79 to −74.5, and GEBCO 2020 profiles every 0.02°
  along both cuts (Chocó 4.65° N, Chaparral 3.86° N) with each trench longitude. The Slab2 input
  the owner downloaded by hand is at `data/slab2/Slab2Distribute_Mar2018/` in the main checkout
  (gitignored; ScienceBase blocks scripted downloads). GEBCO came through Open Topo Data
  (`api.opentopodata.org/v1/gebco2020`, 100 points a request, 1 request a second).
- `src/insights/plate.ts`: `plateAt`, `plateSide`, `groundAt`, `plateAlong`, `CUTS`, and the rate
  (`CONVERGENCE_CM_PER_YEAR` = 5, `CONVERGENCE_SOURCE` = Mora-Páez et al. 2019's DOI).
- `src/insights/story/section.tsx`: `frameSections` (both cuts at one px-per-km, set only by the cuts
  whose steps are shown, each clamped to its ground data by `cutEnd`), `SectionFrame` (axis, plate,
  ground, the motion arrow, the locator map), `RATE` (the rate as copy writes it, with a no-break
  space). `story/graphic.tsx` has the Chocó overlay (`SectionBase`) and Chaparral's
  (`TolimaSectionBase`), the new scene id `tolimaSection`, and `TownMark`.
- `story/model.ts`: `model.plate.*`, `tolimaToPereiraKm`, `tolimaCut` (Chaparral's step is shown
  only with Chocó's plate step), `facts.tolimaFarFromPlate` (`FAR_FROM_PLATE` = 2).
- `src/insights/region.ts`: `TOWNS` gained Buenaventura (kind `cut`, DIVIPOLA centroid) and
  `onCut` (within 0.05° of a cut's latitude).
- Story steps in order around the cuts: `section` (now with the rate and its cited note),
  `section-caveat`, `section-plate` (now with USGS's "northernmost extent"), …, `tolima-share`,
  `tolima-drift`, **`tolima-section`** ("Chaparral visto de perfil"), then `felt-*`.
- Docs are current: `docs/science.md` (Chaparral's cut rules, the far-from-plate rule, the rate and
  every other published one, and the facts **checked and deliberately left off**: the Caldas tear,
  the Panamá–Chocó collision, USGS's own location for the M7.4), `docs/frontend.md` (the section
  module, locator, arrow and label decisions, phone layout), `docs/performance.md` (story chunk
  99.9 kB, 30.4 kB gzipped, after #52).

**Measured on the 2026-09-24 fixture** (recomputed in Python; tests pin them):

| Source | Depth | Plate top | Margin (Slab2 unc + depth err) | Rule says |
|---|---|---|---|---|
| Shallow group (4.48 N, −76.71) | 42.2 km | 72.5 km | 27.9 km | above, clearing the margin by only 2.4 km |
| Deep group (4.81 N, −76.40) | 88.7 km | 82.1 km | 28.3 km | close |
| M7.4 (4.99 N, −76.29) | 103.4 km | 82.6 km | 25.7 km | close |
| Chaparral (3.86 N, −75.63) | 18.9 km | 160.2 km | 24.8 km | above, by 141 km |

Pereira is 106.5 km from the swarm's median epicentre ("~110 km al norte" on the page).

### Done: unit S, the external-products store (PR #56, open, 2026-09-24)

Branch `feat/external-products`, worktree `.claude/worktrees/external-products`, one commit (amend on
review, as usual). **Merging deploys it**: CI applies migration 0007, and the first run is 11:07 UTC.

**Where things live**, for A and D:

- `worker/external.ts`: `PRODUCTS_CRON` = `7 11 * * *`, `refreshProducts` (the daily job), `readContext`,
  `searchUrl`. `worker/usgs.ts`: `digestDyfi`, `digestPager`, `digestForecast`, `DIGEST_VERSION`
  (**bump it whenever a digest's shape or rules change**, or stored rows keep the old shape; PAGER's
  URL for the M7.4 is final). `worker/db.ts`: `zoneMainshockRow`. `worker/plan.ts`: `INGEST_CRON`.
- `GET /api/context?zone=` returns `ContextResponse` (`worker/api-types.ts`): `{ dyfi, pager, forecast }`,
  each null or `{ source, sgcEventId, sourceEventId, productUrl, sourceUpdatedAt, checkedAt, digest }`.
  **The page must show a digest only while `sgcEventId` equals its own detected mainshock id**
  (the job deletes others, but only daily).
- `core/places.ts`: `PEREIRA`, now imported from there everywhere (the re-export in `claims.ts` is gone).
- Docs current: `docs/ingest.md` "The daily USGS job", `docs/api.md`, `docs/operations.md` (the `usgs:`
  log lines), `docs/security.md`, `docs/deployment.md` (two Cron Triggers), `docs/development.md`
  (`/__scheduled` needs `?cron=`), `docs/science.md` (the USGS facts below).

**Facts re-fetched 2026-09-24 (A and D need them)**:

- DYFI: the cell holding Pereira's point is **CDI 8, 41 responses**, of 1,249 total, but **DYFI labels it
  "Dos Quebradas"**; the two cells it labels "Pereira" are just west (7.7 from 10, 7.3 from 2). Copy
  must not call the cell by DYFI's label. DYFI's threshold for hiding sparse cells is still unconfirmed.
- PAGER: Pereira MMI **8.43**, 0.2 km from the page's point; product `review-status` is `automatic`.
- OAF: issued 2026-09-21 18:03 UTC, `review-status` `reviewed`, **`nextForecastTime` 2026-09-28 16:00 UTC**.
  **`expireTime` is a year after issue**, so Part D's rule 1 ("use the validity window the file gives")
  must read `nextForecastTime` instead, with the 14-day fallback. Figures as the plan had them
  (M≥5: 2.65% day, 14.78% week, 43.47% month, 89.37% year; M≥6: 6.09% month, 26.23% year).
- Render every USGS string (`placeName`, city `name`, window `label`) as text, never HTML
  (security review note).

**Owner to do before or after merge**:

- Count the account's Cron Triggers (free plan: 5 per account; S adds one). The agent's classifier
  refused reading the API token, so this is unchecked.
- ~~Recapture the match fixture~~: done by the owner the same day. The real search returned one
  event, `us6000tjl2`, identical to the derived stand-in except for `metadata`.
- After the first 11:07 UTC run: `pnpm logs --since 24h --msg "usgs: product stored"` and `pnpm logs
  cpu`. Measured in Node V8: 3–4 ms cold with every product changed, ~0.2 ms on an ordinary day.

### Done: unit C, relief on the monitor's map (PR #57, open, 2026-09-24)

Branch `feat/map-hillshade`, worktree `.claude/worktrees/hillshade`, one commit (378f760). Merging
deploys it; nothing server-side changes. Before/after screenshots (both zones, both themes, 1280 and
320 px, and Chaparral at z12) are in the PR body. The owner has seen it in the demo and likes it.

- `src/components/event-map.tsx`: a Mapterhorn `raster-dem` source (verified 2026-09-24: terrarium,
  512 px WebP, `https://tiles.mapterhorn.com/{z}/{x}/{y}.webp`, credit "© Mapterhorn" linking to
  `mapterhorn.com/attribution`, `max-age=604800`, CORS `*`). **Colombia's data ends at z12** (z13
  answers 404), hence `maxzoom: 12`. Declared `tileSize: 1024` to fetch a quarter of the tiles.
  `RELIEF_COLOURS` holds the per-theme shadow and highlight.
- **Layer order**: the relief goes over the basemap's fills and under its first line, then `water`
  is moved back over it. Just under `water` (the plan's first idea) put it under OpenFreeMap's wood,
  which is opaque by z12: the review caught it.
- **CSP**: `tiles.mapterhorn.com` in `connect-src` only. The plan said `img-src` too; MapLibre
  never loads raster-dem tiles as `<img>` (checked in its source). `test/headers.test.ts` now fails
  if the map fetches from a host `connect-src` lacks.
- **Weight** (one load): Chocó 391 kB of relief against 189 kB of basemap, Chaparral 245 kB against
  145 kB. **Lighthouse was not run**: at Lighthouse's two viewports the map never mounts on the
  first load and no tile is requested, so it cannot move the score. Recorded in `docs/performance.md`.
- Docs current: `docs/frontend.md` (the relief bullet), `docs/performance.md`, `docs/security.md`.
- `/code-review` found 8 issues, all fixed before the PR was opened.
- For E: the plan's "tilting is Part E's job" stands; the map stays flat.

### Done: unit E0, the 3D block's data (PR #58, open, 2026-09-24)

Branch `feat/insights-block-data`, worktree `.claude/worktrees/block-data`, one commit (amend on
review). Run in parallel with A (no shared files). Merging changes nothing on the page: nothing
imports the data yet.

**Where things live**, for E1:

- `src/insights/block.json` (22 kB, 6.7 kB gzipped, oxfmt-formatted) from `scripts/insights-block.ts`
  (`pnpm tsx scripts/insights-block.ts && pnpm format`; no manual download). Typed by
  `src/insights/block.ts`: `GROUND` and `RUPTURE`. The plate is still `SLAB2` in `plate.ts`.
- `GROUND`: GEBCO 2020 every 0.05° over the Slab2 box (lon −79 to −74.5, lat 3.5–5.3), 91 × 37, row by
  row from the SW corner, whole tens of metres. Equal to `section.json` wherever Chocó's cut meets it.
- `RUPTURE`: USGS finite-fault `us6000tjl2_1` v1 (reviewed), pinned by URL. Strike 225.57°, dip 71.78°,
  rake 33.23°, 150 × 66 km, 25 × 11 patches of 6 × 6 km, 82.26–144.95 km deep, lat 4.05–5.12.
  `corners` = top NE, top SW, bottom SW, bottom NE as [lon, lat, km]. `slipCm` row by row from the top,
  each row from the NE end; max 398 cm at row 2, column 14 (4.47° N, 76.49° W, 94–99 km).
- `scripts/gebco.ts`: the Open Topo Data client, now shared by both insights scripts
  (`insights-section.ts` re-run after the move: byte-identical).
- Docs current: `docs/science.md` ("The 3D block's ground and rupture plane"), `docs/frontend.md`,
  `docs/development.md`.

**What E1 must handle** (all in `docs/science.md`): three hypocentres for one event (FFM 4.987 N,
76.082 W, **125 km**; USGS catalogue 108.2 km; SGC 4.99 N, 76.29 W, 103.4 km; SGC's is 23 km across
and 22 km above the FFM's), so the plane does not pass through the page's mainshock dot: draw it where
USGS put it, labelled as USGS's model, never shifted. The largest slip is ~70 km SW of the hypocentre
and is a model's. The plane's flat top is ~15 km above Slab2's plate top at the NE end and ~8 km inside
it at the SW end: not fitted to the plate. Gate it on `USGS_ASSESSED.sgcId`, never on `RUPTURE.eventId`
(USGS's id). GEBCO at 0.05° tops out at 4,610 m (Ruiz's summit is 5,321 m).

Reviews: `/code-review` found 10 issues, all fixed (format:check failing on minified JSON, a doc bullet
inserted mid-bullet, the USGS-vs-SGC id gate, unchecked USGS numbers that could write an all-zero
plane, two wrong claims in `science.md`, the copied Open Topo Data client, a type cast, fetch order).
`/security-review`: no findings.

### Done: unit A, "¿Qué tan fuerte se sintió?" (PR #59, open, 2026-09-25)

Branch `feat/insights-felt-pereira`, worktree `.claude/worktrees/felt-pereira`, one commit (amend on
review). Merging deploys it; nothing server-side changes. Until the daily job's first run stores
digests, production's `/api/context` is empty and the question simply is not asked.

**Where things live**, for D (which should stack on or follow #59):

- `src/insights/claims.ts`: `feltInPereira(context, mainshock)` → `Felt | null`, `FELT_MIN_RESPONSES`
  = 5, `intensityLevel` (rounded from the one-decimal figure, clamped to I–X+). `src/insights/copy.ts`:
  `intensityName(level, lang)` (numeral + USGS's perceived-shaking term; the Spanish is ours),
  `claims.feltAgreement`, `claims.feltTakeaway`. `questions/shaking.tsx` is the question;
  `questions/copy.ts` `shaking` its copy. D's rule 4 ("point to Part A") can link to `#q-shaking`.
- `src/lib/api.ts` `getContext`; `useInsights` returns `context` and **waits for it** (`isPending`),
  with no retry and no refetch while open, so a question tied to it cannot appear or vanish above the
  reader. D's forecast box gets the same property for free from the same query.
- Question 2 on the questions tab (after "¿Por qué lo siento si está tan lejos?"), owner's choice.
- Docs current: `docs/science.md` (the rules), `docs/frontend.md`, `docs/api.md`, `docs/ingest.md`,
  `docs/security.md`, `docs/performance.md` (shell +1.4 kB gz, questions +1.7 kB gz), `docs/ideas.md`.

**Facts checked 2026-09-25**: DYFI publishes **no minimum-response threshold** (its background page and
the 20-year review, doi:10.3389/feart.2020.00120, give none; its 10 km file keeps 149 single-response
cells of 260), so 5 is the page's own rule, stated as such. USGS's perceived-shaking terms, I to X+:
not felt, weak, weak, light, moderate, strong, very strong, severe, violent, extreme.

Reviews: `/code-review` found 10; 8 fixed (level clamp before comparing, level from the shown
decimal, the context insert/remove race, USGS credit in the comparison sentence, singular total,
JSDoc, duplicated helper, our Spanish quoted as USGS's). 2 declined, with reasons in the PR: no tile
for a product USGS never published (docs corrected instead), and the rule stays in `claims.ts`
despite the shell cost. `/security-review`: no findings. Spanish through `/better-writing`.

**SGC's felt-report link checked by the owner** (2026-09-25 01:21 UTC): `https://sismosentido.sgc.gov.co/`
answers `200 OK`, text/html (its session cookie is scoped to `/EvaluacionIntensidad`).

### Drafted: D's forecast wording (2026-09-24), awaiting the owner

`.claude/plans/forecast-wording.md` has the box in Spanish and English, the claim rules (whole
percent; natural-frequency bands; count phrasing; staleness) and six open questions with a
recommendation each. It went through `/better-writing` (two HIGH findings fixed: the "at least one"
meaning, and a false claim that ComCat only records M ≥ 4.45 there). Findings for D beyond the plan:

- **USGS's windows start at the forecast's start (2026-09-21 16:00 UTC), not today.** The "1 Week"
  window ends 09-28 whatever day the reader looks. Name each window by its dates, hide ended ones,
  never rescale (that would be computing a forecast).
- **USGS's 125.4 km circle reaches Pereira** (113 km from its centre), so copy must not say the
  forecast's M5 will be over 100 km away; it speaks of Chocó's sources instead.
- Figures re-fetched 2026-09-24 from USGS: unchanged from the fixture. M≥7.4 ("larger than the
  mainshock"): 0.33 % in the month window, 1.71 % in the year.

### Done: E1, the 3D prototype (branch `prototype/3d`, 2026-09-25; never merged)

Worktree `.claude/worktrees/prototype-3d`, commits e9086b2 (A–C) and cc024e3 (D). Run it with
`pnpm prototype:3d` there: it serves the 2026-09-24 fixture (a dev-only Vite middleware in
`vite.config.ts`, `PROTOTYPE_FIXTURES=1`) on the LAN at port 5190, so a phone on the same Wi‑Fi can
open `http://<LAN IP>:5190/insights?tab=3d&variant=D`; nothing reaches the Worker, D1 or SGC. A third
tab "3D (prototipo)" on `/insights`, `?variant=A|B|C|D`, a floating switcher (dev only, ← →).

- `src/insights/prototype-3d/scene.ts`: one three.js scene for every variant. km units, x east, z
  south, y up, **one exaggeration for everything vertical** (ground and depth), plate clipped at the
  240 km floor, events as one `InstancedMesh` in the page's source colours (read from the CSS
  variables by rasterising, as `docs/development.md` describes), the rupture as a 25 × 11 slip
  texture, CSS2D labels, camera presets with a fit that frames the whole block for any screen shape
  and exaggeration, an fps counter.
- `index.tsx`: the variants. A = turning preview + full-screen viewer (drawer: exaggeration, layers,
  replay, legend). B = inline, five view buttons with captions, one finger scrolls and two turn.
  C = guided tour pinned beside six scrolling steps, no gestures. **D = A + B's view buttons and
  captions inside the full-screen viewer.**
- **Owner's verdict (2026-09-25): "it looks amazing". D wins**: A's look at the start (the turning
  preview), and in the full-screen viewer B's buttons to jump to specific views, full width like A.
  B's inline embed and C's tour were not chosen.
- **Measured**: the 3D chunk is **599 kB, 154 kB gzipped** (three.js is most of it), loaded only
  with the tab; `/insights` itself starts at 364 kB. 60 fps headless on the desktop. **Still to get:
  the owner's phone fps** (the counter is on screen). The plan's "try a smaller WebGL library if it is
  out of proportion" was **not** done: that is E2's first question.
- What the views showed: "Desde el sur" makes the plate/groups/Chaparral point best; at ×1 the relief
  is nearly invisible (4–5 km against 240), so the exaggeration is always labelled on the block; the
  legend names the snapped depths (60 events at 42.9 km, 54 at 39.9, 32 at 45.9 on the fixture) and a
  layer button highlights them; the rupture plane misses the M7.4 dot (USGS vs SGC hypocentre) and
  the legend says so.
- **Owner feedback round 2 (2026-09-25), applied on the branch** (commits cc5757f, 8f8184e):
  - *From above* was blurry and meaningless: the ground now fades to 0.55 when looking down so the
    events show, and the depth ticks, plate, uncertainty, box and underground labels hide.
  - *Map quality*: option 3 of three offered (owner's choice): the monitor's own map (OpenFreeMap
    positron/dark + Mapterhorn relief) **baked once per theme** at the block's bounds
    (`prototype-basemap.html` + `bake-basemap.ts`, screenshotted at 4096 × 1644 by agent-browser,
    WebP 201 kB light / 116 kB dark) and draped with Mercator UVs. Rejected: switching to live
    MapLibre for the top view (~250 kB gz more, no camera glide, top view only) and a plain Mapterhorn
    hillshade. The pinned towns, reserves, airports and shields are left off the image. Credit
    "© OpenStreetMap · OpenFreeMap · © Mapterhorn" on the block. **For the real build: bake it with a
    script, not by hand, and check OpenFreeMap's terms for a baked image.**
  - *The plate*: first too transparent, then (solid) too dark. Settled at 0.6 on the top surface,
    walls on its north and south cut faces, a grey a quarter of the way from the page's background
    to its text (0.05 in dark mode, where the lights brighten it ~3×), and the **events and the
    rupture drawn through it** (render order after the plate) so a solid plate never hides data.
  - *Town pins*: teardrop map pins (inline SVG in a CSS2D element whose tip is the town), Pereira
    in `--place`. They can overlap in the south view on a phone (Buenaventura/Istmina).
  - Bug fixed: the plate's upper uncertainty surface was clamped at sea level and poked through the
    sea floor; the trench edge now runs diagonally (three-corner cells get one triangle).
- **Smaller WebGL library, compared at equal quality (owner asked, 2026-09-25; commit a97a907)**.
  Candidates measured for exactly what the scene imports (esbuild, minified, gzip -9): three.js
  141.8 kB gz, **OGL 17.5**, twgl 20.6, regl 41.2. OGL was ported (`scene-ogl.ts`, `?engine=ogl`):
  its own shaders reproduce three.js's Lambert (linear light ÷ π, sRGB out) and Basic materials,
  labels are projected DOM. The shared, engine-free parts are `common.ts`. **Build: three.js chunk
  575 kB / 144.9 kB gz, OGL 72.7 kB / 22.2 kB gz, plus 13.4 kB gz shared either way: 158 → 36 kB gz
  (−78 %).** Quality: five views × two themes differ by a mean of 0.10–0.45/255 and < 0.25 % of pixels
  by > 24 levels (a Node + sharp diff of agent-browser screenshots); 60 fps headless both. Costs of
  OGL: shaders and sRGB handling are ours to maintain, a smaller community, no CSS2D renderer (~30
  lines of projection instead). Every geometry must carry every attribute its program declares, or
  OGL throws inside `Geometry.draw`. **Recommendation: OGL** for the real build. Still to get: the
  owner's phone fps for each engine.
- Prototype shortcuts to redo when building it for real: Spanish only, no tests, no i18n, the
  switcher and fixture middleware, labels that can collide at some angles, `details` as the drawer,
  body scroll lock by `overflow: hidden`, no focus trap in the dialog.

### What this session learned (apply it to the next units)

- **Run `/code-review` on every PR before calling it done** (owner, 2026-09-24). On #52 and #54 it
  found real problems the four checks missed: a sentence contradicting the page's own plate rule, a
  citation hidden when no mainshock is found, a USGS quote reworded into a narrower claim, a hidden
  cut still setting the scale, missing text alternatives. Fix, amend, force-push, update the PR body.
- **Spanish copy goes through `/better-writing`** before it is committed (owner): earlier copy read
  as translated. Known traps: verbless fragments, "de lado" (say "de perfil"), a missing "a" before
  a distance ("queda a unos"), a word repeated in one sentence, and a normal space before a unit
  (use U+00A0; put figures in `{placeholders}` filled from constants so this cannot happen).
- **A label beats a tooltip on this page.** The owner found an unlabelled arrow unclear; a hover
  tooltip was rejected because a phone has no hover. Put the meaning where the eye already is (the
  plate's label).
- **Every label must be checked at 320 px.** Four collisions were only visible there (the Pereira
  note against Buenaventura, the cut title clipped, the arrow label against the deep group, the
  arrow against its own label).
- **Stacked PRs work** here: #54 had #52's branch as its base, and GitHub merged it into `main`
  when #52 merged. The owner is fine with either a stack or separate PRs.
- **Quote USGS in its own terms.** Rewording ("at that depth" for "intermediate depth") changes the
  claim; the review caught it.
- **TDD, at seams agreed with the owner first** (owner, unit S). For S: the worker-pool end-to-end
  seam (cron + route, USGS via MSW) and the pure digests. Where code was written ahead of a test,
  a quick mutation (break it, see the test fail, restore) showed the test was not vacuous.
- **Run `/security-review` as well as `/code-review`** (owner, unit S). Code review on S found ten
  real issues (digest versioning, redirects, stale rows, swallowed errors, silent `null`s), and
  fixing them surfaced an eleventh: `failed ??= await f()` skips `f` once `failed` is set.
- **The agent cannot read Cloudflare's API with wrangler's token, and a USGS `curl` was refused
  once after that**; plan owner-run commands for account checks and fixture captures.
- **Read the basemap's layer order before inserting under it** (unit C). OpenFreeMap draws its land
  fills after `water`, so "under the water" also meant "under the forest". Fetch the style JSON and
  list the layers.
- **Weigh third-party tiles, not just the bundle** (unit C). The relief was 5× the basemap until the
  tiles were declared 1024 px; `agent-browser network requests` plus `curl` sizes gave the numbers.
- **Parallel sessions on this plan work** (C and S, 2026-09-24): separate worktrees, ports and
  `agent-browser` sessions; `git merge-tree --write-tree` shows whether two open PRs conflict. A
  worktree-isolated session cannot edit this plan (it is untracked, so only the main checkout has
  it): stage the update elsewhere, then leave the worktree and merge it onto the live file, since the
  other session will have edited it meanwhile.
- **A question that exists only when an API has data must wait for that API** (unit A). Inserting
  question 2 after the tab drew would renumber every later question under the reader; the review
  caught it. Count the query in `isPending`, no retry, no refetch while open.
- **Decide comparisons on what the reader sees** (unit A): a rule that compares raw decimals while the
  page shows rounded, clamped numerals can say "one level apart" beside two identical numerals.
- **Our translation is not the source's words** (unit A): quote USGS's English term; leave the Spanish
  unquoted, and say in the caption that it is the page's translation.

### Local leftovers

Still to remove (the agent's permission check refused it, 2026-09-25): the worktrees and branches of
the merged #56 and #57, `.claude/worktrees/external-products` and `.claude/worktrees/hillshade`, both
clean.

Cleaned on 2026-09-24: the `slab-section` worktree and the branches of #50–#54 and the demo were
removed after `git cherry` showed every commit already on `main`. The one stash on main ("stale
local copy of .claude/reports") predates this work and was left alone.

### Next: the remaining work as PR-sized units (scoped 2026-09-24)

Each unit is one PR from `main` unless it says otherwise. Size: S ≈ one short session, M ≈ one
full session, L ≈ more than one. "Gate" is what has to be true before it merges; every gate also
includes the four checks and `/code-review`.

```
C                                (PR #57, open; done once merged)
S ─► A ─► D                      (A = PR #59, open; D's wording drafted, awaiting the owner)
E0 ─► E1 ─► owner review ─► E2   (E0 = PR #58, open; E1 next on the owner's say)
```

The owner chose the planned order (2026-09-24): C, then S → A → D, then E. E0/E1 depend only on
Part B, so they can be pulled forward at any time, but only on the owner's say (the owner is keen
on the 3D).

#### C. Hillshade on the monitor's map (S) — PR #57, see "Done: unit C" above

- `event-map.tsx`: a `raster-dem` source and a `hillshade` layer under the labels and the dots.
  **Verify first**: Mapterhorn's tile URL template, encoding, max zoom and attribution text (the
  plan's are from the research pass). AWS Terrain Tiles is the fallback.
- `public/_headers`: the tile host in `img-src` and `connect-src`; update the CSP comment's
  "verified" date and list.
- Tune exaggeration and opacity, never the dots' colours, until depth colours read in both themes.
- **Gate**: before/after screenshots of `/` and `/tolima`, both themes; Lighthouse on `/` shows no
  regression beyond the tiles themselves (the map is deferred, per `docs/performance.md`).

#### S. The external-products store (M–L) — PR #56, see "Done: unit S" above

Design as in "Shared piece" below. Pre-checks, in the PR description:

- `pnpm exec wrangler` shows how many cron triggers the account uses (free plan: 5 per account).
- The current file names in `us6000tjl2`'s products: DYFI's 10 km file, PAGER `cities.json`, OAF
  `forecast.json`, and OAF's validity field. Captured once into `test/fixtures/usgs-*`.

Contents: migration (`external_products`), the second cron branched on `controller.cron`, the
matcher (one / zero / several candidates, tested), the fetch-if-URL-changed logic, digests for
DYFI + PAGER (Part A's numbers) **and** the OAF (Part D's), `GET /api/context?zone=`, logging.
Storing the forecast digest now costs one more subrequest and saves a second migration; nothing
shows it until D. **Gate**: CPU under 10 ms in `wrangler dev`, then `pnpm logs cpu` after deploy.

#### A. "¿Cuánto se sintió en Pereira?" (M) — PR #59, see "Done: unit A" above

The questions-tab card from `/api/context`: DYFI cell and responses, PAGER MMI, the total count,
the descriptors, the agree/differ claim rule in `claims.ts`, the SGC "¿Lo sintió?" link, the
fewer-than-N-responses rule (confirm DYFI's threshold). Hidden when the route has nothing. EMSC is
phase 2 (decision 4), not in this PR.

#### D. The USGS aftershock forecast (M, gated)

The box, its claim rules (natural frequencies, count ranges, expiry), the story's one-line link,
and the `docs/science.md` / `docs/ideas.md` changes listed under Part D. **Gate: the owner reviews
the Spanish and English wording before merge.** Write the copy first and hand it over early.

#### E0. The 3D block's data (S) — PR #58, see "Done: unit E0" above

Everything offline and committed, like `section.json`:

- **Slab2**: already on `main` (0.1° grid, lat 3.5–5.3, lon −79 to −74.5, 46 × 19 nodes), which
  covers both zones and Pereira. Reuse it.
- **Terrain lid**: a GEBCO 2020 grid over the same box. At 0.05° that is 91 × 37 = 3,367 points,
  34 Open Topo Data requests at 1 a second, a few kB gzipped. Extend
  `scripts/insights-section.ts` or add `scripts/insights-block.ts`.
- **Rupture plane**: the corners of USGS's finite-fault model for us6000tjl2 from `FFM.geojson`
  (research pass: strike 226°, dip 72°, 150 × 66 km; re-fetch). Public domain, credited "USGS".
- **Events**: none committed; the prototype reads the same `/api/events` data as the story.

#### E1. The 3D prototype (M, branch `prototype/3d`, not merged to main)

A throwaway to answer "does 3D help this reader, on a phone, at an acceptable weight?"

- **Stack**: plain `three` inside one `useEffect`, lazy-imported behind "Explorar en 3D". Not
  `@react-three/fiber` (a second reconciler for one canvas). Events as one `InstancedMesh` coloured
  by depth with the page's existing scale; Slab2 as a translucent surface with the uncertainty as
  a second, fainter one; terrain as the lid; the rupture plane; Pereira and Chaparral as labelled
  pins. `OrbitControls` for drag and pinch.
- **Measure before anything else**: the chunk's gzipped size (`three` tree-shakes poorly; expect
  well over 100 kB and measure it). If it is out of proportion to `/insights`' 364 kB, try a
  smaller WebGL library for comparison before deciding.
- **Phone interaction**: the canvas must not trap the page's scroll. Either it opens full-screen
  from the button, or one finger scrolls and two fingers turn. Try both.
- **Honesty**: vertical exaggeration shown in the view and adjustable (1× default is true to scale
  and will look flat; that may itself be the point); depths that snap to fixed values
  (`commonDepths`) flagged, never jittered; "modelo USGS Slab2" on the surface.
- **Motion and access**: no auto-rotation under `prefers-reduced-motion`; a time slider that
  replays the sequence only on request; a WebGL check that falls back to the 2D cuts; the cuts
  remain the accessible text alternative.
- **Output**: screenshots and a short screen recording (desktop and phone emulation), the chunk
  size, a frame-rate note from the owner's own phone (`pnpm dev --host` on the LAN), and a list of
  what worked and what did not.

#### E2. Decide, then plan (owner) — layout decided: variant D (2026-09-25)

**Engine decided: OGL** (owner, 2026-09-25, after the comparison under "Done: E1": 36 kB gz against
three.js's 158 at equal quality; three.js's extra features — PBR, shadows, model loaders, effects —
are not needed by a static block diagram, and the engine-free `common.ts` keeps a switch back cheap).
The prototype now defaults to OGL (`?engine=three` to compare). Condition: the owner's phone fps
with OGL is no worse than with three.js (not yet measured).

Still open: the phone fps (both engines), where the tab lives (its own tab,
the story's end, or `/insights/3d`), the default exaggeration (the prototype opens at ×2), and whether
the replay earns its place.


With E1's output: keep it or not, where it lives (the story's end, the questions tab, or its own
`/insights/3d`), the default exaggeration, and whether the time replay earns its weight. Then a
separate plan file, as Part E says.

### How to look at the page without touching SGC (what worked on 2026-09-24)

- `pnpm dev --port <p> --strictPort` (run it in the background; it serves the working tree, so
  switching branches switches what it serves).
- Split `test/fixtures/api-events-2026-09-24.json` into one file per zone (its top-level keys are
  `choco` and `tolima`), and write `{"backfill":{"done":1,"total":1},"lastSuccessfulRun":null}` as
  the status body. The local D1 is stale (09-18, before Tolima existed), so stub rather than use it.
- In one `agent-browser --session <name>`, **before the first `open`**:
  `network route '**/api/refresh*' --abort`, and `network route '<pattern>' --body "<json>"` for
  `**/api/status*`, `**/api/events?zone=choco*` and `**/api/events?zone=tolima*`. Then
  `set viewport <w> <h>`, `set media <light|dark> reduced-motion`, `open …/insights`.
  (The commands are `network route` and `set viewport`/`set media`, not `route` or `viewport`.)
- To reach a story step: `eval` a script that finds the `article` whose `h2`/`h3` text matches the
  step's title and calls `scrollIntoView({block:'center'})`, wait ~2 s, then `screenshot`. Put the
  whole loop (themes × widths × steps) in a script file in the scratchpad and run it with `sh`.
- Wait a second after an edit before screenshotting: a shot taken during Vite's hot reload showed
  the old code once.
- `agent-browser --session demo --headed` opens a visible window for the owner; the routes set in
  that session survive `reload`.

## Intent

Five pieces for the reader in Pereira, in this order. Each can ship alone.

| Part | What the reader gets | Where |
| --- | --- | --- |
| A | "¿Cuánto se sintió?": how strongly the M7.4 was felt in Pereira, from USGS and EMSC reports and models, not from an equation we write | `/insights`, questions tab |
| B | The cut view explains what is actually happening underground: the real Nazca plate from USGS Slab2, the terrain on top, and which of the three sources is inside the plate and which is above it | `/insights`, story, "Dos grupos a distinta profundidad" scene and one new scene |
| C | Relief shading on the monitor's map | `/` and `/tolima`, `event-map.tsx` |
| D | USGS's own aftershock forecast for Chocó, relayed and attributed, never computed here | `/insights` |
| E | A 3D view, **prototype first** | later, separate plan once B has shipped |

## Read before starting

- `docs/science.md` in full, especially "No drawn plate", "Do not put a probability of a larger
  event on this tab", "The two coincide in time", and the insights-page simplifications.
  Parts B and D change rules there, and the change goes into that doc in the same PR.
- `docs/frontend.md` "The insights page" (colours, SVG text sizing, no-break spaces before units).
- `docs/security.md` and the CSP in `public/_headers` (Parts C and, if the browser fetches, A/D).
- `docs/ingest.md` "The CPU budget" and the memory of the 2026-09-20 outage: **nothing in this
  plan runs inside the ingest tick.**
- `docs/performance.md`: `/insights` starts at 364 kB; each tab is a lazy chunk. Budget anything
  new against that.

## Shared piece: an external-products store (Parts A and D)

> **Built as unit S (PR #56, 2026-09-24).** Kept as the record of what was intended. Where the build
> differs, the build and `docs/ingest.md` ("The daily USGS job") are right: the DYFI file is
> `dyfi_geo_10km.geojson`; a digest records its SGC mainshock and is deleted when that changes; a
> redirect is a failure; errors are rethrown after the run so the invocation shows as failed; rows
> carry a `digest_version`.

**Recommended: the Worker fetches USGS on its own cron, stores a small digest in D1, and the page
reads it from a same-origin route.** Alternatives and why not:

- *Browser fetches USGS directly.* USGS sends `Access-Control-Allow-Origin: *`, so it works, but
  it widens `connect-src`, ties the page's load to USGS's uptime, and makes every reader download
  the full detail GeoJSON and several product files to show three numbers.
- *Snapshot at build time.* Stale: the forecast updates about weekly and DYFI keeps growing.

Design:

- **A second cron expression** in `wrangler.jsonc`, **once a day** (e.g. `"7 11 * * *"`, off the
  quarter-hours), branched on `controller.cron` in `scheduled()`, so it is **a separate
  invocation with its own 10 ms CPU**, never the ingest's. Once a day is enough: six weeks after
  the M7.4 its felt reports grow slowly, and the forecast is updated about weekly. The free plan allows 5 cron triggers per account: check
  how many the account already uses before adding one.
- **Keep it under 10 ms CPU, not merely "tolerated".** `docs/ingest.md` ("The CPU budget") says
  the ingest ticks already run over 10 ms and survive only because overruns are infrequent. The
  tolerance is per isolate and unpublished, so a second job that also overruns could count
  against the same allowance. Parse only small files, measure the first runs with
  `pnpm logs cpu`, and move any product that does not fit to an offline script.
- **Which USGS event: matched, never pinned** (the mainshock rule in `docs/science.md`). For each
  zone's detected mainshock (`assessMainshock`, state "found" only), one USGS FDSN query:
  `earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=t−60s&endtime=t+60s&latitude=…&longitude=…&maxradiuskm=100&minmagnitude=M−1`.
  Exactly one result → that is the event; zero or several → store nothing and log it. On
  2026-09-24 the M7.4 matched `us6000tjl2`.
- **Fetch per run** (about 4 subrequests): the event detail GeoJSON, then only the product files
  used: PAGER `json/cities.json`, DYFI `cdi_geo_10km` or `dyfi_geo_10km.geojson` (the research
  pass saw the latter; check the name), and OAF `forecast.json`. Product URLs are versioned and
  immutable, so skip a download when the URL has not changed since the last run.
- **Store a digest, not the file**: a D1 table (e.g. `external_products`: zone, kind, source,
  source event id, product URL, source update time, fetched_at, digest JSON). The digest is the
  handful of numbers the page shows (Parts A and D). A new migration in `migrations/`.
- **CPU**: parsing the detail GeoJSON and the DYFI 10 km cells must be measured in `wrangler dev`
  and in production logs. If the DYFI file is too big to parse in budget, keep only the Pereira
  cell by a cheaper route (see A), or move that one product to an offline script.
- **Route**: `GET /api/context?zone=` returning the digests with their source times, under the
  same same-origin check as the other routes (`docs/api.md`). `no-cache`, like every API route.
- **Failure**: USGS down, no match, or a malformed file → the route returns what it had, with its
  age, and the page hides a card rather than showing a guess. Log through `worker/log.ts`.
- **Terms**: USGS products are US public domain; credit "USGS" by name next to every figure.
- **Cost: $0 on the free plan** (limits as recorded in `docs/ingest.md`). One cron run a day with
  about 4 subrequests (50 allowed per run); a few D1 rows written a day against 100,000, and one
  small read per `/insights` load against 5,000,000; one more API request per page load against
  100,000 a day. The only real limit is CPU, above.

## Part A: "¿Cuánto se sintió en Pereira?"

What it says, for the zone's mainshock only in phase 1:

- **Reported shaking in Pereira**: DYFI's intensity for the 10 km cell containing Pereira, with
  its number of responses (2026-09-24: CDI 8 from 41 responses).
- **Modelled shaking in Pereira**: PAGER's MMI for Pereira from `cities.json` (2026-09-24: 8.4).
- **How many people reported it** anywhere: DYFI's total (1,249) and, in phase 2, EMSC's (1,345).
- **Each figure with its words**: the intensity scale's descriptor for that level, in Spanish,
  written once as copy and cited to USGS's published scale. Roman numerals, as USGS writes them.
- **The sources disagree, and the page says so.** EMSC's corrected median near Pereira is 6.4. The
  honest sentence is a rule over the digest: "reports and models agree within one level" or "they
  differ by N levels, because…". It follows the claims pattern: a rule in `src/insights/claims.ts`
  picks a pre-written sentence from `src/insights/copy.ts`. No language model.
- **A cell with fewer than 5 responses is not shown** (DYFI's own practice is to be sparse at low
  counts; confirm its threshold and use it).
- **Placement**: next to the existing distance question and `questions/feel.tsx`, which today
  explain *why* distance matters without predicting shaking. This adds what was *actually
  reported* for one real event, which that rule allows: it predicts nothing.
- **Link to SGC's "¿Lo sintió?" form** (`sismosentido.sgc.gov.co`) so the reader can add their own
  report. SGC's own EMS-98 intensities for the event are the Colombian authority; they are HTML
  with an XLS export and have no API. The owner can check that page once by hand
  (`! curl -sS -D - -o /dev/null <url>`); do not fetch it from the Worker without that check.

Phase 2 (separate PR): the same for each M ≥ 4 event with a USGS DYFI or an EMSC felt count (the
2026-09-24 pass found 2 of 11 Chaparral events with DYFI, and EMSC felt counts of 0–44). EMSC
needs its id-conversion call (`seismicportal.eu/eventid/api/convert`, no CORS, server only) and
`testimonies-ws/api/search`, CC BY 4.0, credited "EMSC/CSEM".

Not in this plan: turning M, distance and depth into intensity for events USGS never modelled.
That still needs a published equation (the research pass named slab GMPEs plus the Worden 2012
GMICE, the same logic tree USGS used for this event), computed offline in OpenQuake and shipped as
a table. It is its own plan, and would be validated against Part A's figures.

## Part B: the cut view: what is actually happening underground

> **Done (PRs #50, #52, #54, 2026-09-24).** Kept as the record of what was intended. Where the build
> differs, the build and `docs/science.md` are right: two cuts at one scale with a locator each; the
> plate's motion from GPS (not schematic), cited on the page; the Caldas tear and the Panamá–Chocó
> block checked and left off; "Istmina above the plate" stated by the plate rule, not "squeezed".

Today the story's section scene (`src/insights/story/graphic.tsx`) is a west–east cut through
Chocó, true to scale, events only, with the Nazca plate in words; "No drawn plate" in
`docs/science.md` exists because an invented band was tried and dropped. Slab2 replaces the
invention with data.

### Data, built offline

- **Slab2**, South America model (Hayes 2018, doi:10.5066/F7PV6JNV, public domain), grids
  `sam_slab2_dep`, `_thk` and `_unc` (depth of the plate's top, its thickness, its uncertainty).
  ScienceBase refused scripted downloads; the owner downloads the files by hand once.
- **Terrain and sea floor**: a DEM sampled along the cut line. Land from Mapterhorn or AWS
  Terrain Tiles (both free, Terrarium encoding); sea floor from GEBCO if the cut reaches the
  Pacific.
- **A script** `scripts/insights-section.ts`, like `scripts/insights-region.ts`: samples all three
  along the section line every ~2 km, writes a small committed JSON (`src/insights/section.json`,
  a few kB), and states its sources and licences in its header comment. Run by hand; the output is
  committed.

### The drawing

- **Plate top** as a line, **plate bottom** from its thickness, **uncertainty** as a lighter band.
  Label it "placa de Nazca (modelo USGS Slab2)". The drawing is scientific data only if it says
  whose model it is.
- **Terrain** as the top edge. The scene's copy says "sin exagerar la escala", and it stays true to
  scale: the cordilleras are 3–4 km against a 120–140 km section, so the relief is a thin, honest
  edge. If an inset exaggerates it, that inset says by how much.
- **Where each source sits against the plate**, as measured by the script and to be re-checked
  against the final grid: the research pass read the plate top at about 90 km under the mainshock
  (hypocentre 103–108 km, so **inside** the plate), about 64 km under Istmina (the ~40 km group is
  **above** it, in the overriding plate), and about 174 km under Chaparral (12–25 km, **in the
  crust**, nowhere near the plate). Each of those becomes a claim with a rule and a margin of
  the Slab2 uncertainty at that point: "inside", "above" or "too close to call", never a bare
  statement.
- **Two cuts, one per zone, both straight west–east** (see Decisions, 3):
  - **Chocó's cut**, at the sequence's latitude (~4.5–4.9° N), widened from today's to start at the
    trench off the Pacific coast and to end past Pereira: the plate going down under the coast, the
    M7.4 inside it, Istmina above it, Pereira on the surface.
  - **Chaparral's cut**, at the swarm's latitude (~3.8–3.9° N), from the same trench to past the
    swarm: the plate far below, the swarm in the crust near the surface. It belongs in the story's
    Chaparral scene (`TolimaScene`). Pereira is not on this cut; if the drawing names it at all, it
    says Pereira is ~100 km to the north. Surface places along it (Buenaventura, on the coast, should
    be near that latitude; unchecked) come from DIVIPOLA centroids, checked, not assumed.
  - **Both at the same scale and depth range**, so the reader can compare them by eye: how far the
    plate is below each source is the whole point, and two scales would hide it.
  - Each cut shows only its own zone's events. A small locator map beside each shows where the
    slice runs.
- **Arrows showing the plates' motion are schematic** and labelled as such, or they come from a
  published GPS velocity with its citation (look one up; do not write a rate from memory).

### The explanation (copy outline, Spanish first)

It is not two plates crashing head-on. The three sources are three different things:

1. **The plate sinks, it does not crash.** The Nazca plate, heavy ocean floor, slides under
   South America at the trench off the Pacific coast and keeps sinking into the mantle, a few
   centimetres a year.
2. **The M7.4 broke the sinking plate itself**, about 100 km down: the plate cracks as it bends
   and is pulled down. That is why it was so deep and felt so widely, and why its aftershocks
   deep down faded like a textbook sequence.
3. **The Istmina–Sipí group is above the plate**, in the rock of South America, which the
   plate's push squeezes. Why it keeps going is one of the things "Lo que nadie sabe todavía"
   already says nobody knows.
4. **Chaparral is in the shallow crust**, about 150 km farther from the plate than the M7.4, on
   faults in the Central Cordillera. It is a different kind of activity; the SGC hypothesis that
   the M7.4 helped trigger it stays SGC's, as `docs/science.md` requires.

Regional details to verify before any is used, all written here from memory: the Panamá–Chocó
block's collision with northwestern South America, the tear in the subducting plate near 5° N
(the "Caldas tear", Vargas & Mann 2013, BSSA), and the convergence rate.

### Rule changes to `docs/science.md`

- "No drawn plate" becomes: the plate is drawn **only** from Slab2, with its uncertainty, and
  labelled as a model; nothing about it is drawn by hand.
- Add the inside/above/too-close rule and its margin.

## Part C: relief on the monitor's map

- A MapLibre `raster-dem` source from Mapterhorn (Terrarium, 512 px WebP, attribution
  "© Mapterhorn") with a `hillshade` layer inserted **under** the OpenFreeMap labels and the event
  dots. Flat map, no tilt: tilting is Part E's job, and MapLibre cannot draw dots below the ground.
- **CSP**: add Mapterhorn's tile host to `img-src` and `connect-src` in `public/_headers`, then
  re-check the map in both themes, as that file's comment asks.
- **Readability**: the depth-coloured dots must stay distinguishable over the shading in light
  and dark mode; check with `agent-browser` screenshots, and turn the hillshade's exaggeration
  and opacity down rather than recolouring the dots.
- **Cost**: tiles load only once the deferred map mounts (`docs/performance.md`). Mapterhorn lists
  no usage limits or SLA; AWS Terrain Tiles is the fallback.
- The insights maps are SVG, not MapLibre. Relief there would be a pre-rendered image made by the
  Part B script. Optional; skip unless the story reads flat without it.

## Part D: the USGS aftershock forecast

USGS publishes a reviewed Operational Aftershock Forecast (OAF) for `us6000tjl2`. It uses an ETAS
model on USGS's own catalogue (ComCat), at M ≥ 4.45 within 125 km. The research pass saw it
updated 2026-09-21, with the next update about 09-28. Its 2026-09-24 figures: P(M ≥ 5) 2.7% in a
day, 14.8% in a week, 43% in a month, 89% in a year; P(M ≥ 6) 6.1% in a month, 26% in a year. It
also gives median expected counts and 95% ranges for M3 to M7. **Re-fetch all of these.**

### Why it is on the page (owner, 2026-09-24)

What the reader in Pereira most wants to know is "is another big one coming?", and today the page
can only say nobody knows. A reviewed, official answer with its uncertainty is more honest than
that. The page **relays USGS's forecast; it never computes one.** The requirement in
`docs/ideas.md` that the researcher check the method applies to a forecast built here, whose
method would be ours. This one's method is USGS's: peer-reviewed, operational, reviewed by a USGS
seismologist at each update and published for the public. **The gate is the owner's review of
the Spanish and English wording**, not a researcher. Building our own forecast stays out of
scope.

### The rules

1. **Attributed every time.** "Según el USGS (Servicio Geológico de EE. UU.)", with the date it
   was issued and the date of its next update, taken from `forecast.json`. **Hidden once it
   expires**: use the validity window the file gives (check the field). *Checked 2026-09-24:
   `expireTime` is a year after issue, so it cannot serve; use `nextForecastTime` (the digest's
   `nextUpdateAt`) with the 14-day fallback below.* With no window given,
   hide it once it is older than 14 days, which is two missed weekly updates. A stale probability
   is worse than none.
2. **Separate from the page's own figures.** "Estas cifras no son un pronóstico" stays true for
   the b-value and everything else computed here. The forecast lives in its own clearly labelled
   box ("El USGS publica este pronóstico"), and nothing of ours is drawn inside it.
3. **Natural frequencies beside percentages, with the range.** "Alrededor de 1 en 7 en la próxima
   semana" next to 15%, and the most likely count with its 95% range as USGS gives it (a median
   of 0 is said as "lo más probable es que no haya ninguno"). The rounding and the phrase for
   each band are claim rules in `src/insights/claims.ts` with tests, so the words never say more
   than the number.
4. **A magnitude at the source is not shaking in Pereira.** Next to the number, one plain
   sentence says that an M5 over 100 km away and deep underground is not strong shaking here. Point
   to Part A for what the M7.4 actually felt like in Pereira. Do not invent an intensity for a
   hypothetical M5; that needs the offline equation this plan leaves out.
5. **SGC is the authority for Colombia.** The box points to SGC for official information and for
   what to do. It gives no safety advice of its own.
6. **Chocó only, and never away from its context.** Nothing on the Tolima tab: USGS publishes
   nothing for the Chaparral swarm, and the rule in `docs/science.md` that Tolima gets no
   probability of a larger event stands. The forecast also never appears in share previews,
   notifications, the status bar or the MCP server, so the number never travels without its
   caveats.

### The limitations the box states

- **One region, two groups.** USGS's 125 km circle takes in the deep group, which has faded, and
  the Istmina group, which is still active. The forecast answers "an M5 or larger somewhere in this
  area". It must not suggest which group the next one comes from.
- **Different b.** USGS's model uses b = 1.0 on M ≥ 4.45; the page's b is about 0.75 over
  M ≥ 2.3. Both are right for what they measure. One sentence, for the reader who compares them.
- **Its catalogue is not SGC's.** It counts USGS's events (M ≥ 4.45), which is why its figures
  cannot be checked against the page's own counts.

### Where it goes

On `/insights`: the questions tab, as its own question ("¿Puede venir otro grande?"), and the story's
"Lo que nadie sabe todavía" scene, which today says only that nobody knows, gets one line
linking to it. Nothing on the monitor.

### Docs to change in the same PR

- `docs/science.md`: a new rule, "the page relays USGS's forecast and computes none", with the
  six rules above; and the "not a forecast" wording scoped to the page's own figures.
- `docs/ideas.md`: the "Will one be felt soon?" entry updated to say the forecast half is done by
  relaying USGS, and the felt-intensity half is still open.

## Part E: 3D (later)

The catalogue has latitude, longitude, depth, magnitude and time for every event, which is
exactly what a 3D view needs. Add Slab2 as a surface, the terrain as a lid, USGS's finite-fault
rupture plane (strike 226°, dip 72°, 150 × 66 km, from `FFM.geojson`), Pereira and Chaparral. The
reader drags to turn the block and a time slider replays the sequence.

- **Tool: three.js for real 3D; D3 stays for everything 2D.** D3 has no 3D renderer; faking it in
  SVG means re-rendering ~1,300 circles on every drag frame, which the phones this page is tuned for
  would not keep up with. deck.gl only if the 3D has to sit on the real basemap; a block diagram
  does not need one.
- **Lazy and optional**: its own chunk behind an "Explorar en 3D" button, never loaded by the
  story; a WebGL check with the 2D cut as the fallback; `prefers-reduced-motion` stops any
  auto-rotation. Measure the chunk before committing to it.
- **Honesty**: vertical exaggeration labelled; depth errors shown (the catalogue's depths also
  "snap to steps", `commonDepths`, which a 3D view makes look like real layers).
- **Prototype first** (branch `prototype/3d`, like `prototype/explainer`), and look at it on a
  phone before planning it properly. Worth doing after B, since it reuses B's data.

## Order of work

(The current state is in "Progress" at the top.)

1. **Done:** Part B, both cuts, the plate, its motion and the copy (PRs #50, #52, #54).
2. **Done:** Part C hillshade (PR #57, merged).
3. **Done:** the external-products store (unit S, PR #56, merged). **Done, awaiting merge:** Part A
   (PR #59).
4. Part D, once the owner has reviewed its wording.
5. Part E: E0 data (**done, PR #58**), E1 prototype, then the owner's decision (E2).

## Checks

- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` on every PR.
- Tests against captured fixtures, never live USGS: save one detail GeoJSON, one `cities.json`,
  one DYFI file and one `forecast.json` under `test/fixtures/`, and test the matcher (one, zero and
  several candidates), the digest, and each claim rule's cases. Recompute the figures the tests pin
  independently in Python, as the rest of the repo does.
- `agent-browser` screenshots of every changed scene at 320, 375 and desktop widths, in both
  themes and both languages.
- Lighthouse on `/insights` before and after, per `docs/performance.md`.
- Production logs for the new cron's CPU time after the first deploy.

## Decisions (owner, 2026-09-24)

1. **Part D, the USGS forecast: in, relayed and never computed.** Briefly dropped the same day
   for want of a researcher, then reinstated: the method is USGS's, reviewed by USGS, so the gate
   is the owner's review of the wording (see Part D, "Why it is on the page").
2. **The store: the Worker cron plus D1**, on condition that it costs nothing. It does, as set out
   under "Cost" above; CPU is the one limit to watch.
3. **Part B: two straight cuts, one per zone**, at the same scale (owner, 2026-09-24). Chosen
   over a single cut bent at Pereira, and over projecting Chaparral onto Chocó's cut: Chaparral is
   almost due south of Pereira (~100 km), so a projection would draw the swarm directly under
   Pereira, which is false and alarming.
4. **Part A phase 2 (felt reports for every M ≥ 4 event): later.** Ship the M7.4 first, then
   count how many recent events have enough reports to show (the research pass found USGS
   reports for 2 of 11 Chaparral M4 events). Confirmed by the owner.
5. **Part B, the M7.4 against the plate: the strict rule, plus USGS's own words** (owner,
   2026-09-24). On Slab2 alone the M7.4 is "too close to call". The page keeps the rule's answer
   and quotes USGS's tectonic summary for us6000tjl2 ("likely occurred within the subducting Nazca
   plate", "due to its depth"), attributed and linked. The quote shows only while the detected
   mainshock is SGC2026pqqmro. Rejected alternatives: the strict rule alone, and narrowing the
   margin to reach "inside". The margin adds the source's depth error to Slab2's uncertainty, a
   refinement over "a margin of the Slab2 uncertainty" in Part B below. USGS also calls the
   rupture "primarily strike-slip", so the copy outline's point 2 ("cracks as it bends") was
   softened to USGS's general "bending forces" wording.
6. **Order after Part B: as planned** (owner, 2026-09-24): C, then the store, A and D, then E,
   although the owner looks forward to the 3D most. Pull E forward only when the owner says so.
7. **The plate's arrow is explained by the plate's own label, not a tooltip** (owner review of
   #54, 2026-09-24). The locator map names its line and Pereira.
8. **`/code-review` runs on every PR before it is handed over, and Spanish copy goes through
   `/better-writing`** (owner, 2026-09-24).
