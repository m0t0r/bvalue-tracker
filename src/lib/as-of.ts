/**
 * The moment a claim about "the last 7 days" or "the recent pace" is made at. The catalogue grows only
 * when someone syncs (docs/ingest.md, "On demand only"), so a window measured up to the clock runs on
 * past the data, and a week nobody synced reads as a week without earthquakes: a confident, false
 * claim (docs/science.md). Such windows end at the last successful sync instead, or at the clock if
 * that is earlier. The oldest of several zones' syncs, when a claim spans them; the clock while any
 * of them is unknown (a status that has failed, or a zone never synced), as before.
 */
export function asOf(syncedAt: readonly (string | null | undefined)[], clock: number): number {
  let at = clock;
  for (const s of syncedAt) {
    if (s == null) return clock;
    const t = Date.parse(s);
    if (!Number.isFinite(t)) return clock;
    at = Math.min(at, t);
  }
  return at;
}

/** How long after the last sync a page says outright that its figures stop there. */
export const SYNC_NOTICE_AFTER_MS = 24 * 60 * 60_000;
