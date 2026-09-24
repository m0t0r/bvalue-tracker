import {
  memo,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { Bar, BarChart, CartesianGrid, Scatter, ScatterChart, XAxis, YAxis, ZAxis } from "recharts";
import { useResizeObserver } from "usehooks-ts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import type { StoredEvent } from "@/lib/api";
import { dailyCounts } from "@/lib/daily-counts";
import { fmtDate, fmtDateTime, fmtDay, fmtRegion } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useZone } from "@/lib/zone";
import { CLUSTER_DEPTH_KM, clusterOf } from "../../../core/clusters";
import type { ZoneId } from "../../../core/zones";

// The shallow cluster keeps the page's blue; the deep one, which went quiet after the first week, is
// a teal set well away from the blue in lightness as well as hue. Orange stays the mainshock's alone.
const config = {
  mag: { label: "M", color: "var(--chart-1)" },
  deep: { label: "M", color: "var(--chart-4)" },
  main: { label: "M", color: "var(--chart-2)" },
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
// Recharts hides a tick whose label would cross the edge of the plot, which dropped the first one —
// the day of the mainshock, sitting exactly on the domain's left edge. Half a date label of padding
// moves the scale, not the label, so every tick stays centred on its own day and none is lost.
const FIRST_TICK_PAD = { left: 20 };
// Left margin so a dot — and the mainshock's much larger star — on the first day is not half cut
// off by the edge of its own svg. The y axis used to provide that room; it is a separate chart now.
const SCATTER_MARGIN = { left: 10, right: 12, top: 8 };
const BAR_MARGIN = { left: 10, right: 12, top: 8 };
const PINNED_SCATTER_MARGIN = { left: 0, right: 0, top: 8 };
const PINNED_BAR_MARGIN = { left: 0, right: 0, top: 8 };

/**
 * The top of the magnitude axis, fixed per zone so it does not jump with the filters: Chocó's has
 * room for the M7.4, and the Chaparral swarm's, whose largest is M4.5, would otherwise spend half
 * the chart on empty space. A larger event than the zone's scale allows still extends it.
 */
const MAG_TOP: Record<ZoneId, number> = { choco: 8, tolima: 6 };

// The daily counts need one explicit scale, because the pinned axis is drawn by a second chart that
// holds no data: left to infer a domain the two would disagree.
function countAxis(max: number): { domain: [number, number]; ticks: number[] } {
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find((s) => max / s <= 4) ?? 2000;
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  return { domain: [0, top], ticks };
}

/** `mainshockId` is the zone's detected mainshock, drawn as a star apart from the other events; null draws none. */
export const MagnitudeTimeChart = memo(function MagnitudeTimeChart({
  events,
  mainshockId,
}: {
  events: readonly StoredEvent[];
  mainshockId: string | null;
}) {
  const { t, lang } = useI18n();
  const zone = useZone();
  const { points, deepPoints, main, daily, domain, days, count, magTop } = useMemo(() => {
    const pts = events.map((e) => ({
      t: Date.parse(e.time),
      mag: e.mag,
      time: e.time,
      region: e.region,
      id: e.id,
      depthKm: e.depthKm,
      cluster: clusterOf(e),
    }));
    // The day histogram is `dailyCounts`, shared with the groups card: a bar sits at the middle of
    // its own day, and the time axis spans the whole of the first day to the whole of the last.
    const byDay = dailyCounts(events);
    const lo = byDay.days[0]?.start ?? 0;
    const hi = byDay.days.length > 0 ? byDay.days.at(-1)!.start + DAY : 1;
    return {
      points: pts.filter((p) => p.id !== mainshockId && p.cluster === "shallow"),
      deepPoints: pts.filter((p) => p.id !== mainshockId && p.cluster === "deep"),
      main: pts.filter((p) => p.id === mainshockId),
      daily: byDay.days.map((d) => ({ t: d.start + DAY / 2, total: d.total, shallow: d.shallow, deep: d.deep })),
      domain: [lo, hi] as [number, number],
      days: Math.max(1, byDay.days.length),
      count: countAxis(byDay.maxTotal),
      magTop: Math.max(MAG_TOP[zone.id], Math.ceil(Math.max(0, ...events.map((e) => e.mag)) + 0.5)),
    };
  }, [events, mainshockId, zone.id]);

  const scroller = useRef<HTMLDivElement>(null);
  const { width: viewW = 0 } = useResizeObserver({ ref: scroller as RefObject<HTMLDivElement> });

  const roomW = Math.max(0, viewW - AXIS_COL);
  const plotW = viewW > 0 && viewW < DENSE_BELOW ? Math.max(roomW, days * PX_PER_DAY) : roomW;
  const scrolls = plotW > roomW + 1;
  // Weekly ticks are right when the whole range is on screen. Once it scrolls there is room for more,
  // and a week of empty axis between labels reads as a gap in the data. A range of two weeks or less
  // (a young swarm) gets a label every day: weekly, it had one label for the whole chart.
  const tickDays = scrolls ? Math.max(1, Math.ceil(TICK_GAP / (plotW / days))) : days <= 14 ? 1 : 7;
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
    <XAxis
      dataKey="t"
      type="number"
      scale="time"
      domain={domain}
      ticks={ticks}
      height={X_AXIS_H}
      tickFormatter={(ms: number) => fmtDay(ms, lang)}
      tick={labels}
      tickLine={false}
      axisLine={false}
      tickMargin={8}
      minTickGap={40}
      padding={FIRST_TICK_PAD}
    />
  );
  const yMag = (pinned: boolean) => (
    <YAxis
      dataKey="mag"
      type="number"
      domain={[1, magTop]}
      ticks={Array.from({ length: magTop - 2 }, (_, i) => i + 2)}
      tickLine={false}
      interval={0}
      axisLine={false}
      width={AXIS_W}
      hide={!pinned}
    />
  );
  const yCount = (pinned: boolean) => (
    <YAxis
      type="number"
      domain={count.domain}
      ticks={count.ticks}
      allowDecimals={false}
      tickLine={false}
      interval={0}
      axisLine={false}
      width={AXIS_W}
      hide={!pinned}
    />
  );
  // Pinned while the plot scrolls under it, so a dot always has a magnitude beside it. It is opaque
  // and, once scrolled, casts a shadow: the one cue that the chart continues to the left.
  const pinnedCol = cn("sticky left-0 z-10 w-(--axis-col) shrink-0 bg-card", scrolled && "shadow-pin");
  // Recharts lays out nothing for a chart with no data, so the pinned charts carry one invisible
  // point. Both scales are given explicitly above, so it cannot move a tick.
  const seed = useMemo(() => [{ t: domain[0], mag: 2, total: 0 }], [domain]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.magTimeTitle}</CardTitle>
        <CardDescription>{t.magTimeDesc}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {/* The two depth groups are Chocó's (docs/science.md); elsewhere every dot is one colour and needs no key. */}
        {zone.depthClusters ? (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {(["shallow", "deep"] as const).map((c) => (
              <li key={c} className="flex items-center gap-1.5">
                <span className={cn("size-2.5 rounded-full", c === "shallow" ? "bg-(--chart-1)" : "bg-(--chart-4)")} />
                {t.clusterName[c]} <span>({t.clusterWhere[c](CLUSTER_DEPTH_KM)})</span>
              </li>
            ))}
          </ul>
        ) : null}
        <div
          ref={scroller}
          onScroll={onScroll}
          role="group"
          aria-label={t.magTimeRegion}
          tabIndex={0}
          className="overflow-x-auto overscroll-x-contain rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring"
        >
          <div
            className="flex w-[calc(var(--axis-col)+var(--plot-w))] flex-col gap-6"
            style={{ "--axis-col": `${AXIS_COL}px`, "--plot-w": `${plotW}px` } as CSSProperties}
          >
            <div className="flex">
              <div className={pinnedCol}>
                <ChartContainer config={config} className="aspect-auto h-64 w-full">
                  <ScatterChart margin={PINNED_SCATTER_MARGIN} data={seed}>
                    {xAxis(false)}
                    {yMag(true)}
                    <Scatter data={seed} fill="none" stroke="none" isAnimationActive={false} />
                  </ScatterChart>
                </ChartContainer>
              </div>
              <ChartContainer config={config} className="aspect-auto h-64 w-(--plot-w) shrink-0">
                <ScatterChart margin={SCATTER_MARGIN} title={t.magTimeTitle} desc={t.magTimeDesc}>
                  <CartesianGrid vertical={false} />
                  {xAxis(true)}
                  {yMag(false)}
                  <ZAxis range={[28, 28]} />
                  <ChartTooltip
                    cursor={{ strokeDasharray: "3 3" }}
                    content={({ active, payload }) => {
                      const p = payload?.[0]?.payload as (typeof points)[number] | undefined;
                      if (!active || !p) return null;
                      return (
                        <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-xl">
                          <div className="font-medium tabular-nums">
                            M{p.mag.toFixed(1)} · {fmtDateTime(p.time, lang)}
                          </div>
                          <div className="text-muted-foreground">
                            {zone.depthClusters ? `${t.clusterName[p.cluster]} · ` : null}
                            {p.depthKm.toFixed(0)} km · {fmtRegion(p.region)}
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Scatter
                    data={points}
                    fill="var(--color-mag)"
                    fillOpacity={0.55}
                    stroke="var(--color-mag)"
                    isAnimationActive={false}
                  />
                  <Scatter
                    data={deepPoints}
                    fill="var(--color-deep)"
                    fillOpacity={0.55}
                    stroke="var(--color-deep)"
                    isAnimationActive={false}
                  />
                  <Scatter data={main} fill="var(--color-main)" shape="star" isAnimationActive={false}>
                    <ZAxis range={[160, 160]} />
                  </Scatter>
                </ScatterChart>
              </ChartContainer>
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="sticky left-0 w-fit text-sm font-medium">{t.dailyTitle}</h3>
              <div className="flex">
                <div className={pinnedCol}>
                  <ChartContainer config={config} className="aspect-auto h-36 w-full">
                    <BarChart margin={PINNED_BAR_MARGIN} data={seed}>
                      {xAxis(false)}
                      {yCount(true)}
                      <Bar dataKey="total" fill="none" isAnimationActive={false} />
                    </BarChart>
                  </ChartContainer>
                </div>
                <ChartContainer
                  config={{ total: { label: t.dailyTitle, color: "var(--chart-1)" } }}
                  className="aspect-auto h-36 w-(--plot-w) shrink-0"
                >
                  <BarChart data={daily} margin={BAR_MARGIN} barCategoryGap={2} title={t.dailyTitle}>
                    <CartesianGrid vertical={false} />
                    {xAxis(true)}
                    {yCount(false)}
                    <ChartTooltip
                      cursor={{ fillOpacity: 0.08 }}
                      content={({ active, payload }) => {
                        const p = payload?.[0]?.payload as (typeof daily)[number] | undefined;
                        if (!active || !p) return null;
                        return (
                          <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-xl tabular-nums">
                            <div>
                              <span className="font-medium">{p.total}</span> · {fmtDate(p.t, lang)}
                            </div>
                            {p.deep > 0 && p.shallow > 0 ? (
                              <div className="text-muted-foreground">
                                {t.clusterShort.shallow} {p.shallow} · {t.clusterShort.deep} {p.deep}
                              </div>
                            ) : null}
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="shallow" stackId="day" fill="var(--chart-1)" isAnimationActive={false} />
                    <Bar dataKey="deep" stackId="day" fill="var(--chart-4)" isAnimationActive={false} />
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
