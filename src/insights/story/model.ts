/**
 * What the story draws, derived from the page's `Insights`. Presentation only: every statement
 * the story makes about the data is a claim in `../claims.ts` with its sentence in `../copy.ts`;
 * this adds the shapes and figures the drawings need (energy shares, the 1/t reference curve,
 * the swarm's half-day windows), all computed from the same catalogues at render.
 * Pure, so it can be tested without a renderer.
 */
import { energyRatio, epicentralKm, hypocentralKm, seismicMoment } from "@bvalue/seismo";
import { PEREIRA, SOURCES, type Insights, type QuakeLike, type Source } from "../claims";
import { commonDepths, median, medianHorizontalErrorKm, timeWindows } from "../shared";

const DAY = 86_400_000;

/** An event with its time parsed once and the source it belongs to. */
export interface Ev extends QuakeLike {
  t: number;
  source: Source;
}

/** The event's depth error, where the catalogue gives one. */
const depthError = (e: QuakeLike): number | null =>
  typeof e.errDepthKm === "number" && Number.isFinite(e.errDepthKm) ? e.errDepthKm : null;

/**
 * The 1/t curve the aftershock chart draws for comparison: Omori's law, rate = K / (t + c), with c
 * fixed at 0.05 days and K chosen so the curve holds exactly as many events in the first day as the
 * group actually had. Anchored, not fitted: its only job is to show the shape ordinary aftershocks
 * take, and the page says so.
 */
export const OMORI_C_DAYS = 0.05;
export function omoriCurve(firstDayCount: number) {
  const k = firstDayCount / Math.log((1 + OMORI_C_DAYS) / OMORI_C_DAYS);
  return (days: number) => k / (days + OMORI_C_DAYS);
}

/** Each event's share of its zone's seismic moment, largest first: the energy strips. */
export function energyShares(events: readonly { mag: number }[]): number[] {
  const m = events.map((e) => seismicMoment(e.mag));
  const total = m.reduce((a, b) => a + b, 0);
  return total > 0 ? m.map((v) => v / total).sort((a, b) => b - a) : [];
}

/**
 * The thresholds that decide which way a sentence in the story is worded. Each is a plain fact
 * about the catalogue, recomputed on every render, so the copy never states one that stopped holding.
 */
/** Three straight-line distances count as "similar" when the farthest is within a third of the nearest. */
export const SIMILAR_DISTANCE_RATIO = 4 / 3;
/** The largest event "released almost all the energy" from this share of the zone's moment. */
export const DOMINANT_SHARE = 0.9;
/** The deep group lies "around" the largest event when its centre is this close to the epicentre, km. */
export const NEAR_KM = 40;
/** Depths "snap to steps" when the three commonest values hold this share of the group. */
export const SNAPPED_SHARE = 0.2;
/** Deeper than this, a median depth is not called "inside the crust". */
export const CRUSTAL_KM = 30;

/** Events at or above `minMag` in each 7-day week from `start`, the week in progress included. */
export function strongByWeek(events: readonly Ev[], start: number, now: number, minMag: number): number[] {
  const weeks = Math.max(1, Math.ceil((now - start) / (7 * DAY)));
  const out = Array.from({ length: weeks }, () => 0);
  for (const e of events) {
    if (e.mag < minMag || e.t < start || e.t > now) continue;
    const w = Math.floor((e.t - start) / (7 * DAY));
    if (w < weeks) out[w]!++;
  }
  return out;
}

