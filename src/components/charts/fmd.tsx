import { memo, useMemo } from "react";
import { CartesianGrid, ComposedChart, Line, ReferenceLine, Scatter, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { useI18n } from "@/lib/i18n";
import type { Stats } from "@/lib/use-stats";

/** `magType` is set while the b card limits the statistics to one magnitude type. */
export const FmdChart = memo(function FmdChart({ stats, magType }: { stats: Stats; magType: string | null }) {
  const { t } = useI18n();
  const { bins, fit, mc } = stats;

  const config = {
    cumulative: { label: t.cumulative, color: "var(--chart-1)" },
    count: { label: t.perBin, color: "var(--chart-3)" },
    fit: { label: fit ? `${t.grFit}: b = ${fit.b.toFixed(2)} ± ${fit.sigmaB.toFixed(2)}` : t.grFit, color: "var(--chart-2)" },
  } satisfies ChartConfig;

  const data = useMemo(
    () => bins.map((b) => ({
      mag: b.mag,
      // Drawn only where an event exists. A dot at every step turns the lone mainshock into a
      // long flat run at N = 1, which reads as data. The tooltip still reports every step.
      cumulative: b.count > 0 ? b.cumulative : null,
      cumulativeAll: b.cumulative,
      count: b.count > 0 ? b.count : null, // zero cannot be drawn on a log axis
      fit: fit && mc !== null && b.mag >= mc - 1e-9 && fit.a - fit.b * b.mag >= 0 ? 10 ** (fit.a - fit.b * b.mag) : null,
    })),
    [bins, fit, mc],
  );
  // The largest event, when nothing lies within a magnitude unit below it: worth naming, or it looks like a stray point.
  const filled = bins.filter((b) => b.count > 0);
  const isolated = filled.length > 1 && filled.at(-1)!.mag - filled.at(-2)!.mag >= 1 ? filled.at(-1)!.mag : null;
  const top = Math.max(10, ...bins.map((b) => b.cumulative));

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{t.fmdTitle}</CardTitle>
        <CardDescription>{magType !== null ? `${t.bScopeNote(magType)} ` : ""}{t.fmdDesc}{isolated !== null ? ` ${t.fmdIsolated(isolated.toFixed(1))}` : ""}</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="aspect-auto h-80 w-full">
          <ComposedChart data={data} margin={{ left: 0, right: 12, top: 16 }} title={t.fmdTitle} desc={t.fmdDesc}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="mag" type="number" domain={["dataMin", "dataMax"]} tickCount={8}
              tickFormatter={(v: number) => v.toFixed(1)} tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis type="number" scale="log" domain={[0.8, top * 1.5]} allowDataOverflow
              ticks={[1, 10, 100, 1000, 10000].filter((x) => x <= top * 1.5)} tickLine={false} axisLine={false} width={40} />
            <ChartTooltip content={({ active, payload }) => {
              const p = payload?.[0]?.payload as (typeof data)[number] | undefined;
              if (!active || !p) return null;
              return (
                <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-xl tabular-nums">
                  <div className="font-medium">M{p.mag.toFixed(1)}</div>
                  <div>{t.cumulative}: {p.cumulativeAll}</div>
                  <div>{t.perBin}: {p.count ?? 0}</div>
                </div>
              );
            }} />
            <ChartLegend content={<ChartLegendContent />} />
            {mc !== null ? (
              <ReferenceLine x={mc} stroke="var(--muted-foreground)" strokeDasharray="4 4"
                label={{ value: `Mc ${mc.toFixed(1)}`, position: "top", fill: "var(--muted-foreground)", fontSize: 12 }} />
            ) : null}
            <Scatter dataKey="count" fill="var(--color-count)" shape="square" isAnimationActive={false} />
            <Scatter dataKey="cumulative" fill="var(--color-cumulative)" isAnimationActive={false} />
            <Line dataKey="fit" stroke="var(--color-fit)" strokeWidth={2} dot={false} activeDot={false}
              connectNulls={false} isAnimationActive={false} />
          </ComposedChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
});
