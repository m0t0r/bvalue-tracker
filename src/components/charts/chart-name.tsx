import { Explain } from "@/components/explainer/explain";
import { CHART_TITLE, type ChartId } from "@/components/explainer/ids";
import { useI18n } from "@/lib/i18n";

/**
 * A chart's name in its card's title, which opens the card that says how to read it (issue #145): no
 * icon, so the title takes no more room than its words. Drawn by the card's placeholder and by the
 * chart alike, so nothing changes when the chart's chunk lands.
 */
export function ChartName({ chart }: { chart: ChartId }) {
  const { t } = useI18n();
  return <Explain id={chart}>{t[CHART_TITLE[chart]]}</Explain>;
}
