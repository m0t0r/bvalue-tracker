import type { Dict } from "@/lib/i18n";
import type { Stats } from "@/lib/stats";
import type { Cluster } from "../../../core/clusters";

/**
 * "Distribución frecuencia–magnitud"'s description, apart from Recharts like `bTimeDescription`, so
 * that `Deferred` writes it into the placeholder: on a phone it runs to four lines, which a one-line
 * skeleton left out of the placeholder's height.
 */
export function fmdDescription(t: Dict, stats: Stats, magType: string | null, cluster: Cluster | null): string {
  // The largest event, when nothing lies within a magnitude unit below it: worth naming, or it looks like a stray point.
  const filled = stats.bins.filter((b) => b.count > 0);
  const isolated = filled.length > 1 && filled.at(-1)!.mag - filled.at(-2)!.mag >= 1 ? filled.at(-1)!.mag : null;
  return (
    (cluster !== null ? `${t.clusterNote(t.clusterName[cluster])} ` : "") +
    (magType !== null ? `${t.bScopeNote(magType)} ` : "") +
    t.fmdDesc +
    (isolated !== null ? ` ${t.fmdIsolated(isolated.toFixed(1))}` : "")
  );
}
