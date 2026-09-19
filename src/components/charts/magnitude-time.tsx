import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Scatter, ScatterChart, XAxis, YAxis, ZAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import type { StoredEvent } from "@/lib/api";
import { MAINSHOCK_ID } from "@/lib/filters";
import { dayStart, fmtDateTime, fmtDay } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

const config = { mag: { label: "M", color: "var(--chart-1)" }, main: { label: "M7.4", color: "var(--chart-2)" } } satisfies ChartConfig;

function domainOf(events: readonly StoredEvent[]): [number, number] {
  if (events.length === 0) return [0, 1];
  return [dayStart(events[0]!.time), dayStart(events[events.length - 1]!.time) + 86_400_000];
}

export function MagnitudeTimeChart({ events }: { events: readonly StoredEvent[] }) {
  const { t } = useI18n();
  const { points, main, daily, domain, ticks } = useMemo(() => {
    const pts = events.map((e) => ({ t: Date.parse(e.time), mag: e.mag, time: e.time, region: e.region, id: e.id }));
    const counts = new Map<number, number>();
    for (const e of events) counts.set(dayStart(e.time), (counts.get(dayStart(e.time)) ?? 0) + 1);
    const [lo, hi] = domainOf(events);
    const days = [];
    for (let d = lo; d < hi; d += 86_400_000) days.push({ t: d + 43_200_000, count: counts.get(d) ?? 0 });
    const ticks: number[] = [];
    for (let d = lo; d <= hi; d += 7 * 86_400_000) ticks.push(d);
    return {
      ticks,
      points: pts.filter((p) => p.id !== MAINSHOCK_ID), main: pts.filter((p) => p.id === MAINSHOCK_ID),
      daily: days, domain: [lo, hi] as [number, number],
    };
  }, [events]);

  const xAxis = (
    <XAxis dataKey="t" type="number" scale="time" domain={domain} ticks={ticks} tickFormatter={fmtDay}
      tickLine={false} axisLine={false} tickMargin={8} minTickGap={40} />
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.magTimeTitle}</CardTitle>
        <CardDescription>{t.magTimeDesc}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <ChartContainer config={config} className="aspect-auto h-64 w-full">
          <ScatterChart margin={{ left: 0, right: 12, top: 8 }} title={t.magTimeTitle} desc={t.magTimeDesc}>
            <CartesianGrid vertical={false} />
            {xAxis}
            <YAxis dataKey="mag" type="number" domain={[1, 8]} ticks={[2, 3, 4, 5, 6, 7]} tickLine={false} axisLine={false} width={28} />
            <ZAxis range={[28, 28]} />
            <ChartTooltip cursor={{ strokeDasharray: "3 3" }} content={({ active, payload }) => {
              const p = payload?.[0]?.payload as (typeof points)[number] | undefined;
              if (!active || !p) return null;
              return (
                <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-xl">
                  <div className="font-medium tabular-nums">M{p.mag.toFixed(1)} · {fmtDateTime(p.time)} UTC</div>
                  <div className="text-muted-foreground">{p.region}</div>
                </div>
              );
            }} />
            <Scatter data={points} fill="var(--color-mag)" fillOpacity={0.55} stroke="var(--color-mag)" isAnimationActive={false} />
            <Scatter data={main} fill="var(--color-main)" shape="star" isAnimationActive={false}>
              <ZAxis range={[160, 160]} />
            </Scatter>
          </ScatterChart>
        </ChartContainer>
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">{t.dailyTitle}</h3>
          <ChartContainer config={{ count: { label: t.dailyTitle, color: "var(--chart-1)" } }} className="aspect-auto h-36 w-full">
            <BarChart data={daily} margin={{ left: 0, right: 12 }} barCategoryGap={2} title={t.dailyTitle}>
              <CartesianGrid vertical={false} />
              {xAxis}
              <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} />
              <ChartTooltip cursor={{ fillOpacity: 0.08 }} content={({ active, payload }) => {
                const p = payload?.[0]?.payload as { t: number; count: number } | undefined;
                if (!active || !p) return null;
                return (
                  <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-xl tabular-nums">
                    <span className="font-medium">{p.count}</span> · {new Date(p.t).toISOString().slice(0, 10)}
                  </div>
                );
              }} />
              <Bar dataKey="count" fill="var(--color-count)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ChartContainer>
        </div>
      </CardContent>
    </Card>
  );
}
