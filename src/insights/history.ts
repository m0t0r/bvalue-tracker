/**
 * Past Colombian earthquakes to measure the mainshock against: the story's "¿Qué tan grande?" step.
 * Committed data (`history.json`, written by `scripts/insights-history.ts` from ISC-GEM through
 * USGS's ComCat); the comparison is recomputed from the live mainshock on every render, so a revised
 * magnitude moves the words and the drawing with it. History is context: nothing here says when or
 * whether another will come.
 */
import { energyRatio, epicentralKm, magnitudeGap, tenths } from "@bvalue/seismo";
import { fmtYear } from "@/lib/format";
import raw from "./history.json";

export interface PastQuake {
  /** ISC-GEM's id, as ComCat lists it. */
  id: string;
  time: string;
  lat: number;
  lon: number;
  depthKm: number;
  /** ISC-GEM's moment magnitude to the tenth, half up: what the page shows and compares. */
  mag: number;
  /** ISC-GEM's moment magnitude as published, to the hundredth. */
  publishedMag: number;
  name: { es: string; en: string };
}

export interface History {
  source: { catalogue: string; doi: string; licence: string; retrieved: string; iscgemEnd: string };
  /** The largest magnitude within `radiusKm` of Pereira since `from`, the M7.4 (`excluded`) left out. */
  region: { radiusKm: number; from: number; maxMag: number; maxId: string; excluded: string };
  quakes: PastQuake[];
}

export const HISTORY: History = raw;

/**
 * The mainshock the region's record was read for (USGS's `region.excluded`): SGC's id for the M7.4.
 * The step calls a mainshock the region's largest only while it is this one, since `region.maxMag`
 * leaves exactly that event out.
 */
export const HISTORY_FOR = "SGC2026pqqmro";
/** A past event happened "near the same place" within this distance of the mainshock's epicentre, km. */
export const HISTORY_NEAR_KM = 50;
/** …and within this much of its depth, km. */
export const HISTORY_NEAR_DEPTH_KM = 30;
/** The events the prose names: Armenia 1999, and 1995's two, in the order they happened. */
export const ARMENIA_1999 = "iscgem1443400";
export const PAIR_1995 = ["iscgem118073", "iscgem89834"] as const;

/** ISC-GEM's own page, which the step's note links to. */
export const ISCGEM_URL = "https://www.isc.ac.uk/iscgem/";

/** The year a past event happened in, in Colombian time, like every date on the page. */
export const quakeYear = (q: PastQuake) => fmtYear(Date.parse(q.time));

/** Which way round the mainshock stands against a past event, in whole tenths. */
export type Relation = "more" | "same" | "less";

export interface Compared {
  quake: PastQuake;
  relation: Relation;
  /** How many times more energy the larger of the two released (1 for the same tenth). */
  times: number;
}

interface Mainshock {
  id: string;
  mag: number;
  /** When it happened, ms. */
  t: number;
  lat: number;
  lon: number;
  depthKm: number;
}

function compare(main: Mainshock, quake: PastQuake): Compared {
  // Both in the tenths the reader sees: the mainshock's own magnitude may carry hundredths.
  const a = tenths(main.mag) / 10;
  const b = tenths(quake.mag) / 10;
  const relation: Relation = a > b ? "more" : a < b ? "less" : "same";
  return { quake, relation, times: relation === "same" ? 1 : energyRatio(Math.max(a, b), Math.min(a, b)) };
}

/**
 * The mainshock against the committed history. `found` is the page's mainshock rule having found it
 * (reviewed, and standing clear): only then may the step call it the region's largest.
 */
export function compareHistory(main: Mainshock, found: boolean) {
  const all = HISTORY.quakes.map((q) => compare(main, q)).sort((a, b) => b.quake.mag - a.quake.mag);
  const byId = (id: string) => all.find((r) => r.quake.id === id) ?? null;
  const outsized = (r: Compared | null) => (r?.relation === "more" ? r : null);

  const near = all
    .filter((r) => Math.abs(r.quake.depthKm - main.depthKm) <= HISTORY_NEAR_DEPTH_KM)
    .map((r) => ({ ...r, km: epicentralKm(main, r.quake) }))
    .filter((r) => r.km <= HISTORY_NEAR_KM)
    .sort((a, b) => a.km - b.km)[0];
  const pair = PAIR_1995.map((id) => outsized(byId(id)));

  return {
    /** Past events the mainshock is at least as large as, largest first: the step's first drawing. */
    smaller: all.filter((r) => r.relation !== "less"),
    /** Past events larger than the mainshock, largest first. */
    larger: all.filter((r) => r.relation === "less"),
    /** The reviewed mainshock stands at least a tenth above everything in the region's record. */
    largestInRegion: found && main.id === HISTORY_FOR && magnitudeGap(main.mag, HISTORY.region.maxMag) > 0,
    /** Years of the region's record, from its first year to the mainshock's. */
    years: fmtYear(main.t) - HISTORY.region.from,
    /** The closest past event at about the same place and depth, if any. */
    near: near ?? null,
    /** What the prose names, each only while the mainshock outsizes it (the sentences say "more"). */
    featured: {
      armenia: outsized(byId(ARMENIA_1999)),
      pair: pair.every((r) => r !== null) ? (pair as Compared[]) : null,
    },
  };
}

export type HistoryComparison = ReturnType<typeof compareHistory>;

export interface RankRow {
  /** Top of the row. */
  y: number;
  /** The square's side. */
  side: number;
  /** The row's height: its square, or `minRow` for a square too small to hold two lines of text. */
  h: number;
}

/**
 * Squares for `mags`, largest first, one per row, each with an area true to its energy
 * (side ∝ 10^(0.75 M)). The largest side is as big as fits `height` without passing `maxSide`; a row
 * is never shorter than `minRow`, so every label has room. No rows if even the minimums do not fit.
 */
export function rankLayout(
  mags: readonly number[],
  { height, maxSide, minRow, gap }: { height: number; maxSide: number; minRow: number; gap: number },
): { rows: RankRow[] } {
  if (!mags.length) return { rows: [] };
  const top = Math.max(...mags);
  const rel = mags.map((m) => Math.sqrt(1 / energyRatio(top, m)));
  const total = (s: number) => rel.reduce((a, r) => a + Math.max(r * s, minRow), 0) + gap * (mags.length - 1);
  if (total(0) > height) return { rows: [] };
  // total() grows with s, so the largest side that fits is found by bisection.
  let lo = 0;
  let hi = maxSide;
  if (total(hi) > height) {
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (total(mid) <= height) lo = mid;
      else hi = mid;
    }
  } else lo = hi;
  let y = 0;
  const rows = rel.map((r) => {
    const side = r * lo;
    const row = { y, side, h: Math.max(side, minRow) };
    y += row.h + gap;
    return row;
  });
  return { rows };
}
