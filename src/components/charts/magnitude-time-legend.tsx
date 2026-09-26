import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useZone } from "@/lib/zone";
import { CLUSTER_DEPTH_KM } from "../../../core/clusters";

/**
 * "Magnitud en el tiempo"'s key and placeholder, apart from Recharts so that `Deferred` can draw them
 * before the chart's chunk arrives. The key wraps to one, two or three lines with the width, so the
 * placeholder carries the real one rather than guessing its height.
 */

/** The two depth groups are Chocó's (docs/science.md); elsewhere every dot is one colour and needs no key. */
export function ClusterLegend() {
  const { t } = useI18n();
  const zone = useZone();
  if (!zone.depthClusters) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {(["shallow", "deep"] as const).map((c) => (
        <li key={c} className="flex items-center gap-1.5">
          <span className={cn("size-2.5 rounded-full", c === "shallow" ? "bg-(--chart-1)" : "bg-(--chart-4)")} />
          {t.clusterName[c]} <span>({t.clusterWhere[c](CLUSTER_DEPTH_KM)})</span>
        </li>
      ))}
    </ul>
  );
}

/** The key, then the magnitude chart's h-64 and the daily bars' h-36 under their own heading. */
export function MagnitudeTimePlaceholder() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-3">
      <ClusterLegend />
      <div className="flex flex-col gap-6">
        <Skeleton className="h-64 w-full" />
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">{t.dailyTitle}</h3>
          <Skeleton className="h-36 w-full" />
        </div>
      </div>
    </div>
  );
}
