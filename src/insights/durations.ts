/**
 * How long the fault took to break: the story's "¿Cuánto duró?" step. The M7.4 against the past
 * earthquakes of `history.json` that have a published, measured source time function (the rate at
 * which the fault released its moment, second by second). Committed data (`durations.json`, written
 * by `scripts/insights-durations.ts` from USGS's finite-fault model and the SCARDEC database); every
 * event without such a measurement is left out rather than estimated from its magnitude.
 */
import { HISTORY, HISTORY_FOR, type PastQuake } from "./history";
import raw from "./durations.json";
import type { Release } from "./release";

export interface Durations {
  source: { retrieved: string };
  /** The M7.4, from USGS's finite-fault model: its moment-rate file, pinned by URL. */
  main: Release & { sgcId: string; usgsId: string; product: string; url: string; momentNm: number };
  /** Past events, by ISC-GEM id, from SCARDEC's average source time function. */
  past: (Release & { id: string; scardec: string; momentNm: number })[];
}

export const DURATIONS: Durations = raw;

/** USGS's page for the M7.4's finite-fault model, which the step's note links to. */
export const USGS_FINITE_FAULT_URL = "https://earthquake.usgs.gov/earthquakes/eventpage/us6000tjl2/finite-fault";
/** The SCARDEC database (Vallée & Douet 2016, doi:10.1016/j.pepi.2016.05.012). */
export const SCARDEC_URL = "http://scardec.projects.sismo.ipgp.fr/";
/** SGC's own article on how long the M7.4 lasted, which separates the three durations. */
export const SGC_DURATION_URL =
  "https://www2.sgc.gov.co/Noticias/Paginas/Cuanto-duro-el-sismo-de-San-Jose-del-Palmar-Choco.aspx";

/** The seconds in which the central 90% of the moment came out: the one figure compared across sources. */
export const central = (r: Release) => r.t95 - r.t5;

/**
 * The M7.4's duration against the past events that have one, longest first, in the whole seconds the
 * reader sees (`core`, the central 90%). The M7.4 also has `slow`, the start of USGS's model before
 * 5% was out, rounded down so "less than 5% in the first {slow} seconds" stays true. Only while the
 * page's rule has found the M7.4 as the mainshock: the durations are about that event and no other.
 */
export function compareDurations(main: { id: string }, found: boolean) {
  const m = DURATIONS.main;
  if (!found || main.id !== HISTORY_FOR || m.sgcId !== HISTORY_FOR) return null;
  const past = DURATIONS.past
    .map((p) => ({ ...p, quake: HISTORY.quakes.find((q) => q.id === p.id) }))
    .filter((p): p is typeof p & { quake: PastQuake } => p.quake !== undefined)
    .map((p) => ({ quake: p.quake, seconds: central(p), core: Math.round(central(p)) }))
    .sort((a, b) => b.seconds - a.seconds);
  return {
    main: { seconds: central(m), core: Math.round(central(m)), slow: Math.floor(m.t5) },
    past,
  };
}

export type DurationComparison = NonNullable<ReturnType<typeof compareDurations>>;
