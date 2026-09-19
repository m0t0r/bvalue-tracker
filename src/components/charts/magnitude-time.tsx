import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Scatter, ScatterChart, XAxis, YAxis, ZAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import type { StoredEvent } from "@/lib/api";
import { MAINSHOCK_ID } from "@/lib/filters";
import { dayStart, fmtDate, fmtDateTime, fmtDay } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { CLUSTER_DEPTH_KM, clusterOf } from "../../../core/clusters";

// The shallow cluster keeps the page's blue; the deep one, which went quiet after the first week, is
// the neutral grey. Orange stays the mainshock's alone.
const config = {
  mag: { label: "M", color: "var(--chart-1)" }, deep: { label: "M", color: "var(--chart-3)" },
  main: { label: "M7.4", color: "var(--chart-2)" },
} satisfies ChartConfig;

const DAY = 86_400_000;
// The whole sequence squeezed into a phone's ~300px is one solid band, so below DENSE_BELOW every
// Colombian day gets a fixed slice of width instead and the card scrolls sideways. Above it the
// chart still just fills its card, exactly as it did before.
const PX_PER_DAY = 28;
const DENSE_BELOW = 768;
const AXIS_W = 28; // the y axis itself, the width it has always had
const AXIS_COL = 36; // the column pinned to the left: that axis plus a little air before the plot
const X_AXIS_H = 30; // pinned and scrolling charts must reserve the same strip, or their y ticks drift apart
const TICK_GAP = 64; // horizontal room one date label needs
// Left margin so a dot — and the mainshock's much larger star — on the first day is not half cut
// off by the edge of its own svg. The y axis used to provide that room; it is a separate chart now.
const SCATTER_MARGIN = { left: 10, right: 12, top: 8 };
const BAR_MARGIN = { left: 10, right: 12, top: 8 };
const PINNED_SCATTER_MARGIN = { left: 0, right: 0, top: 8 };
const PINNED_BAR_MARGIN = { left: 0, right: 0, top: 8 };

function domainOf(events: readonly StoredEvent[]): [number, number] {
  if (events.length === 0) return [0, 1];
  return [dayStart(events[0]!.time), dayStart(events[events.length - 1]!.time) + DAY];
}

// The daily counts need one explicit scale, because the pinned axis is drawn by a second chart that
// holds no data: left to infer a domain the two would disagree.
function countAxis(max: number): { domain: [number, number]; ticks: number[] } {
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find((s) => max / s <= 4) ?? 2000;
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  return { domain: [0, top], ticks };
}

