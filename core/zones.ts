/**
 * The places this project follows. Each one is a bounding box on SGC's form and a start date,
 * and nothing else about ingest or the statistics differs between them: the events of one zone
 * never enter another's catalogue, fit or history.
 *
 * The boxes must not overlap. An event id is the primary key of `events`, so an event inside two
 * boxes would belong to whichever zone ingested it first and silently vanish from the other.
 */
import { CHOCO_SWARM_BBOX, MAINSHOCK_DATE } from "./seiscomp.ts";
import type { BBox } from "./types.ts";

export const ZONE_IDS = ["tolima", "choco"] as const;
export type ZoneId = (typeof ZONE_IDS)[number];
/** The zone a request that names none gets: every URL and script from before there were two. */
export const DEFAULT_ZONE: ZoneId = "choco";

export const isZoneId = (v: unknown): v is ZoneId => (ZONE_IDS as readonly unknown[]).includes(v);

export interface Zone {
  id: ZoneId;
  bbox: BBox;
  /** The first UTC day of the sequence. The history the sweep back-fills begins here. */
  start: Date;
  /**
   * Whether depth splits this sequence into the two groups of `core/clusters.ts`. That split was
   * measured on the Chocó catalogue (see docs/science.md) and says nothing about anywhere else.
   */
  depthClusters: boolean;
}

/**
 * The Chaparral (Tolima) swarm, measured from SGC's catalogue on 2026-09-23 (446 events): it began
 * 2026-09-20 08:27 UTC, sits at 3.78–3.91 N, 75.68–75.57 W and 12–25 km deep, and has no dominant
 * event. The box leaves ~0.1° around that, and the same box held 25 events in the eight and a half
 * months before, so background seismicity barely enters it. 150 km from the Chocó box.
 */
export const CHAPARRAL_BBOX: BBox = { lonMin: -75.85, lonMax: -75.4, latMin: 3.65, latMax: 4.05 };

export const ZONES: Record<ZoneId, Zone> = {
  choco: {
    id: "choco",
    bbox: CHOCO_SWARM_BBOX,
    start: MAINSHOCK_DATE,
    depthClusters: true,
  },
  tolima: {
    id: "tolima",
    bbox: CHAPARRAL_BBOX,
    start: new Date(Date.UTC(2026, 8, 20)),
    depthClusters: false,
  },
};
