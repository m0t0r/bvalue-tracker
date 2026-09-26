/**
 * How long the M7.4 lasted: the story's "¿Cuánto duró?" step. It answers with how long the ground
 * moved, SGC's figure for its stations nearest the epicentre, and sets the fault's own time beside it
 * from USGS's finite-fault model (`durations.json`, written by `scripts/insights-durations.ts`), so the
 * reader sees the shaking outlast the rupture. Past earthquakes are not compared: no shaking duration
 * is published for them, and a rupture's seconds read as shaking to every reader (docs/science.md).
 */
import { HISTORY_FOR } from "./history";
import raw from "./durations.json";
import { fmt } from "./shared";

export interface Durations {
  source: { retrieved: string };
  /**
   * The M7.4, from USGS's finite-fault model: its moment-rate file, pinned by URL, and `t95`, the
   * seconds from the model's zero (its hypocentral time, where the rupture starts) until 95% of the
   * moment was out.
   */
  main: { sgcId: string; usgsId: string; product: string; url: string; t95: number };
}

export const DURATIONS: Durations = raw;

/** USGS's page for the M7.4's finite-fault model, which the step's note links to. */
export const USGS_FINITE_FAULT_URL = "https://earthquake.usgs.gov/earthquakes/eventpage/us6000tjl2/finite-fault";
/** SGC's own article on how long the M7.4 lasted, which separates the three durations. */
export const SGC_DURATION_URL =
  "https://www2.sgc.gov.co/Noticias/Paginas/Cuanto-duro-el-sismo-de-San-Jose-del-Palmar-Choco.aspx";
/**
 * SGC: "las estaciones de monitoreo más cercanas al epicentro registraron aproximadamente entre
 * 90 segundos y 2 minutos de movimiento significativo" (its article above, 2026-08-10).
 */
export const SGC_NEAR_EPICENTRE = { fromS: 90, toS: 120 } as const;

/**
 * How long the M7.4 lasted, in the whole seconds the reader sees: the ground near the epicentre
 * (SGC's range) and the fault itself (USGS's model, from its start to 95% of the moment). Only while
 * the page's rule has found the M7.4 as the mainshock: both figures are about that event.
 */
export function shakingDuration(main: { id: string }, found: boolean) {
  const m = DURATIONS.main;
  if (!found || main.id !== HISTORY_FOR || m.sgcId !== HISTORY_FOR) return null;
  return { nearEpicentre: { ...SGC_NEAR_EPICENTRE }, ruptureS: Math.round(m.t95) };
}

/**
 * The step's figures as the copy's placeholders take them, `{from}` and `{toMin}` for SGC's range and
 * `{rupture}` for the fault: the prose, the drawing and its text alternative all format them here.
 */
export function shakingParts(d: NonNullable<ReturnType<typeof shakingDuration>>) {
  return {
    from: fmt(d.nearEpicentre.fromS),
    toMin: fmt(d.nearEpicentre.toS / 60),
    rupture: fmt(d.ruptureS),
  };
}
