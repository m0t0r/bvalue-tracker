/**
 * How long the M7.4 lasted: the story's "¿Cuánto duró?" step. It answers with how long the ground
 * moved, SGC's figure for its stations nearest the epicentre, and sets the fault's own time beside it
 * from USGS's finite-fault model (`durations.json`, written by `scripts/insights-durations.ts`), so the
 * reader sees the shaking outlast the rupture. Past earthquakes are not compared: no shaking duration
 * is published for them, and a rupture's seconds read as shaking to every reader (docs/science.md).
 */
import { HISTORY_FOR } from "./history";
import raw from "./durations.json";
import { fmt, fmtKm } from "./shared";

export interface Durations {
  source: { retrieved: string };
  /**
   * The M7.4, from USGS's finite-fault model: its moment-rate file, pinned by URL, and `t95`, the
   * seconds from the model's zero (its hypocentral time, where the rupture starts) until 95% of the
   * moment was out.
   */
  main: { sgcId: string; usgsId: string; product: string; url: string; t95: number };
  /**
   * SGC's accelerometer in Pereira that recorded the M7.4 (`scripts/insights-shaking.py`), with
   * seconds from the origin time: when the sensor first and last clearly recorded it, the strong part
   * (5% to 95% of the Arias intensity) and the strongest second.
   */
  pereira: {
    network: string;
    station: string;
    location: string;
    lat: number;
    lon: number;
    kmFromPereira: number;
    retrieved: string;
    arrivalS: number;
    strongFromS: number;
    strongToS: number;
    peakS: number;
    recordedToS: number;
  };
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

const to5 = (s: number) => Math.round(s / 5) * 5;

/**
 * How long the M7.4 lasted, in the round figures the reader sees: in Pereira (SGC's accelerometer),
 * near the epicentre (SGC's range) and the fault itself (USGS's model, from its start to 95% of the
 * moment). The Pereira arrival and peak are to 5 s and said with "unos"; the strong part to the second;
 * the recording to the minute. Only while the page's rule has found the M7.4 as the mainshock: every
 * figure is about that event.
 */
export function shakingDuration(main: { id: string }, found: boolean) {
  const m = DURATIONS.main;
  const p = DURATIONS.pereira;
  if (!found || main.id !== HISTORY_FOR || m.sgcId !== HISTORY_FOR) return null;
  return {
    nearEpicentre: { ...SGC_NEAR_EPICENTRE },
    ruptureS: Math.round(m.t95),
    pereira: {
      station: p.station,
      km: Math.round(p.kmFromPereira),
      arrival: to5(p.arrivalS),
      peak: to5(p.peakS),
      strong: Math.round(p.strongToS - p.strongFromS),
      recordedMin: Math.round(p.recordedToS / 60),
      /** The recording as measured, which the drawing places on its time axis. */
      record: p,
    },
    /** Pereira's strongest second came after the fault's model had released 95% of its moment. */
    peakAfterRupture: p.peakS > m.t95,
  };
}

/**
 * The step's figures as the copy's placeholders take them: the prose, the drawing and its text
 * alternative all format them here.
 */
export function shakingParts(d: NonNullable<ReturnType<typeof shakingDuration>>) {
  return {
    from: fmt(d.nearEpicentre.fromS),
    toMin: fmt(d.nearEpicentre.toS / 60),
    rupture: fmt(d.ruptureS),
    km: fmtKm(d.pereira.km),
    station: d.pereira.station,
    arrival: fmt(d.pereira.arrival),
    peak: fmt(d.pereira.peak),
    strong: fmt(d.pereira.strong),
    recMin: fmt(d.pereira.recordedMin),
  };
}
