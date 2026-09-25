/**
 * Every statement the insights page makes about the catalogue, decided by a rule over the live
 * data. The page never states a trend in a fixed sentence: it asks a function here which of a few
 * pre-written sentences is true now, and fills in the figures the function returns. A rule that
 * cannot decide returns a neutral case, and the page says less rather than something false.
 *
 * Pure functions of the two zones' catalogues and `now`; no DOM, no React. Tested on the
 * production catalogue as it stood on 2026-09-24 (`test/fixtures/api-events-2026-09-24.json`) and
 * on synthetic catalogues for the cases that one does not reach. See docs/science.md, "The
 * insights page", for why each threshold is what it is.
 */
import { bearingDeg, computeStats, epicentralKm, hypocentralKm, largestMomentShare, type LatLon } from "@bvalue/seismo";
import { median } from "d3-array";
import { dayStart } from "@/lib/format";
import { clusterOf } from "../../core/clusters";
import { mainshockId, zoneMainshock, type ZoneMainshock } from "../../core/mainshock";
import { PEREIRA } from "../../core/places";
import type { ContextResponse, ForecastDigest } from "../../worker/api-types";
import { medianHorizontalErrorKm } from "./shared";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export interface QuakeLike {
  id: string;
  time: string;
  lat: number;
  lon: number;
  depthKm: number;
  mag: number;
  magType: string;
  status: string;
  errLatKm?: number | null;
  errLonKm?: number | null;
  errDepthKm?: number | null;
  removedAt?: string | null;
}

/**
 * Where an event comes from, as the reader in Pereira meets it: Chocó's two depth groups, split
 * exactly as `core/clusters.ts` splits them, and the Chaparral swarm.
 */
export type Source = "shallow" | "deep" | "tolima";
export const SOURCES: readonly Source[] = ["shallow", "deep", "tolima"];

export interface Catalogues<E extends QuakeLike = QuakeLike> {
  choco: readonly E[];
  tolima: readonly E[];
}

export const sourceOf = (zone: "choco" | "tolima", e: { depthKm: number }): Source =>
  zone === "tolima" ? "tolima" : clusterOf(e);

/** Each source's events, withdrawn ones left out, in time order. */
export function bySource<E extends QuakeLike>(cat: Catalogues<E>): Record<Source, E[]> {
  const out: Record<Source, E[]> = { shallow: [], deep: [], tolima: [] };
  for (const zone of ["choco", "tolima"] as const)
    for (const e of cat[zone]) if (!e.removedAt) out[sourceOf(zone, e)].push(e);
  for (const s of SOURCES) out[s].sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  return out;
}

// ---------------------------------------------------------------------------------------------
// Places (Pereira's own point is `PEREIRA` in core/places.ts, shared with the Worker)

/**
 * Wave speeds for "how long the waves took to reach you", rounded: P ≈ 6.5 km/s and S ≈ 3.7 km/s
 * are typical of the crust and upper mantle. Real paths bend and speed up with depth, so these
 * give arrival times to within a few seconds, and the page says "about".
 */
export const P_WAVE_KMS = 6.5;
export const S_WAVE_KMS = 3.7;
export const arrivalSeconds = (km: number) => ({ p: km / P_WAVE_KMS, s: km / S_WAVE_KMS });

export interface SourceDistance {
  count: number;
  /** Median over the source's events: map distance, straight-line distance and depth, in km. */
  epicentralKm: number;
  hypocentralKm: number;
  depthKm: number;
  /** The nearest and farthest events, straight-line. */
  minKm: number;
  maxKm: number;
}

