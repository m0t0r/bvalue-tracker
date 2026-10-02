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
- The `page` vitest project runs on `happy-dom` with `@testing-library/react`, for that seam and
  two others: `InfoTip`'s wiring to Radix (see the filters card, below), and the map's hand-over
  (`Deferred`'s margin, `MapPreview` and `EventMap` against a stand-in for MapLibre; see the card
  bullet under Interface conventions).
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

### Choosing days on the bars (from 2026-09-26)

**The "eventos por día" bars choose which days the catalogue table lists, and nothing else**
(`src/lib/day-selection.ts`, `DailyLine` in `magnitude-time-legend.tsx`). A b-value, a map or a chart
of one day's events would read noise as a finding, so the choice is not part of the page's scope:
it has no chip, "Quitar filtros" leaves it, and every figure keeps counting the whole filtered
catalogue. Chosen from three prototype variants (branch `prototype/day-bar-filter`, never merged):
one day per press (A), one day and one depth group with Chocó's bars side by side (B), and a range (C,
the owner's pick).

- **With a mouse, a press chooses a day and a drag or a shift-press a range; on touch, a press
  only.** A sideways drag on a phone scrolls the chart, so the range is desktop's alone
  (`useFinePointer`, `(hover: hover) and (pointer: fine)`), and the tip under the bars names only
  what works on the reader's device ("Haz clic…, o arrastra…" / "Toca…"). Over the bars the cursor
  is `pointer`, since a day can be pressed (`cursor-pointer` on the drawing); from the mouse-down and
  for as long as a drag lasts it is `col-resize` on the whole document, which says the bars take a
  sideways sweep (owner's call). That one is a rule in `index.css` with `!important`
  (`[data-drag-days]`), over every element's own cursor, so it does not flicker back as the drag
  leaves the chart. When checking a cursor, check the element under the pointer (`elementFromPoint`),
  not an ancestor.
- **The day under the pointer is read from the event's own position** (`dayAt` in `DailyBars`: the
  time scale inverted), for the tooltip and for a press alike, so a press always lands on the day the
  tooltip names. (In the Recharts build the press could not use the chart's hover index: it was set a
  frame after the mousemove, a tap has no move before it at all, and off the plot it was null.)
  A press on the date labels chooses the day above it.
- **A drag is followed on the window and can be dropped.** It ends on the window's mouseup, wherever
  the button is let go, and is dropped, choosing nothing, on window blur, on Escape, and when a move
  arrives with the button already up: each is a mouseup the page never got (a context menu, a switch
  of app, a release over another frame), after which the next click anywhere would have chosen a
  range. A Ctrl-press, a right click on a Mac, starts none. The drag's state lives in `DailyBars`, so
  sweeping across the days redraws the bars and not the scatter's hundreds of dots; the scatter's
  band follows the choice once it is made. A mouse press calls `preventDefault`, so it selects no
  text and leaves no focus ring on the chart.
