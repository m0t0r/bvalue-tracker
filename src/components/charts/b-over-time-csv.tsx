import { DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/lib/download";
import { useI18n } from "@/lib/i18n";
import type { Stats } from "@/lib/stats";
import { useZone } from "@/lib/zone";
import type { Cluster } from "../../../core/clusters";
import { windowsToCsv } from "../../../core/csv";

/**
 * "Valor b en el tiempo"'s download, apart from Recharts so that `Deferred` draws it in the card's
 * placeholder too: it shares the header's first row with the title, which it wraps to two lines on a
 * narrow phone, and a placeholder without it was a line short. It needs only the windows, so it works
 * before the chart has loaded.
 */
export function BTimeCsvButton({
  stats,
  magType,
  cluster,
}: {
  stats: Stats;
  magType: string | null;
  cluster: Cluster | null;
}) {
  const { t, lang } = useI18n();
  const zone = useZone();
  return (
    <Button
      variant="outline"
      size="sm-touch"
      aria-label={t.downloadBCsv}
      disabled={stats.windows.length === 0}
      onClick={() =>
        downloadCsv(
          `sgc-${zone.id}-b-windows${cluster !== null ? `-${cluster}` : ""}${magType !== null ? `-${magType}` : ""}.csv`,
          windowsToCsv(stats.windows, lang),
        )
      }
    >
      <DownloadIcon data-icon="inline-start" />
      {t.downloadCsv}
    </Button>
  );
}
