/**
 * Figures the "Preguntas" tab draws or quotes that are not claims: the tab's own arithmetic over
 * `Insights`. Nothing here decides a trend — that is `claims.ts`, and its sentences are `copy.ts`.
 * Helpers both tabs use live in `../shared.ts`. Pure functions; no DOM.
 */
import { energyRatio, epicentralKm, hypocentralKm } from "@bvalue/seismo";
import { dayStart } from "@/lib/format";
import { sourceOf, type Insights, type QuakeLike, type Source } from "../claims";
import { PEREIRA } from "../../../core/places";
import { fmtInt, roundSig } from "../shared";

const DAY = 86_400_000;

/** The Colombian day starts from the day containing `from` to the one containing `to`. */
export function colombianDays(from: number, to: number): number[] {
  const out: number[] = [];
  const last = dayStart(new Date(to).toISOString());
  for (let d = dayStart(new Date(from).toISOString()); d <= last; d += DAY) out.push(d);
  return out;
}

/** Index of the Colombian day an instant falls on, in a list from `colombianDays`. */
export const dayIndexOf = (days: readonly number[], t: number): number =>
  Math.round((dayStart(new Date(t).toISOString()) - days[0]!) / DAY);

/** Events per Colombian day at or above `mc`, one count per entry of `days`. */
export function dailyCounts(events: readonly QuakeLike[], mc: number, days: readonly number[]): number[] {
  const out = days.map(() => 0);
  if (days.length === 0) return out;
  for (const e of events) {
    if (e.mag < mc) continue;
    const i = dayIndexOf(days, Date.parse(e.time));
    if (i >= 0 && i < out.length) out[i]!++;
  }
  return out;
}

/**
 * The illustrative aftershock curve for a daily series: day 1 as counted, then that divided by the
 * day number — half on day 2, a tenth on day 10. Omori's law with p = 1, anchored to the first day
 * rather than fitted, which is what the chart says.
 */
export const omoriFromFirstDay = (first: number, days: number): number[] =>
  Array.from({ length: days }, (_, i) => first / (i + 1));

/** Total energy of some events, counted in events of magnitude `unit`: "as much as N M4.0s". */
export const energyInUnits = (events: readonly { mag: number }[], unit = 4): number =>
  events.reduce((s, e) => s + energyRatio(e.mag, unit), 0);

/**
 * How a ratio against the reference is said: `same` within 5% of it, otherwise "N times more" or
 * "1/N of it", with N to a tenth below 10 ("1/1.4") and to two significant figures above, which is
 * all a simplified ratio deserves. The figure comes formatted for display.
 */
export function ratioPhrase(ratio: number): { kind: "same" } | { kind: "more" | "less"; x: string } {
  if (!(ratio > 0) || !Number.isFinite(ratio) || Math.abs(ratio - 1) <= 0.05) return { kind: "same" };
  const big = ratio > 1 ? ratio : 1 / ratio;
  return { kind: ratio > 1 ? "more" : "less", x: big < 10 ? big.toFixed(1) : fmtInt(roundSig(big, 2)) };
}

/**
 * Relative ground-motion amplitude at Pereira against a reference event, from magnitude and
 * straight-line distance only: 10^(M − Mref) × Rref / R. A simplification the tab labels as one —
 * it leaves out the rock's absorption, the fault's direction and the ground under the house.
 */
export const relativeAmplitude = (mag: number, km: number, refMag: number, refKm: number): number =>
  10 ** (mag - refMag) * (refKm / Math.max(km, 1));

export interface Preset {
  id: Source | "reference";
  event: QuakeLike;
  source: Source;
}

/**
 * The events the "why do I feel it" explorer starts from: the zone's reference event (Chocó's
 * mainshock, or its largest event while none stands clear) and the largest of the shallow group and
 * of the swarm. Each is a real catalogue event, found by magnitude, never named in the code.
 */
export function presets(data: Insights): Preset[] {
  const largest = (es: readonly QuakeLike[]) =>
    es.reduce<QuakeLike | null>((a, b) => (!a || b.mag > a.mag ? b : a), null);
  const ref = data.mainshock.choco.largest;
  const out: Preset[] = [];
  if (ref) out.push({ id: "reference", event: ref, source: sourceOf("choco", ref) });
  const shallow = largest(data.sources.shallow.filter((e) => e !== ref));
  const tolima = largest(data.sources.tolima);
  if (shallow) out.push({ id: "shallow", event: shallow, source: "shallow" });
  if (tolima) out.push({ id: "tolima", event: tolima, source: "tolima" });
  return out;
}

/** Map and straight-line distance from Pereira, in km. */
export const toPereira = (e: QuakeLike) => ({ epi: epicentralKm(e, PEREIRA), hypo: hypocentralKm(e, PEREIRA) });

/** Km east (x) and north (y) of `origin`, flat-Earth: for the swarm's few-km drift panels. */
export const kmFrom = (origin: { lat: number; lon: number }, p: { lat: number; lon: number }) => ({
  x: (p.lon - origin.lon) * 111.195 * Math.cos((origin.lat * Math.PI) / 180),
  y: (p.lat - origin.lat) * 111.195,
});
