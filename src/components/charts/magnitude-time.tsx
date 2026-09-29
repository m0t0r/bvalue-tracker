import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceArea,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
  ZAxis,
  useActiveTooltipLabel,
  useXAxisInverseScale,
} from "recharts";
import { useResizeObserver } from "usehooks-ts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import type { StoredEvent } from "@/lib/api";
import { dailyCounts, type DayRange } from "@/lib/daily-counts";
import { pickDay, spanDays } from "@/lib/day-selection";
import { fmtDate, fmtDateTime, fmtDay, fmtRegion } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useZone } from "@/lib/zone";
import { clusterOf } from "../../../core/clusters";
import { NO_VERTICAL_LINES } from "./chart-grid";
import { ClusterLegend, DailyLine, useFinePointer } from "./magnitude-time-legend";
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

// Recharts' keyboard layer moves its tooltip from day to day with the arrows but has no notion of
// choosing one. This reads the day it is on, so Enter can choose it.
function ActiveDay({ into }: { into: RefObject<number | null> }) {
  const label = useActiveTooltipLabel();
  useEffect(() => {
    into.current = label == null ? null : Number(label);
  }, [into, label]);
  return null;
}

/**
 * A day not chosen: grey, still there to compare against, plainly not what the catalogue shows. One of
 * the theme's own greys rather than the day's colours dimmed (owner's call).
 */
const REST = "var(--border)";

type InverseX = NonNullable<ReturnType<typeof useXAxisInverseScale>>;
// The bar chart's x scale, read backwards, so a press is placed by its own coordinates.
function InverseXProbe({ into }: { into: RefObject<InverseX | null> }) {
  const inverse = useXAxisInverseScale();
  useEffect(() => {
    into.current = inverse ?? null;
  }, [into, inverse]);
  return null;
}

interface Day {
  t: number;
  start: number;
  total: number;
  shallow: number;
  deep: number;
}

/**
 * The daily bars, and choosing days on them. A press on a day with events chooses it, and a second
 * press lets it go. With a mouse a drag, or a shift-press from the last day pressed, chooses every day
 * in between; on touch a sideways drag scrolls the chart, so there a press is all there is. The drag
 * lives here and not in the chart around it, so sweeping across the days redraws the bars alone and
 * not the scatter's hundreds of dots; the scatter shows the choice once it is made.
 */
