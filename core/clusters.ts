/**
 * The sequence is two separate groups of events, and depth alone tells them apart: a shallow one
 * (~40 km) under Istmina and Sipí, and a deep one (~85 km) around the M7.4. Between 55 and 75 km
 * the catalogue is almost empty, so any cut in that gap gives the same two populations; 70 km is
 * also the conventional boundary between shallow and intermediate-depth earthquakes.
 */
import { bDifference, computeStats, type BDifference, type CatalogStats } from "./gr.ts";

export const CLUSTER_DEPTH_KM = 70;
export type Cluster = "shallow" | "deep";
export const CLUSTERS: readonly Cluster[] = ["shallow", "deep"];

export const clusterOf = (e: { depthKm: number }): Cluster => (e.depthKm < CLUSTER_DEPTH_KM ? "shallow" : "deep");

/** Below this many events a cluster's own maximum-curvature Mc is noise, and is not compared with the shared one. */
const MIN_FOR_OWN_MC = 50;
export const RECENT_DAYS = 7;

export interface ClusterPart {
  stats: CatalogStats;
  /** The cluster's own maximum-curvature Mc is above the shared one, so its b is probably biased low. */
  ownMcHigher: boolean;
  /** Events in the last RECENT_DAYS days, and the time of the newest one. A count, not a forecast. */
  recent: number;
  /** Largest magnitude among those recent events. */
  recentMaxMag: number | null;
  lastTime: string | null;
}

export interface ClusterStats {
  all: CatalogStats;
  shallow: ClusterPart;
  deep: ClusterPart;
  /** Whether the two b-values can be told apart; null unless both clusters have a fit. */
  difference: BDifference | null;
}

/**
 * Statistics for the whole catalogue and for each cluster. Both clusters are fitted above the Mc
 * of the WHOLE catalogue, so their b-values differ only in which events they count. This is the
 * one place that rule lives: the page, the API and the CLI all come through here.
 */
export function computeClusterStats(
  events: readonly { time: string; mag: number; depthKm: number }[], mcOverride: number | null = null, now = Date.now(),
): ClusterStats {
  const all = computeStats(events, mcOverride);
  const since = now - RECENT_DAYS * 86_400_000;
  const part = (cluster: Cluster): ClusterPart => {
    const own = events.filter((e) => clusterOf(e) === cluster);
    // computeStats reports no Mc for fewer than two events; the cluster still carries the shared one.
    const stats = { ...computeStats(own, all.mc), mc: all.mc };
    let lastTime: string | null = null;
    for (const e of own) if (lastTime === null || e.time > lastTime) lastTime = e.time;
    const recent = own.filter((e) => Date.parse(e.time) > since);
    return {
      stats, lastTime,
      ownMcHigher: own.length >= MIN_FOR_OWN_MC && stats.mcMaxc !== null && all.mc !== null && stats.mcMaxc > all.mc,
      recent: recent.length,
      recentMaxMag: recent.length > 0 ? Math.max(...recent.map((e) => e.mag)) : null,
    };
  };
  const shallow = part("shallow"), deep = part("deep");
  const difference = shallow.stats.fit && deep.stats.fit ? bDifference(shallow.stats.fit, deep.stats.fit) : null;
  return { all, shallow, deep, difference };
}
