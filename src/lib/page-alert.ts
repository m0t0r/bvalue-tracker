/**
 * The one alert the monitor shows, or none. Stacked alerts made the reader work out which state was
 * current; the page now names only the most serious (docs/frontend.md). A failed load leaves nothing
 * to caveat; a failed SGC query stalls the back-fill, so it outranks the back-fill's progress. The
 * b card's "Historial incompleto" badge keeps that caveat when the back-fill alert gives way.
 */
export type PageAlert = "load" | "ingest" | "backfill";

export function pageAlert(s: {
  catalogueFailed: boolean;
  ingestFailed: boolean;
  incomplete: boolean;
}): PageAlert | null {
  if (s.catalogueFailed) return "load";
  if (s.ingestFailed) return "ingest";
  if (s.incomplete) return "backfill";
  return null;
}
