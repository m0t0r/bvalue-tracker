# The page

## The page's scope

**One module owns what the page is narrowed to, and everything read off it**
(`src/lib/scope.ts`, architecture review candidate 03, 2026-09-19). A `Scope` is the filters form,
the depth group and the b card's magnitude tab; `pageView(events, scope, now)` derives the whole
page from it and is a plain function, so a test runs exactly what the page runs. `useScope` adds
only React — the state, three memo layers, the deferred copies and the two control objects the
groups card and the b card take. `App.tsx` is layout.

- **The rule it exists for: every fit the page shows is above the Mc of the whole filtered
  catalogue.** Narrowing to a depth group or to one magnitude type changes which events are counted
  and nothing else. `computeClusterStats` keeps the group half; `measure` keeps the magnitude half,
  which before this lived as one argument inside a component body — swap `clusters.all.mc` there for
  the reader's own `filters.mc` and one tab silently fits its own distribution. `pageView` is where
  that is now tested, across every group × tab combination.
  - The fixture in `src/lib/scope.test.ts` is **synthetic on purpose**. On the real catalogue every
    Mc estimate lands on 2.3, so the mistake passes unnoticed; that catalogue peaks at M2.4 while
    the commonest magnitude type and the deep group each peak at M2.0, and the swap reads as a
    different number. Reinstating the swap was checked to fail it.
- **Mc moves the figures and never the selection**, so the derivation is layered and each layer is
  given exactly the part of the scope it may read. `applyFilters` takes `EventFilters`, which has no
  `mc` field at all — the guard is in the type, not in a `mc: null` argument at the call site as it
  used to be. `selectBase` is keyed on the filters, `selectShown` on the group, `measure` on the
  rest. So dragging the Mc slider rebuilds no array, and choosing a group leaves `base` — the two
  daily strips in the groups card — untouched. Checked in a browser: after four steps of the Mc
  slider the MapLibre canvas and the table's first row are the same DOM nodes.
- The `page` vitest project runs on `happy-dom` with `@testing-library/react`, for that one seam.
  Everything else it holds is a pure function; do not reach for a renderer where `pageView` will do.

## Events per day

**One module counts events per Colombian day, and both charts that draw them ask it**
(`src/lib/daily-counts.ts`, architecture review candidate 06, 2026-09-19). `dailyCounts(events)`
returns one record per day — `start`, `shallow`, `deep`, `total` — plus two maxima. The stacked
"eventos por día" bars under "Magnitud en el tiempo" and the two per-group strips in the groups
card had each written their own version, and they disagreed. Do not add a third: `grep dayStart`
should only ever reach `format.ts` and this module.

- **It returns a flat array of days, not `from`/`to`/a day count.** Each day carries its own
  `start`, so the range is read off the array. An empty catalogue therefore has no range to
  misreport — the groups card's end labels used to compute theirs from a `from` of 0 and render
  "1 ene 1970". That path is dead today (`App.tsx` renders the card only when `base` is non-empty),
  and the guard in `DailyStrip` is what keeps it dead.
- **There are two named maxima, and which one a chart uses is a claim about its scale.**
  `maxTotal` is the busiest day's total and is the stacked bars' y axis; `maxCluster` is the most
  any one cluster had on a day and is the scale the two strips **share**, which is the whole point
  of the strips — one group going quiet while the other carries on has to be visible without
  reading a number. The review's finding was that the two implementations disagreed about what a
  single `max` meant. Do not collapse them back into one.
- **It assumes nothing about the order events arrive in.** It scans for its range rather than
  reading `events[0]` and `events[last]`, which is what `magnitude-time` used to do. One extra pass
  over ~800 events, and nothing breaks quietly if `/api/events` ever loses its `ORDER BY time`.
- **An event whose `time` cannot be parsed is left out, not thrown on.** It runs inside a render,
  there is no error boundary in `src/`, and the D1 read path is deliberately outside the admission
  gate (see [Security decisions](security.md)), so one bad row must cost
  that event and not the dashboard. Both implementations it replaced dropped such an event
  silently; a bare `days[i]!` would have turned that into a white screen. Tests pin it.
- It takes a structural type rather than `StoredEvent`, and imports nothing with JSX or the `@`
  alias, so `test/` (the Node project) can hand it parsed fixture events — the same shape, and for
  the same reason, as `src/lib/format.ts`. Its tests are mutation-checked; the figures in them were
  counted independently in Python from the same 786 events.

## Zones

**One tab per zone, and only the chosen zone's page exists** (`App.tsx`, `src/lib/zone.tsx`).
Each panel is a `ZonePage` with its own queries (`["events", zone]`, `["status", zone]`), its own
scope and its own status bar; Radix mounts only the active panel, so switching throws the other
zone's filters away rather than carrying Chocó's "desde el 10 de agosto" into a swarm that began on
the 20th of September. Each zone starts from `defaultFilters(zone)`, and the scope bar compares against
those, so an untouched tab shows no chips on either side.

- **Each zone is its own page: `/` is Tolima, `/choco` is Chocó** (`core/zone-pages.ts`). The
  link is shared person to person, mostly on WhatsApp, and a messenger's preview is read from the
  `<head>` by a crawler that runs no JavaScript. With the zone in a query parameter there was one
  `index.html`, and a Tolima link previewed as "Secuencia sísmica del Chocó" (2026-09-23).
  - `index.html` is the home zone's page (`HOME_ZONE`) and the template. The build (`zonePages` in
    `vite.config.ts`) copies the finished file once per other zone with that zone's `<title>`,
    description and `og:*` swapped in, and the asset layer serves `choco.html` at `/choco` — no Worker, so
    `public/_headers` covers it like the rest of the page. `withZoneMeta` throws if a tag is
    missing or doubled, so a drifted template fails the build rather than shipping the wrong zone's
    preview. The Spanish copy is `SHARE_META`; a test holds its titles to the tabs' `docTitle`.
  - **The bare URL is the zone where the activity is** (`HOME_ZONE`): Chocó until 2026-09-25, then
    Tolima. The home zone's copy lives in `index.html` itself, and a test holds it to `SHARE_META`,
    so moving the home means rewriting those tags too. The old home's path was not kept: `/tolima`
    answers 404 since the swap (owner's call), and the query-parameter form the zone had for its
    first day is not read at all. The API is unaffected: a request that names no zone is still
    Chocó's (`DEFAULT_ZONE`).
  - Switching tabs moves to the other path without a reload, and the back button undoes it
    (`pushState`, `popstate`). Paths are zone names; anything else in code or URLs is English.
- **The tabs are named by department, "Tolima | Chocó"**, as SGC's daily bulletin names the pair,
  in the order of `ZONE_IDS`: the home zone first (Chocó led until 2026-09-25).
  The Tolima tab's heading names the locality, "Enjambre sísmico de Chaparral (Tolima)", because
  its box covers only the swarm and "Tolima" alone would claim the whole department.
- **The tabs sit in the header's top row with three controls**: the link to `/insights` ("¿Qué está
  pasando?", with a lightbulb), the language and the theme. The title and subtitle underneath are the
  zone's own. On a phone the controls wrap under the tabs rather than squeezing them; at 375 px they
  share one row, which is why the link shows only its icon below `sm` (its words stay its name), and
  why the language button says "EN" / "ES" rather than the language's name (owner's call,
  2026-09-24). The button's accessible name is "EN (English)": the full name for a screen reader, with
  the visible code kept in it so a voice command for what is on screen still finds it.