- **The way back is three ways**: the chosen day pressed again, Escape in the chart, and "Ver todos
  los días" in the table's header, which is the visible one. It is the only button: a second one
  under the bars repeated it a card apart (owner's call, 2026-09-26), so that line names the days
  and links down to the table ("23 sept · Ver los 107 eventos en el catálogo ↓") instead. Clicking
  empty space does not clear: on a phone a tap while scrolling would.
- **The tooltip's content never changes on a press.** It used to gain "Haz clic de nuevo para ver
  todos los días" on the chosen day. Recharts drew the wider tooltip at its old position first and
  then slid it back over ~120 ms, so on the rightmost days (Tolima's last, 23 Sept) it ran 106 px past
  the chart's scroll container, and a horizontal scrollbar flashed on every press (owner's report,
  2026-09-26; measured frame by frame). The line under the bars already says how to go back. Since
  issue #126 a tooltip cannot widen the scroll container at all: each drawing clips sideways
  (`overflow-x-clip`), and a tooltip is placed inside what is on screen of it.
- **The keyboard has the same choices.** The arrows move between days, Enter chooses the day the
  tooltip is on, Shift + Enter chooses every day up to it, Escape lets go. A held Enter's repeats are
  ignored, or each would undo the last. The chart's `desc` says all of this. The tooltip stays through
  Enter: in the Recharts build Enter also hid it (its accessibility layer's own toggle), and the day
  the keyboard was on with it.
- **Chosen days are marked three ways**: the other bars turn grey, a band in `foreground` at 7 %
  sits behind the chosen days in both the bars and the scatter above, and the line under the bars
  names them. The band was added after review: a chosen day of three events is a bar a few pixels
  tall.
  - **The grey is the theme's own `--border`** (owner's call, 2026-09-26: a neutral grey rather than
    the days' own colours at 22 % opacity, and one of the palette's greys rather than a new token).
    Measured on the card: 1.26:1 light and 1.32:1 dark, and 3.51:1 and 3.73:1 from the blue, so the
    chosen days stand clear of it. The mid greys were no use: `--chart-3` and `--muted-foreground` sit
    at the blue's own lightness (1.07:1 from it in light mode), so a chosen bar would barely have
    stood out. `--muted` (1.09:1) nearly vanished; `--input` is the same as `--border` in light mode.
    One grey for both groups also means the stacked split shows only on the chosen days.
  - **The grey bars are below 3:1 on purpose**: they are context, each keeps its count in the
    tooltip, and a grey at 3:1 on the card would sit at the blue's lightness, the problem above.
  - The switch of colour is a 150 ms `fill` transition (`transition-fill`), off under reduced motion.
- **Why not Chocó's groups side by side (variant B)**: after the first week most deep bars are 1–3 px
  tall and 10 px wide, too small to hit, and side by side the day's total can no longer be read off
  the axis. "Ver solo este grupo" in the groups card already narrows to one group, and a day choice
  then applies within it.
- **The table lists what was chosen, and its CSV too**, named for the days
  (`sgc-choco-events-2026-09-12_2026-09-18.csv`).
  - **The download button says how many events the file holds**: "Descargar 121 eventos en CSV",
    always, not only while days are chosen (owner's call, 2026-09-26). The file is what the table
    lists, which the page's filters narrow as well as the days, so a label that switched to a
    "selected" wording would need a rule per case; the count is true in every one, and matches the
    "121 de 809" beside it or the scope bar's "Mostrando 639 de 786" above. On a phone the button is
    the icon and "CSV" (owner's call); the words before it stay in its name (`max-sm:sr-only`), so
    the name is the whole sentence and still contains what is shown. Checked in the accessibility tree
    at 320 and 1280 px: "Descargar 121 eventos en CSV".
- The table returns to page 1 on a new choice, in the same
  render (the page index is its own state, reset when the days change; an effect painted "Página 4
  de 1" for a frame first), and its
  always-mounted sr-only status says "Solo 12–18 sept: 145 de 809 eventos". "Ver los N eventos en el
  catálogo" scrolls to the table (smoothly unless reduced motion) and focuses its heading.
- **A choice the filters empty is let go of**, not kept to return when they change back. A refetch
  that adds events keeps it. `eventsInDays` sits beside `dailyCounts`, so a bar and the rows it lists
  never disagree about which Colombian day an event belongs to.
- Checked 2026-09-26 at 1280 and 320 px, both themes, both languages: no horizontal overflow at
  320 px, keyboard path end to end. Not checked on a physical touch device.

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
- **The header is in each zone's HTML before any JavaScript runs** (issue #69, 2026-09-28;
  `MonitorShell` in `src/components/monitor-shell.tsx`). The build renders that component, the one
  React draws, once per language (`src/static-shell.tsx`) into a slot in `#root`, and `zonePages`
  gives each zone's file its own. So a change to the header is made in `MonitorShell`, never in
  `index.html`, and whatever it shows must not depend on the browser or the theme: the theme button
  draws both halves, each an icon with its own name ("Cambiar a tema claro" beside the sun), and shows
  one by the `dark` class (`not-dark:hidden`, `dark:hidden`), since the static copy is drawn before
  anything knows the theme. A first version kept the name in an `aria-label` from React's state, and
  the static copy offered the dark theme to a reader already in it (code review).
  - **React hydrates the static header rather than replacing it** (issue #97, 2026-09-28;
    `src/lib/hydrate.ts`). Replaced, it was a new element, and a phone paints the static copy before
    Geist has loaded: React's copy, in Geist, came out larger and became the page's LCP, after the whole
    bundle ([Performance](performance.md) has the numbers). `main.tsx` keeps the copy in the language on
    `<html>`, removes the other, marks the kept one `data-static-live` (a `[data-static-lang]` copy is
    hidden while its language is not on `<html>`, which a change of language would have done to the
    whole page) and hydrates it with the `useId` prefix the build used, so the zone tabs' ids and their
    panels' agree. `App` draws the page under the header only from the render after hydration
    (`useHydrated`, a layout effect, so both commit in one frame): drawn during it, the page would not
    match the HTML. Because the header's nodes now stay, the monitor keeps a desktop scrollbar's room
    from the first paint (`scrollbar-gutter`), or the header moved aside when the page mounted and the
    scrollbar appeared, a layout shift. So `static-shell.tsx` must
    render exactly what `App` renders before that, and `src/page-root.test.ts` holds it to that for both
    zones and languages: no mismatch, every static node kept, each tab linked to its panel. A mismatch
    all the same (a browser extension that edits the page before the bundle runs) makes React draw
    its own header, as before, and `installErrorReporting` reports it. The dev server's page has no
    static header, so there it is a plain `createRoot`.
  - **Until Geist has loaded, the page is in a stand-in cut to Geist's measure** ("Geist Fallback" in
    `index.css`): Arial, or Liberation Sans on Linux and Roboto on Android, with Geist's ascent and
    descent and scaled to its width on the header's own strings, rounded up. The header breaks into as
    many lines in both faces in 42 of 44 cases (11 widths from 320 to 1350 px, both zones and both
    languages, 2026-09-29). In the other two the stand-in takes one more line, and gives it back when
    Geist arrives: Tolima's Spanish subtitle at 360 px, and Chocó's English one at 1024 px in a browser
    whose scrollbars take room. The second came with the scrollbar's room above (`scrollbar-gutter`),
    which was added after the first count, 43 of 44: it narrows that column from 976 to 961 px, and the
    subtitle's one line is 962.5 px in the stand-in against 959.3 in Geist. Otherwise the header keeps its
    height when Geist arrives; what still moves is text below it redrawn where it stands (0.0003 of CLS on
    `/choco` in English at 390 px, with Geist held back 3 s). With a bare `sans-serif` a line was 1.0 em
    tall to Geist's 1.3. Roboto's faces are from its published files; not checked on an Android device.
    - **fontaine does not replace them** (issue #101, 2026-09-29, fontaine 1.0.0 with `fallbacks: ["Arial",
      "Roboto"]`, wired into the Vite build and into `headerCss`, whose Tailwind compile no Vite transform
      reaches). It writes one face per system font from [Capsize](https://github.com/seek-oss/capsize)'s
      metrics, scaled by average character width, and that loses on every count the hand-written faces
      were measured on:
      - **Width.** Its Arial face is 104.76 % of Arial, and the header's subtitle came out 3.0–3.5 %
        wider than in Geist (the hand-written face: 0.3–0.8 %). Measured in the page, `agent-browser` at
        11 widths from 320 to 1350 px, both zones and both languages, the header broke into the same
        number of lines as in Geist in 38 of 44 cases, against 42 of 44 for the hand-written faces in the
        same run. Four of the six misses are phone widths (320, 360 and 390 px). On `/choco` in English
        at 390 px, with Geist held back 3 s behind the brotli proxy, the page shifted 0.0036 when Geist
        arrived, against 0.0003 on `main`.
      - **Bold.** It copies each face's own descriptors, and Geist's variable face declares
        `font-weight: 100 900`, so a single fallback face serves every weight. The semibold title then
        paints in Arial *regular*: the face claims to cover 600, so the browser does not even synthesise
        a bold. It has no option for a face per weight. Capsize does have Arial's and Roboto's bold
        (`variants["700"]`); fontaine reads only each family's regular.
      - **Linux.** Capsize has no metrics for Liberation Sans, and fontaine skips a fallback it has no
        metrics for, so Linux gets a bare `sans-serif`.
      - **Our setup.** It reads a face's metrics from its file, one per `@font-face`, and keeps only its
        weight, style and stretch, not its `unicode-range`. Geist's non-Latin subsets lack most of the
        letters the average is taken over, so it also writes faces at 122.7 % for every character, and
        Chrome uses the Latin one only because it comes last in the stylesheet. It rewrites literal
        `font-family` declarations, not `--font-sans` in `@theme`, so the family must still be named by
        hand, and its CommonJS build fails to load (`magic_string.default is not a constructor`).

      The Lighthouse A/B and the first-paint comparison were not run, since it failed these first.
      Retrying it needs all four fixed: a face per weight, a Liberation Sans face, no faces from other
      subsets, and then the width checked again against the header's own strings, since an average over
      a whole alphabet is what put it 3 % off.
  - **The head script decides the language and the theme, and nothing else does**
    (`src/boot.ts` over `src/lib/startup.ts`). It is a classic, render-blocking script at the top of
    every page's head, a file because the CSP allows no inline script, and it writes `<html lang>`
    and the `dark` class before the first paint. `index.css` shows the static copy in that language
    (`[data-static-lang]`), and React hydrates that copy; `I18nProvider` opens in the language on `<html>` rather than deciding
    again, and `theme.ts` only changes the theme afterwards (`followSystemTheme`, `toggleTheme`).
    Before this, `initTheme()` decided the theme in the bundle. If the script never runs, the HTML's
    own `lang="es"` stands and header and page agree on Spanish, in the light theme, and the theme
    button still works: it switches away from the theme on screen rather than deciding again.
  - **Declined in the code review (2026-09-28):**
    - *React deciding the language itself when the head script did not run*, so that a French
      browser gets English as the rule says. It would be the second decision the head script
      replaced, and would swap the header's language as React mounted. The script is a 0.5 kB
      same-origin file requested before the bundle; a load that loses it has usually lost the
      bundle too, and a browser too old for its syntax cannot run the bundle either.
    - *Making the static header `inert`* while its tabs and buttons do nothing (only the link to
      `/insights` works until React mounts, ~1.7 s on a throttled phone). The page was blank for that
      time before, and `inert` would also take the header's words away from a screen reader.
    - *One copy of the header with the words swapped per language*, to halve what it adds to the
      HTML (index.html 3.4 → 25.2 kB raw, but 1.0 → 2.9 kB with brotli, which the edge sends; most of
      it is the two copies' repeated class lists, which compress well). It would need a script to swap
      them, the one thing the CSP rules out, or a second hand-written header; the A/B already
      includes the cost.
  - **Checked in `agent-browser` on `pnpm preview`** with the monitor's bundle blocked, which shows
    exactly what paints before React, then with it: all eight of {light, dark} × {es, en} × {`/`,
    `/choco`} remembered against the opposite system theme and browser language, and a first visit
    with nothing stored (an `es-CO` browser on a dark system, an `en-US` one on a light system). In
    every case the static page and React's had the same language, theme, title, selected tab and
    theme icon, and the title and subtitle the same top and height, at 390 px and at 320, 768, 1024 and
    1280. The language and theme buttons still switch and remember. A second case in the same browser
    measures nothing: the bundle is cached `immutable` and a cached request never reaches the route
    that blocks it, so each case needs a fresh browser.
- **What is a Chocó finding stays on Chocó's tab**: the depth-groups card and the magnitude chart's
  group legend and tooltip line (`depthClusters` in `core/zones.ts`). The copy that differs lives in
  `t.zones[zone]` — title, subtitle, back-fill text and the caveats — and the update interval is a
  number from `worker/plan.ts` (`updateEveryMin`), never written into a string.
- **The mainshock is detected, on every tab alike** (`view.mainshock` from `pageView`, over the
  whole catalogue the page holds — never the filtered view; [the rule](science.md#the-mainshock-detected-from-the-catalogue-never-pinned-from-2026-09-24)).
  The map's ring and its legend sentence (`mapRing`), the star, the marker on "Valor b en el
  tiempo", "Excluir sismo principal" and its chip all appear only while one is found; the caveats
  take the state as an argument (`caveats(state)`).
  - **"Sismo principal" is the status bar's last stat, always shown** (`MainshockStat` in
    `status-bar.tsx`): "M7.4 (Mw)" linked to SGC's page for it, with the day and the gap under it;
    "automático, en revisión" while it waits; "Ninguno claro · el mayor, solo 0.3 por encima del
    siguiente" for a swarm ("+0.3 sobre el 2.º" on a phone). Chosen over a notice that appears only when the copy is out of date, and
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

## What both pages share

**What the two pages have in common is drawn once, so one cannot say less than the other** (issue #142,
2026-10-01). The monitor never said it was independent of SGC, while `/insights` did ("Página
independiente, sin relación con el SGC"), because each page had written its own footer and only one
had the sentence. Three components, in `src/components/`, and `page-chrome.test.ts` fails if a page
draws its own copy of any of them:

- **`SiteFooter`** (`site-footer.tsx`) is the one `<footer>`. The page gives it its own lines as
  children (the monitor: where its data comes from and how often it is read; `/insights`: how far the
  data goes), and it adds the shared ones: the time zone (`timeNote`, and `timeNoteCsv` for the page
  that has downloads, `csv`) and what the page is (`disclaimer`: independent of SGC, its figures
  describe what already happened and are not a forecast, and where the official word is). `ref` goes
  to `BackToTop`, which watches the footer. Lines of one group are 4 px apart and the two groups 16 px,
  under a rule, with the text in a column of at most `max-w-2xl`. The monitor's footer took the look
  `/insights`' already had, so it gained the rule. Both pages end 80 px above the window's bottom edge
  (`pb-12` on top of the frame's padding): the round back-to-top button, 44 px and 16–24 px up, sat on the
  end of the disclaimer, the longest line, on a phone (found in the before/after captures).
  - **Where it sits.** Inside the zone's panel on the monitor, whose lines depend on the zone, and
    after the tabs on `/insights`; `mt-auto` takes it to the window's foot on a short page in both (the
    monitor's tabs fill the frame, `flex-1`, or the panel would end with its content and the footer
    with it). The monitor draws it once its data has settled, a failed load included; `/insights` once
    it has data or has failed, and not while it loads: its first render must equal the HTML's, which
    has none.
- **`PageFrame`** (`page-frame.tsx`) is the column both pages are drawn in: its width, its gutters and
  the tabular numerals. The pixel background reads where the cards' column lies, so a frame of a page's
  own could move it.
- **`HeaderControls`** (same file) is the language and theme buttons at the end of a header, with the
  page's own controls (the monitor's link to `/insights`) before them. The `-touch` sizes live there.
  The 3D viewer's own language button is not this: it sits in a different header.

The words are shared as well as the markup: `disclaimer`, `timeNote`, `timeNoteCsv` and
`completesItself` ("Se completa solo.", the back-fill notice's promise on both pages; it does not
add "no hace falta hacer nada", which the monitor's "Cargar lo que falta ahora" beside it would
contradict) are in `i18n.tsx`, which `/insights` already reads for the theme button's names, and its
own dictionary has no copy of them. All three components are markup with no state, so the build draws
the headers into the HTML as it did, and the hydration tests (`page-root.test.ts`,
`insights/hydration.test.ts`) pass unchanged.

- **Not shared, with the reason.** The two headers: the monitor's has zone tabs and a title two sizes
  smaller, `/insights`' a way back and three tabs, and a header both pages draw would need a slot or a
  flag for each difference (the chart kit's frame was declined for the same reason). The load error
  already is shared (`LoadError`). The stale-data and unfinished-history notices are not: each page
  words them for what it shows, and what they promise is shared in the sentence above.

## The insights page

**`/insights` is a second page with its own HTML file and its own bundle** (`insights.html`,
`src/insights/main.tsx`; the `client` entry in `vite.config.ts`). It explains the zones in plain
words for a reader in Pereira (the rules for what it may say are in
[the science](science.md#the-insights-page-insights-from-2026-09-24)). D3's maths modules
(`d3-geo`, `d3-scale`, `d3-shape`, `d3-array`) do the maths and React renders the SVG, so there is no
`d3-selection`; the monitor's MapLibre never loads there. The monitor's frequency–magnitude
chart is drawn the same way since issue #118, "Valor b en el tiempo" since #125 and "Magnitud en el
tiempo" since #126 (see their bullets under Interface conventions), so `d3-scale` and `d3-shape` are now
shared chunks of both pages.

- **The route.** The asset layer serves `insights.html` at `/insights` in production. In dev the
  Cloudflare plugin would hand that path to the Worker, which answers 404 (the same trap as the zone
  pages), so `insightsPage` in `vite.config.ts` serves it first. The monitor's header links to it,
  and it links back.
- **Its header and skeleton are in the HTML before any JavaScript runs** (issue #120, 2026-09-29;
  `InsightsShell` in `src/insights/shell.tsx`), as the monitor's header is (the zone bullets above, and
  the same machinery): the build renders the page's first render once per language
  (`insightsStaticShell` in `src/static-shell.tsx`) into a slot in `insights.html`, with the CSS it
  needs inlined and the stylesheet at the end of the body, and `main.tsx` hydrates the reader's copy.
  Before this the page was an empty `#root`, and a phone showed a blank white screen until its bundle
  had run, ~3.5 s ([Performance](performance.md) has the numbers). So a change to the header, the
  notice's live region or the skeleton is made in `shell.tsx`, which both draw, and
  `src/insights/hydration.test.ts` holds the static copy to React's first render in both languages and on
  every tab: no mismatch, every static node kept, the selected tab linked to its panel.
  - **The theme button follows the `dark` class** (`ThemeButton`, now shared with `MonitorShell`). The
    page's own chose its icon and name from `useIsDark()`, which the static copy cannot know, and whose
    `useSyncExternalStore` has no server snapshot, which hydration needs. Its strings are the monitor's
    (`t.themeToLight`, `t.themeToDark`); the page's copies of them were the same words and are gone.
  - **No tab is chosen until React has hydrated.** The HTML is one file for the three tabs and cannot
    see `?tab=`. A copy with the story chosen would show "La historia" on a `?tab=3d` link for the ~2 s
    before hydration on a phone, then jump to "En 3D"; with none chosen, the chosen tab appears once and
    nothing on screen changes to something else. React's first render chooses none too, or it would not
    match (`useHydrated`), and the query string's tab in the render after, which commits in the same
    frame. On the bare URL, the link the monitor and most shares use, "La historia" is therefore
    unchosen until hydration. Not built: the head script choosing (it decides the language and the
    theme and nothing else; #119's per-tab preload was declined for the same reason), and a copy per
    tab (six copies in the HTML, and a script to choose one, which is the head script again).
  - **The stand-in face keeps the header's lines**: with Geist blocked, the static header breaks into
    as many lines as in Geist in 22 of 22 cases (11 widths from 320 to 1350 px, both languages), so the
    title, subtitle and tabs keep their place when Geist arrives. The back link and the tabs are ~3 px
    narrower in the stand-in, which moves nothing below them. Measured again on 2026-10-01 when the link
    went from "Volver al inicio" to **"Ver los datos en vivo"** / "See the live data" (issue #143, owner's
    choice: the old words could be read as "back to the top", beside the round "Volver arriba" button):
    22 of 22 at 320, 360, 375, 390, 414, 480, 640, 768, 1024, 1280 and 1350 px, in both faces, the top
    row one line (28 px) at every width with the controls beside the link, and the header's height equal
    to `main`'s at every width (the link grew from 119 to 154 px in Spanish and from 116 to 132 in English,
    and at 320 px the row has room to spare).
  - **Checked in `agent-browser` on `pnpm preview`** with the bundle and the stylesheet blocked, which
    shows exactly what paints before React, against React's first render with the API held back: in
    {light, dark} × {es, en} at 320, 390, 768, 1024 and 1350 px, and on `?tab=questions` and `?tab=3d`,
    the title, subtitle, back link, buttons, icons, tabs and skeleton had the same text, place and size,
    and the same theme. The only difference is the chosen tab.
  - **Declined in the code review (2026-09-29):** having the head script write the query string's tab
    on `<html>` for CSS to style the chosen tab from, so the bare URL paints "La historia" chosen too.
    It is the reason above: the head script's one job, and the tab's look restated in CSS outside the
    component. And one Tailwind compiler for both pages' inlined CSS (`headerCss`), to compile
    `index.css` once per build: its `build` keeps every candidate it was given, so the second page's
    CSS would carry the first's classes, and the monitor's pages would change.
- **Three tabs, "La historia", "Preguntas" and "En 3D"**, in the query string (`?tab=questions`,
  `?tab=3d`; the story is the bare URL). Switching replaces the history entry rather than pushing
  one: back leaves the page. Each tab is its own chunk (`src/insights/story`,
  `src/insights/questions`, `src/insights/block3d`). The tab the page opens on is fetched at startup,
  beside the data, and read with `use`, not `lazy`: `lazy` suspends once even on a chunk that has
  already arrived, and React then holds the tab back 300 ms (see [Performance](performance.md)).
  The story's chunk is also preloaded from the HTML, with the data, at every width (issue #108;
  `preloadStoryTab` in `vite.config.ts`): the hero needs both, and the story is the bare URL. A tab
  opened later still loads when it is opened.
- **Live data, kept current like the monitor.** `useInsights` reads `/api/events` for both zones under
  `["events", zone]`, and computes every claim with `insights()` over them and a clock rounded to
  the minute. Status is polled every minute and on returning to the tab, and a zone's events are
  refetched when its last ingest changes, the monitor's own rule, so a page left open does not keep
  counting "the last 7 days" over a catalogue that stopped growing. The two pages are separate
  documents and share no cache. Status also drives the warning while either zone's history is
  incomplete (`backfill.done < total`); the page never starts the back-fill, so nothing on it can
  reach SGC. The Worker's cron carries it on, so the notice says it completes by itself. **A refetch
  that fails keeps the claims, and the page says so** (2026-09-26): `staleSince` over both catalogues
  and both statuses puts a caution notice in the back-fill notice's slot ("Los datos no se están
  actualizando · No se pudieron actualizar: lo que ves es de las 12:35, y se actualizará solo.",
  worded as the monitor's line, the day only when it is not today). One notice at a time: the load
  error, then stale data, then an unfinished history. The notice is a `note`; it is announced from an
  always-mounted sr-only `role="status"`, since a live region inserted with its text already in it is
  often not read out (the back-fill notice goes the same way). Checked with a 503 on `/api/` and
  offline, and back.
- **Copy.** The shell's words and every data-dependent sentence live in `src/insights/copy.ts`; each is a
  function of a claim's result, so the words cannot say more than the rule decided. Each tab keeps its
  long-form prose in its own `copy.ts`. Language and theme are the monitor's (`useI18n`, `theme.ts`),
  so a choice made on one page holds on the other. What the footer says is the monitor's too
  ([What both pages share](#what-both-pages-share)).
  - **One name per source** (issue #143, 2026-10-01). Chocó's shallow group was named five ways on the
    questions tab alone, and two keys on two tabs disagreed. In prose a group is "el grupo superficial"
    or "el grupo profundo", with its place said once where it is introduced (the story's first
    step, question 1's opening clause, question 3's two paragraphs). Every key, label and legend,
    on all three tabs, takes its name from `sourceShort` (`src/insights/source-names.ts`): "Chocó
    superficial", "Chocó profundo", "Chaparral", "Chocó shallow", "Chocó deep" in English, never a
    comma form and never the place as a name ("Istmina–Sipí"). `source-names.test.ts` holds each tab to
    the table and fails if a copy file spells a name out again.
  - **A threshold is written with its decimal, "M4.0 o más"** (owner's decision, 2026-09-30), on the
    story as on the questions tab; a size class keeps "M4", "M5", "M6" (the ×32 ladder, "un M4 llega
    muy atenuado"). A rate is "por día" / "per day" on every tab, the monitor's "Eventos por día", and
    the page is "esta página", never "nosotros" ("we" is the region's people). A span of days names
    the month once ("entre el 4 y el 8 de septiembre", `fmtDaysSpan`). `wording.test.ts` holds these.
- **Colours.** Chocó's groups keep the monitor's blue and teal and the mainshock its orange (the
  monitor's Gutenberg–Richter fit line is `foreground` for that reason, not `--chart-2`). The
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
  one groups thousands ("125 893"), where the digits are meant to sit close. A range's dash is
  written " –⁠" (a word joiner after it): a line may break after an en dash even when a no-break
  space follows (UAX #14), which left "20 sept – 22 / sept" in the b card.
- **SVG text is sized in screen pixels.** A drawing that scales with its column (the questions tab's
  map, `viewBox` 400) multiplies its font sizes by viewBox units per pixel; in viewBox units alone
  its town names were 7 px on a 320 px phone.
- **A label stays inside its drawing and clear of the others, by measured width, or is left off**
  (issue #154, 2026-09-30). The catalogue grows, so where a label falls moves by itself: the rule is
  what holds, never a nudged number. Every decision measures through `useTextWidth()`, so a drawing
  laid out in the stand-in face lays itself out again when Geist arrives. The helpers are
  `src/insights/place.ts` (tested); the axis rule is the chart kit's.
  - **An axis' labels go through `ownPlaceLabels`** (`@bvalue/charts`, used as it is): each drawing
    still offers the ticks it chose by width, and a label is drawn only where, centred on its own
    place, it clears the next one by `INSIGHTS_LABEL_GAP` (6 px) and both edges of the drawing. A tick's mark
    stays when its label is left off. This is on every axis whose ticks move with the catalogue or the
    clock: question 3's days, question 5's dates, the story's hero strip, its two clocks, its wave
    race and its durations. Question 5 is where it showed: at 320 px d3's `ticks(4)` gave seven weekly
    dates, each 1–7 px into the next, and at 390 px they stood 1.4–7.4 px apart; both now draw every
    other week. The amplitude scale on question 1 is left as it was: its domain and ticks are fixed,
    and with `textWidth`'s 3 % reserve its "1/100 000" measures 2 px past an edge it fits in, so the
    rule would drop it at every width.
  - **A row of labels read left to right goes through `forwardLabels`**: each is moved inside the
    plot and dropped where it would start before the last one kept ends. Question 3's lull bands and
    the story's two-clocks step both call it. The story's had no rule, and at 320 px read "cal calma
    profundo", its two labels run together and into the deep line's name. Inside the plot also moves
    the story's second "calma" about 3 px left at 768 and 1280 px in Spanish, where it ran 2 px past
    the plot's end.
  - **A label with somewhere else to go takes the first placement that is clear** (`firstClear`, over
    `textBox`es: an SVG line's box in Geist is 1 em above the baseline and 0.3 em below, measured).
    - Question 5's "20 sept: empieza Chaparral →" sat on "M7.4 · 10 ago" on a phone (70 px at 320,
      21–27 px at 390). It is tried whole before the band, as on a desktop, then whole inside it without
      the arrow, then as "Chaparral →" before it and "Chaparral" inside it, and is otherwise left off,
      since the band and the key still say it; always within the plot, clear of the reference event's
      label and its ringed dot. Chosen over moving it down a line, where it would sit among the largest
      events' dots. On a phone the short form is the one that fits, at 320 and at 390 px.
    - The story's lull labels are also kept off the lines: at the foot of their band, as before, where
      no line crosses them, and otherwise at the top of the plot, which the rates have left by the time
      of any lull. At 320 px the deep group's line, settled at the floor, ran through "calma" (the
      scanner does not see it: it compares text with text). The height is chosen first and
      `forwardLabels` then runs once per row, so a label left off, or one on the other row, takes no
      room from its neighbours (code review). Every band is drawn before any label, here and on
      question 3: a label may run on past its own band, and the next band covered its last letters.
    - The drift step's "centro cada 12 horas" is tried beside the track's end, before it (as it was)
      and after it, above and then below it, then centred on it, then at either margin at the same
      heights; each must stay off the track itself (`crosses`, a line clipped against the label's
      box, 3 px of room), off the error circle's dashed outline (`crossesRing`) and clear of the scale
      bar and of both their labels. Failing all of
      those it is centred above the end, moved inside the close-up, over the track if it must, and
      otherwise left off. It was cut by the left edge at 320 px in English, and at 768 px in both
      languages on the 2026-09-30 catalogue. A first version that only flipped it after the end put
      it on the track at 768 px, where the track ends at its west side; at 320 px in English only
      the left margin, below the end, is clear.
  - **Question 1's map draws a town only where its dot is on the map**, and only where its measured
    name stays inside the map and clear of the sources' labels, Pereira's and the towns kept before
    it, in `TOWNS` order. The boxes may touch, with no gap: a line's box already reaches about a
    quarter of an em past the letters, and at 768 px "Manizales" and "Pereira" are 1.5 px apart, which
    a 2 px gap wrongly left off. Medellín and Bogotá lie off the map at every width and were drawn
    outside it, clipped; at 320 px "Manizales" sat under "● M7.4 y réplicas profundas" and "Armenia"
    touched "Ibagué", and both Manizales and Ibagué are left off there. The story's map still leaves
    off a town near its right edge by a fixed 60 px (`graphic.tsx`), which nothing crosses today; #155
    moves the two maps' town marks into one module. The map's three source labels are not placed by
    this rule: each has a hand-chosen spot and is only kept inside the map, as before. They clear one
    another and Pereira's label in every scan above; a longer reference name or a narrower column
    than 320 px is where that could stop holding.
  - **The story map's side view stays bottom-left, over the sea, wherever it can** (`pickCorner` in
    `story/side.ts`, 2026-09-30). Corners are tried in a fixed order (bottom-left, bottom-right,
    top-left, top-right) and the first is taken that cuts no line, covers no figure, line name,
    Pereira or the mainshock's star, and hides at most 5 % of the events (`MAX_HIDDEN_SHARE`, so it
    never sits on a cluster); failing all four, the one covering fewest of those marks, then fewest
    events. A town's or the ocean's name does not count: the card is opaque, so one under it is left
    off rather than cut, and the ocean's name only while the first scene shows, since the last scene
    reuses the map without the card (code review).
    - **Why a fixed order, not the corner that hides least.** The first version weighed every
      corner by what it covered, a town's name heavier than a few dots. On the 2026-09-30 capture
      that put the card top-left at 390 px (bottom-left would cover "Cali") and bottom-left at 320 px
      and on a desktop, and the owner read the jump between widths as a bug. With the fixed order it
      is bottom-left at 320, 360, 390, 430, 768, 1024, 1280 and 667 × 375 px in both languages, with
      Chaparral's events held back, and with the web font blocked.
    - **Its size**: the plot, the arc's reach included, takes at most a third of the drawing across
      and a sixth of a desktop's height down (70 px on a phone), one scale both ways. The long title
      is used only where it fits over the plot, else the short one, which may widen the card on a
      phone (at 320 px the card is about half the drawing). Its labels sit left of each focus and move
      down two pixels at a time until they clear one another and the other foci's dots. The arc's
      "120 km" is left off where the arc has shrunk enough to meet "Pereira".
    - The corner rule and the map's other placements are in `planWhere` (`graphic.tsx`), which runs
      only while the first scene is mounted.
  - **Declined in the code review (2026-09-30):** *offering the hero strip's ticks up to today*, instead
    of stopping three days short, now that `ownPlaceLabels` guards the edge. The issue keeps which
    ticks a drawing offers out of scope, and the change would add a label to wide layouts that are
    meant to stay as they are. *Measuring the hero's labels lazily*: its start-anchored labels pass
    their middle as their place, so each candidate is measured; there are at most eight, and the
    measure is cached once Geist is in. *Giving the map's source labels a placement of their own*:
    above.
  - **Checked** with the scanner in the issue (every visible SVG `<text>` of the questions tab and of
    each of the story's 17 steps, in es and en, at 320 × 700, 390 × 844, 768 × 800, 1280 × 800 and
    667 × 375; both builds served by `scripts/fixture-server.ts` from one capture): 16 of 180 scans
    had an overlap or a label past its drawing's edge on `main`, none here. At 768 and 1280 px, every
    drawing of both tabs was screenshotted on both builds with the clock frozen (the axes that end at
    "now" otherwise move between two runs) and reduced motion (so the wave race and the dots are at
    rest): identical, or within the rasteriser's 1–17/255, apart from the drift label and the Spanish
    "calma" above; the questions tab's markup is byte for byte `main`'s but for the map's two
    off-map towns.
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
- **A scene's drawing is mounted from the step before its first one, and then kept** (`mounted` in
  `story/index.tsx`, issue #70). Scenes cross-fade (`Layer` in `story/marks.tsx`), so the next one must
  already be in the SVG, at opacity 0, when its step turns current; drawing all of them at load cost
  ~1,500 elements screens away from the reader (see [Performance](performance.md)). The drawing follows
  the active step a frame behind (`drawn`), so a scene reached by a jump (a fling, a reload with the
  scroll kept) is mounted hidden first and still fades and reveals in. The map's layer, the shared dots
  and the scene titles belong to the first scene.
- **The dots the map and the cuts share are drawn on a canvas** (`DotLayer` in `story/dots.tsx`, issue
  #94): as ~1,900 SVG circles, each on its own CSS transition, a scene turn froze a phone for most of
  its glide ([Performance](performance.md) has the numbers). The drawing is three layers in one box: an
  SVG with the map and the cuts, the canvas, and an SVG with everything drawn over the dots (legends,
  titles, the other scenes). The box is the `role="img"` with the scene's text alternative, as the SVG
  was; the layers inside it are presentation. `Graphic` says where each dot and the star sit in the
  scene and how opaque (`marks`); `DotLayer` glides them there as the CSS did: 1 s on `EASE_MOVE`, each
  dot held back by its depth (3 ms per km, at most 400 ms), a new target taken from wherever the dot
  is, and a glide sent back where it came from shortened as CSS shortens a reversed transition
  (`story/glide.ts`, tested). The colours are the theme's tokens (`TOKEN` and `token` in `tones.ts`),
  read once per theme and drawn again on a switch; a new box or a reader who asked for less motion gets
  the dots where they belong at once; the canvas is exactly the SVGs' box and follows the device pixel
  ratio. Two things differ from the SVG on purpose: a dot hidden at both ends of a move goes there at
  once (Chaparral's swarm waiting on its cut, which nobody sees travel), and the fading star is drawn as
  one image at its opacity, since fill and outline faded one after the other showed the outline as a
  ring (code review). The dots are no longer in the DOM: a check that counts `circle`s in the story now
  finds only the scenes' own.
- **Story step 2 draws squares true to energy, one per row, largest first** (`Ranks` in
  `story/scenes.tsx`, `rankLayout` in `history.ts`, 2026-09-25): the M7.4 in the mainshock's orange,
  past earthquakes in `muted-foreground`. Squares are right-aligned so each label sits beside its own
  square; left-aligned, the small ones' labels floated ~250 px from them. A row is never shorter than
  its two lines of text. The labels are measured (`fitRanks` in `story/layout.ts`, `textWidth` in
  `insights/measure.ts`, shared with the questions tab's labels: one canvas measurement, cached once the web font has loaded), the widest line
  decides how much width the squares get, and the text steps down a pixel at a time (to 9 px) until
  every row fits the height and the largest square is at least two rows tall; if even 9 px is too
  wide, the first lines drop the time. At 320 × 640 the second part's nine rows did not fit at 11 px
  and the drawing came out empty; an estimate of 13 em per label clipped "Armenia (Quindío) · 25 ene
  1999, 13:19" at 320 px (interface review, 2026-09-26).
  Every row gives the day and time in Colombian time, like the M7.4's (`fmtDateTime`, 2026-09-25);
  1906 reads 10:39, Bogotá's mean solar time, since Colombia had no standard time until 1914. With
  the time added, "Costa de Ecuador y Colombia" ran 7 px past the right edge at 320 px, so the 1906
  row is "Costa Ecuador–Colombia"; no label comes closer than the 6 px margin to the right edge. The
  drawing's title names the M7.4 ("frente al M7.4"), because every row's ratio is against it. The
  text alternative lists every row with its label. Both layouts, the first part's and the second's,
  stay mounted so the step change cross-fades; drawing only the active one was suggested in review
  and declined, since the two fits cost well under a millisecond.
- **"¿Cuánto duró?" draws two bars on one time axis, seconds since the earthquake began**
  (`Durations` in `story/scenes.tsx`, a sub-state of the energy scene, 2026-09-26): Pereira in the
  mainshock's orange, faint from ~19 s to ~248 s while its sensor records the earthquake and solid for
  the strong part (~50–100 s), and the fault in `muted-foreground`, 0 to ~54 s, so the reader sees the
  fault stop before Pereira's strongest shaking. The faint span has no key: the row's second line
  states it ("registrado de 20 s a 4 min · fuerte: unos 50 s"), under "Cerca de Pereira" since CBOCA is 6.6 km from the centre, which also fits at 320 px where a key
  line would not. SGC's near-epicentre range is not drawn, having no start time. Each row's two lines
  of text sit above its bar (`RowLabel`, shared with the energy squares). The axis runs to the next ten
  seconds past the longest bar. Like the squares, the text steps down a pixel at a time to 9 px until
  the rows, the axis and its label fit. PR #65 drew rupture durations of past earthquakes here
  instead; they read as shaking and were taken out (see the science). Checked at 1280 and 320 px,
  both themes. **Any landscape window from 560 px uses the side-by-side layout** (`useWide` in
  `story/hooks.ts`: `(min-width: 768px), (orientation: landscape) and (min-width: 560px)`), so a
  landscape phone or a desktop at 200 % zoom (667 × 375, 640 × 450) gives the drawing the window's
  full height (338 × 327 and 322 × 402) instead of ~170–210 px pinned over half of it, where this
  step and the energy squares came out empty. The layout and the step observer read the same query
  (`data-side` on the section). A portrait window under about 600 px tall still cannot draw every
  scene.
- **The ×32 ladder's labels sit on the squares' baseline, in gaps sized to hold them** (2026-09-26,
  owner's report). Each "×32" was centred in a fixed 14 px (phone) or 26 px gap, narrower than the
  label, and set 10 px above the previous square's top: it ran into both neighbours (at 375 px into
  the M6 square), and the two labels floated at different heights, the first far from M5. Each gap is
  now the label's width plus 12 px (20 on a desktop), both labels share one height just above the
  baseline, and the squares take the width left after both gaps (M6 about 13 % smaller on a phone).
  Checked at 1280, 375 and 320 px, both themes. The squares are `muted-foreground`, untinted: the
  blue at 40 % was "Chocó superficial"'s colour in the story's key, and 1.7:1 against the card.
- **The waves step drops its seismogram label and footnote on a phone**: both ran off the drawing at
  320 px, and the aside beside it says both. **Chaparral's close-up** has a phone title ("Chaparral
  de cerca · intenso = reciente"). The swarm's age is a colour step (`--chart-5-age-1..4`, 1 the
  oldest), never opacity, each ≥ 3:1 on the card (the numbers are in `index.css`); the strip's
  smaller events are neutral, like Chocó's. The calendar's and the map's legends are spaced by
  measured widths, and a calendar tile shows its month only when it fits. Every story step was
  scanned for SVG text past the drawing's edge at 320, 375, 390, 640 × 450, 667 × 375 and 1280 px,
  both languages (2026-09-26).
- **Dates in running prose are written out** (`fmtDayLong`, "10 de agosto"); drawings, chips and
  labels keep `fmtDay` ("10 ago", with a no-break space).
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
  so the source colours stay the only colours in the drawing. The band is called "franja tenue" /
  "faint band": in dark mode it is darker than the body, not lighter, and "franja clara" was wrong
  there.
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
- **The block's fine ground** is `src/insights/block3d/relief.bin.gz` (80 kB, 451 × 181 heights in whole
  metres; `encodeHeights` in `block.ts` is the format), written by `scripts/insights-relief.ts` and
  committed: the same box every 0.01° (~1.1 km), land from Mapterhorn's terrain tiles (zoom 7) and the
  sea floor from `block.json`'s GEBCO grid, since Mapterhorn has none. `block3d/relief.ts` fetches and
  decodes it once per page (the preview and every opening of the viewer share it); the scene draws
  GEBCO's grid first and swaps the fine one in when it has loaded, and keeps GEBCO's if it never does.
  **It is a binary file and not an image on purpose**: a first version was a 71 kB Terrarium WebP read
  back through a canvas's `getImageData`, which private browsing (Safari, Brave, Firefox's
  fingerprinting protection) adds noise to, and one unit of noise was 256 m. The file is served as
  gzip; a server that sends it with `Content-Encoding: gzip` (Vite's dev server does) has had it
  unzipped by the browser already, and the decoder checks the gzip magic bytes for that. How to redo it
  is in [development](development.md#the-3d-blocks-fine-ground).

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
- **The viewer is a modal dialog**: it is portalled to `<body>` and the page root is `inert` while it
  is open; focus goes to its close button and loops inside it over every tab stop, the panel's tab
  content included (a first version missed that one and let Tab reach the page behind). Escape closes
  it and returns focus to "Explorar en 3D", and the page behind does not scroll. Reduced motion stops
  the preview's rotation and makes the views jump instead of glide; otherwise a pause button on the
  preview stops it (WCAG 2.2.2).
- **The mountains are raised ×5 by default, and a setting puts them back to true scale** ("Montañas":
  "Realzadas ×5" / "A escala real", `RAISED_LAND` and `landScale` in `shared.ts`; owner's call,
  2026-09-26). At true scale the highest peak (~5.2 km) is ~8 px tall on a laptop's 500 km block, and
  the fine ground on its own changed nothing the owner could see. **Only the land is raised**: the sea
  floor and every depth stay at the block's exaggeration, so this is the one place the block mixes two
  scales, and every surface that states the scale says so (the corner tag, "Montañas realzadas ×5";
  the settings' help; the key's "Las medidas"). The mountains stand at ×5 whatever the vertical
  exaggeration (`landScale` = 5 ÷ exaggeration, never below 1): multiplied, ×4 would have made them
  ×20. The raising is the ground program's `uLandScale` uniform, applied in the vertex shader to
  y > 0 (the normal's y divided by it), so a press in the settings rewrites one number, not an
  81,631-node mesh: a first version rebuilt the mesh on every change. ×3, ×5 and ×10 were compared on
  the default view: ×3 read as texture, ×10 as spikes. The ×1 exaggeration is named "A escala real"
  like the mountains' true-scale option (it was "×1 (real)"), at the owner's request. **Declined in the
  code review** (2026-09-26): that the viewer then opens with "A escala real" pressed under
  "Exageración vertical" while the mountains are raised. Each choice sits under its own heading, the
  exaggeration's help says it is the depths that stay unstretched, and the corner tag names the
  raising; the owner asked for the name.
- **The sea moves with the day's real swell** (2026-09-26, the owner's request; switch "Mar",
  `layers.sea`). A first version the same morning, a see-through surface with slowly drifting swells
  and glints, was removed: it barely moved and read as nothing like water. The second is an **opaque
  surface** at sea level (the owner: "surface water, not depth water"), discarded wherever the ground
  is above the sea, which the water reads from a one-byte heights texture (`heightTexture` in
  `scene.ts`). What it takes from where, and what it invents, is in
  [the science](science.md#the-3d-tabs-rules-from-2026-09-25); the fetch is
  [the daily sea-state job](ingest.md#the-daily-sea-state-job).
  - **The waves** are three trains, the main swell, a second swell and the wind's own waves, each a
    sum of "exponential sines" (after Acerola's water, github.com/GarrettGunnell/Water, MIT: sharp
    crests, broad troughs, each octave bending the next). `drawnSea` in `shared.ts` turns an hour of
    the forecast into the shader's uniforms; the swells move the mesh and all three shade it. Before
    the forecast loads, or once the stored hours run out, the sea is `USUAL_SEA` and the key states no
    figure.
  - **Not built, each tried or weighed:** waves a tap sets off (the owner: not realistic at this
    scale), a calm option, see-through water, a light pattern on the sea floor (caustics; the owner
    did not want it), three.js's `Water` and `WaterMesh` (`WaterMesh` needs three.js's WebGPU renderer,
    and three.js is 120 kB more; they are one shader, written here instead), Water Pro
    (commercial, its licence forbids its code in a public repository), and swell in sets
    (2026-09-27, after caustic-volume's lite sea, github.com/ScottieFox/caustic-volume: each train's
    height under an envelope moving at half the crests' speed, as deep-water groups do). Tried twice
    in a preview: mild, a set every 9–14 wavelengths and lulls at 35 % of the height, it was hard to
    notice; strong, every 5–8 wavelengths and lulls at 12 %, the calm stretches read as glassy. The
    owner prefers even crests. The rest of caustic-volume is caustics, see-through water, tap ripples
    and an FFT ocean, each declined above or too heavy for one block on a page.
  - **Why it is not pale:** a glint sun placed where the flat sea mirrors it put a hazy white disc in
    the middle of the sea from above, and the water faded from above with the ground, showing the
    pale map. The water's own sun stands 20° up in front of the camera (`SUN_ELEVATION`), and the
    water is opaque at every angle; the events are drawn over it anyway. **Why it does not speckle:**
    an octave shorter than 3–6 px fades out, and the glint fades where they do; the fresnel is capped
    and the glint dimmed at grazing angles, which is the whole Pacific from the default view.
  - **The trench's label is near-white in a dark halo** (`text-on-sea`, `text-shadow-sea` in
    `index.css`, which holds the measurements): on the sea, the old `text-foreground` was 3.0:1 at the
    default view, and white alone fell to 2.9:1 under the glitter. From "Desde el sur" it floats over
    the page's white and reads as outlined text.
  - **The shore's foam is a line at the waterline**, not a band by depth: off the San Juan's delta the
    shelf stays shallow for kilometres, and 60 m of depth spread a white smear over its green water.
  - **The key's "El mar" is its last entry**, after the note on the depths (owner: it is not
    essential data).
  - **What the code review changed (2026-09-26):** the preview's pause button stops the waves as well
    as the turning, and is now "Detener el movimiento"; reduced motion stills them, and follows a
    change of the setting while the tab is open (`setWaves`; the viewer, which has no pause, stills
    them under reduced motion, and "Mar" hides them, WCAG 2.2.2). The waves' clock stops where it is
    and goes on from there. "Mar" is its own switch: tied to "Terreno" as well, it read on for a sea
    that was not drawn. `/api/sea` is a TanStack query with the page's retry policy (a first version
    kept a failed answer for the whole visit), not asked without WebGL, and the hour drawn moves at
    each hour's start rather than on a one-minute tick. The key's sizes say what the drawing does:
    waves under about 5 s (`SHORT_WAVE_PERIOD_S`) are drawn longer than 75×, and the wind's are only
    texture, with no height.
- **A compass rose in the viewer** (2026-09-26, owner's request): ticks every 45°, a two-tone needle,
  and N, E, S, O (W in English) on their bearings, kept upright. Every frame it turns to where north
  lies on screen, by projecting a point 20 km north of the one the camera looks at, so it is right at
  any tilt. Viewer only: the preview's pause button has the top right. Hidden from screen readers; the
  views and the key say where things are.
  - **Top right from 1024 px, bottom left below** (2026-09-26, later that day, owner's request): on
    a phone the top right is where the pins and their names sit in most views, and the compass
    covered them; the bottom left is the block's emptiest corner. There the map credit keeps to the
    compass's right (`pl-16` under `data-compass`) and wraps, rather than run under it; each
    attribution (a link) stays on one line, or "©" was left at a line's end.
  - **The needle reads as raised** (the same day, the owner's bonus request): each half is two faces
    cut along its ridge (`NEEDLE_FACES` in `shared.ts`), each shaded by how squarely it faces a light
    fixed in the top left of the screen (`needleShade`, tested), so the shading shifts as the rose
    turns. The lit face is the lighter one in either theme (less opaque over the light background,
    brighter over the dark). The faces sit on an opaque base and never drop under 70 %: a first
    version ran them down to 50 % with nothing under them, and the code review found the lit north
    face as grey as the shaded south one, and the shadow showing through as a band. In the light
    theme the needle casts a small shadow down and right; in the dark one a shadow would not show.
    Flat SVG, no gradient, so no `id`s in the page and every colour a token.
  - **Declined in the code review:** choosing the corner by the block's width rather than the
    viewport's. From 1024 px the side panel narrows the block, but the pins sat clear of the top
    right at 1024 and 1280 px, and the owner asked for the phone only.
- **A pin shows its distance from Pereira** (`pinDistances` in `shared.ts`, 2026-09-26): in the viewer
  the other three pins are buttons; a mouse over one, a tap or the keyboard's focus draws a dashed line
  to Pereira's pin and adds the distance to the pin's own name ("Buenaventura · ~180 km"); a pressed
  pin is a toggle with `aria-pressed`, and its name says "a unos 115 km" (rounded). A label of
  its own at the line's middle covered the pin's name whenever the line was short on screen. The
  distance is great-circle, to the nearest 5 km (the pins are for scale), and the key lists all three,
  for a reader who cannot hover, and says it works in "Explorar en 3D" (the key is also on the tab,
  beside the preview, whose pins are inert). A tapped pin keeps its line while the block is turned, so it can be
  followed from any angle; a tap on the block that does not turn it (under 5 px of travel) lets it go.
  The line is drawn in screen space between the two pins' tips each frame. The preview's pins stay
  inert. A first version cleared the line on any press on the block, and positioned a distance label
  whose point threw while no pin was chosen: that stopped every label after it in the frame, and the
  line froze where it was.
- **The preview turns at ×2 and the viewer opens at ×1** (`PREVIEW_EXAGGERATION`,
  `VIEWER_EXAGGERATION` in `shared.ts`, owner's call, 2026-09-26): the preview is a showcase, where
  the relief should show; the viewer is where the reader judges the plate's dip and the sources'
  depths, which ×2 doubled. The viewer keeps the reader's choice while the tab stays mounted. At ×1
  the plate's label sits at least 70 km down (`max(40 × exaggeration, 70)`), or it lay on "~500 km"
  at 320–390 px. Without WebGL 2 the tab says so
  and points to the story's cuts, which remain the text alternative.
- **The viewer's explanation and settings are one panel with two tabs, "Leyenda" and "Ajustes"**
  (`Panel`, 2026-09-26). It replaced a hand-rolled `<details>` ("Capas, escala y tiempo") that, open
  on a phone, shrank the block to a third of the screen and piled the layers, the scale, the replay
  and the whole key into one unlabelled 45svh scroll. From 1024 px (`useWide`) the panel is a
  24rem column beside the block. Below that, two buttons under the caption open it as a shadcn `Sheet`
  from the bottom (4/5 of the screen), on the tab pressed, and the block keeps its full height.
  - **The sheet is a real modal, on purpose.** An always-open peek sheet on shadcn's `Drawer` was
    built first and failed verification: vaul 1.1.2 never passes `modal={false}` to Radix, so the
    "non-modal" sheet `aria-hid` the viewer's header, Close button, views and block from screen
    readers and trapped keyboard focus inside itself. It also cost ~17 kB gzipped. A drag sheet of our
    own was declined: its gestures could not be checked without a physical touch device.
  - While the sheet is open the viewer's own key handler stands aside (`sheetOpen`), and it ignores an
    Escape Radix has already handled (`defaultPrevented`): otherwise one Escape closed both the sheet
    and the viewer. Escape closes one layer at a time, and focus goes back to the button that opened
    it: Radix keeps one trigger per sheet and returned focus to "Ajustes" whichever button opened it,
    so `onCloseAutoFocus` sends it to the one pressed. On touch the layer rows are ~47 px apart, clear
    of the Switch's 46 px hit area.
- The explanation comes first: the reader is not a specialist. Layers are `Switch`es named for their on
  state; the views and the exaggeration are `ToggleGroup`s. The hint names the reader's input (a phone
  pinches, a mouse scrolls). The views row fades at its edge on a phone, where it is cut mid-word.
  The viewer's header carries the language switch (`LanguageButton`, shared with both pages' headers):
  the page's own switch is under the viewer, out of reach while it is open.
- **Checked at 390 px and 1440 px, both themes, both languages** (2026-09-25): the side-length label
  ends at the block's edge (a centred one ran off a phone's screen), and the exaggeration note sits top
  left, clear of the credit. **Every label but the pins is clamped inside the block** (its width read
  once per resize) while its point is on the canvas; a label whose point has left the canvas sideways
  leaves with it, or after a drag the trench's name and the depth ticks slid along the edge; below 480 px the plate, rupture and size labels drop what the key says (the model,
  the date, the directions). The quieter labels are `text-xs` in `foreground`: in `muted-foreground`
  at 10 px they measured 2.1–2.9:1 on the grey plate (8.6:1 now, light). Checked again at 320, 390 and
  1280 px, 2026-09-26. Pins can still overlap one another from some angles (Chaparral's name over
  Pereira's pin at 390 px on the default view).
- **The questions tab's line caps are pixels, not `ch`** (Geist put 65ch at ~95 characters): body
  `max-w-lg`, lede and headings `max-w-xl`, captions `max-w-md`. Its choices are `ToggleGroup`s like
  the 3D tab's. The stat row wraps (`basis-32 grow`), since "~120 km" outgrew a third of 320 px.
  Calendar day numbers are 12 px from 360 px and 10 px below, where "14×6" does not fit a 31 px cell.
  The M ≥ 4 stat counts the events *after* the M7.4 ("después del M7.4"), which the calendar's and the
  story's totals include; "desde" read as including it.

## The pixel background

**Both pages have a background of 1-bit pixel art drawn from the live catalogue** (`src/backdrop`,
2026-09-30, the owner's request for "a bit of cherry on top" that does not distract). A canvas behind
the page, 3 px to the pixel, in `--foreground` at 8–11 % (the mainshock's `--chart-2` is its one other
colour): an ordered dither (Bayer 8×8) of a smooth field, rising to a checkerboard where the zone's
events fall, with the newest event as one hard pixel. `/insights` feeds it both zones' catalogues
(`catalogues` from `useInsights`, the queries it already holds), and the swarm is fitted to the events'
own spread (their middle 96 % in each direction), so both zones show while each holds more than 2 % of
the events. Chosen from three prototypes on the page itself, built and judged live:
a helicorder's drum sheet (disliked), topographic contours with wavefronts (rejected for moving by
itself) and pixel art (the owner's own suggestion).

- **No card ever sits on a pixel** (owner's call). The pattern fills the header, the side margins and
  the footer, stops 16 px short of the column from the first card to the footer, and thins out over
  its last 48 px, a dithered edge rather than a cut. The first version ran under the cards, and they
  read as "much more visible and contrasty with the borders". It is drawn over the whole document and
  scrolls with it, so the header's pixels leave with the header. Where the cards begin is one row gap
  below the header, which is a notice on `/insights` as often as a panel.
- **Nothing moves on its own on a desktop** (owner's call): the contour version's wavefronts played on
  load, and that is why it lost. Everything answers the reader:
  - **A mouse** moves a lens with no shape of its own (a denser disc under it read as "not pleasant"
    and buried the swarm). Under it the events come out as hard pixels, fainter further from the
    pointer, and the event nearest writes its magnitude beside it in a 3×5 bitmap font, the largest
    other one in the lens more quietly. The digits dither in through the Bayer matrix (the owner's
    favourite detail) and out faster. Labels stay while their event is in the lens, so they do not
    flicker; the lens opens only over the pattern and closes over a card.
  - **The header's title and subtitle switch to a bitmap font together**, as one block, while the
    pointer (or a tap) is on either, and back once it leaves (`pixel-text.ts`). The font is after the
    HD44780 character LCD's 5×7, with a 4-wide lowercase, descenders and Spanish accents; the title's
    pixel is 3 px (the grid's cell), so its capitals are 21 px like Geist's at 30 px, and the 16 px
    subtitle's 1.5 px in a tall cut (row 5 twice), within ~6 % of Geist's height. Each word is set
    across the page word's own width, so nothing moves or shrinks as it switches: set in the font's
    own spacing the lines came out a tenth shorter, and the owner read it as the text jumping. Rasterising
    Geist onto the grid was tried first and was unreadable ("awful"). The switch is a scan: a 72 px band
    travels along each line on `--ease-slide` at one speed for every line (2.2 px/ms in, 3.6 out; at
    4 px/ms the owner could not follow it), the subtitle 60 ms behind the title; inside the band the words
    thin out under a mask while the glyphs resolve out of shaking noise at 20 flickers a second, with
    stray pixels sparking beside them. A crossfade came first and read as "naive". The page's words stay
    in the DOM throughout (selection, find, screen readers). The pointer on a control inside the header
    (the subtitle's "SGC" explainer) switches nothing, so its card opens over words that stay words.
  - **"Actualizar ahora"** sends one ring of pixels out from where it was pressed, lighting the swarm's
    events as it passes (`backdrop:ripple`, fired by `status-bar.tsx`).
- **A phone has no hover, so it gets the epicenter** (owner's request): the largest event as a filled
  orange pixel disc with its magnitude, in the header's most open spot (the point furthest from every
  line of text and every control, leaning right; placed by geography it fell on the title on
  `/insights`), with rings of pixels rolling out from it. Here gentle motion on its own is wanted, since
  a phone would otherwise be static: the rings roll at 12 px/s, stepped at 15 frames a second, only
  while they are on screen in a visible tab and never under reduced motion. A scroll pushes them 1.5×
  its distance and brightens them (the header is on screen only for a little of a scroll, and the owner
  asked for it "sensitive to the scroll"); a tap on the pattern and "Actualizar ahora" send one strong
  ring. It is orange, not the red the owner first suggested: red is the page's colour for a failure,
  and Pereira's on `/insights`. Which version a device gets is `(hover: hover) and (pointer: fine)`.
- **Reduced motion** keeps every picture and drops every movement: the lens and the text switch jump,
  and no ring rolls or travels.
- **Checking it headlessly**: agent-browser's viewport keeps a fine pointer, so the phone's version
  needs Chrome DevTools MCP's `emulate` with `390x844x3,mobile,touch`. The cost is under
  [Performance](performance.md).
- **What the reader's language, theme and the web font change**: a new language or theme redraws
  (the header's glyphs are set from its words, the ink from the tokens), and so does the font once it
  lands, if it was not in yet.
- Ideas for richer drawings on `/insights` in the same language are issue #157, not built.

## Interface conventions

Settled in a six-domain interface review (accessibility, layout, copy, typography,
colour, motion). Keep to them:

- **The page opens in the browser's language** (owner's call, 2026-09-27; Spanish for everyone
  before that): the first of `navigator.languages` it has, by primary subtag, so `es-CO` is
  Spanish, and English when the browser lists neither (`browserLang` in `src/lib/i18n.tsx`). The
  toggle's choice is remembered per device, and choosing the browser's own language clears it, as
  the theme does with the system's. A shared link's preview stays Spanish (`SHARE_META`): the
  crawler that reads it has no browser language. Every new string goes into both `es` and `en` in
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
- **The zone is stated once, in the footer** (`timeNote`, drawn by `SiteFooter`: see "What both pages
  share" below), and never repeated on an individual timestamp. It used to hang off every one of them — the two status-bar
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
  - **`relativeTimeShort` is the same ladder for a figure with little room** (the status bar on a phone):
    `Intl`'s narrow units, "hace 7 min", "hace ~2 h", "hace ~3 d", "hace <1 min", with no copy of
    its own. The "~" marks hours and days only, which rounding moves by up to half a unit; whole
    minutes are exact enough to go without. A screen reader is given `relativeTime`'s long form
    instead (`Ago` in `status-bar.tsx`), since it reads "~" out as a word.
- **What identifies one event is a link to SGC's own page for it** (`sgcEventUrl` in
  `src/lib/format.ts`): the table's time column, with the UTC form on hover; the mainshock's
  magnitude; and the newest event's **place and magnitude** in the status bar, not its time (readers' request,
  2026-09-28: where and how strong is what they look for). A time that identifies no single event
  (the last SGC query) is not a link.
- **The page says that it updates itself, in the footer** (`autoUpdateLong`): readers were
  reloading it. It also said so under the refresh button until 2026-09-28, when the last SGC query
  took that line (see the status bar below). The "15 minutes" in `autoUpdateLong` is the cron in
  `wrangler.jsonc`, and `refreshWait`'s is `REFRESH_MIN_INTERVAL_S`, which is the same number for
  the reason given under the budget. `src/lib/i18n.test.ts` holds both to it; change them
  together.
- **The failed-ingest alert names no interval at all, and that is the settled answer.** It
  named the cron's own rate, in the one state where the fast lane has stood down and the
  cron's rate is wrong. It was changed to the wide tick's rate instead, and within the hour
  the 410s began and the probe dropped to hourly, so that was wrong too. Three lane rules decide that number and the reader can act on none of them, so
  `ingestFailedBody` promises a retry and stops there. What it must keep saying is "no hace
  falta recargar"; `src/lib/i18n.test.ts` holds both halves. Do not put a number back.
- **Three stand-down messages, three different truths.** `refreshWait` claims SGC answered
  within the last five minutes, so it may only appear when nothing has failed;
  `refreshStillFailing` replaces it beside the alert and must not tell the reader to press
  again, because while SGC is refusing us the Worker's own wait is an hour (it says who is
  retrying, "La página ya reintenta; no hace falta pulsar": it used to read "No se envió: ya hay un
  reintento en camino", with no subject, to a reader who had pressed "Actualizar" and sent nothing
  (issue #142). It is as short as it was on purpose: beside the button on a phone it is two lines, and
  the first version, "La página ya reintenta la consulta; no hace falta pulsar de nuevo", was three); `refreshFailed`
  is for the request from the *page* failing, which is a different thing again, and so names no SGC
  ("No se pudo actualizar", not "No se pudo consultar al SGC": that request never reached it). While the data is
  stale (`staleSince`), the stale line takes priority over all three: `refreshWait` would claim
  fresh data, and `refreshFailed` blames SGC for what is usually the connection.
- **The refresh button standing down is good news, not a countdown.** The throttle is the
  cron's own period, so it refuses most presses, so `refreshWait` says the reader
  already has the newest data instead of asking them to wait N minutes. It is a timed
  factual claim, so it is hidden as soon as a run fails — otherwise it would sit on
  screen asserting a recent successful query right beside the "la última consulta falló"
  alert, and it sticks until the next press.
- **Decimal point everywhere** ("M7.4", "Mc = 2.0"), matching SGC, the CSV and every
  computed number. Never mix in decimal commas.
- Terms: "sismo" only for the mainshock, "evento" for catalogue entries, "valor b",
  "Mc / magnitud de completitud". The 3D tab too (its layer is "Eventos").
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
    (`oklch(0.54)` since 2026-09-26; shadcn's 0.556 was 4.34:1 on a `--muted` fill) is 5.04:1 on
    white and 4.85:1 on these fills, so a fill much deeper takes it under AA. Hence
    fills at `oklch(0.988 …)`, about Tailwind's `*-50`, with the **border** carrying the
    colour at this size, as it does in the shadcn "custom colors" alert these follow.
    Dark mode has the headroom (the grey sits at 6:1) for a real step off `--card`.
    Measured in the browser, light then dark: caution title 4.77 and 10.40, failure title
    8.24 and 6.89, descriptions 4.85–4.86 and 6.03–6.07, borders 1.36 and 2.12 against the page.
  - **The two `-strong` values are a fixed 0.11 apart in lightness**, red the darker in
    light mode and amber the lighter in dark. The two alerts used to stand in the status bar at
    once; they no longer do ("One alert at a time" below), and the separation stays so they
    remain distinct if they ever meet again. Their hues alone are 0.048 apart in OKLab for a
    tritanope — under the 0.10 that reads as one colour. Lightness is what survives, as it does for the clusters.
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
  must be within the first screen. The b card's plain description ("Cuánto pesan los eventos
  grandes frente a los pequeños…") is a caption under the number, not the card's description: at
  375 × 812 the figure had 2 px to spare. With it there, the figure ends at 786.
- **The status bar leads with the newest event's magnitude and place** (readers' request, owner's
  pick of three variants tried on the real page, 2026-09-28; the prototype is on the branch
  `prototype/status-bar-place`, never merged). "Evento más reciente" reads "Chaparral, Tolima
  (M 2.5)", place first and all of it one link to SGC's page for the event, with how long ago and
  the date under it.
  Then "Eventos" and "Sismo principal". "Última consulta al SGC" is no longer a stat: it is the
  line under the refresh button, which it concerns, in the place of "Se actualiza sola cada N
  minutos" (the footer still says that): how long ago, and from `sm` up the clock time too.
  - **The hint under "Eventos" says what the total is the total of, and only while a filter narrows
    the count** (issue #142, 2026-10-01): "de 1037 en el catálogo" / "of 1,037 in the catalogue", as the
    scope bar's "Mostrando 639 de 786 eventos" says it (it was a bare "/ 1037": of what?). On a phone it
    is `eventsOfCatalogueShort`, "de 1037 en total", through `ByWidth`. The total is the catalogue's own
    length, as the scope bar's, not the status poll's, which can be a refetch ahead of it. Unfiltered it
    says nothing: the count is the whole catalogue. **A worded hint when unfiltered was built first
    ("todo el catálogo") and measured against `main`, and dropped**: on Chocó at 640 px the stat row has
    2 px to spare (Eventos is 51 px wide, and a stat that no longer fits takes the next line), so the
    wider hint put the card a row taller (176 → 264 px) from 638 to 675 px, in both languages. Measured
    on 28 renders (both zones and languages, 320, 375, 390, 640, 768, 1024 and 1280 px) the unfiltered
    card is exactly `main`'s height with the next card at the same top; filtered, the phone widths are
    too, and 640 px on Chocó is the one place it is a row taller, while the reader has narrowed the count.
  - `/api/status` carries `newestEvent` (id, time, mag, region), read in the same indexed
    one-row query as the id alone was. The status bar takes it from there rather than from the
    catalogue, which can be a refetch behind the status poll.
  - **The magnitude has no type** (owner's call, 2026-09-28): the line says how strong, not on which
    scale. The code review asked for the type, since "M" is only 64 of the fixture's 1,435 events
    and the rest are MLr_1, MLr_2 and MLv; "M2.5 (MLr_2) · Chaparral, Tolima" was built, and the
    owner dropped it for the shorter line. The mainshock keeps its "(Mw)", and the b card is where
    the types are compared. "(M 2.5)" is written with a no-break space and stays whole. The place is `fmtPlace`, SGC's "Chaparral - Tolima" as "Chaparral, Tolima"; the table, the chart and the
    map keep `fmtRegion`'s form. SGC writes no accents ("Choco", "Bolivar") and the page does not
    add them. The time under it keeps the UTC form on hover.
  - **A long place is one line and an ellipsis, at every width** (owner's request, 2026-09-28).
    `admitEvent` stores SGC's region as it comes, with no length limit, and the first version let it
    wrap: tried on the page with four places (the longest real one, "El Litoral del San Juan
    (Docordo), Choco"; "Providencia y Santa Catalina Islas, Archipielago de San Andres, Providencia y
    Santa Catalina"; one 70-letter word; ~200 characters), a phone's card grew to 428 px against 260,
    a long row pushed "Eventos" and "Sismo principal" under it at 1280 px, and the unbroken word
    ran 817 px wide out of a 288 px card. Now the place is a `truncate` span that cuts at the
    character, "(M 2.5)" is a separate span after it that never shrinks. How wide the place may be:
    on a phone, the card's width; from `sm` to `lg`, where the row wraps, at most `max-w-xs`, the
    room beside "Eventos" and the mainshock at 768 px; from `lg`, where the card is one row, whatever
    the row leaves: the row stops wrapping, the other stats and the button block keep their width
    (`shrink-0`), and the newest event alone shrinks, to no less than 160 px (`min-w-40`). A fixed cap
    there was tried first: 320 px let a long place push the button block onto a second line in
    Spanish at 1024 px, whose last-query note is longer than the old "Se actualiza sola…", and 240 px
    cut "Bolivar, Valle del Cauca" with 100 px of the row empty. The full place stays the link's
    accessible name, its `title` and SGC's own page. Also tried and dropped: two lines on a phone
    (`line-clamp`), which cut at a word and left the magnitude floating up to a word's width away, in
    a column of its own that pushed the real longest place into the cut at 320 px. One line also
    means the card's height never depends on the next event's place. The underline breaks for
    the space before "(M": the browser does not underline a flex item's leading space.
  - **Declined in the code review** (2026-09-28): keeping `newestEventTime` and `newestEventId`
    beside `newestEvent` for pages open across the deploy. Such a page shows "—" for the newest
    event until it is reloaded, and nothing else breaks; the repo keeps no legacy shapes. Running
    `status()`'s five D1 reads together rather than in turn is a fair follow-up, not this change.
    **Declined in the interface review**: an sr-only "(ficha del SGC, abre otra pestaña)" on the
    place link. The table's time and the mainshock's magnitude link to SGC the same way, and one
    link out of three saying so would be the odd one; if it is wanted, it is a convention for all.
  - **Why not the other two variants.** B set the magnitude as a headline figure beside the place;
    it competed with the b-value's own large figure just below, and the b-value leads the page. C
    listed the three newest events; on Tolima all three read "Chaparral, Tolima", and it cost 29 px
    on a phone.
  - **While a run has failed**, the note says "Última consulta correcta al SGC" ("Consulta
    correcta" on a phone): its time is the last query that worked, and "Última consulta al SGC:
    hace 2 horas" beside "La última consulta al SGC falló" read as a contradiction. The line stays
    shown, unlike the old cadence note, which went quiet because it promised a cadence that had
    stopped. It is outside the live region: it changes every minute and would be read out as news.
- **The status bar is a grid on a phone and one wrapping row from `sm` up** (owner's call,
  2026-09-27). Each phone form is a `*Short` key in `i18n.tsx` beside its wide one, and `ByWidth`
  in `status-bar.tsx` shows one or the other in CSS at `sm` (as the scope bar does), so nothing
  swaps in after the first paint, and the hidden form is out of the accessibility tree. PR #86 made
  the phone's compact copy apply at every width, and the owner had it taken back off wider screens
  the same day: keep a change meant for one width from reaching the other.
  - **On a phone** the newest event spans both columns, since a place such as "El Litoral del San
    Juan (Docordo), Choco" needs the width, and "Eventos" and "Sismo principal" share the row under
    it. The time under the event leads with how long ago, in `relativeTimeShort` ("hace ~2 h"),
    then the clock time, with the day only when it was not today (`fmtClock`). The last-query note
    sits beside the button ("Consulta al SGC: hace 7 min"). A **hint** may wrap inside its column
    (the mainshock's does, "el mayor, solo +0.3 sobre el 2.º"). Measured against `main` on
    2026-09-28, 120 renders: both languages, both zones, the real place and the four long ones, at
    320, 390, 640, 768, 1024 and 1280 px. The link never passes the card's edge, and the card is
    never taller than on `main`; it is a row (88 px) shorter at 640 px on Tolima in English and at
    768 px in Spanish, where the four stats used to wrap. Units that must not
    part from their number take a no-break space ("el 2.º").
  - **From `sm` up** a stat is as wide as its own longest line, and one that no longer fits beside
    its neighbour takes the next line whole, so which stats share a line is a consequence of the
    text. The newest event gives how long ago, then the full date. The refresh note sits under the
    button: at the start edge on its own line below `lg`, and hugging the end edge beside the stats
    at `lg`.
- **The filters card is three groups** (`filters.tsx`, owner's request, 2026-09-27): when (the two
  dates), which events (the smallest magnitude, "Solo revisados", "Excluir sismo principal"), and the
  Mc the b-value is fitted above, which selects no events. One column each from `lg`, dates and
  events side by side from `sm` with Mc under the dates, stacked in that order on a phone. Each
  date's label sits beside its input (a subgrid, so "From" and "To" line up), which saves a label's
  height twice and reads as one range. The date-order error goes under both. The card went from
  268 to 148 px tall at 1280 px, 329 to 148 at 1024, and 489 to 319 at 390 (Tolima). Space alone separates
  the groups: 24 px between them against 8–12 px inside one.
  - **Why the automatic Mc uses maximum curvature is an info tip**, not a paragraph. As four lines
    under the Mc slider it set the height of the whole row and left three columns empty. The icon
    follows "Automática (curvatura máxima)", or "Manual · Usar la Mc automática" when Mc is set by
    hand, since that method is what it explains.
  - **`InfoTip` (`info-tip.tsx`) is the page's info icon**, on shadcn's `Tooltip`: hover and focus
    open it, as Radix does, and a tap opens and closes it, which Radix does not (it ignores touch,
    and closes on every press and click). The behaviour is `info-tip-tooltip.tsx`. It cancels Radix's
    own press and click handlers, and a click decides from what the press found (`openAfterClick`):
    a phone that focuses what it taps has opened the tip on focus before the click arrives, so a
    plain toggle closed it again. A click from the keyboard (`detail` 0) only opens, and a press
    that became a scroll (`pointercancel`) is forgotten, or it decided the next Enter. The tip's
    dismiss layer ignores presses on the button itself: to Radix the button is outside the tip, so
    a mouse click blinked it shut on the press and open on the click (found writing the test).
    One component for both, not a `Popover` on touch: a laptop with a touch screen reports a
    fine pointer and would have got a tip that no tap opens. A tap elsewhere, Escape and a scroll
    close it. The text is the button's description at all times (`aria-describedby` on a `hidden`
    copy, which a description may point to), so a screen reader reaches it without opening
    anything, and once: as an `sr-only` copy in the line it was read a second time. It opens
    below the icon, so it does not cover the value it explains, and stays inside the 16 px gutter
    (`collisionPadding`). `TooltipContent` is capped at the width Radix says is free, or the tip's
    320 px ran off a 320 px phone. On touch the 44 px hit area reaches 4 px back, 20 px forward, 8 px
    up and 16 px down (`icon-inline`): a symmetric one covered the last 8 px of the link back to the
    automatic Mc and the bottom of the Mc slider's track (code review; measured with the page's
    coarse-pointer rules forced on, clear of both).
    `info-tip-tooltip.test.ts` renders it (happy-dom) and fires the events each device sends; each
    of the handlers above was removed in turn and a test failed. Checked in a browser with a mouse,
    the keyboard and synthetic touch sequences in both orders (Android's focus-on-tap, iOS's
    without); not on a physical device.
  - **The tooltip is its own chunk** (see [Performance](performance.md)). Radix's Tooltip brings
    Popper and floating-ui, 14 kB gzipped that nothing else loaded at startup, and in the first
    chunk they cost both pages that much, `/insights` included, which has no tooltip. `InfoTip` draws
    its button at once and imports the behaviour in an effect, once for every tip on the page; the
    button it then wraps looks the same, and takes focus back if the one it replaced had it. Not
    `lazy`: it suspends even on a chunk that has arrived and holds it back 300 ms, and a failed load
    is thrown to the nearest error boundary, of which the page has none, so a stale chunk after a
    deploy would have blanked the page. A failed load leaves the button as it is. Neither page
    mounts a `TooltipProvider` at its root any more: `InfoTipTooltip` brings its own, and a root one
    would pull the module back into the first chunk. A new tooltip should go through `InfoTip`, or
    load in the same way. One provider per tip costs nothing today: the delay is 0, so there is no
    skip-delay to share, and Radix closes any open tooltip when another opens, provider or not
    (declined in the code review).
- **A word that explains itself is an explainer** (`src/components/explainer/`, issue #144,
  2026-09-30). A source ("Servicio Geológico Colombiano"), a link ("artículo del SGC") or a term
  ("réplicas", "Mc") opens a card: a source's logo or name tile, who they are and what this page takes
  from them; a link's publisher, title, one line on what is there and the way out; a term's plain
  definition, with a small animated drawing where movement is the explanation (`figures.tsx`: b tilting
  between 1 and 0.7, Mc's missing small events, a swarm against aftershocks, the ×32 energy squares,
  waves leaving the hypocentre, the plate sliding under the continent, the two depth groups). Chosen
  from three prototype variants (branch `prototype/explainer-cards`, never merged; the verdict is on
  #144): a compact card beside the word with a mouse (A) and a sheet from the bottom on touch (B's),
  over the same card inline in the text (C).
  - **One definition per thing, in `entries.ts`**, both languages; a page names an explainer by id
    (`ids.ts`) and never repeats its words, so USGS cannot be expanded two ways again (the story said
    "EE. UU." where the questions said "Estados Unidos"; both now say the latter). A link's address is
    the page's, passed as `href`, and TypeScript requires one for every link explainer.
  - **How it opens is `interaction.ts`, a pure function, tested path by path.** A mouse opens a preview
    after 350 ms over the word and closes it 250 ms after the pointer has left both word and card, so the
    pointer can travel into it; a click pins a term's card and a second click lets it go; a click on a
    link follows it. On touch a tap opens the sheet instead of following a link (the sheet has a button
    the width of the screen to leave by), and the next tap closes it. The keyboard's focus previews,
    Enter on a term opens the card with focus on the card itself, where a screen reader starts at its
    title; Escape closes and gives focus back to the word, without previewing it again, and Tab out of either end of the card returns to the word, since the card is
    portalled to the end of the page. A card opened while another is open, or within 500 ms of one
    closing, skips the pause and the entrance; so does one opened from the keyboard.
  - **A device that cannot hover never shows the card** (`(any-hover: hover)` false: a phone). The
    surface used to follow each event's pointer type, and on a phone the card opened when a click came
    with no `pointerdown` before it (the press then defaults to a mouse's), from a screen reader's
    activation (`detail` 0 reads as Enter), and beside a mouse-type pointer resting on the word (a
    trackpad, DevTools' device mode); a real touch tap always gave the sheet, so it showed up now and
    then. `next` takes `canHover`: without it nothing previews and every press of any kind opens the
    sheet. That includes the keyboard: Enter on a link there opens the sheet (whose button follows it)
    instead of following it, and keyboard focus previews nothing. A laptop or an iPad with a trackpad
    keeps the per-pointer rule, and with it the same three slips (they need a mouse, an assistive
    technology or a missing `pointerdown` on a device that can hover). Checked with real touch input
    over CDP (`Input.dispatchTouchEvent`), not synthetic events alone: `explain.test.ts` holds the
    cases, and the DevTools MCP's `click` is a mouse press, so it cannot stand in for a tap.
  - **Radix's Popover, not its HoverCard**, which ignores touch and keeps its content from the keyboard.
    The sheet is shadcn's `Sheet` with a `card` layout (a local addition in `ui/sheet.tsx`: flush, rounded
    on top, scrolling past 85 % of the screen) and a close label in the page's language (`closeLabel`;
    shadcn's was always "Close"). On a tap focus goes to the sheet itself, not its close button.
  - **A term is a `span` with the button role**, answering Enter on the press and Space on the release:
    a `<button>` stays one box and cannot wrap inside a sentence, and "Servicio Geológico Colombiano
    (SGC)" wraps at 320 px. Dotted underline in `muted-foreground`, darker on hover and while open,
    `cursor-help`; a link keeps its own look (`linkClassName`, the questions tab's tighter underline).
  - **Where**: the first use in each story step and each question, never an SVG or WebGL label, a form
    label, text already inside a link or a button, or an `aria-*` string. The monitor: the header's SGC,
    "Sismo principal", "Valor b", the "Mc" badge (a word of its own before the rolling figure, whose custom
    element no underline reaches), the depth groups' title, the caveats' magnitude types and automatic
    events, and the footer's query form. Not the 3D viewer's links (Open-Meteo, ESA): the viewer is its
    own modal with its own focus loop, which a card portalled outside it would fight. Not the per-event
    links to SGC (status bar, table): their words already say which event they open.
  - **The static headers hold one** (SGC in both subtitles): the word renders the same before and after
    hydration, and `src/page-root.test.ts` and `src/insights/hydration.test.ts` compare the subtitle's text
    with its template filled in. The monitor's words did not change, so its measured line breaks hold;
    `/insights`' English subtitle now names SGC in English, as the monitor does.
  - **Copy with an explainer is a template**: `{placeholder}` sentences rendered through `Rich`, moved to
    `src/lib/rich.tsx` for both pages. The questions tab and the monitor's caveats use it too now; their
    tests fill the template before reading the words.
  - **A failed chunk leaves the page as it was**: a link is a plain link, a term a plain word
    (`explain-failed.test.ts`). A tap that arrives before the chunk marks the word `aria-busy` and pulses
    it, and a second tap then does not cancel it (`explain-slow.test.ts`). Focus moving into the card is
    Radix's FocusScope, which happy-dom does not run: checked in Chrome (below). A second tap waits for
    the card, but a link's click or Enter is always followed; after a failed download a hover or focus
    opens nothing. **A failed download is final until a reload** (declined in the code review: retrying
    it). Chrome keeps a failed module for the document's life: offline and back online, a second
    `import()` sent no request at all (Chrome 154, the DevTools network log). The page is whole without
    the cards. A word that goes while its card is open (a refetch
    rewrote the sentence) still counts it closed. The sheet stays mounted, so it slides away and gives
    focus back to its word; each drawing's SVG is hidden from a screen reader, never its caption or its
    controls (code review, 2026-09-30).
  - **A drawing plays once, when its card opens, and rests on the finished picture**; a replay button
    (↻, "Repetir la animación") beside its caption plays it again (owner's call, 2026-09-30: nothing moves
    by itself). The prototype looped; the owner chose this instead. b tilts once from 1 to 0.7 and its two
    buttons are its replay; Mc's bars rise once, an entrance with nothing to replay; the depth groups are
    still. Reduced motion gets the finished picture and no replay button (`figures.css`).
  - **Logos**: SGC's alone, which is in the public domain on Wikimedia Commons; every other source is its
    short name in a neutral tile, never in its own colours. Why, per source, is in
    [Security](security.md). The drawings sit on the sheet's `muted` band, so their ground and land are
    tints of `muted-foreground`: in `muted` they vanished.
  - **A chart's name is its explainer** (issue #145, 2026-10-01; `ChartName` in `charts/chart-name.tsx`):
    "Distribución frecuencia–magnitud", "Valor b en el tiempo" and "Magnitud en el tiempo" in their cards'
    titles open a card on how to read the chart, one pattern for the three (owner's call, after an
    `InfoTip` beside each title was planned and dropped). **No icon**: the name itself is the trigger,
    with the dotted underline every term has, so a title takes no more room than its words (measured at
    320 px in both languages: 22 or 44 px, as on `main`). `InfoTip` stays for one-sentence answers beside
    a control (the filters' maximum curvature).
    - **What the card holds** (`CHARTS` in `entries.ts`, a `chart` kind): a small drawing of the chart
      with its marks named, two or three short paragraphs (what each mark is, why the axis is
      logarithmic, what the slope says, where Mc shows), and for "Valor b en el tiempo" the note that it
      is not a forecast. The drawings use made-up numbers, as every explainer's do. The window drawing
      moves, once, because the moving is the explanation (a window of 8 events stepping 2 at a time,
      adding its stretch of line), then rests on its last window with a replay button; the other two
      are still. A sheet's kicker says "Cómo leer el gráfico".
    - **The b-value, Mc, magnitude and the mainshock are named, not defined again**: a `{placeholder}` in
      a paragraph becomes that term's own explainer inside the card (`CHART_PARTS`), opening its card
      over the chart's: card on card with a mouse or the keyboard, sheet on sheet on touch. Escape closes
      one at a time and focus goes back to the word it came from. A word inside a card keeps the
      350 ms pause and the entrance (`NestedExplainers`): the open card counts as warm, and without
      the pause every term the pointer crossed in the text opened at once. The window figures in the
      text (150, 10, 140) come from `@bvalue/seismo`'s constants.
    - **The description keeps the orientation in the open**: "Cuántos eventos hay de cada magnitud."
      for the frequency–magnitude chart, "Cada punto es un evento." as before, and for "Valor b en el
      tiempo" its windows and Mc in one sentence and the caution that overlapping windows make the line
      look surer than it is in a second (the science's rule; the card says why). The frequency–magnitude
      drawing's own text alternative keeps the old sentence (`fmdAlt`), which says what it draws.
    - **A card can be taller than a chart's**, so a popover is capped at the height Radix says is free
      and scrolls inside it, up and down only (`ui/popover.tsx`; `overflow-x-hidden`, or every card
      would have scrolled sideways too); a chart's card is `w-96`, a term's `w-80`.
    - **The chart's name lives once, in the page's titles** (`CHART_TITLE` in `ids.ts`): the card's
      heading reads the same string as the word that opened it, so a renamed chart cannot open a card
      under its old name.
    - **What the code review changed (2026-10-01):** a Tab out of a term's card inside a chart's card
      bubbled through the React tree to the chart's card, which took the inner word, its own last stop,
      for the way out and closed too (each card now answers only the keys pressed inside it;
      `explain.test.ts`); the window count in the text says "of their 150 events"; the sideways
      overflow above; the chart's name in one place.
    - **Declined in the code review:** *making a card opened while any card is open wait like any other*,
      in place of `NestedExplainers`. Skipping the pause while a card is open is #144's rule for reading
      along a paragraph; inside a card it is wrong, so it is turned off there and nowhere else.
      *Hiding a term's card when its word scrolls out of the chart's card* (Radix's `hideWhenDetached`):
      happy-dom lays nothing out, so every anchor counts as detached and every card in the tests hid,
      and the case needs a pinned card in a chart's card that is scrolled, on a window too short for it;
      Escape or a press anywhere else closes it.
  - **Set by hand, the line under the slider keeps its type and names the state first**:
    "Manual · Usar la Mc automática" / "Manual · Use automatic Mc", against "Automática (curvatura
    máxima)". The link is `Button` `link-inline` / `inline`: the line's own 14 px, regular weight
    and grey, told apart by its underline, dark on hover. It was `link` at 12 px, medium weight and
    near-black, and three changes at once read as a jolt on switching (owner's report,
    2026-09-27). It has no border, whose 2 px made the manual line taller than the automatic one
    (21.3 px in both now). It wraps (`whitespace-normal`): unwrapped, the old "Switch back to
    automatic Mc (maximum curvature)" ran past a 320 px card and stretched every field with it.
    Link and icon share one line down to 320 px in both languages (measured). Keep it short: a
    `<button>` stays a box even at `display: inline`, so once it wraps the icon cannot follow its
    last word (at 12 px, "Volver a Mc automática (curvatura máxima)" already did at 320 px).
- **"Magnitud en el tiempo" scrolls sideways when it is too narrow to read.** Below
  768 px of plot width every Colombian day gets `PX_PER_DAY` (28 px) instead of the
  whole range being squeezed in, which on a phone drew one solid band. The bars themselves
  come from `dailyCounts` (see [Events per day](#events-per-day)). The scatter and
  the "eventos por día" bars sit in **one** scroll container so a single gesture moves
  both, and both y axes are pinned: each is a small drawing of the tick numbers alone in a
  `sticky` column (`PinnedAxis`), placed by the same scale as the plot beside it.
  The view starts at the newest events and stays there through a refresh unless the
  reader has scrolled away from the right edge. Date ticks go from weekly to whatever
  fits in `TICK_GAP` while it scrolls. Above 768 px nothing changes.
- **"Magnitud en el tiempo" and its daily bars are drawn with D3's maths and React's SVG, not
  Recharts** (`charts/magnitude-time.tsx`, its pure parts in `charts/day-axis.ts`; issue #126,
  2026-09-30; the numbers are in [Performance](performance.md)). With the dots at Recharts' size the
  card matched the Recharts build to the pixel wherever the old chart was right (below). What a change
  must keep, and what was changed from Recharts on purpose (owner's rule: fix the old chart's bugs,
  do not copy them):
  - **The layout is Recharts'**: a 10 px margin on the left, 12 on the right, 8 on top, a 30 px strip
    for the date labels, the first day starting 20 px inside the plot (`FIRST_DAY`) so its label,
    centred on the day's start, is not cut by the drawing's edge. A bar is 2 px clear of its day on
    each side and a whole number of pixels wide (`dayBar`), and its coordinates are written to four
    decimals, as Recharts wrote them: with the full float some bar edges came out a step apart.
  - **Changed: a dot is 28 px² and the mainshock's star 160 px².** The Recharts build asked for those
    sizes (`ZAxis range`) and never got them: without a `dataKey` Recharts ignored the range and drew
    both at its default 64 px², so the star was no larger than the dots around it and a thousand
    9 px dots ran together. This is the one change every reader sees; the two sizes are `DOT` and
    `STAR`.
  - **Changed: the tooltip is on the mark nearest the pointer, within 5 px of its edge (11 for a
    finger)**, where Recharts needed the pointer exactly on a dot, a 9 px target then and a 6 px one
    now. Of two marks as near, the one drawn on top wins, and the star is read anywhere on it (a first
    version measured to every mark's centre, and the star's points were out of reach: code review).
  - **Changed: a tooltip stays inside what is on screen.** Recharts kept it inside the whole plot, which
    on a phone is 1,260 px wide with ~275 on screen: a dot near the visible edge had its tooltip cut
    off by the scroll container or under the pinned axis (measured on `main` at 390 px: 23 to 161 px
    cut). The area is read when the reading is made and again whenever the chart scrolls or changes
    width under a tooltip (`area` from `useReading`, given the scroller's `view`). A tooltip is at most the visible
    plot wide, and at most 360 px, and a longer place wraps (`--tip-max`, `wrap-anywhere`): on `main` a
    70-letter word made the tooltip 459 px wide and the scroll container 161 px wider.
  - **Changed: a lifted finger lets go of the tooltip**, as on the frequency–magnitude chart. On `main`
    a sideways drag left the last tooltip standing over the chart, cut off, while the reader scrolled.
  - **Changed: the keyboard walks every event in the order they happened.** Recharts' layer walked one
    depth group only (660 of Chocó's 809 events) and never reached the mainshock. Focus from the
    keyboard shows the first event on screen, which without scrolling is the first of all, or the one
    the keyboard was last on; the arrows step, Enter hides and shows the tooltip, blur hides it. The
    tooltip sits by its dot, with the same dashed cross as the pointer's.
  - **Changed: the keyboard's point is scrolled into view** (`ScrollView.reveal`), and the arrows no longer
    also scroll the container around the chart. On `main` the keyboard's day could be 40 days off
    screen. A press on a dot focuses the drawing too, and shows no keyboard reading
    (`:focus-visible`).
  - **The pointer and the keyboard never both hold the tooltip: the one used last does.** An arrow
    clears the pointer's reading, and a pointer that moves onto a mark or a day clears the keyboard's,
    so Enter on the bars can only choose the day the tooltip names (a first version let a resting
    pointer's tooltip hide the keyboard's day, which Enter then chose: code review). The browser sends
    a mouse move from where a resting pointer already is whenever the chart moves under it. After the
    keyboard's own scroll that move is ignored, or it would take the tooltip back; after the reader's
    scroll (a wheel, a trackpad) it counts, so the tooltip goes on naming what a press there would
    choose. Since issue #138 this is `useReading`'s rule for every chart ([the chart kit](#the-chart-kit-packagescharts)),
    and a move from the same place with nothing moved under it is no move at all.
  - **A pinned axis writes a thousand and over in thousands** ("1k", `tickLabel`): its column has room
    for three digits, and "1000" lost its first one to the column's edge. No day has had more than
    ~190 events; the axis is ready for one that does.
  - **Changed: every date label is centred on its own day, or not drawn.** Recharts pulled the last
    label inside when it crossed the drawing's edge and drew it there: on a scrolling chart "24 sept",
    the end of the last day, sat ~10 px before its place and took the room of "21 sept", the last
    regular label. Labels are chosen by `ownPlaceLabels` (tested), and the end of the last day gets a
    label only where it fits (Tolima's "1 oct" at 1280 px, which Recharts drew 3 px off, is gone).
  - **Changed: labels need 24 px between them, not 40** (`LABEL_GAP`). At 40, a scrolling chart's
    labels, 81 px apart and ~41 px wide, cleared one another by under a pixel, and Tolima's on a phone
    (72.5 px apart) did not: every other one was dropped, "23 sept" and "29 sept" where every third
    day was meant.
  - **Changed: the day under the pointer is marked.** The band behind the hovered day was `--muted` at
    8 % opacity, which cannot be seen in either theme; it is `--muted` whole, shadcn's own bar cursor.
  - **Changed: the dashed cross follows the theme** (`muted-foreground` at 50 %). It was a fixed
    `#ccc`, the one mark on the chart that ignored dark mode; in the light theme it is a step darker
    (about `#b9b9b9`).
  - **Changed: a catalogue of one day has its bar.** Recharts sized a bar from the gap between two
    days and drew none for one (the date filter set to a single day). A bar's width is now the day's
    own, and where a day is narrower than 5 px (a sequence of ~220 days at 1280 px) it keeps half
    the day, where Recharts' rule gives no width.
  - **Changed: the chosen days' band survives the date filter.** Recharts discarded a reference area
    that reached past the axis, so a choice the filter then cut into lost its band while the bars
    stayed grey; the part still on the axis is drawn (`bandOnAxis`).
  - **Gone with Recharts**: the pinned axes as data-less charts with a seed point, `interval={0}`,
    the probe components that read Recharts' scale and active label, and the `!important` pointer
    rule. `FIRST_TICK_PAD` stays as `FIRST_DAY`: the first label needs the room whoever draws it.
  - **What a pointer does not change is built once per catalogue and size** (`marks` in `Dots`, the
    grid and labels in `DailyBars`): a move redraws the cross and the tooltip, not a thousand dots.
    A drag redraws the bars alone, as before.
  - **Checked** (agent-browser, `pnpm preview` of `main` and of this on the same catalogue): with the
    dots at Recharts' 64 px², screenshots of the card for both zones, both languages, both themes at
    320, 390 and 1280 px were identical or within 1/255, apart from the date labels above; then, as
    shipped, the mouse over dots and days, a press, a drag, a drag dropped with Escape, the keyboard
    path on both drawings at 1280 and 390 px, every keyboard stop counted on both builds, and four
    extreme place names in the tooltip at 320, 390, 640, 768, 1024 and 1280 px (inside the plot in all
    24 cases, against 13 cut off on `main`). Touch was driven through the DevTools protocol (tap,
    sideways drag, tap on a day and again), not on a physical phone. `magnitude-time.test.ts` holds
    the behaviour; each of 20 mutations of the component failed a test.
  - **Declined in the code review (2026-09-30), and done since:** *moving the keyboard walk, the
    pointer-moved rule, the tooltip's shell and the focus ring out of this chart* for the three to
    share. "Valor b en el tiempo" was being moved in another branch at the same time (issue #125).
    The tooltip's shell moved when Recharts was removed (`ChartTip`, the dark-tooltip bullet below);
    the rest moved with issue #138, into [the chart kit](#the-chart-kit-packagescharts). What is
    left here is what only this chart does: the scroller's width, the day choosing and its drag.
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
    in the tab order: a group named "Filtros activos", not a live region, since mounted with its
    chips and button it was read out whole on every filter step. An always-mounted sr-only
    `role="status"` announces only "Mostrando N de M eventos". It is laid out as one row wherever
    there is room, so the bar reads as the same object come back rather than a second thing.
  - The **bar** is fixed to the top of the window and **hands over from the notice**: it slides in
    once the notice has left the top of the window, and slides away when the reader comes back up
    to it. So exactly one of the two states the scope at any time, and the reader is never without
    it — which is the whole reason the bar exists, since everything below the fold is a chart drawn
    from a filtered catalogue. One `IntersectionObserver` on the notice decides it: no scroll
    handler, no pixel threshold, nothing running on a scroll frame. Its root runs from the top of
    the window down without end (`rootMargin: 0px 0px 100000px 0px`), so the notice leaves it only
    by its bottom crossing the top of the window, and `past = !isIntersecting`: a notice out of view
    *below* the fold, which is where a short screen starts, still intersects, and the bar does not
    stand in for it. Watched against the window alone, a jump from low on the page to the top on a
    short phone took the notice from above the window to below the fold without crossing it, and
    left the bar over the header (2026-09-26).
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
  - On a phone the bar shows the first chip and counts the rest (`+3`, right after that chip), shows
    "Quitar filtros" as its X icon alone with the words kept as its name, and shortens the count to
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
  string. `CardDescription` caps itself at `max-w-lg` (32rem, about 79 characters of Geist at
  14 px; `75ch` ran to about 107, because Geist's "0" is wide) and spans the header under the title
  and any `CardAction`, so an action never squeezes it into a column on a phone. A card that wants
  a full-width subtitle passes `max-w-none`.
- **The b card's fine print is collapsed** — the magnitude-scale caveat, the goodness-of-fit Mc and,
  when the start or end window may have lost small events, what its ⚠ means. Open, it made the card
  half again as tall as "Valor b en el tiempo" beside it: 189 px of the chart's card was empty.
  Folded, the row is 569 px instead of 779 px. Fold nothing whose only other home is that card: the
  mixed magnitude types and "no es un pronóstico" stay in the open under "Cómo leer estas cifras", and
  the incomplete windows in the open on the chart (its shaded stretch, key and tooltip), which is
  what makes hiding them here safe (owner's call, 2026-09-28). The ⚠ itself stays beside the row's
  figure, inside the line, so it never changes the card's height, and names the caution for a screen
  reader (`bWindowIncomplete`). The figure stays inline text with the icon `inline` in it: as a flex
  row its height followed the icon, and each flagged row moved the slider 2 px. With the detail open, the caution line can come and go as Mc moves;
  the detail's other lines already do, and it never happens while folded.
- **Both magnitude readings are in the open** (2026-09-28; the figures and the rule are in
  [the science](science.md#how-sure-b-over-time-is-from-2026-09-28)). Under the drift sentence, one
  sentence gives the reading on the tab the reader is not on ("Solo con MLr_1, el valor b sale 0.86 en
  todo el periodo y 0.83 al final…"), and each row of the b scale draws it as a hollow ring, named in
  the scale's key. `measure` computes that reading (`other` in `scope.ts`) above the same shared Mc,
  and a test holds each tab's `other` to what the other tab shows; the start and end rings and "…al
  final" are the other reading over the same spans as this tab's windows (`otherEnds`, see
  [the science](science.md#how-sure-b-over-time-is-from-2026-09-28)). The sentence sits over a hidden
  copy of its longest form, with stand-in figures: without an end window it loses a clause, and the
  card shrank a line when Mc ran the windows out. The reading's name in both keys comes from
  `otherReadingKey`, each card passing the values it draws (the chart its deferred copy).
- **"Distribución frecuencia–magnitud" is drawn with D3's maths and React's SVG, not Recharts**
  (`charts/fmd.tsx`, issue #118, 2026-09-29; why, and what it saved, in [Performance](performance.md)).
  It was rebuilt to be the same chart, checked against the Recharts build pixel by pixel (below), with
  the old chart's bugs found on the way fixed rather than copied (owner's rule: parity is with what the
  chart is meant to do). What that took, each of which a change must keep:
  - **The layout is Recharts'**: 40 px for the y axis, 12 px on the right, 16 on top, a 30 px x axis,
    the drawing a whole number of pixels wide from the plot box's left edge (Recharts rounds its
    container), and the key under it as wide as the drawing less its right margin. The key is
    `ChartKey` (`@bvalue/charts`), drawn as shadcn's `ChartLegendContent` drew it; this chart no
    longer goes through `ChartContainer`, which wrapped Recharts' `ResponsiveContainer`, and takes its
    colours as the theme's own classes (`fill-chart-3`, `bg-chart-1`) rather than `--color-*` variables.
  - **The magnitude labels sit on their magnitudes** (`magnitudeTicks`, `charts/magnitude-ticks.ts`):
    Recharts' rule for a `tickCount` over a fixed domain, from the smallest magnitude to the largest,
    with its step rounded up to whole tenths. Recharts' own step could be 0.95 or 0.09, so on Chocó's
    whole catalogue "1.8" was drawn at 1.75 and "3.7" at 3.65, and on a narrow one (2.0–2.6) "2.5"
    appeared twice. Where Recharts' step was already whole tenths (Tolima's 0.4) the labels are its
    own, which a test holds to Recharts' function. They are then thinned as its default `interval`
    thinned them (`preserveEndTicks`; "4.3" goes before "4.5" at 390 px), with widths from a canvas, or
    0.6 em a character where there is none.
  - **The marks are Recharts' symbols** (`d3-shape`'s square and circle of 64 px², as paths): a
    `<circle>` of the same radius differed at every dot's edge.
  - **Mc is drawn only on the axis, and "Mc 2.7" is one string.** A manual Mc below the smallest
    magnitude left is off the axis, and Recharts discarded its reference line there; so does this.
    Changed from Recharts: on a catalogue of one magnitude the axis is a single value, which a scale maps
    to its middle, and Recharts drew "Mc 2.5" as a line through the M2.3 point there; it is off the axis
    too, and left out.
    Written as `Mc {value}`, React makes two text nodes, shaped apart, and the last digit moved a pixel.
  - **The tooltip is Recharts'**: on the magnitude nearest the pointer, 10 px below and right of it,
    on the other side where it would leave the plot (`tipPosition`, tested), gliding 400 ms between
    magnitudes, with the grey cursor line. Changed from Recharts: it appears where it belongs, where
    Recharts' first one flew in from the chart's top-left corner over 400 ms (it animated from
    `translate(0, 0)`), and again from wherever it was last shown (owner's call); and a lifted finger
    hides it, where Recharts left it over the chart after a sideways drag while the reader scrolled on.
    A tap still shows it, through the mouse events the browser sends after the touch, and now on the
    bin under the finger every time: Recharts' taps often showed the previous tap's bin (its hover index
    lags a frame, as on the day bars). A move is drawn within its event (`flushSync`), as Recharts' store
    drew it; left to React's scheduler the tooltip reached the screen a frame later. Measured at 4× CPU,
    a real mouse between two bins, 15 moves: on screen ~20 ms after the event against Recharts' ~30.
  - **The keyboard layer is Recharts' `accessibilityLayer`**: the drawing is a tab stop
    (`role="application"`, its `title` and `desc` the text alternative); focus shows a magnitude; the
    arrows step through every 0.1 step, empty ones included, and stop at the ends; Enter hides and shows
    the tooltip; blur hides it. Its tooltip sits at one height for every magnitude, where Recharts put
    it. Changed from Recharts: focus shows the magnitude the keyboard was last on, where Recharts showed
    one on the first focus only and a reader who tabbed back found the chart silent until an arrow.
  - **A reading is of a bin by its index, and a filter can leave fewer bins**: an index past the new
    last bin is no reading (the code review found the tooltip reading past the array and taking the card
    down), as Recharts dropped an active index outside its data. `fmd.test.ts` holds all of this.
  - **What a pointer does not change is built once per catalogue and size** (`marks`): a move redraws
    the cursor and the tooltip, not the ~150 marks.
  - **Checked** (agent-browser, `pnpm preview` of `main` and of this, the same catalogue): screenshots
    of the card for both zones, both languages, both themes at 320, 390 and 1280 px, identical to the
    pixel or within 3/255 in at most ~300 pixels (grid lines rasterised a step lighter), apart from
    Chocó's labels, above; the mouse over five points, the keyboard path, End, Home and Space (which
    scroll the page on both), at 1280 and 390 px: the same within 9/255 (the tooltip's shadow); a mouse
    scanned across the plot a pixel at a time changes bin at the same x on both; with no canvas, the
    same; a catalogue from M2.0 to M2.6 and one of M2.3 alone differ only by the two fixes above (the
    labels, the off-axis Mc). Touch was driven through the DevTools protocol (drag, lift, tap), not on a
    physical phone.
  - **Declined in the code review (2026-09-29):** *measuring the tooltip only when its content
    changes.* Each move commits new text or a new cursor, which leaves layout to be done for that frame
    anyway; reading the tooltip's box forces it earlier, not twice, as Recharts' own read did.
  - **The pointer, finger and keyboard rules above are one hook, `useReading` (`@bvalue/charts`)**,
    since issue #125: a chart gives it how many points it has, which point a pixel is on and how high the
    keyboard's tooltip sits, and gets back the reading to draw and the handlers. Every chart uses the
    same one since issue #138, so a fix to one chart's tooltip is a fix to all
    ([the chart kit](#the-chart-kit-packagescharts), which also lists what that changed here: the
    keyboard takes the tooltip from a resting pointer, and a bin is its magnitude).
- **"Valor b en el tiempo" is drawn the same way** (`charts/b-over-time.tsx`, issue #125, 2026-09-30;
  what it saved is in [Performance](performance.md)): `d3-scale` and `d3-shape` for the maths, React for
  the SVG, the shared pieces of `@bvalue/charts`. At rest it is the Recharts build's picture to the
  pixel, apart from which dates the axis labels (below), and the Recharts build's bugs were fixed rather
  than copied. What a change must keep:
  - **The layout is Recharts'**: 32 px for the b axis, 40 px on the right for "b = 1" and the last date
    label, 16 px on top, a 30 px date axis; the drawing a whole number of pixels wide from the plot box's
    left edge. Bottom to top: the grid (a line per b tick and one at each edge of the plot, once where a
    tick is on an edge), the shaded stretches, the ±1σ band, the mainshock's line, the dashed line, the
    line, "b = 1", the dots, the cursor and its three dots, and every label over all of them. The band, the
    lines and the dots are clipped to the plot's height and to nothing sideways, as Recharts clipped them.
  - **Two numbers are written as Recharts wrote them, because half a pixel decides a row.** A grid line
    keeps its unrounded height (394.50000000000006, not 394.5: rounded, the line moved a pixel row), and a
    shaded stretch's edges are rounded to four decimals.
  - **The time axis runs over both lines' windows**, this reading's and the dashed line's own, which can
    end later. The labels are chosen by `preserveEndTicks` (issue #96) from every window's end on either
    line, **in time order** (changed from Recharts, below), by the plot's width and font alone: its
    height follows the b card as Mc moves and measures nothing. Without a canvas a label is taken as
    0.6 em a character (`labelWidth`, shared with the frequency–magnitude chart), where the Recharts build
    fell back to measuring in the DOM: a little wide, so such a browser gets a label fewer, never two that
    touch.
  - **The mainshock is drawn only on the time axis** (Recharts' `ifOverflow="discard"`), its label 5 px
    in from the line and from the plot's top. Chocó's M7.4 is before the first window's end, so today no
    zone draws it; a catalogue with a clear mainshock halfway through was used to check it.
  - **Changed from Recharts, each a bug in the old chart:**
    - *The tooltip read the wrong window wherever the dashed line was drawn.* With `scale="time"` Recharts
      took every line's points as places the pointer could be on, the dashed line's included, but the
      tooltip describes this line's windows only. Scanned a pixel at a time on Chocó at 1280 px
      (2026-09-30): over 58 % of the plot's width the tooltip showed one window, "8 sept → 19 sept",
      whatever the pointer was on, with the cursor on a dashed-line point and the three dots up to 540 px
      away from it; and **the four latest windows, 20 to 27 September, could not be read at all**, by
      pointer, finger or keyboard (the arrows stopped at the window of 19 September, and the latest b the
      chart draws, 0.51, was nowhere in it). Why Recharts settled on that window was not looked into. The
      reading is now the window of this line nearest the pointer, anywhere in the plot, with the cursor
      and the dots on it; halfway between two is the earlier one's. The same scan reads all 44 windows,
      each with its cursor and dots on it. A test holds it with a dashed line whose windows fall between
      this line's and end later.
    - *The latest date gets a label.* Recharts collected its label candidates line by line, this line's
      windows and then the dashed line's, and chose from the last one back: the dashed line's last window
      took the end label whatever its date, and no later date got one. On Tolima at 390 px the axis ended
      at "28 sept", 8 px short of the line's end on the 29th; a dashed line ending days earlier would have
      left the latest days unlabelled. The candidates are now sorted, so the last label is the last date
      ("24 sept, 26 sept, 29 sept" there). This is the one change to the chart at rest: see "Checked".
    - *The keyboard's tooltip sits over the window it reads* (issue #125 asked for a decision): its
      bottom edge 10 px above the top of the window's ±1σ, to the right of the cursor, or under the band
      where there is no room above (`clear` in `tipPosition`, tested). Recharts put it halfway down the
      chart for every window, wherever the line was: on Chocó at 1280 px its top was 85 px under the
      first window's point. Beside the point, where the pointer's tooltip goes, was tried first and covered the windows
      the arrows step to next. The pointer's tooltip stays where Recharts put it, 10 px below and right
      of the pointer, which the reader can move. (The frequency–magnitude chart keeps the one height: its
      cursor crosses two series, and neither is "the" reading.)
    - *Focus shows the window the keyboard was last on*, a lifted finger lets go, the first tooltip
      appears in place, a tap reads the window under the finger, and a move is drawn within its event: the
      five fixes of the frequency–magnitude chart, which this chart has through `useReading`.
    - *Found by the code review in both charts, and fixed in the hook* (2026-09-30): a press on the
      drawing focuses it, and the keyboard's tooltip then appeared on the first window when the pointer
      left (focus from a press now shows nothing; the arrows still work from there); the arrows also
      scrolled a sideways-scrolling ancestor (they are the chart's now, `preventDefault`); and the
      pointer's reading was kept as an index, so new data or a new size under a resting pointer moved the
      tooltip to whatever had that index (it is kept as the pointer's place and read again on each
      render, and forgotten with the drawing).
    - *A reading of another magnitude type that is not drawn no longer stretches the b axis.* With one
      window (no line to draw) or no name in the key, its b still set the axis' range.
  - **The reading is its own component, `Reading`**, which owns `useReading`: a move renders the cursor,
    the three dots and the tooltip, and nothing of the card around them (code review; in the card, every
    pointer pixel re-rendered the header, the CSV button and the key).
  - **Declined in the code review (2026-09-30):** *one `ChartFrame`/`AxisTicks` for both charts' frame,
    svg, clip path, grid and tick labels.* The two differ in each of those (a key inside the frame or
    outside it, a log or a linear axis, grid rows deduplicated or never coinciding, labels over the cursor
    or under it), and the third chart ("Magnitud en el tiempo", #126, moved the same day in another
    branch) has pinned axes and a scroll container: the shared shape is better cut from three than
    guessed from two. Issue #138 cut it from three, and it is not a frame: what all three share is the
    drawing, the clip, the grid's rows and the labels' places, each its own piece of
    [the chart kit](#the-chart-kit-packagescharts), with `useReading`, `inPlot`,
    `labelWidth`, `ChartTip` and `usePlotSize`. *Moving the frequency–magnitude chart's reading into a child
    component too:* its hover was measured in #124 (~20 ms to the screen at 4× CPU) and is left alone.
  - **Kept from Recharts on purpose:** the three dots on the cursor, b and the two ends of its ±1σ, which
    are what the tooltip's "b = 0.58 ± 0.04" says; the dashed cursor over the plot's whole height; the
    arrows stepping through every window and stopping at the ends; Enter hiding and showing the tooltip.
  - **Checked** (agent-browser, `pnpm preview` of `main` at `aed8d13` and of this behind the proxy, the
    same catalogue): screenshots of the card for both zones, both languages, both themes at 320, 390 and
    1280 px. **With Recharts' label order, 24 of 24 were identical to the pixel.** With the labels in
    time order, 2 are identical and 22 differ only in the 12 pixel rows of the date labels (another day
    labelled, a few pixels along); everything else in those 22 is still the same pixel. The same holds
    for the edge cases, whose counts below are from before that fix: and five edge cases at 390 and 1280 px on both zones:
    a clear mainshock mid-catalogue, a catalogue of three and a half days (labels with the hour), one
    magnitude type (no dashed line), too few events (the message) and no canvas. 15 of those 20 are
    identical. One, the short catalogue on Tolima at 1280 px, differs in 1,913 pixels by at most 11/255
    with every coordinate in the two drawings equal: the differing pixels include the card's corners and
    the CSV button's icon, which this does not touch, so it is the rasteriser's, and the same on every
    run of each build. The four with no
    canvas differ in the date labels only (above). After the magnitude-type tab, Mc moved, Mc moved until
    the windows ran out and back, a resize from 390 to 700 px and one depth group, every label, dot,
    line and path of the two drawings is at the same place. A real mouse at five points and the keyboard
    path at 1280 and 390 px: identical where Recharts read the right window, and different exactly where
    the fixes above say (the arrows and Enter sent as in-page key events: see
    [development](development.md#tooling-gotchas)). Touch (drag, lift, three taps) through the DevTools
    protocol, not on a physical phone: the lift clears the tooltip, where Recharts left it over the chart.
- **A chart's tooltip is dark in both themes** (owner's call, 2026-09-30: the dark theme's tooltip,
  near-black with light text, in the light theme too). The surface is `ChartTip`'s own
  (`@bvalue/charts`), so the three charts' four tooltips cannot differ: a box with the `dark`
  class, which gives it and everything in it the dark theme's tokens (`bg-background`,
  `text-foreground`, `text-muted-foreground`, the caution icon's `text-caution-strong`, the border).
  A tooltip's content is therefore written with the theme's classes and no `dark:` variant, and a
  chart passes `className` only for what its own tooltip adds (`tabular-nums`, the magnitude chart's
  width cap). The text colour is set on the box: inherited, it would be the page's near-black. In the
  dark theme nothing changed. The filters' info tip is not a chart tooltip and keeps its own surface
  (shadcn's inverted `Tooltip`).
  - **The map's popup has the same surface** (owner's call, 2026-10-01, so the page's hover cards read
    as one). It is MapLibre's DOM, so `Popup` is given `className: "dark"` and `.maplibregl-popup-content`
    in `index.css` uses `bg-background`, `text-foreground`, `border` and `shadow-xl`, as `ChartTip` does,
    and its arrow is `--background`. Not the popover's tokens: in the dark theme `--popover` is a step
    lighter (`oklch(0.205)` against `0.145`), so the popup was lighter than the chart tooltips there too.
    Checked at 1280 px on the Tolima tab in both themes beside a chart tooltip. The zoom buttons and
    the attribution are controls, not tooltips, and keep the theme's popover surface.
  - Measured in the light theme at 320, 390 and 1280 px on both zones (2026-09-30): the box is
    `rgb(10 10 10)`, its text `rgb(250 250 250)` (19:1) and its secondary line `rgb(161 161 161)`
    (7.7:1), the dark theme's own values; every tooltip is inside the viewport and the page gains no
    sideways scroll.
  - **Declined in the code review (2026-09-30):** *a tooltip token or scope class of its own instead
    of `dark`*, since inside the box every `dark:` variant and `.dark` rule now applies in the light
    theme too. That is the request: the dark theme's tooltip, which a second set of tokens would have
    to be kept equal to by hand. What goes in a chart tooltip is text and one icon. *A test of the
    colours rather than the classes:* happy-dom compiles no Tailwind, so the colours are the browser
    measurement above.
- **A chart grows into the space beside it only where the extra height cannot mislead.**
  Cards in a two-column row are stretched to the taller one, so a fixed-height chart leaves a
  void under its legend. "Distribución frecuencia–magnitud" therefore fills its card (`flex-1`
  with `min-h-80`) instead of sitting at `h-80` with ~90 px blank beneath it: both of its axes
  are read off the data, so the room only spreads its points out.
  - **"Valor b en el tiempo" grows too, at a fixed scale** (owner's call, 2026-09-28; it used to keep
    `h-80`, centred). Stretching it would steepen a b-value decline the page is careful not to
    oversell, so `bAxis` (`charts/b-axis.ts`, tested) keeps the pixels per unit of b it has at 320 px
    and turns extra height into more axis, split evenly above and below; what does not fit under
    b = 0 goes on top. Ticks every 0.2. The plot's height is read in its ref callback, so the first
    frame is already at the measured height (waiting for the `ResizeObserver` drew one frame of the
    resting axis stretched over the taller plot: code review), and followed with the observer. The
    chart sits `absolute` inside a wrapper that has only `flex-1` and `min-h-80`: in the flow, each
    render measured 2 px taller than the last and the row crept down under the Mc slider. The same
    read gives the width, which places the date labels (chosen as Recharts would choose them, without
    its DOM measuring: [Performance](performance.md)), and the chart is drawn only once it has both. On a
    phone the cards stack, nothing stretches it and it stays 320 px. On a desktop, Tolima's axis
    runs 0.0–1.8 on 2026-09-28: its resting axis was already 1.0 wide, so the same scale needs that
    much range to fill ~550 px, and the lower third is empty. That is the price of keeping the slope.
- **"Valor b en el tiempo" says how few readings its line holds** (2026-09-28). A dot marks each window
  that shares no event with another (`independentWindows`); the line between them is drawn through
  windows that share 140 of 150 events. The description says the windows overlap, so the line looks
  surer than it is; the card its name opens says by how much, and that each point sits at its window's
  last event (issue #145). The other magnitude reading is a dashed line in the same blue, out of the
  tooltip, drawn only while the key names it. Windows that may have lost small events are shaded
  in `--caution-edge` (a run of one reaches halfway to its neighbours), and their tooltip adds both
  Mc. The key is hidden from screen readers, so the chart's `desc` names those stretches by date
  ("…las ventanas que terminan entre el 14 sept y el 18 sept…"), and the b card's caution names the
  chart by its title, not as "beside" it: on a phone it is below. The key (`BTimeKey`,
  `b-over-time-key.tsx`, apart from the chart's chunk) is drawn in the card's
  placeholder too, and over a hidden copy holding every entry it can have: its shaded-stretch entry
  comes and goes with Mc, and the card is above the filters on a phone. It keeps that room when the
  windows run out. Checked 2026-09-28 by stepping Mc from 2.0 to 4.0 on both zones at 320, 390, 1024
  and 1280 px, in English, and at 320 and 1280 px in Spanish: the filters card's top did not move.
- **Nothing above the filters changes height as Mc moves** (owner's report, 2026-09-27). The Mc
  slider sits under the b row and, on Chocó, the groups card, so every change of height there moved
  the slider under the reader's pointer (Chrome's scroll anchoring then moves the page instead).
  At Mc 3.2 on Tolima the windows ran out: "Valor b en el tiempo" dropped to a two-line message and
  the b card dropped its start / whole / end section, and the row lost 329 px (553 on a phone).
  What holds each state's height now, checked by stepping Mc from 2.0 to 4.0 on both zones at 320,
  390, 1024 and 1280 px in both languages (the filters card's top did not move once):
  - "Valor b en el tiempo" shows its empty message in a box of the plot's height (`h-80`).
  - The b card has one layout for every state. With too few events for two windows, "Todo el
    periodo" keeps its figure and mark and the start and the end are dashes on an empty track;
    with too few for b at all, the headline, the n and every row are dashes. One sentence says
    which: the drift, "Aún no hay suficientes eventos ≥ Mc para comparar el inicio con el final",
    or `bNone`. All three share one grid cell with the unused ones `invisible`, so the cell is the
    longest one's height in both languages and at every width. The sentence names no threshold:
    two windows exist from 160 events ≥ Mc, but there they share 140 of their 150 events, so 160 is
    when a comparison can be drawn, not when it means much (code review). Whether the drift should
    wait for windows that do not overlap (300 events) is an open question for the science, not
    decided here.
  - A row's window line ("primeros 150 eventos · 20 sept – 24 sept") sits under the label at full
    width, over a hidden copy of the widest it can be ("28 sept – 28 sept"), so a row keeps its
    height with dates, without them, and when they wrap at 320 px. A row with no window shows no
    line at all: "primeros 150 eventos" beside a dash read as a sample that does not exist.
  - Under 50 events the n badge carries the caution ("⚠ n = 45: poco fiable", `bFewSr` for a screen
    reader) rather than a third badge, which wrapped. In the b card it stays one badge and one
    `FlowNumber`, so n rolls across 50 like the other figures. The groups card's lines do the same.
  - The groups card's comparison paragraph holds both verdicts in one cell, and keeps its place
    when a group has no b; its "Detalle técnico" stays mounted and is only hidden, so it keeps its
    room and stays open if the reader opened it. Each group's b line has a hidden copy with the
    own-Mc caution beside it and the n as wide as its wider form, so it always has that room: about
    40 px of blank under the line on a phone when the caution is not shown. That is the price of
    not moving; the other way was the card jumping 28–56 px.
  - Checked: from 2.0 to 4.0 on both zones at 320, 390, 1024 and 1280 px in both languages, and with
    the dates narrowed to one day until b could not be fitted; the filters card's top did not move.
- A failed load shows the error only. It must never draw an empty dashboard that
  tells the reader to change their filters.
- **One alert at a time** (`src/lib/page-alert.ts`, 2026-09-26). The monitor used to stack the
  back-fill notice, the failed-ingest alert and the load error, which left the reader to work out
  which one was current. It now shows only the most serious: a failed load, then a failed SGC
  query (which stalls the back-fill), then the back-fill's progress. The b card's "Historial
  incompleto" badge keeps the incomplete-history caveat when the notice gives way. /insights has
  only the back-fill notice and the load error, and already shows one or the other.
- **The load error offers a retry, not a reload** (`load-error.tsx`, both pages). The page cannot tell
  a dropped connection from a failing server, so the copy blames neither; "Reintentar" refetches
  only the failed catalogue and reads "Reintentando…" through the query's own retries. On
  both pages only a catalogue the page never got is an error (`loadFailed`): a background refetch
  that fails keeps what is drawn, with no alert, and the next refetch tries again. The button stays
  focusable while it retries (`aria-disabled`), and a retry parked offline counts as running. An
  `aria-disabled` `Button` takes no pointer events; while it is also `aria-busy` it keeps its full
  colour: the retry and refresh buttons say they are busy in their label or spinner, and 50 % would
  take "Reintentando…" under AA. One that is only `aria-disabled` is off, and dims like `disabled`.
- **The monitor says it is struggling from the first failed request** (`retryAttempt` in
  `load-failed.ts`, owner's call, 2026-09-29). A 503 comes back in a fraction of a second, but the load
  error waits out TanStack Query's retries (1, 2 and 4 s), so for ~7 s the reader had only the
  skeleton. Now a caution alert takes the load error's slot above the skeleton: "Aún no se pudieron
  cargar los datos · La página lo vuelve a intentar sola. Intento 2 de 4", with a spinner. If the
  retries all fail, the same slot turns into the red load error; if one works, the page replaces it.
  Amber while it is still trying and red once it has stopped keeps "red means something failed". The
  first load only: after the load error, its own "Reintentando…" speaks. It is read out once, from
  the skeleton's `role="status"` (the alert's own `role="alert"` is dropped, one live region is
  enough), and the attempt count is `aria-hidden`, or each retry would be news. **A grey line with a
  spinner was tried beside it and dropped**: the owner found plain text easy to miss above a
  full-height skeleton. Also weighed and not built: fewer or faster retries (less resilience), and a
  "Probar ahora" button during them (it restarts the chain and adds requests, the problem the refresh
  backoff exists for).
- **An alert's button is its `AlertAction`** (shadcn's slot; owner's report, 2026-09-29). The
  back-fill notice's button (then "Cargar ahora") sat at the end of its sentence, and the load error's "Reintentar"
  under its text. Upstream pins the action top-right over 72 px of padding, which fits an `xs` button
  and not these (`sm-touch`), so `ui/alert.tsx` makes it a grid column beside the title and
  description from `sm`, top-aligned so the technical detail opening does not move it, and a row under
  the text on a phone. It takes `foreground`, not the alert's colour: inside the destructive alert
  "Reintentar" came out red, which reads as a destructive action. `AlertDescription` keeps to the text
  column like `AlertTitle`, so the load error's technical detail can follow the button on a phone
  as a second description.
- **Data a failed refetch left behind is dated, not hidden** (`staleSince` in `load-failed.ts`,
  interface review 2026-09-26). Kept silent, the monitor went on saying "Se actualiza sola cada 15
  minutos" with every request failing, and only "Última consulta al SGC: hace N min" grew, blaming
  SGC for the reader's connection. Offline, TanStack parks the refetch rather than failing it, so
  nothing failed at all; `staleSince` counts a parked refetch too. On the monitor the line under the
  refresh button then says since when the figures are ("No se pudieron actualizar las cifras: son de
  las 12:35. Se actualizarán solas."; `fmtClock`, with the day only when it was not today), in the
  slot of what is now the last-query note (then "Se actualiza sola cada N minutos"), as a caution: neutral text with a warning icon, never
  red, inside the live region. It names no interval and no reload, and blames neither the connection
  nor the server any more than the load error does. **The time is when the figures were fetched, and
  the copy says only that**: a first version read "Sin conexión con el servidor desde las 08:00",
  which a catalogue fetched at 08:00 and a refetch failing at 12:00 made false while the status polls
  still answered (code review, 2026-09-26). It takes priority over every answer to a press
  except a request actually under way (a press parked offline is not), and it is not shown beside
  the load error. `status` turns to `error` only after the query's retries, so one dropped request
  never shows it. Checked with `fault.js` 503 on `/api/` for 75 s and with `set offline on`, then
  recovery.
- **A chart or the map arrives in its own card, already titled.** They are loaded on approach
  (`Deferred`, see [Performance](performance.md)), so on a slow connection the reader first sees
  the card with its heading and a skeleton the size of the drawing. Never a bare grey box, and
  never a card that changes height when the drawing lands.
  - **`Deferred` draws the card and its header, once; the chunk brings only the `CardContent`**
    (issue #145, 2026-10-01). The fallback card and the loaded one used to be two trees, so the header
    was drawn twice and replaced when the chunk landed. With a chart's name now a control, a tap on it
    in the placeholder opened nothing: on a 390 px phone at Slow 4G the title was a new element 250 ms
    after the tap, and its card gone with the old one (a keyboard reader's focus too; the CSV button in
    "Valor b en el tiempo"'s header had the same replacement on `main`). Now the title is the same
    element before and after, and the sheet opened in the placeholder stays open while the chart lands
    under it (`deferred.test.ts`). The charts and the map no longer draw a header of their own, and
    lost the props only it used (`magType` and `cluster` on the frequency–magnitude chart, `magType` on
    "Valor b en el tiempo").
  - Every placeholder brings the card's own
  description (`bTimeDescription`, `fmdDescription`, `mapDescription`), written without the chart's
  code. The map's and the magnitude chart's placeholders draw their real legend beside skeletons of
  the drawing's exact height (`MapPlaceholder`, `MagnitudeTimePlaceholder`), since a legend wraps
  differently at each width, and "Valor b en el tiempo"'s CSV button is drawn in its placeholder
  too (`BTimeCsvButton`), with its key (`BTimeKey`, from 2026-09-28). Measured 2026-09-26 at 320,
  390, 768, 1024 and 1280 on both zones: the placeholder equals the loaded card, with CLS 0 while
  scrolling; before, the magnitude card grew from 410 px to as much as 610.
  - **From `lg` the map waits until it is on screen, and shows a picture of itself until then**
    (issue #72, owner's call, 2026-09-28). There it shares a row just under the fold, and `Deferred`
    fetches it with a margin of 0 (every other card, and the map below `lg`, 600 px; [Performance](performance.md)
    has why). So a reader who scrolls to it sees it arrive, and a grey box for the second that takes
    would have been the page's biggest empty space. `MapPreview` is instead a soft picture of the
    zone's opening view in the reader's theme, without the events, with a spinner ("Cargando el mapa…")
    in the middle. It is the placeholder's drawing at every width, and a layer over the live map.
  - **The picture leaves once MapLibre has drawn every tile, the relief and the events** (its first
    `idle`): it fades out in 300 ms and leaves the page (at once under reduced motion), so the reader
    never sees a blank or half-tiled canvas, nor the zoom buttons before they work. Until then the map
    under it is `inert`: it takes no focus and no drag, which would move a view the reader cannot see
    and hold `idle` back. It also leaves when the style fails to load, and after 10 s at most
    (`MAP_WAIT_MS`, for a tile that never answers): the reader then gets what they had before the
    picture, the map as it is, rather than a spinner for good. A new theme or language rebuilds the map,
    and the picture comes back over it until the new one has drawn, however quickly the reader toggles
    back. Over the live map the picture loads eagerly: it is on screen, and a lazy image waits a frame
    for its intersection check, showing the grey under it. Only the placeholder's, which may be screens
    away, is lazy. `event-map.test.ts` holds all of this against a stand-in for MapLibre; each case was
    removed in turn and a test failed (code review, 2026-09-28).
  - **The picture lands exactly under the map.** It is baked at the widest the map's box gets
    (1024 × 384, one column just under `lg`) at half density, and drawn at that size centred, which
    is how MapLibre crops its view to a narrower box; the towns and rivers stay put when the map
    replaces it, and only the dots appear. Checked at 1350 px light on Tolima and 390 px dark on
    Chocó. The bake and the live map draw from one module, `map-style.ts` (the view, the style, the
    relief). How to bake it again is in [development](development.md#the-maps-placeholder-pictures);
    redo it whenever `VIEW`, the basemap or the relief changes.
    The dots are left out on purpose: the catalogue is live, and a baked picture of it would be stale.
- **The status bar appears with the page, not before it** (2026-09-26). Until both `/api/status` and
  the catalogue have answered, it is one skeleton block with no stats. Its stats wrap by their own
  width, so each value landing re-wrapped the row: on a phone "Sismo principal"'s hint took it from
  two lines to three and pushed the refresh button down on every load (0.03 of CLS). A status
  request that fails is not waited for through its retries.
  - **A status that never loaded fills nothing in** (2026-09-29, found with `/api/*` answering 503).
    The newest event reads "—", like the catalogue's two stats, rather than a placeholder that
    shimmered for good, and the last-query note says the time is unknown ("desconocida"): "nunca"
    claimed SGC had never been queried, which the page cannot know. "nunca" stays for a status that
    loaded with no successful run.
- **"Actualizar ahora" rests after a failed press, for longer each time** (`src/lib/refresh-backoff.ts`,
  owner's call, 2026-09-29). Unlimited, a reader pressed it about 40 times in a minute through an
  outage, each a request to a Worker that was already failing. Now each failed press dims the button
  (`aria-disabled`, so it keeps focus) for 5 s, then 10, 20, 40 and at most 60 s, the status poll's own
  interval, and the line under it counts down: "No se pudo actualizar. Inténtalo de nuevo en 20 s."
  The countdown is drawn only (`aria-hidden`); a screen reader hears the whole wait once in words, since
  a live region that changed every second would be read out every second. A refresh that works ends the
  run, and so do two quiet minutes between failures, so a tab left open overnight starts again from
  5 s. A status answer does not: a first version forgot the failures whenever a status poll answered,
  but `GET /api/status` can answer from D1 while `POST /api/refresh` fails (an ingest killed for CPU,
  2026-09-20), and then the backoff restarted at 5 s every minute and "No se pudo actualizar" vanished
  while every press was still failing (code review, 2026-09-29). Only presses count: a refresh the page started on a return to the tab rests
  nothing, and none starts while the button rests. The countdown outranks the stale-data line, since it
  is what explains the dimmed button. **A five-press lock came first and was dropped** (owner's call):
  off after five failures until the next status answer, its line had to promise when the button would
  return ("…volverá solo cuando la página pueda cargar datos de nuevo"), which the owner did not like; a
  countdown states a fact instead. `Button` dims an `aria-disabled` button unless it is also
  `aria-busy`: the refresh and retry buttons at work keep their colour and say so in their spinner, as
  before. Checked with `/api/*` at 503 behind a proxy.
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
  `FlowNumber`'s `MOVE` written in CSS; change one and change the other. The curve itself is
  `EASE_MOVE` in `src/lib/ease.ts`, which `MOVE` and the story's dots read, and
  `test/ease-token.test.ts` fails while it and `--ease-move` disagree. Every row
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
    line taller over the map's bottom edge. It collapses once the reader moves the map. "Data from"
    in OpenFreeMap's credit comes from its TileJSON and is written per language by putting
    OpenFreeMap's own credit into the style's `openmaptiles` source (`transformStyle`; a source's
    attribution overrides the TileJSON's). It is a copy: follow OpenFreeMap if its credit changes.
    In dark mode the attribution box and the zoom buttons use the popover colours (`index.css`).
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
- The eight `--sidebar-*` tokens were deleted: nothing imported them, and `--sidebar-primary`
  was a vivid blue in dark against a neutral in light — a stock shadcn default that
  would have rendered wrong the day a sidebar was added.
- Numeric table columns align to the trailing edge, use `tabular-nums` (set once on
  the page root) and a true minus sign (`fmtNum`).
- Every control has an accessible name; sliders get theirs through
  `aria-labelledby` on the thumb, which is the element with `role="slider"`.
- **Every tab stop shows focus at 3:1 or more** (interface review, 2026-09-26). Light `--ring` is
  `oklch(0.556)`, 4.74:1 on white (shadcn's 0.708 was 2.59:1), and nothing uses `ring-ring/50`. A
  region that is a tab stop — a chart with a keyboard layer, a Radix tab panel, the map
  canvas — draws a 2 px `outline-ring` set off from it rather than a ring against its contents; a
  tab panel inside a sheet insets it. A page-level panel whose first child is focusable takes no stop
  of its own (`tabIndex={-1}`), and the magnitude chart's pinned y axes, which repeat the axis beside
  them, are out of the tab order and the accessibility tree.
- **On touch every control reaches 44 px**: tab triggers with a `before:` extender (`after:` is the
  line variant's underline), the date inputs grow to 40, MapLibre's zoom buttons to 44, and the
  Switch's hit area is 56 × 46. The light Switch's off track is `--muted-foreground` (5:1); shadcn's
  `--input` was 1.26:1 and left the white thumb invisible. The Sheet slides on `--ease-slide`, and
  under reduced motion only its fade remains: tw-animate-css has no reduced-motion rule, so its
  `slide-*` classes are `motion-safe:`.

Not yet verified by anyone: real screen-reader output, a physical touch device, and
Safari. The back-fill and ingest-failure alerts have now been seen rendered, in both
themes, but against a **stubbed** `/api/status` (see [Tooling gotchas](development.md#tooling-gotchas))
— not yet in a live state driven by SGC itself.

## The chart kit (`packages/charts`)

**What a chart on this page is, apart from what it draws, is one package, `@bvalue/charts`** (issue
#138, 2026-09-30). The monitor's three charts (`src/components/charts/fmd.tsx`, `b-over-time.tsx`,
`magnitude-time.tsx`) bring their scales, their marks and their words; the kit is everything a
pointer, a finger, the keyboard or a label does the same way on all of them. It knows nothing about
earthquakes, a zone, the page's strings or shadcn's `Card`, and its `tsconfig.json` has no `@` alias,
so it cannot import them. Like `@bvalue/seismo` it is consumed as TypeScript source, with no build
step ([development](development.md#tooling-gotchas)).

| Piece | What it holds |
|---|---|
| `useReading` | The tooltip's state: what the pointer, a finger and the keyboard read off a drawing, and which of them holds the tooltip. Its header lists the rules. |
| `useScrollView` | The sideways scroller around a drawing wider than its card: starts at the end, stays there through a refresh, tells a drawing what is on screen, brings the keyboard's point on screen. |
| `Drawing`, `focusRing` | The `svg` that is a tab stop with a keyboard layer, named by its `title` and `desc`, and the focus ring for the element around it. |
| `GridRows`, `TickLabels`, `PlotClip` | The grid's rows (once where a tick is on an edge), the axis labels where Recharts put them (14 px under the plot, 8 px before it), the clip of a plot's height. |
| `preserveEndTicks`, `ownPlaceLabels`, `labelWidth`, `textWidth` | Which labels fit, by Recharts' rule or each at its own place, and how wide one is, from a canvas. |
| `ChartTip`, `tipPosition`, `ChartKey` | The tooltip's dark surface and its place, and a key. |
| `usePlotSize`, `inPlot`, `PlotArea` | A plot's box in whole pixels, read before the first frame. |

- **One set of rules for the tooltip, where there were two.** "Distribución frecuencia–magnitud" and
  "Valor b en el tiempo" used `useReading`; "Magnitud en el tiempo" had written the same rules again
  for its dots and its bars (its own keyboard walk, `usePointerMoved`, `useTipArea`, `View`), and the
  two had drifted. The owner's rule for a rewrite is that a difference without a reason is a bug to
  fix, not to copy, so each was settled one way, for all four drawings:
  - **The one used last holds the tooltip, on every chart.** On the first two charts the pointer's
    reading always won: with the mouse resting anywhere on the plot, focus, the arrows and Enter
    changed nothing on screen (checked on `main` with a real pointer at 1280 and 390 px: the tooltip
    stayed on the pointer's bin through a focus, two arrows and two Enters). An arrow or a focus from
    the keyboard now takes the tooltip, and a pointer that moves onto a point takes it back, as on
    the magnitude chart. The keyboard's reading then stays hidden until a key brings it back; it
    used to reappear by itself when the pointer left those two charts.
  - **An arrow pressed while the keyboard's tooltip is hidden shows it where it was, without a
    step**, on every chart (the magnitude chart's rule). The first two charts stepped from a point
    the reader could not see.
  - **A move from the same place with nothing moved under it is no move.** The magnitude chart took
    any move from where a resting pointer already was for the pointer coming back, unless its own
    keyboard scroll had just happened: a browser's own repeat of the pointer's place handed the
    tooltip back to the pointer under the keyboard. The move now counts only when the chart has
    moved under the pointer (the reader's scroll).
  - **The pointer's reading is read again on every render, on every chart**, so new data or a new
    size under a resting pointer puts the tooltip on what is under it. The magnitude chart kept the
    event or the day the pointer had been on, and after a new width the tooltip could name a day a
    press there would not choose. **This one shows on the page** (checked 2026-09-30, both zones at
    1280 px): with the mouse resting on the daily bars, a window narrowed to 900 px left `main`'s
    tooltip on 6 Sept while the pointer was over 21 Sept, and a refresh that added a day did the same
    on the dots and the bars; here the tooltip names what is under the pointer, which is what
    `main` shows too after the next 1 px move.
  - **Focus from a press shows nothing, by both tests**: the press itself, and `:focus-visible`. A
    press is over with its own event: the daily bars' drag prevents the press's focus and may be let
    go where the page never hears of it, and a flag waiting for that would have silenced the next
    focus from the keyboard (code review).
  - **Declined in the code review (2026-09-30):** *finding the keyboard's point by a map, not a
    scan*, when new data has moved it: the scan runs only after the data changed under a keyboard
    reading, over a catalogue of about a thousand. *Declaring the tests' own imports in the
    package* (`vitest`, `@testing-library/react`): `@bvalue/seismo`'s tests resolve theirs from the
    root too, and the label recording is one fixture for a test on each side. The package declares
    what its source imports.
  - **A frequency–magnitude bin is its magnitude** (`id` in `useReading`), as a dot is its event and
    a bar its day: a filter that moves the smallest magnitude moves every bin's index, and the
    keyboard's reading stayed on the index, another magnitude (a refresh that brought an M1.0, with
    the keyboard on M1.8: `main` showed M1.3 and here it stays on M1.8, checked 2026-09-30). A window of "Valor b en el tiempo"
    stays its index: two windows can end at the same moment, and nothing else names one from one
    Mc to the next.
  - **Enter takes the tooltip from a resting pointer, like an arrow** (code review). It toggled the
    keyboard's reading unseen under the pointer's tooltip, on every chart, and the reading then
    appeared by itself when the pointer left.
  - **Kept apart, with its reason:** a finger that moves is read like a pointer on the first two
    charts and not on the magnitude chart, where the move is the scroll. Enter hides and shows the
    tooltip everywhere but on the daily bars, where it chooses the day (`enter`), and is handed only
    the day the keyboard's tooltip is on.
- **The frame is not a component.** The issue asked for the wrapper, the `svg`, the clip, the grid
  and the labels as one frame. Cut from the three, what they share is smaller pieces: one chart's
  key is inside the focus ring and another's outside, one has pinned axes in their own `svg`, one
  draws its labels over the cursor. A `ChartFrame` would have needed a slot or a flag for each.
  `GridRows` draws a row once where a tick is on the plot's edge for all of them, which only "Valor b
  en el tiempo" did; the others' ticks never met an edge, or drew the same line twice with one key.
- **Its tests are the `charts` vitest project** (`packages/charts/test`, happy-dom), on a stand-in
  chart of five points: every rule above, without a catalogue. Each of 35 mutations of the kit
  failed a test. The three charts' own tests still run what the reader gets; one assertion in
  `b-over-time.test.ts` changed with the first fix above (after the pointer takes the tooltip and
  leaves, Enter shows the keyboard's reading, where it hid it).
- **An arrow that cannot step renders nothing**, at either end of a walk: the keyboard's reading is
  kept as the same state (`reading.test.ts`, "renders nothing for arrows held against either end").
- **The kit is compiled by React Compiler, as `src/` is** (`SOURCE_DIRS` in `react-compiler.config.ts`;
  [development](development.md#tooling-gotchas)). Its code was compiled in `src/`, and the move to a
  package took it out of the build's compiler until it was listed there. It compiles with no skips,
  and its tests run compiled (`vitest.config.ts`).
- **Where the tooltip goes did not change** (checked 2026-09-30 after the rebase onto React Compiler,
  `main` at `6f0a0d4` against this, both served by `scripts/fixture-server.ts` from one capture,
  DevTools-protocol mouse moves and touches, in-page keys one per call, each box read after its
  glide). A hover grid over all four drawings (the plot's edges and corners, both sides of every
  flip, the scrolling chart at its start, middle and end; 6,096 places, both zones, 1280 and 390 px),
  every keyboard step of every walk to both ends (7,186 records) and taps and drags (416): the same
  box on both builds in every case. What differs is only what the fixes above say: with the mouse
  resting on the plot the keyboard's tooltip shows (at the place `main` gives it with the mouse
  away), Enter hides it, a repeated place is no move, a hidden reading comes back without a step,
  and new data or a new width under a resting pointer is read where the pointer is. The cards at
  rest have the same markup (36 of 36: both zones, both themes, 320, 390 and 1280 px) and the
  stylesheet is the same file.
- **Checked before the rebase** (agent-browser, `main` at `5662df1` and this served by `scripts/fixture-server.ts` from
  one capture of the catalogue): the three cards on both zones, both themes at 320, 390 and 1280 px.
  The stylesheet is the same file, byte for byte; the cards' markup is the same in 36 of 36, apart
  from React's own ids for a clip path, which follow load order on either build; over four runs 35,
  36, 34 and 36 of 36 screenshots were identical to the pixel, and the others differed by 1/255 in at
  most 206 colour values with their markup equal (the rasteriser's). Then a real pointer (DevTools
  protocol moves), in-page key events and touch events over all four drawings at 1280 and 390 px, 72
  steps each: the two builds differ only in the fixes above. A real press, a drag released outside
  the chart and a focus from the keyboard after it, on the bars: the same on both. What it costs
  and saves is in [Performance](performance.md).
- **Whether it came out smaller** (the issue's own test). The three charts went from 1,801 lines to
  1,520 ("Magnitud en el tiempo" from 978 to 721), and what they share from 370 lines in two files
  to 807 in seven, a third of them the rules written down: about a hundred lines more in all, for
  one copy of each rule where there were two, and 1.6 kB less JavaScript.
- **Not in the kit, on purpose:**
  - *The charts themselves.* They read the page's strings, its zones and `Stats`; a package that
    took them would take the page with them.
  - *`src/insights/measure.ts`*, the insights page's `textWidth`. It pads a width by 3 % and guesses
    one without a canvas, to reserve room; the kit's must match Recharts' measure exactly or say it
    cannot ([Performance](performance.md), issue #96's declined items).
  - *The insights page's drawings and the groups card's daily strips.* They have no keyboard layer
    and no tooltip; the strips' scroller is the nearest thing to `useScrollView`, and is a
    follow-up of its own.

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
    changed. Both set their icons to 16 px, 20 on touch, so a caller passes no icon size.
    `default-touch` is `default` growing the same way (the status bar's "Actualizar ahora").
  - `Button` variant `floating` and size `icon-round` are the insights page's back-to-top button:
    opaque primary with a shadow, and a 44 px circle that clips what travels through its edge.
  - `Button` size `header` is the sortable column header (`sm` with the table's 14 px text);
    `inline` is a link-button inside running text, with no box or border of its own and the text's
    size; `inline-touch` is `inline` growing like `sm-touch`. Variant `link-muted` is the "Detalle
    técnico" trigger; `link-inline` is a link inside a sentence, in the sentence's own weight and
    colour and underlined (the filters' link back to the automatic Mc).
  - `Button` size `icon-inline` is an icon inside a line of text (`InfoTip`): 20 px, centred on the
    line, with a 28 px hit area and 44 px on touch. It does not grow on touch, against the
    convention above, because it would make the line of text it sits in 40 px tall.
  - `Table` takes `size="sm"`: 4 px cell sides, for the events table.
  - `Toggle`/`ToggleGroup` size `sm-touch` grows like `Button`'s. `Toggle` shares `Button`'s
    transition (named properties including `scale`, 150 ms `--ease-out`), press scale and
    `ring-3 ring-ring`. Pressed, a toggle is the primary colour (black, white in dark mode), like
    `Button`'s `default`, not shadcn's `muted` (2026-09-26). `ToggleGroup`'s gap is a class per
    `spacing` (0–2), not shadcn's inline `--gap`, which `no-inline-styles` rejects.
  - `TechnicalDetail` takes `size` rather than a `className`; `Deferred` takes a `placeholder` node
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

A new exception goes the same way: in the code, next to what it excuses, with the reason. Never
switch a rule off for a file. `rg "oxlint-disable"` lists them all.

## React's lint

`pnpm lint` also runs React's own rules, from `eslint-plugin-react-hooks` 7 (issue #129; how it is
loaded into oxlint, and why under the name `react-hooks-js`, is in
[development](development.md#tooling-gotchas)). They are what React Compiler checks before it
optimises a component, shown in the editor and in CI: the compiler leaves a component that breaks one
as written, and several are bugs in waiting with or without it. All at `error`, in every file,
`src/components/ui/` included (shadcn's components would be compiled like ours, and had no finding):
`rules-of-hooks`, `exhaustive-deps`, and the compiler's set, `refs`, `immutability`, `purity`,
`set-state-in-render`, `set-state-in-effect`, `static-components`, `use-memo`,
`preserve-manual-memoization`, `incompatible-library`, `globals`, `error-boundaries`,
`unsupported-syntax` and `component-hook-factories`.

How this page answers them:

- **State that follows a prop is set during render, not from an effect** (`set-state-in-effect`).
  `if (was !== on) { setWas(on); setP(0); }` renders again before anything is drawn; the same reset in
  an effect is drawn once with the old value first. Both places that did it had that frame: the
  story's `useProgress` drew a scene that had just turned off once more at its last value, and gave a
  reader who asked for less motion one frame of the empty drawing; the questions' wave race drew the
  old clock against a new distance (`story/hooks.test.ts`, `questions/feel.test.ts`). What can be read
  straight off the arguments is not state at all (`useProgress` is 0 while off).
- **A memo lists what it reads, each a value React can compare** (`preserve-manual-memoization`): a
  field of `data`, not `data`; and not a value another call is also handed, where the compiler cannot
  tell that the call leaves it alone (`Stop` in `questions/index.tsx`, whose comment has the case).
- **An effect lists every value it reads** (`exhaustive-deps`), including one that never changes for a
  given caller (`pressablePins` in the 3D block's scene effect): listed, it costs nothing, and it is
  right the day a caller does change it.
- **What a function reads is declared above it** (`immutability`): the day bars' stable window
  listeners (`on` in `charts/magnitude-time.tsx`) sat below the `stop` that removes them, which worked
  only because `stop` never runs during render.

**Approved exceptions**, each an `oxlint-disable-next-line react-hooks-js/<rule>` with its reason, as
for the design-system rules:

- `lib/hydrate.ts`, `useHydrated` (`set-state-in-effect`): the second render is what the hook is
  for. The first must match the static header's HTML, and the layout effect puts the second in the
  same frame (see "Zones" above).
- `insights/app.tsx`, `tab()` (`static-components`): the component comes out of the tab's chunk,
  read with `use`; it is that chunk's own export, the same one every render, not one made in render.
- **Until their issue lands**, each naming it: a ref written during render in
  `components/event-map.tsx` (#131), and three written and one read in `insights/block3d/index.tsx`
  (#132). Those issues remove the line with its cause.

## Writing for React Compiler

Both pages are compiled by React Compiler (issue #130; the setup and its traps are in
[development](development.md#tooling-gotchas), the numbers in [Performance](performance.md)). It
memoises every component and hook at build time: a render redoes only what its changed props, state
and context reach, and hands React the same elements for the rest. A function it cannot prove safe
is left as written, silently, which is why these are conventions and not only lint rules:

- **No ref is read or written during render** (`ref.current` belongs in an event handler or an
  effect), **and no prop, state or hook result is mutated.** The lint above reports both; the
  compiler skips the whole component for either.
- **`EventsTable` is skipped today** (a default parameter that is an expression; issue #131). It
  holds a TanStack Table, which keeps its state inside one stable object: when it compiles, by #131
  or by a compiler release, walk the table's sorting and paging in a browser before trusting it.
- **No `useMemo`, `useCallback` or `memo` by default.** The compiler does their work, with finer
  grain. Reach for one only where a measurement shows a need the compiler does not meet, and say
  which in a comment. The ones already in the code stay until issue #133 removes them area by area:
  the compiler keeps a manual memo it can prove it preserves, and skips the component when it cannot
  (`preserve-manual-memoization` above).
- **A default parameter is a plain value**, not an expression over another parameter or JSX
  (`of = events.length`, `placeholder = <Skeleton />`): default those in the body. And a few shapes
  trip compiler bugs, such as a method call nested in `Math.round(…)`: hoist the inner call to a
  `const`. The lint reports none of these; `pnpm tsx scripts/react-compiler.ts skips` lists them.
- **`"use no memo"` is the escape hatch**: as the first statement of a function, it tells the
  compiler to leave that function alone. Use it only for a component that misbehaves compiled, with
  a comment that says what went wrong and names the issue that will remove it. None is in the code today.
- **What to check after a change to something that updates over time**: the compiler changes *when*
  a component renders again, so a value read from outside React during render (a clock, a DOM
  measurement, a module variable) can freeze. `useNow` is the pattern: the time is state, so
  everything drawn from it follows. Walked compiled on 2026-09-30: `Ago`'s relative times, the
  refresh backoff's countdown, the stale-data line and the 3D viewer's panel all went on updating.
  - **The one place that did freeze was found by the code review, not by the walk**: `textWidth`
    (`insights/measure.ts`) measures a label in whatever face is loaded, and a width taken before
    Geist arrives was to be taken again "on the next render". Compiled, a scene keeps its layout
    until its inputs change, and a module's function is never one, so a drawing laid out before the
    font stayed in the stand-in face's widths. (On `main` it healed only if something else rendered
    the scene again.) A component now measures through **`useTextWidth()`**, which hands out a
    different function once the font is in: the component renders again and every layout made from
    it is redone, once (`measure.test.ts`). A local walk cannot show this: the font is there at once.
    The same goes for any function that answers differently over time without an argument changing:
    give the change to React as state or as a hook's result.
