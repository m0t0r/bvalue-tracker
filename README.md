# bvalue-tracker

[![CI](https://github.com/m0t0r/bvalue-tracker/actions/workflows/ci.yml/badge.svg)](https://github.com/m0t0r/bvalue-tracker/actions/workflows/ci.yml)
[![Mozilla Observatory](https://img.shields.io/mozilla-observatory/grade/bvalue-tracker.sgc-swarm.workers.dev)](https://developer.mozilla.org/en-US/observatory/analyze?host=bvalue-tracker.sgc-swarm.workers.dev)

A live monitor for the earthquake sequence in Chocó, Colombia, that followed the
M7.4 San José del Palmar earthquake of 2026-08-10 12:34:27 UTC, and for the
earthquake swarm at Chaparral, Tolima, that began on 2026-09-20. It keeps a
catalogue of each up to date from the Colombian Geological Survey (SGC), and
computes its Gutenberg–Richter **b-value**, over the whole catalogue and over time.

**Live:** <https://bvalue-tracker.sgc-swarm.workers.dev>

The page is written for a reader who is interested in the science but is not a
seismologist, and explains its terms in plain words, in Spanish and in English.

<a href="https://bvalue-tracker.sgc-swarm.workers.dev/insights?tab=3d">
  <img src="docs/images/3d-block.webp" width="100%" alt="The 3D block of Colombia's Pacific coast and the Andes, 500 km across and 240 km deep, seen from the south: the Pacific swelling with the day's forecast on the left, the mountains with Istmina, Buenaventura, Pereira and Chaparral pinned on top, and below the ground the sinking Nazca plate, the two groups of Chocó's earthquakes, the orange plane where the rock broke in the M7.4 and the Chaparral swarm near the surface.">
</a>

<sub>The "In 3D" tab of <code>/insights</code>: every event at its depth over the Slab2 plate, the M7.4's rupture from USGS's
model, and a sea that swells with Open-Meteo's forecast in the colour satellites see. Map: OpenFreeMap © OpenMapTiles ©
OpenStreetMap · © Mapterhorn.</sub>

## Features

- **Two zones, one tab each, named by department.** Chocó (the M7.4 sequence) and Tolima (the
  Chaparral swarm) each have their own catalogue, figures and page, and a shared link previews
  as the zone it opens. The site opens on Tolima, where the activity is; Chocó is at `/choco`.
  Tolima is re-read every 15 minutes and Chocó every 30.
- **Up-to-date catalogue.** A Cron Trigger re-reads SGC every 15 minutes, and a
  rotating sweep catches the revisions SGC makes to older events. Events SGC
  withdraws are marked as removed, never deleted.
- **b-value with its caveats.** Magnitude of completeness (Mc) by maximum curvature,
  b with its error bar, b over time with one fixed Mc, and a comparison by magnitude
  type. The page states plainly that a b-value describes the sequence and is not a
  forecast.
- **Two depth clusters.** The sequence splits into a shallow and a deep group. The
  page compares their b-values and daily activity, and can be narrowed to either.
- **Map, charts and table.** Events on a map, magnitude over time, the
  frequency–magnitude distribution and a sortable events table, all driven by one
  set of filters.
- **"What is happening?" (`/insights`).** A second page that explains the two zones in plain words
  to a reader in the coffee region who feels the larger events. It has three tabs: a scrolling story
  and a set of questions, both drawn with D3 from the live catalogue, and a 3D view of the region
  (see [below](#3d-viewer)). Every sentence about the data is chosen by a tested rule, so it cannot
  drift from the figures beside it.
- **Spanish and English.** The page opens in the browser's language, and in English when the
  browser prefers neither. A button in the header switches language, and the page remembers the
  choice. Dates and times are always Colombia time (UTC−5).
- **Downloadable data.** CSV of the events and of b over time, straight from the page.
- **CLI.** Fetch the catalogue to CSV and compute b-values offline, independent of
  the hosted app.

## 3D viewer

The "In 3D" tab of `/insights` is a block of the region, 500 km across and 240 km deep. A slowly
turning preview on the tab opens a full-screen viewer, where you can turn and zoom the block.

- **What it shows.** Every event in the live catalogue at its depth; the Nazca plate sinking under
  Colombia; the plane where the rock broke in the M7.4; the mountains, raised ×5 by default so they
  can be seen at this scale; towns pinned on top, each with its distance from Pereira; and a sea that
  swells with the day's forecast.
- **What you can do.** Jump between five preset views, replay the sequence event by event, change
  the vertical exaggeration, turn layers on and off, and show the mountains at true scale. A compass
  shows where north lies. The legend explains every mark and scale, and the story's cross-sections
  show the same picture in 2D for browsers without WebGL 2.
- **How it is built.** [OGL](https://github.com/oframe/ogl), a small WebGL 2 library (36 kB
  gzipped, against three.js's 158 kB for the same scene), with shaders written here. The waves are
  sums of sharp-crested sine waves after
  [Acerola's water](https://github.com/GarrettGunnell/Water). The viewer's controls and legend
  use shadcn/ui, like the rest of the page.
- **Where its data comes from.**

  | Layer | Source |
  |---|---|
  | Events | The live SGC catalogue |
  | Subducting plate | USGS's [Slab2](https://doi.org/10.5066/F7PV6JNV) model, with its stated uncertainty |
  | M7.4 rupture | USGS's finite-fault model for the mainshock |
  | Sea floor | [GEBCO 2020](https://doi.org/10.5285/a29c5465-b138-234d-e053-6c86abc040b9) bathymetry, every 0.05° |
  | Land relief | [Mapterhorn](https://mapterhorn.com) terrain tiles, every 0.01° (about 1.1 km) |
  | Map on top | [OpenFreeMap](https://openfreemap.org) tiles rendered with MapLibre GL and saved as an image |
  | Waves | [Open-Meteo](https://open-meteo.com/)'s three-day marine forecast |
  | Sea colour | ESA's [Ocean Colour CCI](https://esa-oceancolour-cci.org/) |

  The plate, the rupture, the relief, the sea floor and the map are prepared once and committed;
  only the events and the forecast are live. How to regenerate them is in
  [Development](docs/development.md#the-3d-blocks-map).

## How it works

```mermaid
flowchart LR
  sgc["SGC expert query form"]
  usgs["USGS event products"]
  meteo["Open-Meteo marine forecast"]
  d1[("D1")]
  page["React page"]
  subgraph worker["Cloudflare Worker (Hono)"]
    direction TB
    cron["Cron Trigger<br/>every 15 min"]
    daily["Cron Trigger<br/>daily"]
    api["Same-origin JSON API"]
  end

  sgc <-- "POST / HTML" --> cron
  cron -- "parsed events" --> d1
  usgs -- "GeoJSON / JSON" --> daily
  meteo -- "JSON" --> daily
  daily -- "digests" --> d1
  d1 --> api
  api -- JSON --> page
```

- **Source:** SGC's SeisComP expert query form. One POST returns every event in
  a date range and bounding box, with id, time, location, depth, magnitude and type,
  phases, RMS, GAP, hypocentral errors and review status. The response is HTML; there
  is no official API, so it is parsed.
- **Context from USGS:** once a day the Worker finds each zone's mainshock in USGS's catalogue and
  keeps a digest of what USGS publishes about it: felt reports ("Did You Feel It?"), modelled
  shaking (PAGER) and the aftershock forecast. See [Ingest](docs/ingest.md#the-daily-usgs-job).
  The same run stores Open-Meteo's three-day marine forecast, which the 3D block's sea swells with.
  See [Ingest](docs/ingest.md#the-daily-sea-state-job).
- **Backend:** one Cloudflare Worker ([Hono](https://hono.dev)) serves the page and
  a JSON API, stores events in D1, and runs the ingest on a Cron Trigger. It fits the
  Workers free plan.
- **Frontend:** React with shadcn/ui, TanStack Query, Form and Table, Recharts, D3 and
  MapLibre GL for the monitor; D3 for the explanations page, and OGL (WebGL 2) for its
  [3D viewer](#3d-viewer).
- **Statistics:** written and tested here, in the `packages/seismo` library.

## Project structure

| Path | Contents |
|---|---|
| `core/` | Runtime-neutral logic shared by the Worker, the browser and Node: the SGC request and HTML parser, the admission gate every event passes through, the statistics, CSV and the CLI. |
| `packages/seismo/` | The seismology library: Gutenberg–Richter statistics and mainshock detection, pure and runtime-neutral, knowing nothing about SGC, a zone or the page. |
| `worker/` | The Hono API, the ingest planner and ingest mechanics, D1 access, and the response types shared with the page. |
| `src/` | The React pages. `src/lib/i18n.tsx` holds the monitor's strings in Spanish and English and picks the language; `src/insights/` is the explanations page, with its claim rules and its own copy, and `src/insights/block3d/` is the 3D viewer. |
| `migrations/` | The D1 schema. |
| `scripts/` | Operator tools outside the Worker, such as `pnpm logs`. |
| `test/`, `worker/test/` | Core tests (Node) and Worker tests (real D1 inside the Workers runtime), against SGC responses captured as fixtures. |
| `docs/` | Design notes, operations and the reasoning behind the code. See [Documentation](#documentation). |

## Getting started

Requires Node.js 24 or later and [pnpm](https://pnpm.io) 12.

```sh
pnpm install
pnpm db:migrate:local   # create the local D1 schema
pnpm dev                # page + Worker + local D1 on one port
```

The local database starts empty. Each call below loads one missing week from SGC,
so a fresh database needs a handful of them:

```sh
curl -X POST -H 'Sec-Fetch-Site: same-origin' http://localhost:5173/api/refresh
```

Please keep this to what you need. SGC is a public government service, and this
project is a guest on it.

### Tests

```sh
pnpm typecheck
pnpm lint          # oxlint, with @shadcn/lint's design-system rules
pnpm format:check  # oxfmt; `pnpm format` rewrites
pnpm test          # offline; SGC is stubbed with captured responses
pnpm test:live     # one test against the real SGC server
```

### CLI

```sh
pnpm cli fetch --out data/events.csv
pnpm cli fetch --zone tolima --out data/tolima.csv
pnpm cli bvalue --input data/events.csv --windows
pnpm cli bvalue --input data/events.csv --mc 2.5 --manual-only --exclude-mainshock
```

More options, and the development gotchas worth knowing before changing anything, are
in [docs/development.md](docs/development.md).

## Documentation

Much of what shapes this code was learned by measuring, and is not visible in the
code itself. Read the relevant document before changing that area.

| Document | Covers |
|---|---|
| [The science](docs/science.md) | Mc, b-value, the depth clusters, and the rules the page follows so it does not mislead |
| [The SGC data source](docs/sgc-data-source.md) | Verified facts about the SGC form, dead ends, and the request budget |
| [Ingest](docs/ingest.md) | How the catalogue stays current, concurrency lessons, and the CPU budget |
| [API](docs/api.md) | Endpoints, filters, CSV format and the same-origin rule |
| [The page](docs/frontend.md) | Page architecture and interface conventions |
| [Development](docs/development.md) | Local setup, CLI and tooling gotchas |
| [Deployment](docs/deployment.md) | Deploying your own copy and CI |
| [Operations](docs/operations.md) | Debugging production, logs and observability |
| [Security](docs/security.md) | Security decisions and what was checked |
| [Performance](docs/performance.md) | Load performance and how it is measured |
| [Ideas](docs/ideas.md) | Discussed but not built |
| [Incidents](docs/incidents/) | Postmortems |

## Data and disclaimer

All earthquake data comes from the [Colombian Geological Survey (SGC)](https://www.sgc.gov.co),
which is the authority for seismic information in Colombia. Felt reports, modelled shaking and the
aftershock forecast for a mainshock come from the [USGS](https://earthquake.usgs.gov) (public
domain) and are credited to it wherever they appear, as are Slab2 and the M7.4's rupture model
in the 3D viewer. The 3D block's sea takes its swell from
[Open-Meteo](https://open-meteo.com/)'s marine forecast (Météo-France's wave model, CC BY 4.0) and its
colour from ESA's [Ocean Colour CCI](https://esa-oceancolour-cci.org/); both are illustrative and
credited on the block. This project is independent
and is not affiliated with or endorsed by SGC. SGC revises events after publication, so
figures here change over time.

The statistics describe the sequence recorded so far. **They are not a forecast** and
must not be used for safety decisions. For official information, consult SGC.