export const MagnitudeTimeChart = memo(function MagnitudeTimeChart({ events }: { events: readonly StoredEvent[] }) {
  const { t, lang } = useI18n();
  const { points, deepPoints, main, daily, domain, days, count } = useMemo(() => {
    const pts = events.map((e) => ({ t: Date.parse(e.time), mag: e.mag, time: e.time, region: e.region, id: e.id, depthKm: e.depthKm, cluster: clusterOf(e) }));
    const counts = new Map<number, number>(), deepCounts = new Map<number, number>();
    for (const e of events) {
      const d = dayStart(e.time);
      counts.set(d, (counts.get(d) ?? 0) + 1);
      if (clusterOf(e) === "deep") deepCounts.set(d, (deepCounts.get(d) ?? 0) + 1);
    }
    const [lo, hi] = domainOf(events);
    const bars = [];
    let max = 0;
    for (let d = lo; d < hi; d += DAY) {
      const c = counts.get(d) ?? 0;
      if (c > max) max = c;
      const deep = deepCounts.get(d) ?? 0;
      bars.push({ t: d + DAY / 2, count: c, shallow: c - deep, deep });
    }
    return {
      points: pts.filter((p) => p.id !== MAINSHOCK_ID && p.cluster === "shallow"),
      deepPoints: pts.filter((p) => p.id !== MAINSHOCK_ID && p.cluster === "deep"),
      main: pts.filter((p) => p.id === MAINSHOCK_ID),
      daily: bars, domain: [lo, hi] as [number, number], days: Math.max(1, bars.length), count: countAxis(max),
    };
  }, [events]);

  const scroller = useRef<HTMLDivElement>(null);
  const [viewW, setViewW] = useState(0);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setViewW(entry!.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const roomW = Math.max(0, viewW - AXIS_COL);
  const plotW = viewW > 0 && viewW < DENSE_BELOW ? Math.max(roomW, days * PX_PER_DAY) : roomW;
  const scrolls = plotW > roomW + 1;
  // Weekly ticks are right when the whole range is on screen. Once it scrolls there is room for more,
  // and a week of empty axis between labels reads as a gap in the data.
  const tickDays = scrolls ? Math.max(1, Math.ceil(TICK_GAP / (plotW / days))) : 7;
  const ticks = useMemo(() => {
    const out: number[] = [];
    for (let d = domain[0]; d <= domain[1]; d += tickDays * DAY) out.push(d);
    return out;
  }, [domain, tickDays]);

  // The reader starts at the newest events and scrolls back in time. A refresh or a filter change
  // keeps them where they were reading unless they were already at the right edge, which is where
  // the next event will appear.
  const stick = useRef(true);
  const [scrolled, setScrolled] = useState(false);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !stick.current) return;
    el.scrollLeft = el.scrollWidth;
    setScrolled(el.scrollLeft > 1);
  }, [plotW]);
  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    stick.current = el.scrollLeft + el.clientWidth >= el.scrollWidth - 8;
    setScrolled(el.scrollLeft > 1);
  }, []);

  const xAxis = (labels: boolean) => (
    <XAxis dataKey="t" type="number" scale="time" domain={domain} ticks={ticks} height={X_AXIS_H}
      tickFormatter={(ms: number) => fmtDay(ms, lang)} tick={labels}
      tickLine={false} axisLine={false} tickMargin={8} minTickGap={40} />
  );
  const yMag = (pinned: boolean) => (
    <YAxis dataKey="mag" type="number" domain={[1, 8]} ticks={[2, 3, 4, 5, 6, 7]}
      tickLine={false} interval={0} axisLine={false} width={AXIS_W} hide={!pinned} />
  );
  const yCount = (pinned: boolean) => (
    <YAxis type="number" domain={count.domain} ticks={count.ticks} allowDecimals={false}
      tickLine={false} interval={0} axisLine={false} width={AXIS_W} hide={!pinned} />
  );
  // Pinned while the plot scrolls under it, so a dot always has a magnitude beside it. It is opaque
  // and, once scrolled, casts a shadow: the one cue that the chart continues to the left.
  const pinnedCol = cn("sticky left-0 z-10 shrink-0 bg-card",
    scrolled && "shadow-[6px_0_8px_-7px_rgb(0_0_0/0.35)] dark:shadow-[6px_0_8px_-7px_rgb(255_255_255/0.22)]");
  // Recharts lays out nothing for a chart with no data, so the pinned charts carry one invisible
  // point. Both scales are given explicitly above, so it cannot move a tick.
  const seed = useMemo(() => [{ t: domain[0], mag: 2, count: 0 }], [domain]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.magTimeTitle}</CardTitle>
        <CardDescription>{t.magTimeDesc}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {(["shallow", "deep"] as const).map((c) => (
            <li key={c} className="flex items-center gap-1.5">
              <span className={cn("size-2.5 rounded-full", c === "shallow" ? "bg-(--chart-1)" : "bg-(--chart-3)")} />
              {t.clusterName[c]} <span>({t.clusterWhere[c](CLUSTER_DEPTH_KM)})</span>
            </li>
          ))}
        </ul>
        <div ref={scroller} onScroll={onScroll} role="group" aria-label={t.magTimeRegion} tabIndex={0}
          className="overflow-x-auto overscroll-x-contain rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring">
          <div className="flex flex-col gap-6" style={{ width: AXIS_COL + plotW }}>
            <div className="flex">
              <div className={pinnedCol} style={{ width: AXIS_COL }}>
                <ChartContainer config={config} className="aspect-auto h-64 w-full">
                  <ScatterChart margin={PINNED_SCATTER_MARGIN} data={seed}>
                    {xAxis(false)}{yMag(true)}
                    <Scatter data={seed} fill="none" stroke="none" isAnimationActive={false} />
                  </ScatterChart>
                </ChartContainer>
              </div>
              <ChartContainer config={config} className="aspect-auto h-64 shrink-0" style={{ width: plotW }}>
                <ScatterChart margin={SCATTER_MARGIN} title={t.magTimeTitle} desc={t.magTimeDesc}>
                  <CartesianGrid vertical={false} />
                  {xAxis(true)}
                  {yMag(false)}
                  <ZAxis range={[28, 28]} />
                  <ChartTooltip cursor={{ strokeDasharray: "3 3" }} content={({ active, payload }) => {
                    const p = payload?.[0]?.payload as (typeof points)[number] | undefined;
                    if (!active || !p) return null;
                    return (
                      <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-xl">
                        <div className="font-medium tabular-nums">M{p.mag.toFixed(1)} · {fmtDateTime(p.time, lang)} ({t.tz})</div>
                        <div className="text-muted-foreground">{t.clusterName[p.cluster]} · {p.depthKm.toFixed(0)} km · {p.region}</div>
                      </div>
                    );
                  }} />
                  <Scatter data={points} fill="var(--color-mag)" fillOpacity={0.55} stroke="var(--color-mag)" isAnimationActive={false} />
                  <Scatter data={deepPoints} fill="var(--color-deep)" fillOpacity={0.55} stroke="var(--color-deep)" isAnimationActive={false} />
                  <Scatter data={main} fill="var(--color-main)" shape="star" isAnimationActive={false}>
                    <ZAxis range={[160, 160]} />
                  </Scatter>
                </ScatterChart>
              </ChartContainer>
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="sticky left-0 w-fit text-sm font-medium">{t.dailyTitle}</h3>
              <div className="flex">
                <div className={pinnedCol} style={{ width: AXIS_COL }}>
                  <ChartContainer config={config} className="aspect-auto h-36 w-full">
                    <BarChart margin={PINNED_BAR_MARGIN} data={seed}>
                      {xAxis(false)}{yCount(true)}
                      <Bar dataKey="count" fill="none" isAnimationActive={false} />
                    </BarChart>
                  </ChartContainer>
                </div>
                <ChartContainer config={{ count: { label: t.dailyTitle, color: "var(--chart-1)" } }}
                  className="aspect-auto h-36 shrink-0" style={{ width: plotW }}>
                  <BarChart data={daily} margin={BAR_MARGIN} barCategoryGap={2} title={t.dailyTitle}>
                    <CartesianGrid vertical={false} />
                    {xAxis(true)}
                    {yCount(false)}
                    <ChartTooltip cursor={{ fillOpacity: 0.08 }} content={({ active, payload }) => {
                      const p = payload?.[0]?.payload as (typeof daily)[number] | undefined;
                      if (!active || !p) return null;
                      return (
                        <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-xl tabular-nums">
                          <div><span className="font-medium">{p.count}</span> · {fmtDate(p.t, lang)}</div>
                          {p.deep > 0 && p.shallow > 0 ? (
                            <div className="text-muted-foreground">{t.clusterShort.shallow} {p.shallow} · {t.clusterShort.deep} {p.deep}</div>
                          ) : null}
                        </div>
                      );
                    }} />
                    <Bar dataKey="shallow" stackId="day" fill="var(--chart-1)" isAnimationActive={false} />
                    <Bar dataKey="deep" stackId="day" fill="var(--chart-3)" isAnimationActive={false} />
                  </BarChart>
                </ChartContainer>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});
