# Plan: further ideas for the insights and the reader's experience

Status: ideas, not started. Written 2026-09-24 from an exploration session: two research passes
plus a discussion with the owner. Nothing here is built or measured. Figures from the research
passes are leads: re-fetch them before they reach copy, a test or a doc.

The felt intensity, the plate (Slab2), map terrain, the USGS aftershock forecast and 3D have
their own plan: `.claude/plans/felt-slab-forecast.md`. This file holds the rest, ranked by value
to the reader in Pereira. Each keeps to `docs/science.md`: every sentence about the data comes
from a rule, and the page is not a forecast.

## 1. "¿Ha pasado antes?": the region's earthquake history

**Progress (2026-09-25): built as story step 2, PR #62 (open), not as a timeline.** At the owner's
request it replaced the M7.4-against-aftershocks squares: the M7.4 against earthquakes Colombia
remembers (Armenia 1999, 1995 Calima and Neira, 1979 Eje Cafetero, Páez 1994, Popayán 1983), then the
two larger coastal ones (Tumaco 1979, 1906). ISC-GEM Mw via ComCat, `src/insights/history.json` from
`scripts/insights-history.ts`. The owner's estimate ("much bigger than before") held for the remembered
events but not for 1979: Mw 7.2 (ComCat's preferred mb 6.4 hid it), 110 km deep, ~30 km away, half the
energy. Facts and rules are in `docs/science.md`. Still open from this section: depth as the story
(Armenia's damage against its size), deaths from PAGER, what Pereira felt (SGC's historical viewer).

**Why**: the most useful context a non-expert can get. "Is this normal here?" is the question
behind the others, and the answer is yes: the region has had deep events like this one before.

- **Sources**:
  - USGS ComCat (a 250 km radius around Pereira, M ≥ 6, returned 23 events on 2026-09-24, most with
    historical ShakeMaps).
  - The M7.4's PAGER `json/historical_earthquakes.json` (past regional events with exposure and
    deaths).
  - ISC-GEM v12.1 (1904–2021, M ≥ 5.5, CC BY-SA 3.0, doi:10.31905/D808B825).
  - SGC's historical-intensity viewer (`sish.sgc.gov.co`, browse only) for what Pereira felt.
- **Candidates the research pass found** (verify each):
  - Intermediate-depth, like the M7.4: 1962 Tadó (M6.5, 64 km), 1979 El Cairo (~108 km; the closest
    match), 1995 Calima (M6.4, 74 km), 1995 Neira (M6.6, 120 km), 2019 Versalles (M6.1, 122 km).
  - Shallow: 1999 Armenia (Mw 6.1, 17 km). It did far more damage than a larger deep event, which
    is the clearest lesson about depth the page could show.
  - Near Chaparral: 1997 Roncesvalles (M6.8 and M6.4, 178–199 km deep, beneath the current swarm).
- **Build**: an offline script writes a small committed JSON (`src/insights/history.json`), like
  `scripts/insights-region.ts`. No runtime fetch. A timeline or a small-multiples map on the
  questions tab. Depth is the axis that tells the story.
- **Rule**: history is context, not a pattern. The page must not imply a recurrence interval or
  "the next one is due".
- **Deaths and damage** come from the source (PAGER or ComCat) and are cited. Say it plainly,
  without dramatising, and leave them out if the owner prefers.

## 2. Sharing on WhatsApp

**Why**: the link travels person to person on WhatsApp (`docs/frontend.md`, "Zones"). What the
preview and the message say is what most people will ever see.

- **"Compartir por WhatsApp" button**: `https://wa.me/?text=…` with one sentence written by an
  existing claim rule (for example the pace claim) plus the link. $0, no API.
- **A live preview image**, 1200×630, the latest M ≥ 4 event, the week's count and the trend
  sentence.
  - It cannot be rendered in the Worker. Satori/resvg measured 82–169 ms CPU against the free
    plan's 10 ms.
  - Render it in a GitHub Actions cron instead (free for a public repo), or with Browser
    Rendering's free 10 minutes a day, and store it in R2 (free tier) or as a static asset.
  - WhatsApp drops preview images of 600 KB or more and caches per URL, so each version needs a
    new file name, and `og:image` has to change with it.
  - `SHARE_META` is baked into the zone pages at build time (`docs/frontend.md`). A changing image
    URL means rebuilding that `<head>` or serving the meta from the Worker, which is its own design
    question.
- **Rule**: the image carries activity only, never b, and never a probability (the same rule as
  the daily summary plan).

## 3. Phone alerts for M ≥ 4.5, at $0

**Why**: the reader feels M ≥ 4 events and wants to know "was that it?" quickly.

- **Web Push** (VAPID; WebCrypto libraries that run in Workers: `@block65/webcrypto-web-push`,
  PushForge).
  - The cron must not send it: each subscriber is a subrequest (50 per invocation on the free
    plan) plus CPU. The ingest enqueues one message on a **Cloudflare Queue** (free, 10,000
    operations a day), and a consumer sends in batches.
  - Android Chrome receives push without installing anything. iOS needs 16.4+, the page added to
    the Home Screen, and a manifest with `display: standalone`, so this plan needs a PWA manifest
    and a service worker (stale-while-revalidate for the shell and the latest JSON also helps on
    prepaid data).