export function storyModel(data: Insights) {
  const all: Ev[] = [];
  for (const s of SOURCES) for (const e of data.sources[s]) all.push({ ...e, t: Date.parse(e.time), source: s });
  all.sort((a, b) => a.t - b.t);
  const bySrc = { shallow: [] as Ev[], deep: [] as Ev[], tolima: [] as Ev[] };
  for (const e of all) bySrc[e.source].push(e);
  const choco = all.filter((e) => e.source !== "tolima");

  // The largest event in Chocó, from the page's own detection. "Found" means it stands clear and has
  // been reviewed: only then does the story call it the mainshock.
  const ms = data.mainshock.choco;
  const main = ms.largest ? (choco.find((e) => e.id === ms.largest!.id) ?? null) : null;
  const mainFound = ms.state === "found";
  const others = main ? choco.filter((e) => e.id !== main.id) : choco;
  const largestAfter = others.length ? others.reduce((a, b) => (b.mag > a.mag ? b : a)) : null;

  const start = data.start.choco ?? all[0]?.t ?? data.now;
  const tolimaStart = data.start.tolima;
  const mc = data.mc.choco;

  const deepFirstDay =
    mc === null ? 0 : bySrc.deep.filter((e) => e.mag >= mc && e.t >= start && e.t < start + DAY).length;

  const centre = (es: readonly Ev[]) =>
    es.length ? { lat: median(es, (e) => e.lat)!, lon: median(es, (e) => e.lon)! } : null;

  const tolima = bySrc.tolima;
  const cen = { shallow: centre(bySrc.shallow), deep: centre(bySrc.deep), tolima: centre(tolima) };
  const hypo = SOURCES.flatMap((s) => (data.distances[s] ? [data.distances[s].hypocentralKm] : []));
  const snapped = commonDepths(bySrc.shallow);
  const mainShare = energyShares(choco)[0] ?? null;
  const shallowDepth = data.distances.shallow?.depthKm;
  const deepDepth = data.distances.deep?.depthKm;
  const tolimaDays = tolimaStart === null ? 0 : (data.now - tolimaStart) / DAY;

  return {
    all,
    bySrc,
    choco,
    start,
    now: data.now,
    main,
    mainFound,
    mainEpiKm: main ? epicentralKm(main, PEREIRA) : null,
    mainHypoKm: main ? hypocentralKm(main, PEREIRA) : null,
    largestAfter,
    /** How many events like the largest aftershock, and like an M4.0, it takes to match the largest. */
    equivalents: main
      ? {
          toLargestAfter: largestAfter ? energyRatio(main.mag, largestAfter.mag) : null,
          toM4: energyRatio(main.mag, 4),
        }
      : null,
    /** Every event at M ≥ 4 in either zone since Chocó's catalogue begins, the largest excluded. */
    strongSince: all.filter((e) => e.mag >= 4 && e.id !== main?.id),
    centres: cen,
    chocoToTolimaKm: main && cen.tolima ? epicentralKm(main, cen.tolima) : null,
    /** What decides the wording of the story's data-dependent sentences. */
    facts: {
      distancesSimilar: hypo.length === 3 && Math.max(...hypo) <= SIMILAR_DISTANCE_RATIO * Math.min(...hypo),
      /** The page's rule finds a mainshock, and it holds at least DOMINANT_SHARE of the energy. */
      mainDominant: ms.state === "found" && mainShare !== null && mainShare >= DOMINANT_SHARE,
      mainHoldsMost: mainShare !== null && mainShare > 0.5,
      deepNearMain: main && cen.deep ? epicentralKm(main, cen.deep) <= NEAR_KM : false,
      deepFromMainKm: main && cen.deep ? epicentralKm(main, cen.deep) : null,
      shallowWest: cen.shallow && cen.deep ? cen.shallow.lon < cen.deep.lon : false,
      /** The deep group's centre east of and below the shallow group's: "deeper towards the east". */
      eastDeeper:
        cen.shallow && cen.deep && shallowDepth !== undefined && deepDepth !== undefined
          ? cen.deep.lon > cen.shallow.lon && deepDepth > shallowDepth
          : false,
      depthsSnapped:
        bySrc.shallow.length > 0 && snapped.reduce((a, d) => a + d.count, 0) >= SNAPPED_SHARE * bySrc.shallow.length,
      tolimaCrustal: tolima.length > 0 && (median(tolima, (e) => e.depthKm) ?? Infinity) < CRUSTAL_KM,
      /** The last of the weekly counts covers a week still in progress. */
      weekInProgress: (data.now - start) % (7 * DAY) !== 0,
    },
    /**
     * Median location errors in km. Horizontal is latitude and longitude together
     * (`horizontalErrorKm`), the same measure the `drift` claim quotes.
     */
    errors: {
      choco: {
        h: medianHorizontalErrorKm(choco) ?? null,
        depth: median(choco.flatMap((e) => (depthError(e) === null ? [] : [depthError(e)!]))) ?? null,
      },
    },
    snappedDepths: snapped,
    omori: omoriCurve(deepFirstDay),
    deepFirstDay,
    shallowStrongWeeks: strongByWeek(bySrc.shallow, start, data.now, 4),
    /** The swarm's 12-hour windows with enough events to place a centre, for its track. */
    tolimaWindows: timeWindows(tolima, 12, 20),
    tolimaPerDay: tolimaDays > 0 ? tolima.length / tolimaDays : null,
    tolimaLargest: tolima.length ? tolima.reduce((a, b) => (b.mag > a.mag ? b : a)) : null,
    tolimaDepth: median(tolima, (e) => e.depthKm) ?? null,
    energy: { choco: energyShares(choco), tolima: energyShares(tolima) },
  };
}

export type StoryModel = ReturnType<typeof storyModel>;
