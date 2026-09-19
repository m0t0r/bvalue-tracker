import { memo, useMemo } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, XAxis, YAxis } from "recharts";
import { DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { downloadCsv } from "@/lib/download";
import { fmtDateTime, fmtDay } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { WINDOW_SIZE, type Stats } from "@/lib/use-stats";
import type { Cluster } from "../../../core/clusters";
import { windowsToCsv } from "../../../core/csv";

/** `cluster` is set while the page is narrowed to one depth cluster; `magType` while the b card limits the statistics to one magnitude type. */
export const BOverTimeChart = memo(function BOverTimeChart({ stats, magType, cluster }: { stats: Stats; magType: string | null; cluster: Cluster | null }) {
  const { t, lang } = useI18n();
  const config = {
    b: { label: t.bTitle, color: "var(--chart-1)" },
    band: { label: t.band, color: "var(--chart-1)" },
  } satisfies ChartConfig;

  const data = useMemo(
    () => stats.windows.map((w) => ({
      t: Date.parse(w.to), b: w.b, band: [w.b - w.sigmaB, w.b + w.sigmaB] as [number, number], from: w.from, to: w.to, sigma: w.sigmaB,
    })),
    [stats.windows],
  );
  const lo = Math.min(0.4, ...data.map((d) => d.band[0]));
  const hi = Math.max(1.2, ...data.map((d) => d.band[1]));

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{t.bTimeTitle}</CardTitle>
        <CardDescription>{cluster !== null ? `${t.clusterNote(t.clusterName[cluster])} ` : ""}{magType !== null ? `${t.bScopeNote(magType)} ` : ""}{t.bTimeDesc(WINDOW_SIZE, stats.mc?.toFixed(1) ?? "—")}</CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" aria-label={t.downloadBCsv} disabled={stats.windows.length === 0}
            onClick={() => downloadCsv(`sgc-choco-b-windows${cluster !== null ? `-${cluster}` : ""}${magType !== null ? `-${magType}` : ""}.csv`, windowsToCsv(stats.windows, lang))}>
            <DownloadIcon data-icon="inline-start" />
            {t.downloadCsv}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-center">
        {data.length < 2 ? (
          <Empty><EmptyHeader><EmptyDescription>
            {/* A whole cluster with too few events is not something a wider date range can fix, so it gets its own words. */}
            {cluster !== null && stats.fit && stats.fit.n < WINDOW_SIZE ? t.bTimeEmptyCluster(stats.fit.n.toLocaleString(lang), WINDOW_SIZE) : t.bTimeEmpty(WINDOW_SIZE)}
          </EmptyDescription></EmptyHeader></Empty>
        ) : (
          <ChartContainer config={config} className="aspect-auto h-80 w-full">
            <ComposedChart data={data} margin={{ left: 0, right: 12, top: 16 }} title={t.bTimeTitle}
              desc={t.bTimeAlt(data[0]!.b.toFixed(2), data[data.length - 1]!.b.toFixed(2))}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={(ms: number) => fmtDay(ms, lang)}
                tickLine={false} axisLine={false} tickMargin={8} minTickGap={40} />
              <YAxis type="number" domain={[Math.floor(lo * 10) / 10, Math.ceil(hi * 10) / 10]}
                tickFormatter={(v: number) => v.toFixed(1)} tickLine={false} axisLine={false} width={32} />
              <ChartTooltip cursor={{ strokeDasharray: "3 3" }} content={({ active, payload }) => {
                const p = payload?.[0]?.payload as (typeof data)[number] | undefined;
                if (!active || !p) return null;
                return (
                  <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-xl tabular-nums">
                    <div className="font-medium">b = {p.b.toFixed(2)} ± {p.sigma.toFixed(2)}</div>
                    <div className="text-muted-foreground">{fmtDateTime(p.from, lang)} → {fmtDateTime(p.to, lang)}</div>
                  </div>
                );
              }} />
              <ReferenceLine y={1} stroke="var(--muted-foreground)" strokeDasharray="4 4"
                label={{ value: "b = 1", position: "insideTopRight", fill: "var(--muted-foreground)", fontSize: 12 }} />
              <Area dataKey="band" stroke="none" fill="var(--color-band)" fillOpacity={0.18} isAnimationActive={false} />
              <Line dataKey="b" stroke="var(--color-b)" strokeWidth={2} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
});