- **A Telegram channel**: a bot posts with one `fetch` and the channel reads in a browser at
  `t.me/s/<name>` without an account. How many Colombians use Telegram is unverified.
- **Not $0**: the WhatsApp Business Cloud API (~$0.0008 per utility message in Colombia, plus a
  Meta business account and template approval); Cloudflare email to arbitrary recipients (Workers
  Paid only). ntfy.sh needs an app install, which is too much to ask of this reader.
- **Rules**: alert on magnitude only, never on b (`docs/ideas.md`). Say "según el SGC". Mention the
  event's review status ("automático" until reviewed). A withdrawn event sends nothing further,
  and the page shows it as withdrawn.
- **Privacy**: push subscriptions are personal data. Store the minimum and describe it in
  `docs/security.md`.

## 4. Replay and sound

**Why**: seeing the sequence unfold in time is how teaching tools explain aftershocks (the IRIS
Earthquake Browser, and SeismicEruption, which animates seismicity over time). USGS research on
communicating aftershock forecasts found that people want animations in time steps.

- **Replay**: a play button on the story's map scene. Events appear in time order, a day per
  second, with the date shown. `prefers-reduced-motion` gives a slider instead of autoplay. It
  reuses the dots already drawn, so it needs no new data and no new dependency.
- **Sound**: Web Audio, no library. Each event is a short tone whose loudness (or pitch) follows
  magnitude, and time is compressed. There are precedents: Reveal's Oklahoma sonification, the
  Seismic Sound Lab, and Highcharts' work on sonification as an accessibility aid. It is off by
  default, one button, and says what the sound means. It also gives a screen-reader user a sense
  of the rhythm.
- **Rule**: the time compression is stated on screen, so that "it sped up" is never an artefact
  of the playback.

## 5. A question about weather: "¿El clima o la lluvia provocan sismos?"

**Why**: "tiempo de temblor" (earthquake weather) is a common belief, and the questions tab
exists to answer what readers ask. The answer is fixed, so it needs no claim rule.

- The answer compares sizes. The M7.4 changed stresses nearby by roughly 100–1,000 kPa. Weather
  changes the load on the ground by roughly 1–10 kPa, about what tides do. That can nudge the
  timing of a fault already about to slip, and it cannot start an earthquake. Rain-triggered
  swarms happen in the top few km. Chocó's events are 40–100 km deep and Chaparral's 12–25 km.
- **Do not chart rainfall against counts.** The second rainy season began as the Chaparral swarm
  did. Seven weeks of data would show a coincidence, and the page's rule is that timing is not
  cause.
- **The connection that matters is landslides.** Shaking weakens slopes and rain brings them
  down, and Chocó and the coffee region are prone to both. Link to IDEAM's landslide alerts and
  SGC's mass-movement information (SIMMA) as the authorities, without giving safety advice.
- All figures and papers here were written from memory in the session (Hainzl et al. 2006;
  Bettinelli et al. 2008; Johnson et al. 2017, *Science*; Liu et al. 2009, *Nature*; USGS's
  "earthquake weather" myth page). **Verify each before it becomes copy**, as `docs/science.md`
  requires.

## 6. Smaller additions

- **Link to SGC's "¿Lo sintió?" form** (`sismosentido.sgc.gov.co`) on both pages. It is one line,
  helps SGC, and invites the reader to take part. It also appears in the felt-intensity plan.
- **Faults as a map layer**: SGC's Atlas Geológico 2020 faults on ArcGIS Online, not an SGC host
  (`services1.arcgis.com/Og2nrTKe5bptW02d/arcgis/rest/services/Fallas/FeatureServer/0`, CC BY
  4.0, 7,067 lines); GEM Global Active Faults as an alternative (CC BY-SA 4.0, so share-alike
  applies to a derived layer). Clip at build time. **Context only**: never "this fault caused it".
  The Atlas faults are geological and are not flagged as active.
- **Pereira in the national hazard model** (`amenazasismica.sgc.gov.co`, Arcila et al. 2020):
  one sentence on what the model expects for Pereira over decades, which puts weeks of activity
  in proportion. Take the values by hand, cite the book, and have the researcher check the
  wording.
- **Cross-check with USGS and EMSC** (already in `docs/ideas.md`): the M ≥ 4 events both agencies
  located, beside SGC's. It is useful to the researcher and could live on the monitor's
  technical detail.

## Looked at and not worth it

- **"People within X km"** (DANE, WorldPop, GHSL): the number of people nearby is not the
  shaking they got, and the felt-intensity plan answers the real question.
- **EMSC's WebSocket feed**: a cron cannot hold a socket open, and polling every 15 minutes is
  enough.
- **Global CMT**: USGS's moment tensors are the easier JSON source.
- **deck.gl for 2D, MapTiler** (its free tier stops the map once the monthly quota runs out),
  **self-hosted PMTiles** (only worth it if OpenFreeMap becomes unreliable).
- **Workers AI**: no page text is written by a model (owner decision, 2026-09-24).
- **Weather data feeds**: see 5.

## Constraints that apply to all of it

- $0, Workers free plan. Nothing heavy in the ingest tick (the 2026-09-20 outage).
- The page reads same-origin data. Any new external host is a CSP change in `public/_headers`,
  checked on the running page.
- Spanish first, and every string in both languages.
- No requests to `bdrsnc.sgc.gov.co` beyond the ingest's budget. Other SGC hosts need the owner's
  one-off check first.
