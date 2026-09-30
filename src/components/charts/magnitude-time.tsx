import {
  ChartTip,
  Drawing,
  GridRows,
  TickLabels,
  focusRing,
  inPlot,
  labelWidth,
  ownPlaceLabels,
  usePlotSize,
  useReading,
  useScrollView,
  type PlotArea,
  type ScrollView,
} from "@bvalue/charts";
import { scaleLinear } from "d3-scale";
import { symbol, symbolCircle, symbolStar } from "d3-shape";
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
} from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { StoredEvent } from "@/lib/api";
import { DAY, dailyCounts, type DayRange } from "@/lib/daily-counts";
import { pickDay, spanDays } from "@/lib/day-selection";
import { fmtDate, fmtDateTime, fmtDay, fmtRegion } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useZone } from "@/lib/zone";
import { clusterOf, type Cluster } from "../../../core/clusters";
import type { ZoneId } from "../../../core/zones";
import { bandOnAxis, countAxis, dayBar, dayTicks, tickLabel } from "./day-axis";
import { ClusterLegend, DailyLine, useFinePointer } from "./magnitude-time-legend";

// The whole sequence squeezed into a phone's ~300px is one solid band, so below DENSE_BELOW every
// Colombian day gets a fixed slice of width instead and the card scrolls sideways. Above it the
// chart still just fills its card, exactly as it did before.
const PX_PER_DAY = 28;
const DENSE_BELOW = 768;
const AXIS_W = 28; // the y axis itself, the width it has always had
const AXIS_COL = 36; // the column pinned to the left: that axis plus a little air before the plot
const X_AXIS_H = 30; // the strip the date labels take under each plot
const TICK_GAP = 64; // horizontal room one date label needs
// The least room between two date labels. Recharts' was 40 px, which a scrolling chart's labels cleared by
// under a pixel (81.2 px apart, ~41 px wide): a label a pixel wider would have dropped every other one.
const LABEL_GAP = 24;
// The plot's margins inside each drawing: on the left so a dot, and the mainshock's much larger star,
// on the first day is not cut off by the edge of its own svg; on top for the highest tick's label.
const LEFT = 10;
const RIGHT = 12;
const TOP = 8;
// The first day starts half a date label inside the plot, so its label, centred on the day's start like
// every other, has room: at the plot's edge it would be cut by the drawing's own left edge.
const FIRST_DAY = LEFT + 20;
const TIP_MAX = 360;
const SCATTER_H = 256; // h-64
const BARS_H = 144; // h-36

/**
 * A dot is 28 px² and the mainshock's star 160 px², the sizes the Recharts build asked for (`ZAxis`)
 * and never got: without a `dataKey` Recharts ignored the range and drew both at its default 64 px²,
 * so the star was no larger than the dots around it.
 */
const DOT = symbol(symbolCircle, 28).digits(3)()!;
const STAR = symbol(symbolStar, 160).digits(3)()!;
const DOT_R = 3; // a dot's radius, and the star's outer one
const STAR_R = 12;

/**
 * The top of the magnitude axis, fixed per zone so it does not jump with the filters: Chocó's has
 * room for the M7.4, and the Chaparral swarm's, whose largest is M4.5, would otherwise spend half
 * the chart on empty space. A larger event than the zone's scale allows still extends it.
 */
const MAG_TOP: Record<ZoneId, number> = { choco: 8, tolima: 6 };

/** What both drawings share: the plot's width, the time scale and the date labels under it. */
interface Frame {
  width: number;
  x: (ms: number) => number;
  invert: (px: number) => number;
  /** The days that get a date label, each the instant the day begins. */
  labels: readonly number[];
  domain: readonly [number, number];
}

/** A coordinate to four decimals, as Recharts wrote its bars': the full float put some edges a pixel row apart. */
const r4 = (v: number) => Math.round(v * 1e4) / 1e4;

/** A drawing's plot: what its margins and the date labels under it leave. */
const plotOf = (frame: Frame, height: number): PlotArea => ({
  left: LEFT,
  top: TOP,
  width: frame.width - LEFT - RIGHT,
  height: height - TOP - X_AXIS_H,
});

