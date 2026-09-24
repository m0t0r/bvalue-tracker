/**
 * A zone's mainshock, detected from its own catalogue by the rule in `@bvalue/seismo`, with SGC's
 * meaning of "reviewed". Nothing is pinned: Chocó's M7.4 is found the same way a mainshock in the
 * Chaparral swarm would be, and a later, larger event anywhere would take the label from it.
 *
 * Every caller — the page's map, chart, filters and notice, `excludeMainshock` on the API, and the
 * CLI — goes through `zoneMainshock`, and passes the zone's **whole** catalogue with withdrawn events
 * left out. Never a date range or a filtered view: "the largest event of whatever was asked for"
 * silently drops a real aftershock from any range without the mainshock in it (docs/ingest.md).
 */
import { assessMainshock, type MainshockAssessment } from "@bvalue/seismo";

/**
 * The largest event must exceed every other by this much. It is the inverse of the usual swarm
 * definition (several events within one magnitude unit of the largest, Holtkamp & Brudzinski 2011),
 * and below Båth's average 1.2, which by construction would miss half of real mainshocks. The
 * literature's spread means it still misses a third or more of them: a zone without one has "no
 * clear mainshock", which is not the same as being a swarm. See docs/science.md.
 */
export const MAINSHOCK_MIN_GAP = 1.0;

/** SGC marks a solution an analyst has reviewed `manual`; everything else is automatic. */
export const isReviewed = (e: { status: string }): boolean => e.status === "manual";

export type ZoneMainshock<T> = MainshockAssessment<T>;

/** The zone's mainshock, over its whole catalogue. Only the two largest events decide it. */
export const zoneMainshock = <T extends { mag: number; status: string }>(events: Iterable<T>): ZoneMainshock<T> =>
  assessMainshock(events, isReviewed, { minGap: MAINSHOCK_MIN_GAP });

/**
 * The id of the mainshock, or null. Only a `found` one has an id worth ringing or excluding: an event
 * awaiting review is not called a mainshock yet.
 */
export const mainshockId = (a: ZoneMainshock<{ id: string }>): string | null =>
  a.state === "found" ? a.largest.id : null;