const DailyBars = memo(function DailyBars({
  daily,
  days,
  onDays,
  xAxis,
  yAxis,
}: {
  daily: readonly Day[];
  days: DayRange | null;
  onDays: (d: DayRange | null) => void;
  xAxis: ReactNode;
  yAxis: ReactNode;
}) {
  const { t, lang } = useI18n();
  const fine = useFinePointer();
  const bars = useRef<HTMLDivElement>(null);
  const inverse = useRef<InverseX | null>(null);
  const activeDay = useRef<number | null>(null);
  const anchor = useRef<number | null>(null);
  const dragRef = useRef<{ from: number; to: number; extend: boolean } | null>(null);
  const [drag, setDrag] = useState<DayRange | null>(null);

  // The day under the pointer, from the event's own position. Recharts' hover index is not used: it is
  // set a frame after the mousemove, so a quick press or release landed on the previous day, a tap has
  // no move before it at all, and off the plot it is null, which `daily[Number(null)]` read as day one.
  const dayAt = (clientX: number, clamp: boolean): Day | undefined => {
    const wrapper = bars.current?.querySelector(".recharts-wrapper");
    const first = daily[0];
    if (!wrapper || !inverse.current || !first) return undefined;
    const at = Number(inverse.current(clientX - wrapper.getBoundingClientRect().left));
    const i = Math.floor((at - first.start) / DAY);
    return daily[clamp ? Math.min(Math.max(i, 0), daily.length - 1) : i];
  };
  const press = (start: number) => {
    anchor.current = start;
    onDays(pickDay(days, start));
  };
  const span = (from: number, to: number) => {
    anchor.current = from;
    onDays(spanDays(from, to));
  };

  // A drag is followed on the window, so it goes on outside the chart and ends wherever the button is
  // let go. The listeners are stable functions that call the latest handlers, so they can be removed.
  // It is dropped, choosing nothing, when the window loses focus, on Escape, and when a move arrives
  // with the button already up: each is a mouseup the page never got (a context menu, a switch of app,
  // a release over another frame), after which the next click anywhere would have chosen a range.
  const stop = () => {
    delete document.documentElement.dataset.dragDays;
    window.removeEventListener("mousemove", on.move);
    window.removeEventListener("mouseup", on.up);
    window.removeEventListener("blur", on.cancel);
    window.removeEventListener("keydown", on.key);
    dragRef.current = null;
    setDrag(null);
  };
  const latest = useRef<{ move: (e: MouseEvent) => void; up: (e: MouseEvent) => void; cancel: () => void }>({
    move: () => {},
    up: () => {},
    cancel: () => {},
  });
  useLayoutEffect(() => {
    latest.current = {
      move: (e) => {
        const g = dragRef.current;
        if (!g) return;
        if ((e.buttons & 1) === 0) return stop();
        const d = dayAt(e.clientX, true);
        if (!d || d.start === g.to) return;
        g.to = d.start;
        setDrag(spanDays(g.from, d.start));
      },
      up: (e) => {
        const g = dragRef.current;
        stop();
        if (!g) return;
        const to = dayAt(e.clientX, true)?.start ?? g.to;
        if (g.from !== to || g.extend) span(g.from, to);
        else if (daily.find((d) => d.start === g.from)?.total) press(g.from);
      },
      cancel: stop,
    };
  });
  const [on] = useState(() => ({
    move: (e: MouseEvent) => latest.current.move(e),
    up: (e: MouseEvent) => latest.current.up(e),
    cancel: () => latest.current.cancel(),
    key: (e: KeyboardEvent) => e.key === "Escape" && latest.current.cancel(),
  }));
  useEffect(
    () => () => {
      delete document.documentElement.dataset.dragDays;
      window.removeEventListener("mousemove", on.move);
      window.removeEventListener("mouseup", on.up);
      window.removeEventListener("blur", on.cancel);
      window.removeEventListener("keydown", on.key);
    },
    [on],
  );

  const onMouseDown = (e: React.MouseEvent) => {
    // Ctrl-press is a right click on a Mac: its menu swallows the mouseup.
    if (e.button !== 0 || e.ctrlKey) return;
    const d = dayAt(e.clientX, false);
    if (!d) return;
    // No text selection and no focus ring from a mouse press; the keyboard has its own way in.
    e.preventDefault();
    const extend = e.shiftKey && days !== null;
    dragRef.current = { from: extend ? (anchor.current ?? days.from) : d.start, to: d.start, extend };
    setDrag(spanDays(dragRef.current.from, d.start));
    document.documentElement.dataset.dragDays = "";
    window.addEventListener("mousemove", on.move);
    window.addEventListener("mouseup", on.up);
    window.addEventListener("blur", on.cancel);
    window.addEventListener("keydown", on.key);
  };
  const onClick = (e: React.MouseEvent) => {
    const d = dayAt(e.clientX, false);
    if (d && d.total > 0) press(d.start);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    // A held Enter repeats; each repeat would let go of the day the first one chose.
    if (e.key !== "Enter" || e.repeat) return;
    const d = daily.find((x) => x.t === activeDay.current);
    if (!d) return;
    e.preventDefault();
    if (e.shiftKey && days) span(anchor.current ?? days.from, d.start);
    else if (d.total > 0) press(d.start);
  };

  // What the bars show as chosen: the drag while it lasts, then the choice.
  const lit = drag ?? days;
  const chosen = (start: number) => !lit || (start >= lit.from && start <= lit.to);

  return (
    // The press handlers sit on a plain element around the chart, not on Recharts' own events, which
    // report its lagging hover index. A mouse gets the drag; anything else, a press.
    // `data-day-bars` gives the bars the pointer, and a drag turns the whole page to the sideways
    // cursor (`[data-drag-days]`); both are in index.css, which says why they are not a `style` prop.
    <div
      ref={bars}
      data-day-bars
      className="shrink-0"
      onKeyDown={onKeyDown}
      {...(fine ? { onMouseDown } : { onClick })}
    >
      <ChartContainer
        config={{ total: { label: t.dailyTitle, color: "var(--chart-1)" } }}
        className="aspect-auto h-36 w-(--plot-w) shrink-0"
      >
        <BarChart data={daily as Day[]} margin={BAR_MARGIN} barCategoryGap={2} title={t.dailyTitle} desc={t.dailyKeys}>
          <ActiveDay into={activeDay} />
          <InverseXProbe into={inverse} />
          <CartesianGrid vertical={false} verticalCoordinatesGenerator={NO_VERTICAL_LINES} />
          {/* The scatter's band, behind the bars too: a chosen day of three events is a bar a few
              pixels tall, and the dimming alone left it hard to find. */}
          {lit ? <ReferenceArea x1={lit.from} x2={lit.to + DAY} fill="var(--foreground)" fillOpacity={0.07} /> : null}
          {xAxis}
          {yAxis}
          <ChartTooltip
            cursor={{ fillOpacity: 0.08 }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as Day | undefined;
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
          {(["shallow", "deep"] as const).map((c) => (
            <Bar
              key={c}
              dataKey={c}
              stackId="day"
              fill={c === "shallow" ? "var(--chart-1)" : "var(--chart-4)"}
              isAnimationActive={false}
            >
              {daily.map((d) => (
                <Cell
                  key={d.start}
                  fill={chosen(d.start) ? (c === "shallow" ? "var(--chart-1)" : "var(--chart-4)") : REST}
                  className="transition-fill motion-reduce:transition-none"
                />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ChartContainer>
    </div>
  );
});

/**
 * `mainshockId` is the zone's detected mainshock, drawn as a star apart from the other events; null draws none.
 * `days` are the days the daily bars have chosen, which narrow the catalogue table (`useDaySelection`);
 * `picked` is how many events that leaves it.
 */
export const MagnitudeTimeChart = memo(function MagnitudeTimeChart({
  events,
  mainshockId,
  days,
  picked,
  onDays,
  onShowPicked,
}: {
  events: readonly StoredEvent[];
  mainshockId: string | null;
  days: DayRange | null;
  picked: number;
  onDays: (d: DayRange | null) => void;
  onShowPicked: () => void;
}) {
  const { t, lang } = useI18n();
  const zone = useZone();
  const { points, deepPoints, main, daily, domain, dayCount, count, magTop } = useMemo(() => {
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
      daily: byDay.days.map((d) => ({
        t: d.start + DAY / 2,
        start: d.start,
        total: d.total,
        shallow: d.shallow,
        deep: d.deep,
      })),
      domain: [lo, hi] as [number, number],
      dayCount: Math.max(1, byDay.days.length),
      count: countAxis(byDay.maxTotal),
      magTop: Math.max(MAG_TOP[zone.id], Math.ceil(Math.max(0, ...events.map((e) => e.mag)) + 0.5)),
    };
  }, [events, mainshockId, zone.id]);

  const scroller = useRef<HTMLDivElement>(null);
  const { width: viewW = 0 } = useResizeObserver({ ref: scroller as RefObject<HTMLDivElement> });

  const roomW = Math.max(0, viewW - AXIS_COL);
  const plotW = viewW > 0 && viewW < DENSE_BELOW ? Math.max(roomW, dayCount * PX_PER_DAY) : roomW;
  const scrolls = plotW > roomW + 1;
  // Weekly ticks are right when the whole range is on screen. Once it scrolls there is room for more,
  // and a week of empty axis between labels reads as a gap in the data. A range of two weeks or less
  // (a young swarm) gets a label every day: weekly, it had one label for the whole chart.
  const tickDays = scrolls ? Math.max(1, Math.ceil(TICK_GAP / (plotW / dayCount))) : dayCount <= 14 ? 1 : 7;
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

  // Escape anywhere in the chart lets go of the chosen days; the bars handle the rest (`DailyBars`).
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Escape" || !days) return;
    e.preventDefault();
    onDays(null);
  };

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
  // and, once scrolled, casts a shadow: the one cue that the chart continues to the left. A drawing of
  // tick numbers only, so hidden from assistive technology and out of the tab order: as a chart of its
  // own it was a stop named "2345".
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
        {/* Shared with the placeholder (`MagnitudeTimePlaceholder`), so the card keeps its height when the chart lands. */}
        <ClusterLegend />
        <div
          ref={scroller}
          onScroll={onScroll}
          onKeyDown={onKeyDown}
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
              <div aria-hidden className={pinnedCol}>
                <ChartContainer config={config} className="aspect-auto h-64 w-full">
                  <ScatterChart margin={PINNED_SCATTER_MARGIN} data={seed} accessibilityLayer={false}>
                    {xAxis(false)}
                    {yMag(true)}
                    <Scatter data={seed} fill="none" stroke="none" isAnimationActive={false} />
                  </ScatterChart>
                </ChartContainer>
              </div>
              <ChartContainer config={config} className="aspect-auto h-64 w-(--plot-w) shrink-0">
                <ScatterChart margin={SCATTER_MARGIN} title={t.magTimeTitle} desc={t.magTimeDesc}>
                  <CartesianGrid vertical={false} verticalCoordinatesGenerator={NO_VERTICAL_LINES} />
                  {xAxis(true)}
                  {yMag(false)}
                  <ZAxis range={[28, 28]} />
                  {/* The chosen days, carried up to the scatter, so its dots can be matched to the catalogue. */}
                  {days ? (
                    <ReferenceArea x1={days.from} x2={days.to + DAY} fill="var(--foreground)" fillOpacity={0.07} />
                  ) : null}
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
                <div aria-hidden className={pinnedCol}>
                  <ChartContainer config={config} className="aspect-auto h-36 w-full">
                    <BarChart margin={PINNED_BAR_MARGIN} data={seed} accessibilityLayer={false}>
                      {xAxis(false)}
                      {yCount(true)}
                      <Bar dataKey="total" fill="none" isAnimationActive={false} />
                    </BarChart>
                  </ChartContainer>
                </div>
                <DailyBars daily={daily} days={days} onDays={onDays} xAxis={xAxis(true)} yAxis={yCount(false)} />
              </div>
            </div>
          </div>
        </div>
        <DailyLine days={days} count={picked} onShow={onShowPicked} />
      </CardContent>
    </Card>
  );
});