const TIP = "max-w-(--tip-max) wrap-anywhere";
const DRAWING = cn("relative shrink-0 overflow-x-clip", focusRing);

/** The grid's horizontal lines and the date labels, the same under the dots and under the bars. */
function Backdrop({ frame, plot, ys }: { frame: Frame; plot: PlotArea; ys: readonly number[] }) {
  const { lang } = useI18n();
  return (
    <>
      <GridRows plot={plot} ys={ys} />
      <TickLabels
        below={{ ticks: frame.labels, at: frame.x, label: (d) => fmtDay(d, lang), edge: plot.top + plot.height }}
      />
    </>
  );
}

/** The band behind the chosen days, in the dots and in the bars: the part of the choice that is on the axis. */
function ChosenBand({ days, frame, height }: { days: DayRange | null; frame: Frame; height: number }) {
  const on = days ? bandOnAxis(days, frame.domain) : null;
  if (!on) return null;
  const from = frame.x(on[0]);
  return (
    <rect
      data-band
      x={from}
      y={TOP}
      width={frame.x(on[1]) - from}
      height={height - TOP - X_AXIS_H}
      className="fill-foreground/7"
    />
  );
}

/**
 * A pinned y axis: the tick numbers alone, in a column that stays while the plot scrolls under it, so
 * a dot always has a magnitude beside it. It is opaque and, once scrolled, casts a shadow: the one cue
 * that the chart continues to the left. Hidden from assistive technology and out of the tab order.
 */
function PinnedAxis({
  height,
  ticks,
  y,
  scrolled,
}: {
  height: number;
  ticks: readonly number[];
  y: (v: number) => number;
  scrolled: boolean;
}) {
  return (
    <div aria-hidden className={cn("sticky left-0 z-10 w-(--axis-col) shrink-0 bg-card", scrolled && "shadow-pin")}>
      <svg width={AXIS_COL} height={height} viewBox={`0 0 ${AXIS_COL} ${height}`} className="block">
        <TickLabels beside={{ ticks, at: y, label: tickLabel, edge: AXIS_W }} />
      </svg>
    </div>
  );
}

interface Point {
  id: string;
  t: number;
  mag: number;
  time: string;
  region: string;
  depthKm: number;
  cluster: Cluster;
  main: boolean;
}

/**
 * The dots. The tooltip is on the dot under the pointer, or on the event the keyboard is at: the arrows
 * walk the events in the order they happened, and Enter hides and shows the tooltip.
 */