/** How far each source is from a place, as medians over its events. Null for a source with none. */
export function distancesFrom(sources: Record<Source, readonly QuakeLike[]>, place: LatLon = PEREIRA) {
  const out = {} as Record<Source, SourceDistance | null>;
  for (const s of SOURCES) {
    const es = sources[s];
    if (es.length === 0) {
      out[s] = null;
      continue;
    }
    const hypo = es.map((e) => hypocentralKm(e, place));
    out[s] = {
      count: es.length,
      epicentralKm: median(es.map((e) => epicentralKm(e, place)))!,
      hypocentralKm: median(hypo)!,
      depthKm: median(es.map((e) => e.depthKm))!,
      minKm: Math.min(...hypo),
      maxKm: Math.max(...hypo),
    };
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Strong events: the ones the reader says they feel

/**
 * Where the recent events at or above the reader's threshold came from. `case` picks the sentence:
 * - `none`: nothing that strong in the window.
 * - `one`: all of them from one source.
 * - `mostly`: at least three in four from one source.
 * - `mixed`: no source has three in four.
 */
export type StrongMix =
  | { case: "none"; total: 0 }
  | { case: "one" | "mostly"; total: number; source: Source; count: number; bySource: Record<Source, number> }
  | { case: "mixed"; total: number; bySource: Record<Source, number> };

const MOSTLY = 0.75;

export function recentStrong(
  sources: Record<Source, readonly QuakeLike[]>,
  now: number,
  minMag: number,
  days = 7,
): StrongMix {
  const from = now - days * DAY;
  const bySource = { shallow: 0, deep: 0, tolima: 0 } as Record<Source, number>;
  for (const s of SOURCES)
    for (const e of sources[s]) {
      const t = Date.parse(e.time);
      if (t > from && t <= now && e.mag >= minMag) bySource[s]++;
    }
  const total = bySource.shallow + bySource.deep + bySource.tolima;
  if (total === 0) return { case: "none", total: 0 };
  const top = SOURCES.reduce((a, b) => (bySource[b] > bySource[a] ? b : a));
  if (bySource[top] === total) return { case: "one", total, source: top, count: total, bySource };
  if (bySource[top] >= MOSTLY * total) return { case: "mostly", total, source: top, count: bySource[top], bySource };
  return { case: "mixed", total, bySource };
}

/** The newest event at or above `minMag` from each source, or null. "Chocó's last M4+ was on 19 Sep." */
export function lastStrong<E extends QuakeLike>(sources: Record<Source, readonly E[]>, minMag: number) {
  const out = {} as Record<Source, E | null>;
  for (const s of SOURCES) {
    out[s] = null;
    for (const e of sources[s]) if (e.mag >= minMag) out[s] = e; // time order, so the last one wins
  }
  return out;
}

/** Colombian calendar days, from the first event's to `now`'s, with how many strong events each had by source. */
export function strongDays(sources: Record<Source, readonly QuakeLike[]>, start: number, now: number, minMag: number) {
  const first = dayStart(new Date(start).toISOString());
  const last = dayStart(new Date(now).toISOString());
  const days: { start: number; bySource: Record<Source, number>; maxMag: number | null }[] = [];
  for (let d = first; d <= last; d += DAY)
    days.push({ start: d, bySource: { shallow: 0, deep: 0, tolima: 0 }, maxMag: null });
  for (const s of SOURCES)
    for (const e of sources[s]) {
      if (e.mag < minMag) continue;
      const day = days[Math.round((dayStart(e.time) - first) / DAY)];
      if (!day) continue;
      day.bySource[s]++;
      day.maxMag = Math.max(day.maxMag ?? -Infinity, e.mag);
    }
  return days;
}

// ---------------------------------------------------------------------------------------------
// Pace: is a source at its usual rate?

/** The window "lately" means, and the history a source needs before it has a usual pace. */
export const RECENT_WINDOW_DAYS = 5;
export const MIN_HISTORY_DAYS = 14;
/** Quieter than usual below half the usual daily rate; busier above one and a half times it. */
export const QUIET_FRACTION = 0.5;
export const BUSY_FACTOR = 1.5;

export interface Lull {
  /** First and last Colombian day of the lull, as day starts. */
  from: number;
  to: number;
  /** Whether the source came back to its usual pace afterwards. False for the lull still under way. */
  recovered: boolean;
}

export type Pace =
  | { case: "young"; days: number }
  | {
      case: "quieter" | "usual" | "busier";
      /** Events a day at or above `mc` in the last RECENT_WINDOW_DAYS × 24 h. */
      recentPerDay: number;
      /** The median over every complete Colombian day since the source's first event. */
      usualPerDay: number;
      mc: number;
      /** Events at M ≥ 4 in that recent window. */
      recentM4: number;
      /** Earlier stretches where it went quiet by the same rule, oldest first. */
      pastLulls: Lull[];
      /** When the current quiet stretch began, for `quieter`. */
      quietSince: number | null;
    };

/**
 * A source's recent pace against its own usual one. `mc` is the magnitude above which the
 * catalogue is complete; counting below it measures the network, not the earthquakes.
 *
 * The recent rate is a sliding 120 h window ending `now`, not the last five calendar days, so the
 * day in progress does not drag it down. The usual rate is the median day, which one busy day
 * cannot move. A lull is any day whose trailing five-day mean is under half the usual rate.
 */
export function pace(events: readonly QuakeLike[], mc: number, now: number): Pace {
  const counted = events.filter((e) => e.mag >= mc);
  if (counted.length === 0) return { case: "young", days: 0 };
  const first = dayStart(counted[0]!.time);
  const today = dayStart(new Date(now).toISOString());
  const completeDays = Math.round((today - first) / DAY);
  if (completeDays < MIN_HISTORY_DAYS) return { case: "young", days: completeDays };

  const perDay = Array.from({ length: completeDays + 1 }, () => 0);
  let recent = 0,
    recentM4 = 0;
  for (const e of counted) {
    const t = Date.parse(e.time);
    const i = Math.round((dayStart(e.time) - first) / DAY);
    if (i >= 0 && i <= completeDays) perDay[i]!++;
    if (t > now - RECENT_WINDOW_DAYS * DAY && t <= now) {
      recent++;
      if (e.mag >= 4) recentM4++;
    }
  }
  const usualPerDay = median(perDay.slice(0, completeDays))!;
  const recentPerDay = recent / RECENT_WINDOW_DAYS;
  const quietBelow = QUIET_FRACTION * usualPerDay;

  // The trailing five-day mean on each complete day that has five days behind it.
  const means: { day: number; mean: number }[] = [];
  for (let i = RECENT_WINDOW_DAYS - 1; i < completeDays; i++) {
    let sum = 0;
    for (let j = i - RECENT_WINDOW_DAYS + 1; j <= i; j++) sum += perDay[j]!;
    means.push({ day: first + i * DAY, mean: sum / RECENT_WINDOW_DAYS });
  }
  // A lull is a run of days whose window is quiet, dated from the first window's first day to the
  // last quiet day. It recovered if the mean climbed back to the usual rate before the next lull.
  const runs: { from: number; to: number; end: number }[] = [];
  means.forEach((m, i) => {
    if (m.mean >= quietBelow) return;
    const last = runs.at(-1);
    if (last && last.end === i - 1) {
      last.to = m.day;
      last.end = i;
    } else runs.push({ from: m.day - (RECENT_WINDOW_DAYS - 1) * DAY, to: m.day, end: i });
  });
  const lulls: Lull[] = runs.map((r, k) => {
    const until = runs[k + 1]?.end ?? means.length;
    return { from: r.from, to: r.to, recovered: means.slice(r.end + 1, until).some((m) => m.mean >= usualPerDay) };
  });

  const kase = recentPerDay < quietBelow ? "quieter" : recentPerDay > BUSY_FACTOR * usualPerDay ? "busier" : "usual";
  // A lull running up to yesterday is the current quiet stretch when the recent window agrees, and
  // is not a past one. Otherwise the stretch began with the recent window itself.
  const current = kase === "quieter" && runs.at(-1)?.end === means.length - 1 ? lulls.pop() : undefined;
  const quietSince = kase === "quieter" ? (current?.from ?? today - (RECENT_WINDOW_DAYS - 1) * DAY) : null;
  return { case: kase, recentPerDay, usualPerDay, mc, recentM4, pastLulls: lulls, quietSince };
}

// ---------------------------------------------------------------------------------------------
// Decay: the deep group's aftershocks

/**
 * How far a source's rate has fallen from its first week to its last. `decayed` when the last week
 * runs at under a tenth of the first — the shape of an ordinary aftershock sequence, which falls
 * roughly as 1/time (Omori's law). Not a fit: the page draws a 1/t curve as an illustration only.
 */
export type Decay =
  | { case: "young" }
  | { case: "decayed" | "not-decayed"; firstWeekPerDay: number; lastWeekPerDay: number; factor: number | null };

export function decay(events: readonly QuakeLike[], mc: number, start: number, now: number): Decay {
  if (now - start < 3 * 7 * DAY) return { case: "young" };
  let first = 0,
    last = 0;
  for (const e of events) {
    if (e.mag < mc) continue;
    const t = Date.parse(e.time);
    if (t >= start && t < start + 7 * DAY) first++;
    if (t > now - 7 * DAY && t <= now) last++;
  }
  const f = first / 7,
    l = last / 7;
  return {
    case: l < f / 10 ? "decayed" : "not-decayed",
    firstWeekPerDay: f,
    lastWeekPerDay: l,
    factor: l > 0 ? f / l : null,
  };
}

/**
 * Events per day at or above `mc`, in bins that widen with time since `start` (hours, then days,
 * then weeks, then fortnights for as long as the sequence runs), so a 1/t decay reads as a straight
 * line on log axes. For the "two clocks" chart.
 *
 * The bin in progress is cut at `now`, and is left out until it is at least half its width: a bin a
 * few minutes old turns one event into a hundred a day, or none into nothing, and the line would end
 * in a spike or a cliff that says nothing about the earthquakes.
 */
export function ratesSince(events: readonly QuakeLike[], mc: number, start: number, now: number) {
  const span = (now - start) / DAY;
  const edges = [0.01, 0.03, 0.1, 0.3, 1, 2, 4, 7, 10, 14, 21, 28, 35, 42, 49, 56, 63, 70];
  while (edges.at(-1)! < span) edges.push(edges.at(-1)! + 14);
  const days = events.filter((e) => e.mag >= mc).map((e) => (Date.parse(e.time) - start) / DAY);
  const bins: { fromDay: number; toDay: number; perDay: number; count: number }[] = [];
  for (let i = 0; i + 1 < edges.length && edges[i]! < span; i++) {
    const a = edges[i]!,
      full = edges[i + 1]!,
      b = Math.min(full, span);
    if (b - a < (full - a) / 2) break;
    const n = days.filter((d) => d >= a && d < b).length;
    bins.push({ fromDay: a, toDay: b, perDay: n / (b - a), count: n });
  }
  return bins;
}

// ---------------------------------------------------------------------------------------------
// The swarm's drift

export const DRIFT_MIN_EVENTS = 10;
export const DRIFT_MIN_KM = 1.5;

/**
 * Whether the centre of a source's activity has moved: the median epicentre of its first day
 * against that of the last 24 h. It is a claim only when the shift is at least DRIFT_MIN_KM and
 * larger than the events' own median horizontal location error; otherwise `none`, and the page says
 * it cannot see any movement at the catalogue's precision. Even `moved` is a hint, not a finding.
 */
export type Drift =
  | { case: "too-few" }
  | {
      case: "none" | "moved";
      km: number;
      bearingDeg: number;
      errorKm: number;
      from: LatLon;
      to: LatLon;
      hours: number;
    };

export function drift(events: readonly QuakeLike[], now: number): Drift {
  if (events.length === 0) return { case: "too-few" };
  const t0 = Date.parse(events[0]!.time);
  const early = events.filter((e) => Date.parse(e.time) < t0 + DAY);
  const late = events.filter((e) => Date.parse(e.time) > now - DAY);
  if (early.length < DRIFT_MIN_EVENTS || late.length < DRIFT_MIN_EVENTS || now - t0 < 2 * DAY)
    return { case: "too-few" };
  const centre = (es: readonly QuakeLike[]) => ({
    lat: median(es.map((e) => e.lat))!,
    lon: median(es.map((e) => e.lon))!,
  });
  const from = centre(early),
    to = centre(late);
  const km = epicentralKm(from, to);
  const errorKm = medianHorizontalErrorKm([...early, ...late]) ?? Infinity;
  return {
    case: km >= DRIFT_MIN_KM && km > errorKm ? "moved" : "none",
    km,
    bearingDeg: bearingDeg(from, to),
    errorKm,
    from,
    to,
    hours: (now - t0) / HOUR,
  };
}

/** The eight compass points, for "moved about 3 km west-northwest" said as "hacia el oeste" etc. */
export const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
export const compassPoint = (deg: number) => COMPASS[Math.round(deg / 45) % 8]!;

// ---------------------------------------------------------------------------------------------
// How strongly the mainshock was felt in Pereira: USGS's figures, relayed, never computed here

/**
 * An intensity as its level on the Modified Mercalli scale, the whole number USGS writes as a Roman
 * numeral: DYFI's CDI and PAGER's MMI are both decimals on that scale. Rounded from the one-decimal
 * figure the caption shows, so a 7.46 shown as 7.5 is VIII, not VII; and kept to I–X+, the levels the
 * page can draw, so two readings compared are the two the reader sees (PAGER can pass X).
 */
export const intensityLevel = (v: number) => Math.min(Math.max(Math.round(Math.round(v * 10) / 10), 1), 10);

/**
 * A DYFI cell answered by fewer people than this is not shown. DYFI publishes no such threshold (its
 * 10 km file keeps single-response cells: 149 of 260 for the M7.4), so this is the page's own rule:
 * one or two answers say more about who answered than about the shaking. See docs/science.md.
 */
export const FELT_MIN_RESPONSES = 5;

/**
 * What USGS says about how the zone's mainshock was felt in Pereira: what people there reported to
 * "Did You Feel It?" (the 10 km cell holding Pereira's point) and what its PAGER model estimates for
 * the city. `agreement` compares the two levels when both are shown: `same`, `within-one` (the
 * page's "agree"), or reports `higher`/`lower` than the model by `levels`.
 */
export interface Felt {
  reported: { level: number; cdi: number; responses: number; updatedAt: string } | null;
  modelled: { level: number; mmi: number; updatedAt: string } | null;
  /** Everyone who answered DYFI about the event, anywhere. */
  totalResponses: number | null;
  agreement: { case: "same" | "within-one" | "higher" | "lower"; levels: number } | null;
  /** USGS's page for the event, the credit's link; null for an id that is not shaped like USGS's. */
  usgsEventUrl: string | null;
}

/** A USGS event id: network code and code, letters and digits only ("us6000tjl2"). */
const USGS_EVENT_ID = /^[a-z]{2}[a-z0-9]{1,20}$/;

export function feltInPereira(context: ContextResponse, mainshock: ZoneMainshock<QuakeLike>): Felt | null {
  // A digest is about the event it was matched from. The daily job drops the others, but only once a
  // day, so a later, larger mainshock must never show the old one's figures in between.
  const id = mainshockId(mainshock);
  if (id === null) return null;
  const dyfi = context.dyfi?.sgcEventId === id ? context.dyfi : null;
  const pager = context.pager?.sgcEventId === id ? context.pager : null;
  const cell = dyfi?.digest.pereira ?? null;
  const city = pager?.digest.pereira ?? null;
  const reported =
    dyfi && cell && cell.responses >= FELT_MIN_RESPONSES
      ? { level: intensityLevel(cell.cdi), cdi: cell.cdi, responses: cell.responses, updatedAt: dyfi.sourceUpdatedAt }
      : null;
  const modelled =
    pager && city ? { level: intensityLevel(city.mmi), mmi: city.mmi, updatedAt: pager.sourceUpdatedAt } : null;
  if (!reported && !modelled) return null;
  let agreement: Felt["agreement"] = null;
  if (reported && modelled) {
    const d = reported.level - modelled.level;
    const levels = Math.abs(d);
    agreement = { case: levels === 0 ? "same" : levels === 1 ? "within-one" : d > 0 ? "higher" : "lower", levels };
  }
  const eventId = (dyfi ?? pager)!.sourceEventId;
  return {
    reported,
    modelled,
    totalResponses: dyfi?.digest.responses ?? null,
    agreement,
    usgsEventUrl: USGS_EVENT_ID.test(eventId) ? `https://earthquake.usgs.gov/earthquakes/eventpage/${eventId}` : null,
  };
}

// ---------------------------------------------------------------------------------------------
// USGS's aftershock forecast for the mainshock: relayed as USGS publishes it, never computed here

/** USGS's windows the page relays, by USGS's own labels (owner, 2026-09-25: no day, no year). */
export const FORECAST_WINDOWS = ["1 Week", "1 Month"] as const;
/** The "M or larger" thresholds the page relays (owner, 2026-09-25). */
export const FORECAST_MAGNITUDES = [5, 6] as const;
/** "One as large as the mainshock or larger" is given for this window alone (owner, 2026-09-25). */
const ABOVE_MAINSHOCK_WINDOW = "1 Month";
/** "Casi todos": the share of Chocó's events the box's distance holds for. */
const ALMOST_ALL = 0.95;
/**
 * The box says Chocó's events are "over N km" away and that an M5's waves arrive much weakened only
 * from here: the claim was checked at the ~110 km Chocó is today (docs/science.md), and nearer, it is
 * not bound to hold. Below it the box keeps only "a magnitude is not shaking here".
 */
export const FAR_FROM_KM = 100;

/**
 * Where Chocó's events are, for the forecast box: the distance, in 10 km steps, that almost all
 * (ALMOST_ALL) of them lie beyond in a straight line from Pereira, and each group's median
 * epicentre. Not a median distance, which half the events are nearer than, and not the nearest
 * event, one outlier. Depends on the catalogue alone, so `insights` works it out once per catalogue.
 */
export interface ChocoReach {
  beyondKm: number | null;
  centres: { shallow: LatLon | null; deep: LatLon | null };
}

export function chocoReach(shallow: readonly QuakeLike[], deep: readonly QuakeLike[]): ChocoReach {
  const kms = [...shallow, ...deep].map((e) => hypocentralKm(e, PEREIRA)).sort((a, b) => a - b);
  const centre = (es: readonly QuakeLike[]) =>
    es.length ? { lat: median(es.map((e) => e.lat))!, lon: median(es.map((e) => e.lon))! } : null;
  return {
    // No more than 5% of the events are nearer than kms[k], so at least 95% lie beyond its floor.
    beyondKm: kms.length ? Math.floor(kms[Math.floor(kms.length * (1 - ALMOST_ALL))]! / 10) * 10 : null,
    centres: { shallow: centre(shallow), deep: centre(deep) },
  };
}

export interface ForecastRow {
  /** "M or larger". */
  magnitude: number;
  /** USGS's probability of at least one, 0–1. */
  probability: number;
  /** USGS's most likely number, and its 95% range. */
  median: number;
  p95Min: number;
  p95Max: number;
}

/**
 * What the forecast box shows. Each window is named by its own dates: USGS's windows all start at
 * the forecast's start, not today, so "the next week" would be a week already partly gone.
 */
export interface Forecast {
  issuedAt: string;
  nextUpdateAt: string | null;
  windows: { start: string; end: string; rows: ForecastRow[] }[];
  /** The chance of one at the mainshock's magnitude (USGS's) or larger, in the month window. */
  aboveMainshock: { magnitude: number; probability: number; start: string; end: string } | null;
  /**
   * USGS's model, for the box's limits: its b and its magnitude cut-off, and whether its circle holds
   * the median epicentres of both of Chocó's groups (it cannot say which group the next one is in).
   */
  model: { b: number; mc: number; radiusKm: number; holdsBothGroups: boolean };
  /**
   * The page's own figures the limits set beside USGS's, and `chocoReach`'s distance when it is at
   * least FAR_FROM_KM, the one the box says an M5's waves arrive much weakened from; null nearer.
   */
  page: { b: number | null; mc: number | null; farKm: number | null };
  /** USGS's forecast page for the event; null for an id that is not shaped like USGS's. */
  usgsUrl: string | null;
}

/**
 * A probability as a natural frequency, in words that never say more than the percentage beside it:
 * "4 in 10" for 43% is fair, "1 in 2" would overstate it, and "4 in 10" for 15% would be too coarse
 * (it is 1.5 in 10), so small chances are "1 in N". It is worked out from the percentage shown, so
 * one shown figure always gets one phrase (19.6% and 20% are both "20%: 2 in 10"): the band, the
 * tenths (a shown 45% is 5 in 10) and N (100/6 = 16.7, so a shown 6% is "1 in 17"). N is a whole
 * number under 20 and one significant figure from 20: USGS's figures are model output, not
 * measurements. Under 1%, where the figure is only "less than 1%", N comes from the probability
 * itself (1/0.0033 = 303 is "1 in 300").
 */
export type Natural =
  | { case: "almost-certain" }
  | { case: "tenths"; tenths: number }
  | { case: "one-in"; n: number }
  | { case: "under-one-in-1000" };

export function naturalFrequency(p: number): Natural {
  const pct = wholePercent(p);
  if (pct.case === "over-99") return { case: "almost-certain" };
  if (pct.case === "under-1") return p < 0.001 ? { case: "under-one-in-1000" } : { case: "one-in", n: oneIn(1 / p) };
  const v = pct.value;
  if (v >= 95) return { case: "almost-certain" };
  if (v >= 20) return { case: "tenths", tenths: Math.round(v / 10) };
  return { case: "one-in", n: oneIn(100 / v) };
}

/** N in "1 in N": a whole number under 20, one significant figure from 20. */
function oneIn(n: number): number {
  if (n < 20) return Math.round(n);
  const unit = 10 ** Math.floor(Math.log10(n));
  return Math.round(n / unit) * unit;
}

/**
 * A probability in whole percent, never a decimal: 43.47% would claim a precision a model lacks.
 * Under half a percent it is "less than 1%" rather than 0, and from 99.5% "more than 99%" rather
 * than 100.
 */
export type Percent = { case: "under-1" } | { case: "over-99" } | { case: "whole"; value: number };

export function wholePercent(p: number): Percent {
  if (p < 0.005) return { case: "under-1" };
  if (p >= 0.995) return { case: "over-99" };
  return { case: "whole", value: Math.round(p * 100) };
}

/**
 * Without a next update from USGS, a forecast older than this is not shown: two missed weekly
 * updates. The file's own `expireTime` is a year after issue, so it is no guide (docs/science.md).
 */
export const FORECAST_MAX_AGE_DAYS = 14;

/**
 * When a stored forecast stops being shown: USGS's next update, or 14 days after issue without one.
 * `context-refresh.ts` asks for the next forecast from the same moment.
 */
export const forecastStaleAt = (d: ForecastDigest) =>
  d.nextUpdateAt === null ? Date.parse(d.issuedAt) + FORECAST_MAX_AGE_DAYS * DAY : Date.parse(d.nextUpdateAt);

/**
 * `now` is the exact time, which the page passes at the due time itself: `data.now` is rounded to the
 * minute and would keep a replaced forecast on screen for up to a minute and a half.
 */
export function usgsForecast(context: ContextResponse, data: Insights, now = data.now): Forecast | null {
  const product = context.forecast;
  // About the mainshock the page detects, as with `feltInPereira`, and only once USGS has reviewed it:
  // the case for relaying it at all is that a USGS seismologist has checked it.
  if (!product || product.sgcEventId !== mainshockId(data.mainshock.choco)) return null;
  const d = product.digest;
  if (d.reviewStatus !== "reviewed") return null;
  if (!(now < forecastStaleAt(d))) return null;
  const windows = d.windows.flatMap((w) => {
    if (!(FORECAST_WINDOWS as readonly string[]).includes(w.label) || Date.parse(w.end) <= now) return [];
    const rows = FORECAST_MAGNITUDES.flatMap((m) => {
      const bin = w.bins.find((b) => b.magnitude === m);
      return bin ? [{ ...bin }] : [];
    });
    return rows.length ? [{ start: w.start, end: w.end, rows }] : [];
  });
  if (windows.length === 0) return null;
  // Only under a window the box shows, so its dates are on the page above it.
  const month = d.windows.find(
    (w) => w.label === ABOVE_MAINSHOCK_WINDOW && windows.some((s) => s.start === w.start && s.end === w.end),
  );
  const aboveMainshock =
    month?.aboveMainshock != null ? { ...month.aboveMainshock, start: month.start, end: month.end } : null;
  const { beyondKm, centres } = data.chocoReach;
  const inCircle = (c: LatLon | null) => c !== null && epicentralKm(d.model.regionCenter, c) <= d.model.regionRadiusKm;
  return {
    issuedAt: d.issuedAt,
    nextUpdateAt: d.nextUpdateAt,
    windows,
    aboveMainshock,
    model: {
      b: d.model.b,
      mc: d.model.mc,
      radiusKm: d.model.regionRadiusKm,
      holdsBothGroups: inCircle(centres.shallow) && inCircle(centres.deep),
    },
    page: {
      b: data.b.choco,
      mc: data.mc.choco,
      farKm: beyondKm !== null && beyondKm >= FAR_FROM_KM ? beyondKm : null,
    },
    usgsUrl: USGS_EVENT_ID.test(product.sourceEventId)
      ? `https://earthquake.usgs.gov/earthquakes/eventpage/${product.sourceEventId}/oaf/forecast`
      : null,
  };
}

// ---------------------------------------------------------------------------------------------
// Everything at once

export interface Insights {
  now: number;
  /** The newest event in either zone: "data up to …". */
  dataEnd: number | null;
  sources: Record<Source, QuakeLike[]>;
  distances: ReturnType<typeof distancesFrom>;
  /** Each zone's Mc (maximum curvature), from the same pipeline as the main page. */
  mc: { choco: number | null; tolima: number | null };
  /** Each zone's b over the events at or above that Mc: the b card's figure, all magnitude types. */
  b: { choco: number | null; tolima: number | null };
  /** Where Chocó's events are, for the forecast box (`chocoReach`). */
  chocoReach: ChocoReach;
  mainshock: {
    choco: ReturnType<typeof zoneMainshock<QuakeLike>>;
    tolima: ReturnType<typeof zoneMainshock<QuakeLike>>;
  };
  /** Share of each zone's seismic moment its largest event holds. */
  largestShare: { choco: number | null; tolima: number | null };
  shallowPace: Pace | null;
  tolimaPace: Pace | null;
  deepDecay: Decay | null;
  tolimaDrift: Drift;
  /** When each zone's catalogue begins: the first event. */
  start: { choco: number | null; tolima: number | null };
}

/**
 * `chocoReach` once per Chocó catalogue: `insights` runs every minute for the clock, and the
 * catalogue array is the same object until the next ingest brings a new one.
 */
const reachByCatalogue = new WeakMap<readonly QuakeLike[], ChocoReach>();
function cachedReach(choco: readonly QuakeLike[], sources: Record<Source, QuakeLike[]>): ChocoReach {
  let reach = reachByCatalogue.get(choco);
  if (!reach) reachByCatalogue.set(choco, (reach = chocoReach(sources.shallow, sources.deep)));
  return reach;
}

export function insights(cat: Catalogues, now: number): Insights {
  const sources = bySource(cat);
  const live = { choco: cat.choco.filter((e) => !e.removedAt), tolima: cat.tolima.filter((e) => !e.removedAt) };
  const stats = { choco: computeStats(live.choco), tolima: computeStats(live.tolima) };
  const mc = { choco: stats.choco.mc, tolima: stats.tolima.mc };
  const firstTime = (es: readonly QuakeLike[]) => (es.length ? Math.min(...es.map((e) => Date.parse(e.time))) : null);
  const start = { choco: firstTime(live.choco), tolima: firstTime(live.tolima) };
  const newest = [...live.choco, ...live.tolima].reduce((m, e) => Math.max(m, Date.parse(e.time)), -Infinity);
  return {
    now,
    dataEnd: Number.isFinite(newest) ? newest : null,
    sources,
    distances: distancesFrom(sources),
    mc,
    b: { choco: stats.choco.fit?.b ?? null, tolima: stats.tolima.fit?.b ?? null },
    chocoReach: cachedReach(cat.choco, sources),
    mainshock: { choco: zoneMainshock(live.choco), tolima: zoneMainshock(live.tolima) },
    largestShare: { choco: largestMomentShare(live.choco), tolima: largestMomentShare(live.tolima) },
    shallowPace: mc.choco === null ? null : pace(sources.shallow, mc.choco, now),
    tolimaPace: mc.tolima === null ? null : pace(sources.tolima, mc.tolima, now),
    deepDecay: mc.choco === null || start.choco === null ? null : decay(sources.deep, mc.choco, start.choco, now),
    tolimaDrift: drift(sources.tolima, now),
    start,
  };
}
