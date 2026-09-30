import { ArrowDownIcon, MousePointerClickIcon, PointerIcon } from "lucide-react";
import { useMediaQuery } from "usehooks-ts";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { DayRange } from "@/lib/daily-counts";
import { fmtDayRange } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { FILL } from "@/lib/cluster-fill";
import { cn } from "@/lib/utils";
import { useZone } from "@/lib/zone";
import { CLUSTER_DEPTH_KM } from "../../../core/clusters";

/**
 * "Magnitud en el tiempo"'s key and placeholder, apart from the chart itself so that `Deferred` can draw
 * them before the chart's chunk arrives. The key wraps to one, two or three lines with the width, so the
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
          <span className={cn("size-2.5 rounded-full", FILL[c])} />
          {t.clusterName[c]} <span>({t.clusterWhere[c](CLUSTER_DEPTH_KM)})</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * A mouse can drag across the bars to choose several days; a finger cannot, since a sideways drag
 * scrolls the chart there. Touch keeps the press on one day, and the tip says only what works.
 */
export const useFinePointer = () => useMediaQuery("(hover: hover) and (pointer: fine)");

/**
 * The line under the daily bars. With no days chosen it is the tip that says the bars can be pressed;
 * with some, it names them and takes the reader to the catalogue, whose header holds the one way back
 * to every day (a second "Ver todos los días" here repeated it a card apart). Under the bars, not
 * above them, so nothing the reader is pressing moves.
 */
export function DailyLine({
  days = null,
  count = 0,
  onShow,
}: {
  days?: DayRange | null;
  count?: number;
  onShow?: () => void;
}) {
  const { t, lang } = useI18n();
  const fine = useFinePointer();
  if (!days) {
    const Icon = fine ? MousePointerClickIcon : PointerIcon;
    return (
      <p className="flex min-h-8 items-center gap-1.5 text-xs text-muted-foreground">
        <Icon aria-hidden className="size-3.5 shrink-0" />
        {fine ? t.dailyTipPointer : t.dailyTipTouch}
      </p>
    );
  }
  return (
    <p className="flex min-h-8 flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
      <span className="font-medium text-foreground">{fmtDayRange(days.from, days.to, lang)}</span>
      {" · "}
      {/* It moves the reader down the page, so it says so with the arrow; a link-styled word alone
          read as part of the sentence. */}
      <Button variant="link" size="inline-touch" onClick={onShow}>
        {t.dailyInCatalogue(count.toLocaleString(lang), count === 1)}
        <ArrowDownIcon data-icon="inline-end" />
      </Button>
    </p>
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
      {/* Outside the drawing's column, as in the chart, where it follows the scroller at the card's gap. */}
      <DailyLine />
    </div>
  );
}