const Dots = memo(function Dots({
  points,
  frame,
  y,
  ticks,
  days,
  view,
}: {
  /** In the order they happened. */
  points: readonly Point[];
  frame: Frame;
  /** The magnitude scale, the pinned axis' own. */
  y: (mag: number) => number;
  /** The magnitudes that get a grid line. */
  ticks: readonly number[];
  days: DayRange | null;
  view: ScrollView;
}) {
  const { t, lang } = useI18n();
  const zone = useZone();
  const fine = useFinePointer();

  const plot = useMemo(() => plotOf(frame, SCATTER_H), [frame]);
  const bottom = plot.top + plot.height;
  const index = useMemo(() => new Map(points.map((p, i) => [p.id, i])), [points]);

  // The shallow group is drawn first, then the deep one over it, then the mainshock over both.
  const drawn = useMemo(
    () => ({
      shallow: points.filter((p) => !p.main && p.cluster === "shallow"),
      deep: points.filter((p) => !p.main && p.cluster === "deep"),
      main: points.filter((p) => p.main),
    }),
    [points],
  );
  // What a pointer or a key does not change, built once per catalogue and size: a move redraws only the
  // cursor and the tooltip, not the hundreds of dots.
  const marks = useMemo(() => {
    const dot = (p: Point) => (
      <path key={p.id} id={p.id} d={p.main ? STAR : DOT} transform={`translate(${frame.x(p.t)}, ${y(p.mag)})`} />
    );
    return (
      <>
        <Backdrop frame={frame} plot={plot} ys={ticks.map((v) => y(v))} />
        <g className="fill-chart-1/55 stroke-chart-1">{drawn.shallow.map(dot)}</g>
        <g className="fill-chart-4/55 stroke-chart-4">{drawn.deep.map(dot)}</g>
        <g className="fill-chart-2">{drawn.main.map(dot)}</g>
      </>
    );
  }, [drawn, frame, plot, ticks, y]);

  // The mark nearest the pointer, within reach of its edge: a dot is 6 px across, a small thing to land
  // a finger on, so the pointer need only come close. Recharts read only a dot the pointer was exactly on.
  const reach = fine ? 5 : 11;
  // A reading is of an event by its id: a refresh adds events, and a filter takes them away. The arrows
  // walk the events in the order they happened.
  const reading = useReading({
    n: points.length,
    id: (i) => points[i]!.id,
    read: (px, py) => {
      let id: string | null = null;
      let best = reach;
      // From the last drawn back, so of two marks as near, the one on top wins. The distance is to the
      // mark's edge, so the star, four times a dot across, is read anywhere on it.
      for (const group of [drawn.main, drawn.deep, drawn.shallow]) {
        for (let i = group.length - 1; i >= 0; i--) {
          const q = group[i]!;
          const d = Math.hypot(frame.x(q.t) - px, y(q.mag) - py) - (q.main ? STAR_R : DOT_R);
          if (d < best) {
            best = d;
            id = q.id;
          }
        }
      }
      // The tooltip sits by its dot, not at the pointer's height.
      return id === null ? null : { i: index.get(id)!, y: 0 };
    },
    scroll: { view, x: (i) => frame.x(points[i]!.t), plot },
  });
  const p = reading.active ? points[reading.active.i]! : null;
  const at = p ? { x: frame.x(p.t), y: y(p.mag) } : null;

  return (
    <div className={cn(DRAWING, "h-64 w-(--plot-w)")} {...reading.frame}>
      <Drawing width={frame.width} height={SCATTER_H} title={t.magTimeTitle} desc={t.magTimeDesc} reading={reading}>
        {/* The chosen days, carried up from the bars, so the dots can be matched to the catalogue. */}
        <ChosenBand days={days} frame={frame} height={SCATTER_H} />
        {marks}
        {at ? (
          <path
            data-cursor
            d={`M${at.x},${TOP}V${bottom}M${LEFT},${at.y}H${frame.width - RIGHT}`}
            strokeDasharray="3 3"
            fill="none"
            className="stroke-muted-foreground/50"
            pointerEvents="none"
          />
        ) : null}
      </Drawing>
      {at && p ? (
        <ChartTip at={at} area={reading.area} className={TIP}>
          <div className="font-medium tabular-nums">
            M{p.mag.toFixed(1)} · {fmtDateTime(p.time, lang)}
          </div>
          <div className="text-muted-foreground">
            {zone.depthClusters ? `${t.clusterName[p.cluster]} · ` : null}
            {p.depthKm.toFixed(0)} km · {fmtRegion(p.region)}
          </div>
        </ChartTip>
      ) : null}
    </div>
  );
});