- **What is a Chocó finding stays on Chocó's tab**: the depth-groups card and the magnitude chart's
  group legend and tooltip line (`depthClusters` in `core/zones.ts`). The copy that differs lives in
  `t.zones[zone]` — title, subtitle, back-fill text and the caveats — and the update interval is a
  number from `worker/plan.ts` (`updateEveryMin`), never written into a string.
- **The mainshock is detected, on every tab alike** (`view.mainshock` from `pageView`, over the
  whole catalogue the page holds — never the filtered view; [the rule](science.md#the-mainshock-detected-from-the-catalogue-never-pinned-from-2026-09-24)).
  The map's ring and its legend sentence (`mapRing`), the star, the marker on "Valor b en el
  tiempo", "Excluir sismo principal" and its chip all appear only while one is found; the caveats
  take the state as an argument (`caveats(state)`).
  - **"Sismo principal" is the status bar's fourth stat, always shown** (`MainshockStat` in
    `status-bar.tsx`): "M7.4 (Mw)" linked to SGC's page for it, with the day and the gap under it;
    "automático, en revisión" while it waits; "Ninguno claro · el mayor, solo 0.3 por encima del
    siguiente" for a swarm. Chosen over a notice that appears only when the copy is out of date, and
    over a line under the title, from three variants tried on the real page (2026-09-24). A reading
    that is always there says "none clear" as a
    finding rather than leaving it to an absence, and needs no notion of the copy being "wrong".
  - On a 375×812 phone it takes the status bar a line taller and the b-value still ends inside the
    first screen, by 2 px (810 of 812; 722 without it). On 375×667 the b-value was already below the
    fold. Anything added to the status bar now costs the b-value its place on that phone.
- **A young catalogue changes the charts' time axes.** The magnitude chart labels every day when
  the whole range is two weeks or less (weekly, the swarm had one label), and "Valor b en el
  tiempo" adds the hour when its windows span under four days (a date alone repeated).
  Its magnitude axis tops out per zone, M8 for Chocó and M6 for Chaparral, and grows past that
  only for an event that needs it.

## The insights page

**`/insights` is a second page with its own HTML file and its own bundle** (`insights.html`,
`src/insights/main.tsx`; the `client` entry in `vite.config.ts`). It explains the zones in plain
words for a reader in Pereira (the rules for what it may say are in
[the science](science.md#the-insights-page-insights-from-2026-09-24)). D3's maths modules
(`d3-geo`, `d3-scale`, `d3-shape`, `d3-array`) load only there, and the monitor's Recharts and
MapLibre never do; React renders the SVG, so there is no `d3-selection`.

- **The route.** The asset layer serves `insights.html` at `/insights` in production. In dev the
  Cloudflare plugin would hand that path to the Worker, which answers 404 (the same trap as the zone
  pages), so `insightsPage` in `vite.config.ts` serves it first. The monitor's header links to it,
  and it links back.
- **Three tabs, "La historia", "Preguntas" and "En 3D"**, in the query string (`?tab=questions`,
  `?tab=3d`; the story is the bare URL). Switching replaces the history entry rather than pushing
  one: back leaves the page. Each tab is its own lazy chunk (`src/insights/story`,
  `src/insights/questions`, `src/insights/block3d`), so the shell and the data arrive first.
- **Live data, kept current like the monitor.** `useInsights` reads `/api/events` for both zones under
  `["events", zone]`, and computes every claim with `insights()` over them and a clock rounded to
  the minute. Status is polled every minute and on returning to the tab, and a zone's events are
  refetched when its last ingest changes, the monitor's own rule, so a page left open does not keep
  counting "the last 7 days" over a catalogue that stopped growing. The two pages are separate
  documents and share no cache. Status also drives the warning while either zone's history is
  incomplete (`backfill.done < total`); the page never starts the back-fill, which is the monitor's,
  so nothing on it can reach SGC.
- **Copy.** The shell and every data-dependent sentence live in `src/insights/copy.ts`; each is a
  function of a claim's result, so the words cannot say more than the rule decided. Each tab keeps its
  long-form prose in its own `copy.ts`. Language and theme are the monitor's (`useI18n`, `theme.ts`),
  so a choice made on one page holds on the other.
- **Colours.** Chocó's groups keep the monitor's blue and teal and the mainshock its orange. The
  Chaparral swarm is `--chart-5`, a violet chosen by search against all four under simulated colour
  blindness (the numbers are in `index.css`). **Pereira is red, `--place`** (owner's call,
  2026-09-24): in `foreground` it read as black beside Chaparral's near-black violet. It is its own
  token, not `--destructive`, because it marks a place and not a failure, and the two never share a
  screen (the load error replaces every drawing). It is a darker red than `--destructive`, which at
  its own lightness is 0.036 from the mainshock orange for a deuteranope; `--place` is ≥ 0.109 from
  every chart colour under all three simulations. Its label stays in the text colour: dark mode's red
  is 3.3:1 on a card, enough for a mark, not for text.
  - **Text on a source's colour is chosen per tint, not left to `foreground`.** The story's calendar
    tiles are a source colour at 40, 65 or 90 % (`TILE_TEXT` in `story/scenes.tsx`): black on
    Chaparral's violet measured 1.72:1, white on the dark-mode teal 1.80:1. A label on a map names its
    source with a dot of the colour and keeps its words in `foreground`, as the prose does
    (`SourceName`): the blue is 4.42:1 as text in light mode and the violet 3.87:1 in dark.
  - The mainshock is a star wherever it is drawn, in the prose too (`MainName`); a diamond is any
    M ≥ 4 event, and on the questions tab those are `foreground`, not the mainshock's orange.
- **Figures and their units never part at a line break.** `fmtKm`, `fmtPct` and every "N km" written
  into the copy put a no-break space (U+00A0) before the unit: a thin space broke "~120 / km" at
  320 px. Not the narrow one (U+202F): in Geist it reads as no space at all in a 30 px figure. That
  one groups thousands ("125 893"), where the digits are meant to sit close.
- **SVG text is sized in screen pixels.** A drawing that scales with its column (the questions tab's
  map, `viewBox` 400) multiplies its font sizes by viewBox units per pixel; in viewBox units alone
  its town names were 7 px on a 320 px phone.
- **"¿Qué tan fuerte se sintió?" is question 2** (`questions/shaking.tsx`, 2026-09-25), right after
  the distance question it answers for one real event. It appears only when `feltInPereira` has a
  figure (see [the science](science.md#the-insights-page-insights-from-2026-09-24)), so it is in the
  index or not at all. **Because a question can appear or not, the page waits for `/api/context`**:
  `useInsights` asks for it beside the catalogues and counts it in `isPending`, with no retry. A late
  answer or a retried 5xx would have inserted a question above the reader and renumbered the rest
  (code review, 2026-09-25). **Whether question 2 exists is decided by the first settled answer, for
  good** (`keepFeltFromFirst` in `context-refresh.ts`): a later answer, fetched to keep the forecast
  current (see its bullet below), may update USGS's felt figures but never adds or removes one, so no
  refetch renumbers the questions. After a failed first load the page never asks again while open.
  The first answer is kept with React's set-during-render pattern, not an effect, so no extra commit
  (and no second skeleton frame) follows it. It is a few hundred bytes and goes
  out with the much larger catalogues, so the wait costs nothing measurable; a failure settles at
  once and only hides the question, never the page's load error.
  - The readings sit side by side in a `Figure` (stacked on a phone), each a large numeral with the
    perceived-shaking term beside it. A reading USGS has not published has no tile; one hidden by the
    fewer-than-5 rule keeps its tile with a dash and the reason, because there USGS does have
    reports and the reader should know why they are not shown.
- **Story step 2 draws squares true to energy, one per row, largest first** (`Ranks` in
  `story/scenes.tsx`, `rankLayout` in `history.ts`, 2026-09-25): the M7.4 in the mainshock's orange,
  past earthquakes in `muted-foreground`. Squares are right-aligned so each label sits beside its own
  square; left-aligned, the small ones' labels floated ~250 px from them. A row is never shorter than
  its two lines of text, and the labels step down a pixel at a time (to 9 px) until every row fits:
  at 320 × 640 the second part's nine rows did not fit at 11 px and the drawing came out empty. The
  drawing's title names the M7.4 ("frente al M7.4"), because every row's ratio is against it. The
  text alternative lists every row with its label. Both layouts, the first part's and the second's,
  stay mounted so the step change cross-fades; drawing only the active one was suggested in review
  and declined, since the two fits cost well under a millisecond.
- **USGS's forecast is a box inside "¿Viene uno más grande?"**, not a question of its own
  (`questions/forecast.tsx`, 2026-09-25; the rules are in
  [the science](science.md#the-insights-page-insights-from-2026-09-24)). The draft wording had it as a
  new question, "¿Puede venir otro grande?", beside the existing one; two questions that close in the
  index, one right after the other opening "Nadie puede predecir…", read as a duplicate, so the owner
  chose one question: its "nadie lo sabe" and SGC's position first, then a one-paragraph bridge
  ("Lo que sí existe es un pronóstico de probabilidades…"), the box, and "Lo que sí sirve" after it.
  Without a fresh reviewed forecast the question is exactly as it was. The box is a `section` headed
  by an `h4`, one `h5` per window and a `dl` of the rows; a large percentage figure was left out on
  purpose, so the number is never read without its sentence. Its content arrives with
  `/api/context`, which the page already waits for, so it never appears under the reader on load. It
  can leave under one: on a page left open across USGS's next update it is dropped then, the
  science's staleness rule winning over layout (at most once a week). **The page then picks up the
  next forecast on its own** (`context-refresh.ts`, tested): `refetchOnWindowFocus` and
  `refetchOnReconnect` are a function, `contextRecheckDue`, over the answer and the last attempt, and
  `staleTime` stays `Infinity` so nothing else refetches. A return to the tab asks again only once
  the daily job has run since the forecast was due and since the page's last answer (its schedule is
  `core/products.ts`, shared with the Worker), so the gap before the job, up to about 19 hours, sends
  nothing; after a failed attempt, 10 minutes before the next; for two days past the due time at
  most. Never with no forecast stored, and never after a failed first load. A failed refetch keeps
  what the page has. The box coming or going on a return to the tab can move what is below it, once
  a week at most; that is the price of a page that stays current without a reload, and browsers with
  scroll anchoring keep the reader's line in place. The first version used a `staleTime` function and
  looked right in unit tests, but TanStack counts `staleTime` from the fetch, and a query with no data
  is always stale, so it neither refetched when due nor stayed quiet after a failed load; a browser
  check and the code review caught both. **Checked in a browser on 2026-09-25** (with the recheck then
  due at the forecast's due time; agent-browser cannot move the clock to a job run, so the job-timed
  version rests on its unit tests): with a forecast due two minutes after load, the box left at the
  due time and, on the next return to the tab, came back with the newer figures while question 2
  stayed although the newer answer had no felt data; with `/api/context` failing on load, a return to
  the tab sent no request. `useInsights` decides the
  forecast once (`forecast`) for both tabs. The story's pointer is a sentence naming the question and the tab, not
  a hyperlink: a `?tab=` link reloads the page, and the hash would be read before the question
  exists. A test holds the sentence to both names, so renaming either breaks it.
- **Back to top is a round button that appears only near the end of a tab** (`back-to-top.tsx`,
  2026-09-24). One `IntersectionObserver` on the footer shows it within half a window of it, so it is
  never over the text during the read; on a phone the story's drawing already takes the top half of
  the window. It is `Button` `floating` / `icon-round`: the primary colour, so black with a white
  arrow in light mode and inverted in dark, where black would vanish; opaque on hover (`default`
  goes to 80 % there and lets the text through). On hover the arrow leaves through the top of the
  circle and a second rises in behind it. It arrives in 220 ms and leaves in 150 ms (`.rise` in
  `index.css`); reduced motion drops the movement and the smooth scroll. Hidden, it is `inert`.
  Pressed, it moves focus to the selected tab before scrolling, so a keyboard reader lands where
  they can switch tabs rather than on a button that has just vanished.
- **Map outlines** are `src/insights/region.geo.json`, 26 kB of Natural Earth (public domain) cut to
  Colombia and its three neighbours by `scripts/insights-region.ts` and committed. Re-run the script
  only to change the countries.
- **The plate and the ground under the story's cut** are `src/insights/section.json` (11 kB, 2.2 kB
  gzipped), written by `scripts/insights-section.ts` from Slab2 and GEBCO and committed; only the
  story chunk imports it. The script needs Slab2's "Data Volume" unpacked on disk, because
  ScienceBase serves it behind a browser challenge. Its header says how to get it. The cut is true
  to scale and starts at the trench, where Slab2's model begins. A vertical edge further west read
  as the plate ending there. It is at least 200 km deep (`SECTION_DEPTH_KM`) so the plate under
  Pereira shows. On a phone that makes it about 1 px per km, so the ticks go every 40 km and the
  "más profundo hacia el este" arrow drops its words, which the sentence beside it already says.
  The plate is neutral (`muted-foreground` at 20 % for the body, 10 % for the uncertainty band),
  so the source colours stay the only colours in the drawing.
  - **Both cuts go through `story/section.tsx`**: `frameSections` frames Chocó's and Chaparral's at
    one scale (see [the science](science.md#the-insights-page-insights-from-2026-09-24)), and
    `SectionFrame` draws the depth axis, the plate, the ground and a locator map for either. Chaparral's
    is its own scene (`tolimaSection`, step `tolima-section`, after the drift step), not a sub-state of
    `TolimaScene`. Its dots come from the same shared layer as Chocó's, but they wait on the cut while
    `TolimaScene` shows (hidden, since that scene draws its own map) and fade in in place: sliding from
    the overview map's positions made them fly in from a map the reader was not looking at. Sharing
    the scale shrank Chocó's cut by ~13% on a phone. The scale counts Chaparral's cut only while its
    step is shown (`model.tolimaCut`), and each cut ends no further east than its ground data
    (`cutEnd`), so a swarm drifting east cannot leave a stretch of cut without a surface.
  - **The locator map sits in each cut's lower-left corner**, under the plate near the trench,
    the one area neither cut uses (104 × 72 px, 56 × 38 on a phone, where a larger one reached the
    deep group's label). It shows the coast, the cut's line and Pereira in `--place`.
  - **The plate's motion arrow** is drawn by `PlateAndGround` on both cuts, 0.5–0.9° east of the
    trench in the lower part of the plate's body: under the plate's label and clear of Chocó's
    groups (at 0.95–1.3° it ran into the deep group's label). **Its meaning is the plate label's own
    line**, "se mete bajo Sudamérica, ~5 cm al año" (on a phone, "se mete ~5 cm al año", last, so the
    longer model line does not reach further east). An unlabelled arrow read as a path or as nothing
    in the owner's review (2026-09-24). A hover tooltip was rejected: a phone has no hover, and the
    arrow's one fact would be hidden. A label of its own under the arrow collided with the deep
    group's label on a desktop and on a phone.
  - The locator names its line ("corte") and Pereira, at 9.5 px (8 on a phone).
  - On a phone Chaparral's "Pereira: ~N km al norte" note sits a line higher than on a desktop:
    at the surface it ran into "Buenaventura". The scene title is kept to "Corte por Chaparral ·
    misma escala": the longer "…que el del Chocó" was clipped at 320 px. The prose beside it says
    the rest.
- **The 3D block's data** is `src/insights/block.json` (22 kB, 6.7 kB gzipped; `block.ts` types it),
  written by `scripts/insights-block.ts` and committed: GEBCO 2020 every 0.05° over the Slab2 box, and
  USGS's finite-fault plane for the M7.4. The plate is `section.json`'s grid and the events are the live
  catalogue, so neither is repeated. The script needs no manual download.

### The 3D tab ("En 3D", `src/insights/block3d`, from 2026-09-25)

A block of the region, 500 × 200 km and 240 km deep, with every event at its depth, the Slab2 plate,
USGS's rupture plane and the monitor's own map on top. Chosen from four prototype variants (branch
`prototype/3d`, never merged; the plan's unit E1): a slowly turning preview on the tab opens a
full-screen viewer with five views to jump to.

- **Engine: OGL, not three.js** (owner's choice, 2026-09-25). Both were built; OGL came to 36 kB
  gzipped against three.js's 158 kB for the same scene, and screenshots of five views in both themes
  differed by a mean of under 0.5/255. Its shaders are ours: `scene.ts` reproduces three.js's Lambert
  (linear light ÷ π, sRGB out) and flat materials. Every geometry must carry every attribute its
  program declares, or OGL throws inside `Geometry.draw`, which is why the events have their own
  instanced vertex shader. three.js's extras (PBR, shadows, model loaders, post-processing) are what
  we gave up; the engine-free logic (`shared.ts`) keeps a switch back cheap.
- **Files.** `shared.ts` is everything without an engine or a DOM (coordinates, the views and how
  they frame the block, where the map lies, `blockModel` over the data) and is what the tests hold;
  `scene.ts` draws; `index.tsx` is the tab, the viewer and the key; `copy.ts` has both languages.
- **Live data.** The tab reads the same `Insights` as the others, so it follows each ingest. A newer
  catalogue goes to the scene through `setData`, which redraws the events in place and keeps the
  camera; the scene is rebuilt only for a new language or theme, since its labels and colours are
  drawn inside it. A replay only changes how many events are drawn; the buffers are rewritten only
  when the exaggeration, the highlight or the catalogue changes. The WebGL check runs once, and
  releases its probe's context: browsers keep only a few alive, and one per render (as a first
  version did during the replay) would have cost the viewer its own.
- **The map on top is baked, not live.** `bake-basemap.html` renders OpenFreeMap's positron or dark
  style with Mapterhorn's relief, as `event-map.tsx` draws them, at exactly the block's bounds; the
  screenshot becomes `basemap-{light,dark}.webp` (201 and 116 kB; one loads, by theme). How to redo it
  is in [development](development.md#the-3d-blocks-map). A live MapLibre map was rejected: ~250 kB
  gzipped more, no camera glide into it, and it cannot show anything below the ground. The block's
  pinned towns, reserves (labelled in English), airports and road shields are left off the image.
  The credit, OpenFreeMap © OpenMapTiles © OpenStreetMap and © Mapterhorn, is on the block.
- **Drawing decisions from the owner's review**: the plate is a solid-looking slab (60 % top, walls on
  its cut faces) in a grey a quarter of the way from the page's background to its text (a twentieth
  in dark mode, where the lights brighten it about three times), and the **events and the rupture are
  drawn through it** (render order after the plate), so it never hides data. Looking straight down,
  the ground turns see-through and what only makes sense from the side (depth ticks, the plate, its
  margin, the box, the underground labels) hides. Towns are teardrop pins, Pereira in `--place`,
  their names in the text colour. The block's size is written on its top edges.
- **The viewer is a modal dialog**: focus goes to its close button and stays inside it, Escape closes
  it and returns focus to "Explorar en 3D", and the page behind does not scroll. Reduced motion stops
  the preview's rotation and makes the views jump instead of glide. Without WebGL 2 the tab says so
  and points to the story's cuts, which remain the text alternative.
- **Checked at 390 px and 1440 px, both themes, both languages** (2026-09-25): the side-length label
  ends at the block's edge (a centred one ran off a phone's screen), and the exaggeration note sits top
  left, clear of the credit.

## Interface conventions

Settled in a six-domain interface review (accessibility, layout, copy, typography,
colour, motion). Keep to them:

- **Spanish is the default** regardless of browser language; the toggle's choice is
  remembered per device. Every new string goes into both `es` and `en` in
  `src/lib/i18n.tsx`, which TypeScript enforces.
- **Every date and time on the page is Colombian time** (`America/Bogota`, UTC−5, no
  daylight saving), whatever the reader's device says. That covers the filter dates and
  the daily counts, which are Colombian calendar days. The CSV, the API and its
  `from`/`to` filters stay in UTC; the table shows the UTC form on hover. All of it goes
  through `src/lib/format.ts`; do not format a date anywhere else.
- **SGC ends every region with ", Colombia"**, which says nothing on a page about one
  Colombian sequence. `fmtRegion` in `src/lib/format.ts` strips it, and the table, the
  magnitude-chart tooltip and the map popup all go through it. The CSV and the API keep
  the region exactly as SGC gives it.
- **The zone is stated once, in the footer** (`timeNote`), and never repeated on an
  individual timestamp. It used to hang off every one of them — the two status-bar
  hints, the map popup, the magnitude and b-over-time tooltips, the table's column
  header, and "los días son días de Colombia" under the magnitude chart — which read as
  a disclaimer being restated rather than a fact. A new timestamp gets no zone label.
- **No relative time is counted in seconds, and no unit runs past the next one up.**
  `relativeTime` goes from "hace menos de un minuto" straight to whole minutes, to whole hours at
  60 minutes, to whole days at 24 hours. "hace 66 segundos" and "hace 86 minutos" both left the
  reader doing the arithmetic, and `useNow` ticks every 30 s, so a figure in seconds was stale as
  often as it was right. Under a minute it says so in words, which also answers the small negative
  a device clock running fast produces (it used to read "dentro de 5 segundos"). Days stay numeric
  — "hace 1 día", never "ayer": elapsed hours do not say which calendar day an event fell on, and
  the exact date is always beside it. Those two phrases are the **only** user-facing strings outside
  `i18n.tsx`, because `src/lib/format.ts` is also imported by the Node test project, which has
  neither the `@` alias nor JSX; `Record<Lang, string>` keeps both languages required there.
- **A time that identifies one event is a link to SGC's own page for it** (`sgcEventUrl` in
  `src/lib/format.ts`): the table's time column, and "Evento más reciente" in the status bar —
  which is why `/api/status` carries `newestEventId` beside `newestEventTime`. Both keep the UTC
  form on hover. A time that identifies no single event (the last SGC query) is not a link.
- **The page says that it updates itself** (under the refresh button, in the footer):
  readers were reloading it. The "15 minutes" in `autoUpdate` and `autoUpdateLong` is the
  cron in `wrangler.jsonc`, and `refreshWait`'s is `REFRESH_MIN_INTERVAL_S`, which is the
  same number for the reason given under the budget. `src/lib/i18n.test.ts` holds all three
  to it; change them together.
- **The failed-ingest alert names no interval at all, and that is the settled answer.** It
  named the cron's own rate, in the one state where the fast lane has stood down and the
  cron's rate is wrong. It was changed to the wide tick's rate instead, and within the hour
  the 410s began and the probe dropped to hourly, so that was wrong too. Three lane rules decide that number and the reader can act on none of them, so
  `ingestFailedBody` promises a retry and stops there. What it must keep saying is "no hace
  falta recargar"; `src/lib/i18n.test.ts` holds both halves. Do not put a number back.
- **Three stand-down messages, three different truths.** `refreshWait` claims SGC answered
  within the last five minutes, so it may only appear when nothing has failed;
  `refreshStillFailing` replaces it beside the alert and must not tell the reader to press
  again, because while SGC is refusing us the Worker's own wait is an hour; `refreshFailed`
  is for the request from the *page* failing, which is a different thing again.
- **The refresh button standing down is good news, not a countdown.** The throttle is the
  cron's own period, so it refuses most presses, so `refreshWait` says the reader
  already has the newest data instead of asking them to wait N minutes. It is a timed
  factual claim, so it is hidden as soon as a run fails — otherwise it would sit on
  screen asserting a recent successful query right beside the "la última consulta falló"
  alert, and it sticks until the next press.
- **Decimal point everywhere** ("M7.4", "Mc = 2.0"), matching SGC, the CSV and every
  computed number. Never mix in decimal commas.
- Terms: "sismo" only for the mainshock, "evento" for catalogue entries, "valor b",
  "Mc / magnitud de completitud".
- **Red means something failed.** Cautions ("fewer than 50 events", "history
  incomplete") are neutral badges with a warning icon. A *badge* stays neutral; an
  **alert states itself with its own surface** — see the bullet below.
- **A status alert tints fill, border and title; a note does not.** The two failure
  alerts (the load error, "la última consulta al SGC falló") take `destructive`, the
  back-fill notice takes `caution`, and the two notes that are page chrome — "Cómo leer
  estas cifras" and the scope notice — stay on the neutral `bg-card`, which is also what
  keeps the notice looking like the fixed scope bar it hands over to. Each state is three
  tokens in `index.css` and no more (`-surface` the fill, `-edge` the border, `-strong`
  the title and its icon), one constant hue per ramp.
  - **What bounds the light fills is the description.** It stays on `--muted-foreground`
    in every variant, so only the line that names the state is coloured — and that grey
    clears 4.5:1 on white by just 4.73:1, so a fill any deeper takes it under AA. Hence
    fills at `oklch(0.988 …)`, about Tailwind's `*-50`, with the **border** carrying the
    colour at this size, as it does in the shadcn "custom colors" alert these follow.
    Dark mode has the headroom (the grey sits at 6:1) for a real step off `--card`.
    Measured in the browser, light then dark: caution title 4.77 and 10.40, failure title
    8.24 and 6.89, both descriptions 4.56–6.07, borders 1.36 and 2.12 against the page.
  - **The two `-strong` values are a fixed 0.11 apart in lightness**, red the darker in
    light mode and amber the lighter in dark. Both alerts can stand in the status bar at
    once, and their hues alone are 0.048 apart in OKLab for a tritanope — under the 0.10
    that reads as one colour. Lightness is what survives, as it does for the clusters.
    Colour is not the only channel here (the words and the icon differ), which is why the
    hue pair is allowed to be close where a chart's would not be.
  - Caution is **hue 80**: 52.7° from `--destructive` and 30.3° from the mainshock orange
    `--chart-2`, so it reads neither as a failure nor as the mainshock. Do not move it
    nearer either without redoing the measurements — `agent-browser` plus the canvas trick
    in [Tooling gotchas](development.md#tooling-gotchas) reads the rendered pair straight off the page.
- De-emphasise with the secondary text colour, never with opacity: the b-value must
  stay readable exactly when it is least reliable. The destructive alert's description
  used to be `text-destructive/90`, which is the same mistake and is now the plain
  secondary colour.
- Order by importance: the b-value leads the page, above the filters. On a phone it
  must be within the first screen.
- **The status bar's stats are one wrapping row at every width**, never a two-column grid
  on a phone. The stats are not the same size — "Eventos" is three digits, "Evento más
  reciente" is "18 sept 2026, 17:08" — so equal halves broke the date across two lines
  below 480 px, which is every phone, leaving it two lines tall beside a number one line
  tall. Each stat is now as wide as its own longest line, and one that no longer fits
  beside its neighbour takes the next line whole: the date stays on one line down to
  320 px, and which stats share a line follows from the text rather than from a
  breakpoint. Nothing here needs revisiting when a stat is added, a figure grows a digit
  or a translation gets longer.
- **"Magnitud en el tiempo" scrolls sideways when it is too narrow to read.** Below
  768 px of plot width every Colombian day gets `PX_PER_DAY` (28 px) instead of the
  whole range being squeezed in, which on a phone drew one solid band. The bars themselves
  come from `dailyCounts` (see [Events per day](#events-per-day)). The scatter and
  the "eventos por día" bars sit in **one** scroll container so a single gesture moves
  both, and both y axes are pinned: each is a second, data-less chart in a `sticky`
  column, which only lines up because the pinned and scrolling charts are given the
  same margins, the same `X_AXIS_H` and — for the counts — the same explicit domain and
  `ticks` (`countAxis`). `interval={0}`, or Recharts quietly drops one of them.
  The view starts at the newest events and stays there through a refresh unless the
  reader has scrolled away from the right edge. Date ticks go from weekly to whatever
  fits in `TICK_GAP` while it scrolls. Above 768 px nothing changes.
- **Choosing a cluster narrows the whole page**, like a filter: "Ver solo este grupo" in the
  "Dos grupos de eventos" card. It is one of the settings the scope notice below names, and it sits
  outside the cards because a cluster can be emptied by the other filters, and the control must not
  vanish with it. The comparison was tried inside the b card
  first (as rows on its b scale): the card grew to ~1,400 px, the groups landed far below the
  fold and the chart beside it was left mostly empty, so it has its own card. Shallow is the
  page's blue and deep the teal (`--chart-1`, `--chart-4`) everywhere; orange stays the
  mainshock's. "Grupo", never "cúmulo" or "enjambre". The 7-day counts are counts: nothing in
  that card may read as a forecast.
- **What the page is narrowed by is said once, in two places** (`src/components/filter-scope.tsx`).
  `activeFilterChips` in `src/lib/filters.ts` is the single list: a setting earns a chip only where
  it differs from `DEFAULT_FILTERS`, so an untouched page produces none and neither presentation
  appears. Mc is in the list although it selects no events — it moves the b-value, and a Mc left on
  by hand is what a reader forgets. "Quitar filtros" clears the cluster *and* the filters form,
  which both go through `useScope`'s `clear`: `FiltersCard` is controlled, so the page owns the
  values and the form renders them. It used to be given a `resetSignal` to bump instead, and the
  reason that protocol existed is still a rule — **a reader's half-typed `from > to` must survive**.
  The form remembers the last object it handed up and compares by identity, so while it is invalid
  it emits nothing, `value` stays the last good object, and nothing resets underneath them.
  - The **notice** sits in the flow under the status bar. It is the accessible one and the only one
    in the tab order, laid out as one row wherever there is room, so the bar reads as the same
    object come back rather than a second thing.
  - The **bar** is fixed to the top of the window and **hands over from the notice**: it slides in
    once the notice has left the top of the window, and slides away when the reader comes back up
    to it. So exactly one of the two states the scope at any time, and the reader is never without
    it — which is the whole reason the bar exists, since everything below the fold is a chart drawn
    from a filtered catalogue. One `IntersectionObserver` on the notice decides it: no scroll
    handler, no pixel threshold, nothing running on a scroll frame. It watches `entry`, not
    `isIntersecting` alone, and requires `boundingClientRect.bottom <= 0` — a notice out of view
    *below* the fold, which is where a short screen starts, is not one the bar may stand in for.
    It is `aria-hidden` with its button out of the tab order, because it is a second view of a
    notice a screen reader has already read out and can still reach. The hand-over is the same
    pixel in both directions (checked in the browser, 2 px either side of it), so a reader parked
    exactly on that edge can wobble the bar in and out; a CSS transition retargets from wherever it
    is, so that reads as wavering rather than flashing, and it is not worth a scroll listener.
    - It was **shy** first — away on the way down, back on the way up, on a scroll-direction
      listener with 8 px of hysteresis. Two things were wrong with it: the reader lost the scope
      exactly while moving through the charts it applies to, and a 45 px move under a fade reads
      as the bar blinking rather than arriving. Do not reinstate the direction rule without the
      first problem's answer.
  - Its background is **opaque**, not a frosted pane: dense text and charts scroll under it, and a
    sentence ghosting through the line that states the scope defeats the point. The shadow is what
    separates it from the page and needs a solid surface; in dark mode the shadow does nothing and
    `border-b` carries it. Enter is 260 ms and leave 180 ms, **transform only** — a fade over the
    same time reads as an appearance, and it is the edge travelling that says the bar came from the
    top of the window. The hidden position is `calc(-100% - 1.5rem)`: `-100%` alone parks the bar
    off-screen but leaves `shadow-lg` hanging into the page as a grey band, and the 1.5rem clears
    it. Write the `calc` as `calc(-100%_-_1.5rem)` — CSS needs the spaces around the minus, and
    without them the utility is silently dropped and the bar never hides at all.
    `prefers-reduced-motion` drops the movement and fades instead. The curve is `--ease-slide`
    (`cubic-bezier(0.32, 0.72, 0, 1)`), not the page's `--ease-out`: `--ease-out` is tuned for a
    control answering a click and puts 90% of the travel in its first 95 ms, which over this
    distance is a pop. Measured in the browser, the bar now leaves the top edge at ~60 ms and
    lands at ~230 ms.
  - On a phone the bar shows the first chip and counts the rest (`+3`), and shortens the count to
    "639 de 786". Both are pure CSS at the `sm` breakpoint, so its height never changes as it slides.
- **The per-group daily strips in that card scroll sideways when narrow**, on the same idea as
  "Magnitud en el tiempo", and off the same `dailyCounts` (see [Events per day](#events-per-day)):
  below `MIN_BAR` (10 px) per day each day gets `PX_PER_DAY` (28 px), the
  strip starts at the newest day, each bar carries its count and every third day its date, and
  one gesture moves both strips. Every ancestor up to the tile needs `min-w-0`; without it the
  strip widens its tile instead of scrolling, the width it measures grows, and it flips back out
  of scrolling mode.
- "Detalle técnico" is one component (`technical-detail.tsx`, on shadcn `Collapsible`), used by
  the load error, the failed-ingest alert, the groups card and the b card. It takes a `size`
  for the body's type: `"sm"` for prose meant to be read, the default `"xs"` for a raw error
  string. `CardDescription` caps itself at 75ch; a card that wants a full-width subtitle
  passes `max-w-none`.
- **The b card's fine print is collapsed** — the magnitude-scale caveat and the goodness-of-fit
  Mc. Open, it made the card half again as tall as "Valor b en el tiempo" beside it, and because
  the two share a grid row the chart was stretched to match: 189 px of its card was empty. Folded,
  the row is 569 px instead of 779 px. Fold nothing whose only other home is that card: the
  mixed magnitude types and "no es un pronóstico" stay in the open under "Cómo leer estas cifras",
  which is what makes hiding them here safe. The chart itself keeps its fixed `h-80` and stays
  centred in whatever height the row has; letting it grow to fill would steepen the slope of a
  b-value decline the page is careful not to oversell.
- **A chart grows into the space beside it only where the extra height cannot mislead.**
  Cards in a two-column row are stretched to the taller one, so a fixed-height chart leaves a
  void under its legend. "Distribución frecuencia–magnitud" therefore fills its card (`flex-1`
  with `min-h-80`) instead of sitting at `h-80` with ~90 px blank beneath it: both of its axes
  are read off the data, so the room only spreads its points out. "Valor b en el tiempo" is the
  counter-example directly above — with a pinned y axis, height is a claim about the slope.
- A failed load shows the error only. It must never draw an empty dashboard that
  tells the reader to change their filters.
- **A chart or the map arrives in its own card, already titled.** They are loaded on approach
  (`Deferred`, see [Performance](performance.md)), so on a slow connection the reader first sees
  the card with its heading and a skeleton the size of the drawing. Never a bare grey box, and
  never a card that changes height when the drawing lands.
- Charts and the map redraw on every filter change, so they do not animate. The
  headline numbers do (`FlowNumber`, wrapping `@number-flow/react`): digits roll to
  the new value in 550 ms with `cubic-bezier(0.2, 0, 0, 1)` so the reader sees which
  figures a filter moved. 300 ms with the page's front-loaded `--ease-out` read as a
  jump; the library's 900 ms default lags behind a dragged slider. The roll
  runs on the main thread, so the charts, map and table take `useDeferredValue`
  copies of the data and are wrapped in `memo`: rendered in the same pass they
  blocked for 300–400 ms per slider step and the digits simply jumped. Entry
  animation is limited to the once-per-load `.enter` rows and respects
  `prefers-reduced-motion`.
- **A `FlowNumber` has to measure like the text it replaces.** The library pads its box above and
  below by `round(nearest, var(--number-flow-mask-height, 0.25em) / 2, 1px) * 2` — room for the
  mask that fades a rolling digit out as it leaves the top or the bottom — and that padding is in
  the box, so the element stood taller than the plain text beside it: 32 px against 28 px at
  `text-xl`, 72 px against 48 px at `text-5xl`. In the status bar that dropped the "Eventos" hint
  4 px below the two hints next to it and put the count 2 px off their baseline, and it is where
  the b card's extra 24 px came from. `flow-number.tsx` takes the same amount back as a negative
  `margin-block`. The mask is drawn, not typeset, and nothing clips it, so it stays exactly where
  it was and only the measurement changes. Keep the expression in step with the library's, and
  do not reach for `--number-flow-mask-height: 0` instead: that deletes the fade.
- **The b card's marks travel on that same roll**, because a mark and the figure
  written beside it are one fact and a mark that jumped while the digits were still
  turning read as two events. `--ease-move` and `--duration-move` in `index.css` are
  `FlowNumber`'s `MOVE` written in CSS; change one and change the other. Every row
  figure on the scale is a `FlowNumber` too — the scale's end labels are not, since
  they are the ruler rather than a reading off it. Each mark rides a full-width layer
  moved by a percentage of its own width, so its position is a `transform`, and the
  error band is a full-width capsule cut by `clip-path: inset(… round 9999px)` —
  which keeps both ends a true half-circle at any width, where scaling one capsule
  flattens them into ellipses. Nothing there touches layout, so the marks keep
  gliding on the compositor through the render pass a filter change spends on the
  main thread, the same pass the digits already glide through; on `left`/`right`
  they froze in it while the digits rolled on.
- The theme follows the operating system unless overridden; choosing the theme the
  system already uses clears the override (`src/lib/theme.ts`). The map rebuilds on
  theme and language change.
- Map colours stay as hex constants because MapLibre cannot parse the `oklch`
  tokens. Dots carry an outline that contrasts with the basemap, so neither end of
  the depth ramp disappears. `--chart-2` is the one token in `index.css` written as hex
  for the same reason — `event-map.tsx` reads it through `getComputedStyle` for the
  mainshock ring. Everything else in that file is `oklch`; keep it that way.
- **The monitor's map has relief shading** (a `hillshade` layer over Mapterhorn's elevation
  tiles, 2026-09-24), so the Western and Central Cordilleras read under the dots. What was
  decided, checked on both zones in both themes at 1280 and 320 px:
  - It sits **over the basemap's land fills and under its first line**, and the basemap's
    `water` is moved back over it, so the sea hides the sea floor's relief and every road,
    border and label stays on top. The event dots draw over all of it. Just under `water` was
    tried first and was wrong: OpenFreeMap draws wood, towns, parks and ice after `water`, and
    its wood fades in from z8 to opaque at z12, so in forest (most of Chocó) the relief washed
    out as the reader zoomed in.
  - **The shading is tuned; the dots are not recoloured.** Exaggeration runs from 0.35 at z7 to
    0.22 at z11, so about 0.33 where Chocó's map opens (z7.6) and 0.25 at Chaparral's (z10):
    at a flat 0.35 the relief behind Chaparral's swarm turned busy.
    In dark mode the highlight carries the relief (`#5a5a56`); a shadow on a near-black
    basemap has nothing darker to fall to, and at `#3a3a38` the cordillera barely showed.
  - The tiles are 512 px but **declared 1024**, so MapLibre fetches one zoom coarser and
    stretches them: a quarter of the tiles for a soft background that looked the same (the
    weight is under [Performance](performance.md)). Colombia's data ends at z12.
  - Flat, no tilt: MapLibre cannot draw dots below the ground, and 3D is the insights plan's own unit.
  - "© Mapterhorn" joins the attribution, which at 320 px makes the open attribution box one
    line taller over the map's bottom edge. It collapses once the reader moves the map.
- **The two clusters must differ in lightness, not only in hue** (colour review,
  2026-09-19). Shallow blue and deep grey were both mid-lightness — `oklch(0.575)`
  against `oklch(0.556)`, a measured 1.07:1 — and the one place they touch is the
  stacked "eventos por día" bars, where the boundary was invisible in light mode.
  The deep cluster moved off the recessive grey onto its own `--chart-4`, a teal
  (`oklch(0.4 0.068 195)` light, `oklch(0.85 0.085 195)` dark) set **60° from the
  blue in hue and 0.175 / 0.228 away in lightness**. Both halves are load-bearing:
  a teal at the blue's own lightness is a different colour to most readers and the
  *same* colour to a tritanope, because tritanopia takes the blue–teal difference
  away and leaves nothing behind. Lightness is what survives every kind of colour
  blindness, so any hue chosen here needs a lightness gap as well.
  `--chart-3` stays the recessive neutral and is now used by one thing only: the
  frequency–magnitude chart's per-bin squares, which must sit *below* the blue
  cumulative curve in emphasis. Do not merge the two back together.
- **Check a new chart colour against three pairs, under simulated colour blindness**,
  not just against the card. The deep cluster meets the shallow blue (they touch in
  the stacked bars), the mainshock orange (same scatter chart) and `--chart-3`. Measured
  as OKLab ΔE after a Viénot simulation, a pair below **0.10** reads as one colour, and
  the WCAG ratio will not tell you — it only sees lightness, so two hues at equal
  lightness score 1.0 whatever they look like. Today's worst case is 0.130 (light) and
  0.144 (dark). Candidates that failed, and are not worth retrying as they stand:
  teal, green and purple *at the blue's lightness* (0.02–0.08 against the blue), and
  plum, which is fine against the blue but lands on **0.006 against the mainshock star
  in dark mode for a tritanope** — the pair that is easiest to forget, since the two
  share the scatter chart. A throwaway prototype that shows all of this live is on the
  `prototype/cluster-colour` branch.
- `--chart-2` is `oklch(0.62 … 49.7)` in light and `oklch(0.719 … 49.9)` in dark —
  lighter in dark mode, as an accent on a dark ground should be. It was the other way
  round, and in dark mode it had exactly the blue's lightness. Its hue also sits 21°
  (light) and 28° (dark) from `--destructive`; it was 12° in light, close enough to
  read as red on a page whose rule is "red means something failed".
- `--chart-5` and the eight `--sidebar-*` tokens were deleted: nothing imported them,
  `--chart-4`/`--chart-5` had identical light and dark values, and `--sidebar-primary`
  was a vivid blue in dark against a neutral in light — a stock shadcn default that
  would have rendered wrong the day a sidebar was added.
- Numeric table columns align to the trailing edge, use `tabular-nums` (set once on
  the page root) and a true minus sign (`fmtNum`).
- Every control has an accessible name; sliders get theirs through
  `aria-labelledby` on the thumb, which is the element with `role="slider"`.

Not yet verified by anyone: real screen-reader output, a physical touch device, and
Safari. The back-fill and ingest-failure alerts have now been seen rendered, in both
themes, but against a **stubbed** `/api/status` (see [Tooling gotchas](development.md#tooling-gotchas))
— not yet in a live state driven by SGC itself.

## Design-system lint

`pnpm lint` runs oxlint with [`@shadcn/lint`](https://github.com/shadcn-ui/lint), set up in
`.oxlintrc.json` with all six of its rules at `error`, as its adoption guide gives them:
`no-restyle` and `no-arbitrary-values` allow layout classes, and `no-restyle`,
`no-arbitrary-values` and `require-static-classes` are off inside `src/components/ui/`, which
styles itself. `no-raw-colors` and `no-inline-styles` stay on there. The rules' messages end with
a pointer to this section. What they ask, and how this page answers them:

- **A component's look is a variant or a size, not a `className`.** Callers pass only layout
  (margin, width, position, `flex-1`, `group`). Where a page needed more, it became part of the
  component:
  - `Button` sizes `sm-touch` and `icon-sm-touch` are `sm` and `icon-sm` that grow to 40 px on a
    coarse pointer, with text at 14 px and a 44 px hit area. They carry the convention "on touch
    the control grows, rather than relying on an invisible hit area alone". Before the lint, each
    page control wrote it out itself, and they had drifted: the language button had 14 px text and
    a 44 px hit area, while "Quitar filtros" and the group buttons kept 12 px text and `sm`'s
    56 px hit area. They now share the language button's values, so on touch those three buttons
    changed.
  - `Button` variant `floating` and size `icon-round` are the insights page's back-to-top button:
    opaque primary with a shadow, and a 44 px circle that clips what travels through its edge.
  - `Button` size `header` is the sortable column header (`sm` with the table's 14 px text);
    `inline` is a link-button inside running text, with no box of its own; `inline-touch` is
    `inline` growing like `sm-touch`. Variant `link-muted` is the "Detalle técnico" trigger.
  - `Table` takes `size="sm"`: 4 px cell sides, for the events table.
  - `TechnicalDetail` takes `size` rather than a `className`; `Deferred` takes `height="map"`
    rather than a class. A class string built at runtime cannot be checked.
- **Containers may be spaced by the page.** One `no-restyle` contract lets `Alert`,
  `CardContent`, `FieldGroup`, `Tabs` and `TabsContent` take spacing (gap, padding) as well as
  layout: they own no arrangement of their own, and what goes in them is the caller's.
  `Collapsible` is shadcn's unstyled Radix wrapper with no classes of its own, so it is left out
  of component recognition (`ignoreImports`) rather than given a contract.
- **Values come from the theme.** A value the design needs and Tailwind's scale lacks becomes a
  token in `index.css`: `text-2xs` (0.625 rem) and `--radius-px` (`rounded-t-px`) for the groups
  card's daily strips, and `shadow-pin`, the pinned y axis's shadow, which reads its colour from `--pin-shadow` so dark
  mode can change it. `band-clip` and `transition-clip-path` are `@utility` classes for the
  b scale's error band. The linter reads the theme, so it suggests these by name.
- **Data reaches CSS through custom properties, never an inline property.** A position or width
  computed from data is set as `style={{ "--at": … } as CSSProperties}` and read by a static class
  (`translate-x-(--at)`, `w-(--plot-w)`, `h-(--bar-h)`). Write the object literally in the JSX: a
  helper that returns it cannot be read, and is reported as a dynamic style.

**Approved exceptions**, each marked where it is with `oxlint-disable-next-line` and a reason:

- `event-map.tsx`, the depth legend's gradient. It is drawn from `DEPTH_STOPS`, the same hex
  constants the map paints with (MapLibre cannot parse the `oklch` tokens), so the legend cannot
  disagree with the map.
- `ui/chart.tsx`, shadcn's `ChartStyle` `<style>` element, which scopes each chart's colour
  variables to that chart for each theme.

A new exception goes the same way: in the code, next to what it excuses, with the reason. Never
switch a rule off for a file. `rg "oxlint-disable"` lists them all.
