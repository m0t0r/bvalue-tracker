import type { Dict } from "@/lib/i18n";
import { WINDOW_SIZE, type Stats } from "@/lib/stats";
import type { Cluster } from "../../../core/clusters";

/**
 * "Valor b en el tiempo"'s description, in its own module so that `Deferred` can write it into the
 * card's placeholder without loading Recharts. On a desktop that card is on screen at load and this
 * sentence is the page's largest text, so it is what the largest paint waits for: drawn by the chart,
 * it waited for the 300 kB chart chunk as well as the data (docs/performance.md).
 */
export const bTimeDescription = (t: Dict, stats: Stats, magType: string | null, cluster: Cluster | null): string =>
  (cluster !== null ? `${t.clusterNote(t.clusterName[cluster])} ` : "") +
  (magType !== null ? `${t.bScopeNote(magType)} ` : "") +
  t.bTimeDesc(WINDOW_SIZE, stats.mc?.toFixed(1) ?? "—");