interface Day {
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
  frame,
  y,
  lines,
  view,
}: {
  daily: readonly Day[];
  days: DayRange | null;
  onDays: (d: DayRange | null) => void;
  frame: Frame;
  /** The count scale, the pinned axis' own. */
  y: (count: number) => number;
  /** The counts that get a grid line. */
  lines: readonly number[];
  view: ScrollView;
}) {
  const { t, lang } = useI18n();
  const fine = useFinePointer();
  const anchor = useRef<number | null>(null);
  const dragRef = useRef<{ from: number; to: number; extend: boolean } | null>(null);
  const [drag, setDrag] = useState<DayRange | null>(null);

  const plot = useMemo(() => plotOf(frame, BARS_H), [frame]);
  const bottom = plot.top + plot.height;
  const first = daily[0];

  // The day at `px` in the drawing, or none off the axis; with `clamp`, the nearest day.
  const dayIndex = (px: number, clamp: boolean): number | null => {
    if (!first) return null;
    const i = Math.floor((frame.invert(px) - first.start) / DAY);
    if (clamp) return Math.min(Math.max(i, 0), daily.length - 1);
    return i >= 0 && i < daily.length ? i : null;
  };
  const press = (start: number) => {
    anchor.current = start;
    onDays(pickDay(days, start));
  };
  const span = (from: number, to: number) => {
    anchor.current = from;
    onDays(spanDays(from, to));
  };

  // The tooltip's day: the one under the pointer while it is over the plot, as far up as the pointer
  // is. The keyboard's tooltip sits at one height for every day, halfway down the drawing: the band
  // marks the day. Enter chooses the day the keyboard's tooltip is on, and Shift + Enter every day up
  // to it; a held Enter repeats, and each repeat would let go of the day the first one chose.
  const reading = useReading({
    n: daily.length,
    id: (i) => daily[i]!.start,
    read: (px, py) => {
      const y = Math.round(py);
      if (!inPlot(plot, Math.round(px), y)) return null;
      const i = dayIndex(px, true);
      return i === null ? null : { i, y };
    },
    keyY: () => (TOP + BARS_H) / 2,
    enter: (i, e) => {
      const d = daily[i];
      if (e.repeat || !d) return;
      e.preventDefault();
      if (e.shiftKey && days) span(anchor.current ?? days.from, d.start);
      else if (d.total > 0) press(d.start);
    },
    scroll: { view, x: (i) => frame.x(daily[i]!.start + DAY / 2), plot },
  });
  // The day under the pointer, from the event's own position, so a press is placed by where it landed:
  // the tooltip's day and a press's are read off the same place.
  const dayAt = (clientX: number, clamp: boolean): Day | undefined => {
    const at = reading.place(clientX, 0);
    const i = at ? dayIndex(at.px, clamp) : null;
    return i === null ? undefined : daily[i];
  };

  // A drag is followed on the window, so it goes on outside the chart and ends wherever the button is
  // let go. The listeners are stable functions that call the latest handlers, so they can be removed.
  // It is dropped, choosing nothing, when the window loses focus, on Escape, and when a move arrives
  // with the button already up: each is a mouseup the page never got (a context menu, a switch of app,
  // a release over another frame), after which the next click anywhere would have chosen a range.
  const latest = useRef<{ move: (e: MouseEvent) => void; up: (e: MouseEvent) => void; cancel: () => void }>({
    move: () => {},
    up: () => {},
    cancel: () => {},
  });
  const [on] = useState(() => ({
    move: (e: MouseEvent) => latest.current.move(e),
    up: (e: MouseEvent) => latest.current.up(e),
    cancel: () => latest.current.cancel(),
    key: (e: KeyboardEvent) => e.key === "Escape" && latest.current.cancel(),
  }));
  const stop = () => {
    delete document.documentElement.dataset.dragDays;
    window.removeEventListener("mousemove", on.move);
    window.removeEventListener("mouseup", on.up);
    window.removeEventListener("blur", on.cancel);
    window.removeEventListener("keydown", on.key);
    dragRef.current = null;
    setDrag(null);
  };
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

  // What the bars show as chosen: the drag while it lasts, then the choice.
  const lit = drag ?? days;

  const p = reading.active ? daily[reading.active.i]! : null;
  const band = frame.x(DAY) - frame.x(0);

  // What a pointer or a key does not change: the grid and the date labels, and the bars, which change
  // with the catalogue, the width and the days chosen. A move redraws the day's band and the tooltip.
  const backdrop = useMemo(
    () => <Backdrop frame={frame} plot={plot} ys={lines.map((v) => y(v))} />,
    [frame, plot, lines, y],
  );
  const bars = useMemo(() => {
    const bar = dayBar(band);
    const chosen = (start: number) => !lit || (start >= lit.from && start <= lit.to);
    return (["shallow", "deep"] as const).map((c) => (
      <g key={c}>
        {daily.map((d) => {
          if (d[c] === 0) return null;
          const from = y(c === "shallow" ? 0 : d.shallow);
          const to = y(c === "shallow" ? d.shallow : d.total);
          return (
            <path
              key={d.start}
              d={`M${r4(frame.x(d.start) + bar.offset)},${r4(to)}h${bar.width}v${r4(from - to)}h${-bar.width}Z`}
              className={cn(
                "transition-fill motion-reduce:transition-none",
                // A day not chosen: grey, still there to compare against, plainly not what the catalogue
                // shows. One of the theme's own greys rather than the day's colours dimmed (owner's call).
                !chosen(d.start) ? "fill-border" : c === "shallow" ? "fill-chart-1" : "fill-chart-4",
              )}
            />
          );
        })}
      </g>
    ));
  }, [daily, frame, y, band, lit]);

  return (
    // A mouse gets the drag; anything else, a press. While a drag lasts the whole page shows the
    // sideways cursor (`[data-drag-days]` in index.css).
    <div
      data-day-bars
      className={cn(DRAWING, "h-36 w-(--plot-w) cursor-pointer")}
      {...reading.frame}
      {...(fine ? { onMouseDown } : { onClick })}
    >
      <Drawing width={frame.width} height={BARS_H} title={t.dailyTitle} desc={t.dailyKeys} reading={reading}>
        {backdrop}
        {/* The day the tooltip is on. */}
        {p ? (
          <rect data-cursor x={frame.x(p.start)} y={TOP} width={band} height={bottom - TOP} className="fill-muted" />
        ) : null}
        {/* The scatter's band, behind the bars too: a chosen day of three events is a bar a few
            pixels tall, and the dimming alone left it hard to find. */}
        <ChosenBand days={lit} frame={frame} height={BARS_H} />
        {bars}
      </Drawing>
      {p && reading.active ? (
        <ChartTip
          at={{ x: frame.x(p.start + DAY / 2), y: reading.active.y }}
          area={reading.area}
          className={cn(TIP, "tabular-nums")}
        >
          <div>
            <span className="font-medium">{p.total}</span> · {fmtDate(p.start + DAY / 2, lang)}
          </div>
          {p.deep > 0 && p.shallow > 0 ? (
            <div className="text-muted-foreground">
              {t.clusterShort.shallow} {p.shallow} · {t.clusterShort.deep} {p.deep}
            </div>
          ) : null}
        </ChartTip>
      ) : null}
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
  const { points, daily, domain, dayCount, count, magTop } = useMemo(() => {
    const pts: Point[] = [];
    for (const e of events) {
      const ms = Date.parse(e.time);
      // A time that cannot be read has no place on the axis; `dailyCounts` leaves such an event out too.
      if (Number.isNaN(ms)) continue;
      pts.push({
        id: e.id,
        t: ms,
        mag: e.mag,
        time: e.time,
        region: e.region,
        depthKm: e.depthKm,
        cluster: clusterOf(e),
        main: e.id === mainshockId,
      });
    }
    // In the order they happened, which is the order the keyboard walks them in.
    pts.sort((a, b) => a.t - b.t);
    // The day histogram is `dailyCounts`, shared with the groups card: a bar spans its own day, and
    // the time axis runs from the start of the first day to the end of the last.
    const byDay = dailyCounts(events);
    const lo = byDay.days[0]?.start ?? 0;
    const hi = byDay.days.length > 0 ? byDay.days.at(-1)!.start + DAY : 1;
    return {
      points: pts,
      daily: byDay.days,
      domain: [lo, hi] as const,
      dayCount: Math.max(1, byDay.days.length),
      count: countAxis(byDay.maxTotal),
      magTop: Math.max(MAG_TOP[zone.id], Math.ceil(Math.max(0, ...events.map((e) => e.mag)) + 0.5)),
    };
  }, [events, mainshockId, zone.id]);

  const [sizeRef, size] = usePlotSize();
  const viewW = size?.width ?? 0;

  const roomW = Math.max(0, viewW - AXIS_COL);
  const plotW = viewW > 0 && viewW < DENSE_BELOW ? Math.max(roomW, dayCount * PX_PER_DAY) : roomW;
  const scrolls = plotW > roomW + 1;
  // Weekly ticks are right when the whole range is on screen. Once it scrolls there is room for more,
  // and a week of empty axis between labels reads as a gap in the data. A range of two weeks or less
  // (a young swarm) gets a label every day: weekly, it had one label for the whole chart.
  const tickDays = scrolls ? Math.max(1, Math.ceil(TICK_GAP / (plotW / dayCount))) : dayCount <= 14 ? 1 : 7;
  const font = size?.font ?? "";
  const frame = useMemo<Frame>(() => {
    const x = scaleLinear()
      .domain([...domain])
      .range([FIRST_DAY, Math.max(FIRST_DAY, plotW - RIGHT)]);
    const labels = ownPlaceLabels(dayTicks(domain, tickDays), {
      x,
      width: (d) => labelWidth(fmtDay(d, lang), font),
      start: 0,
      end: plotW,
      gap: LABEL_GAP,
    });
    return { width: plotW, x, invert: (px) => x.invert(px), labels, domain };
  }, [domain, plotW, tickDays, font, lang]);

  // The reader starts at the newest events and scrolls back in time, under the pinned axes' column.
  const {
    ref: scrollRef,
    onScroll,
    scrolled,
    view,
  } = useScrollView({ pinned: AXIS_COL, content: plotW, container: viewW });
  const setScroller = useCallback(
    (el: HTMLDivElement | null) => {
      scrollRef(el);
      sizeRef(el);
    },
    [scrollRef, sizeRef],
  );

  // Escape anywhere in the chart lets go of the chosen days; the bars handle the rest (`DailyBars`).
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Escape" || !days) return;
    e.preventDefault();
    onDays(null);
  };

  // One scale for each y axis, shared by the pinned column and the plot beside it, so a tick's number
  // and its grid line cannot part.
  const magTicks = useMemo(() => Array.from({ length: magTop - 2 }, (_, i) => i + 2), [magTop]);
  const magY = useMemo(
    () =>
      scaleLinear()
        .domain([1, magTop])
        .range([SCATTER_H - X_AXIS_H, TOP]),
    [magTop],
  );
  const countY = useMemo(
    () =>
      scaleLinear()
        .domain(count.domain)
        .range([BARS_H - X_AXIS_H, TOP]),
    [count],
  );

  let drawing: ReactNode = null;
  if (size && plotW > 0) {
    drawing = (
      <div
        className="flex w-[calc(var(--axis-col)+var(--plot-w))] flex-col gap-6"
        style={
          {
            "--axis-col": `${AXIS_COL}px`,
            "--plot-w": `${plotW}px`,
            // A tooltip is never wider than what is on screen of the plot, nor than the longest place SGC
            // has used needs on one line: a longer one wraps instead.
            "--tip-max": `${Math.max(120, Math.min(TIP_MAX, roomW, plotW) - LEFT - RIGHT)}px`,
          } as CSSProperties
        }
      >
        <div className="flex">
          <PinnedAxis height={SCATTER_H} ticks={magTicks} y={magY} scrolled={scrolled} />
          <Dots points={points} frame={frame} y={magY} ticks={magTicks} days={days} view={view} />
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="sticky left-0 w-fit text-sm font-medium">{t.dailyTitle}</h3>
          <div className="flex">
            <PinnedAxis height={BARS_H} ticks={count.ticks} y={countY} scrolled={scrolled} />
            <DailyBars
              daily={daily}
              days={days}
              onDays={onDays}
              frame={frame}
              y={countY}
              lines={count.ticks}
              view={view}
            />
          </div>
        </div>
      </div>
    );
  }

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
          ref={setScroller}
          onScroll={onScroll}
          onKeyDown={onKeyDown}
          role="group"
          aria-label={t.magTimeRegion}
          tabIndex={0}
          className="overflow-x-auto overscroll-x-contain rounded-sm text-xs outline-none focus-visible:ring-3 focus-visible:ring-ring"
        >
          {drawing}
        </div>
        <DailyLine days={days} count={picked} onShow={onShowPicked} />
      </CardContent>
    </Card>
  );
});
