import { scaleLinear, type ScaleLinear } from "d3-scale";
import { area as areaShape, line } from "d3-shape";
import { AlertTriangleIcon } from "lucide-react";
import { memo, useCallback, useId, useMemo, type CSSProperties, type ReactNode } from "react";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { fmtDateTime, fmtDay, fmtDayTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { WINDOW_SIZE, independentWindows, windowIncomplete, type Stats } from "@/lib/stats";
import { BTimeCsvButton } from "./b-over-time-csv";
import { bAxis } from "./b-axis";
import { bTimeDescription } from "./b-over-time-description";
import { BTimeKey } from "./b-over-time-key";
import { ChartTip, inPlot, labelWidth, usePlotSize, useReading, type PlotArea, type PlotSize } from "./svg-chart";
import { preserveEndTicks } from "./time-ticks";
import type { Cluster } from "../../../core/clusters";

/** Below this span the axis labels carry the hour as well as the date. */
const SHORT_SPAN_MS = 4 * 86_400_000;
// The drawing's margins, as the Recharts version had them: the b axis' 32 px on the left, 40 px on the
// right for the "b = 1" label and the last date label, 16 px on top, and the date axis' 30 px below.
const Y_AXIS_W = 32;
const RIGHT = 40;
const TOP = 16;
const X_AXIS_H = 30;
/** The least room between two date labels, in px. */
const TICK_GAP = 40;
/** How far a line's label stands off it, as Recharts' default. */
const LABEL_OFFSET = 5;
/** To four decimals, as Recharts wrote a rectangle's edges: the shaded stretches then fall on the same pixels. */
const px4 = (v: number) => Math.round(v * 1e4) / 1e4;

/** One window of the line, as the chart draws and reads it. */
interface Win {
  /** When its last event was, in ms: where it sits on the time axis. */
  t: number;
  b: number;
  /** b − σ and b + σ. */
  band: [number, number];
  from: string;
  to: string;
  sigma: number;
  mc: number;
  mcOwn: number;
  independent: boolean;
  incomplete: boolean;
}

/** The plot's scales and paths at one size. */
interface Drawn {
  plot: PlotArea;
  x: ScaleLinear<number, number>;
  y: ScaleLinear<number, number>;
  /** The ends of the time axis, in ms. */
  t0: number;
  t1: number;
  yTicks: number[];
  /** Where each window sits, for the pointer: the reading is the nearest window's. */
  xs: number[];
  band: string | null;
  line: string | null;
  other: string | null;
}

/**
 * `cluster` is set while the page is narrowed to one depth cluster; `magType` while the b card limits
 * the statistics to one magnitude type. `mainshockTime` marks the detected mainshock, where the windows
 * after it are the least complete; a mainshock before the first window's end is off the axis and not drawn.
 */
export const BOverTimeChart = memo(function BOverTimeChart({
  stats,
  other,
  otherKey,
  magType,
  cluster,
  mainshockTime,
}: {
  stats: Stats;
  /** The other magnitude reading, drawn as a dashed line; null when every event shares one type. */
  other: Stats | null;
  /** What the dashed line is, for the key ("solo MLr_1", "todos los tipos"). */
  otherKey: string | null;
  magType: string | null;
  cluster: Cluster | null;
  mainshockTime: string | null;
}) {
  const { t, lang } = useI18n();
  const clip = useId();

  const data = useMemo<Win[]>(() => {
    const independent = new Set(independentWindows(stats.windows.length));
    return stats.windows.map((w, i) => ({
      t: Date.parse(w.to),
      b: w.b,
      band: [w.b - w.sigmaB, w.b + w.sigmaB],
      from: w.from,
      to: w.to,
      sigma: w.sigmaB,
      mc: w.mc,
      mcOwn: w.mcOwn,
      independent: independent.has(i),
      incomplete: windowIncomplete(w),
    }));
  }, [stats.windows]);
  // Runs of windows that may have lost small events, as the first and last window of each: shaded as one
  // stretch in the plot, and named by their dates in the text alternative.
  const incompleteRuns = useMemo(() => {
    const runs: [number, number][] = [];
    for (let i = 0; i < data.length; i++) {
      if (!data[i]!.incomplete) continue;
      let j = i;
      while (j + 1 < data.length && data[j + 1]!.incomplete) j++;
      runs.push([i, j]);
      i = j;
    }
    return runs;
  }, [data]);
  // Only with its name in the key: a dashed line the key does not explain is worse than none.
  const otherData = useMemo(() => {
    const windows = other?.windows ?? [];
    return otherKey !== null && windows.length >= 2 ? windows.map((w) => ({ t: Date.parse(w.to), b: w.b })) : [];
  }, [other?.windows, otherKey]);
  // Every window's end on either line, in time order: the time axis runs over both, since the dashed line's
  // own windows can end later than this reading's, and these are the dates a label can sit on.
  const times = useMemo(
    () => [...new Set([...data.map((d) => d.t), ...otherData.map((d) => d.t)])].sort((a, b) => a - b),
    [data, otherData],
  );

  // The plot takes the height its card is given beside the b card (at least `BASE_H`), and `bAxis`
  // turns the extra height into more axis rather than a steeper line. Its width places the date labels.
  // Null until measured: the chart is drawn only then, once, at that size.
  const [plotRef, size] = usePlotSize();

  const shortSpan = data.length > 0 && data.at(-1)!.t - data[0]!.t < SHORT_SPAN_MS;
  // Over a few days a date alone repeats on every tick ("22 sept, 22 sept, 23 sept"), which a young
  // swarm's windows always span; the hour tells the ticks apart.
  const tickLabel = useCallback(
    (ms: number) => (shortSpan ? fmtDayTime(ms, lang) : fmtDay(ms, lang)),
    [shortSpan, lang],
  );

  const drawn = useMemo<Drawn | null>(() => {
    if (!size || data.length < 2) return null;
    const plot: PlotArea = {
      left: Y_AXIS_W,
      top: TOP,
      width: Math.max(0, size.width - Y_AXIS_W - RIGHT),
      height: Math.max(0, size.height - TOP - X_AXIS_H),
    };
    // The b axis holds the band and the dashed line.
    const axis = bAxis(
      Math.min(...data.map((d) => d.band[0]), ...otherData.map((d) => d.b)),
      Math.max(...data.map((d) => d.band[1]), ...otherData.map((d) => d.b)),
      size.height,
    );
    const t0 = times[0]!,
      t1 = times.at(-1)!;
    const x = scaleLinear()
      .domain([t0, t1 > t0 ? t1 : t0 + 1])
      .range([plot.left, plot.left + plot.width]);
    const y = scaleLinear()
      .domain(axis.domain)
      .range([plot.top + plot.height, plot.top]);
    const path = line<{ t: number; b: number }>()
      .x((d) => x(d.t))
      .y((d) => y(d.b))
      .digits(3);
    return {
      plot,
      x,
      y,
      t0,
      t1,
      yTicks: axis.ticks,
      xs: data.map((d) => x(d.t)),
      band: areaShape<Win>()
        .x((d) => x(d.t))
        .y0((d) => y(d.band[0]))
        .y1((d) => y(d.band[1]))
        .digits(3)(data),
      line: path(data),
      other: otherData.length >= 2 ? path(otherData) : null,
    };
  }, [size, data, otherData, times]);

  // The date labels, by Recharts' default rule (`preserveEndTicks`): the last date, then each earlier one
  // that clears the label after it. By width and font alone: the plot's height follows the b card beside
  // it as Mc moves, and moves the labels nowhere, so a change of height measures nothing.
  const width = size?.width,
    font = size?.font;
  const xTicks = useMemo(() => {
    if (width === undefined || font === undefined || times.length === 0) return [];
    const t0 = times[0]!,
      span = times.at(-1)! - t0 || 1;
    const plotW = Math.max(0, width - Y_AXIS_W - RIGHT);
    return preserveEndTicks(times, {
      x: (v) => Y_AXIS_W + ((v - t0) / span) * plotW,
      width: (v) => labelWidth(tickLabel(v), font),
      start: 0,
      end: width,
      gap: TICK_GAP,
    });
  }, [width, font, times, tickLabel]);

  // The mainshock is drawn only on the time axis: Recharts discarded a reference line past its domain.
  const mainshockMs = mainshockTime !== null ? Date.parse(mainshockTime) : null;
  const mainshockAt =
    drawn && mainshockMs !== null && mainshockMs >= drawn.t0 && mainshockMs <= drawn.t1 ? drawn.x(mainshockMs) : null;

  // What a pointer or a key does not change, built once per catalogue and size: a move redraws only the
  // cursor, the three dots and the tooltip (`Reading`). The labels are drawn over those, as Recharts
  // layered them.
  const marks = useMemo(() => {
    if (!drawn || !size) return null;
    const { plot, x, y, yTicks } = drawn;
    const right = plot.left + plot.width,
      bottom = plot.top + plot.height;
    // A grid line at each b tick and at the plot's two edges, once where a tick is on an edge. Each at its
    // unrounded height: half a pixel row is where a line changes rows, and 394.5 is not 394.50000000000006.
    const rows = [...yTicks.map((v) => y(v)), plot.top, bottom].filter(
      (py, i, all) => all.findIndex((row) => Math.abs(row - py) < 1e-6) === i,
    );
    // A run of one window reaches halfway to its neighbours, or it would be a line no wider than the
    // plot's stroke.
    const mid = (i: number, j: number) => (data[i]!.t + data[j]!.t) / 2;
    const stretches = incompleteRuns.map(([i, j]) => {
      const x1 = x(i > 0 ? mid(i - 1, i) : data[i]!.t);
      return { x1, x2: x(j + 1 < data.length ? mid(j, j + 1) : data[j]!.t) };
    });
    return (
      <>
        <defs>
          {/* The plot's height, at any width: the axis can be narrower than the data (`bAxis`), and the
              lines' ends and dots may reach into the margins. */}
          <clipPath id={clip}>
            <rect x={0} y={plot.top} width={size.width} height={plot.height} />
          </clipPath>
        </defs>
        <g className="stroke-border/50">
          {rows.map((py) => (
            <line key={py} x1={plot.left} x2={right} y1={py} y2={py} fill="none" />
          ))}
        </g>
        <g clipPath={`url(#${clip})`}>
          <g className="fill-caution-edge" fillOpacity={0.45}>
            {stretches.map((s, i) => (
              <rect key={i} x={px4(s.x1)} y={plot.top} width={px4(s.x2 - s.x1)} height={plot.height} />
            ))}
          </g>
          <path d={drawn.band ?? ""} className="fill-chart-1" fillOpacity={0.18} />
        </g>
        {mainshockAt !== null ? (
          <line
            x1={mainshockAt}
            x2={mainshockAt}
            y1={bottom}
            y2={plot.top}
            strokeDasharray="4 4"
            className="stroke-chart-2"
            fill="none"
          />
        ) : null}
        <g clipPath={`url(#${clip})`} fill="none" className="stroke-chart-1">
          {drawn.other !== null ? (
            <path d={drawn.other} strokeWidth={1.5} strokeDasharray="5 4" strokeOpacity={0.75} />
          ) : null}
          <path d={drawn.line ?? ""} strokeWidth={2} />
        </g>
        {/* After the band and the line, so the reference stays visible across them. */}
        <line
          x1={plot.left}
          x2={right}
          y1={y(1)}
          y2={y(1)}
          strokeDasharray="4 4"
          className="stroke-muted-foreground"
          fill="none"
        />
        {/* A dot only on the windows that share no events: the readings that really are separate. */}
        <g clipPath={`url(#${clip})`} className="fill-chart-1 stroke-card" strokeWidth={2}>
          {data.map((d, i) => (d.independent ? <circle key={i} cx={x(d.t)} cy={y(d.b)} r={4} /> : null))}
        </g>
      </>
    );
  }, [drawn, size, data, incompleteRuns, mainshockAt, clip]);
  const labels = useMemo(() => {
    if (!drawn) return null;
    const { plot, x, y, yTicks } = drawn;
    const right = plot.left + plot.width,
      bottom = plot.top + plot.height;
    return (
      <>
        <g className="fill-muted-foreground">
          {xTicks.map((v) => (
            <text key={v} x={x(v)} y={bottom + 14} textAnchor="middle">
              <tspan x={x(v)} dy="0.71em">
                {tickLabel(v)}
              </tspan>
            </text>
          ))}
          {yTicks.map((v) => (
            <text key={v} x={Y_AXIS_W - 8} y={y(v)} textAnchor="end">
              <tspan x={Y_AXIS_W - 8} dy="0.355em">
                {v.toFixed(1)}
              </tspan>
            </text>
          ))}
        </g>
        {/* In the right margin, past the end of the plot, where no series can cross it: inside, it sat on
            the ±1σ band at 3.76:1 and the b line ran through it. The halo keeps it legible over a grid line. */}
        <text
          x={right + LABEL_OFFSET}
          y={y(1)}
          fontSize={12}
          textAnchor="start"
          strokeWidth={3}
          paintOrder="stroke"
          className="fill-muted-foreground stroke-card"
        >
          <tspan x={right + LABEL_OFFSET} dy="0.355em">
            b = 1
          </tspan>
        </text>
        {mainshockAt !== null ? (
          <text
            x={mainshockAt + LABEL_OFFSET}
            y={plot.top + LABEL_OFFSET}
            fontSize={12}
            textAnchor="start"
            className="fill-muted-foreground"
          >
            <tspan x={mainshockAt + LABEL_OFFSET} dy="0.71em">
              {t.mainshock.label}
            </tspan>
          </text>
        ) : null}
      </>
    );
  }, [drawn, xTicks, mainshockAt, tickLabel, t]);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{t.bTimeTitle}</CardTitle>
        <CardDescription>{bTimeDescription(t, stats, magType, cluster)}</CardDescription>
        <CardAction>
          <BTimeCsvButton stats={stats} magType={magType} cluster={cluster} />
        </CardAction>
      </CardHeader>
      {/* The plot fills the height the b card beside it gives the row, at a fixed scale: extra height
          shows more of the b axis (`bAxis`), never a steeper version of the same fall. */}
      <CardContent className="flex flex-1 flex-col justify-center">
        {data.length < 2 ? (
          // The plot's own height, so the card does not shrink when the windows run out: it and the b
          // card beside it lost 329 px at once, and the filters below moved under the reader's pointer.
          <div className="flex h-80 items-center justify-center">
            <Empty>
              <EmptyHeader>
                <EmptyDescription>
                  {/* A whole cluster with too few events is not something a wider date range can fix, so it gets its own words. */}
                  {cluster !== null && stats.fit && stats.fit.n < WINDOW_SIZE
                    ? t.bTimeEmptyCluster(stats.fit.n.toLocaleString(lang), WINDOW_SIZE)
                    : t.bTimeEmpty(WINDOW_SIZE)}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        ) : (
          // The wrapper takes the room and the drawing fills it from outside the flow, so the card's height
          // never depends on what the chart drew: in the flow, each render measured a couple of pixels
          // taller than the last, and the row crept down under the Mc slider.
          // `text-xs` is the size the chart draws its labels in, for measuring them.
          <div
            ref={plotRef}
            className="relative min-h-80 w-full flex-1 text-xs has-[svg:focus-visible]:rounded-sm has-[svg:focus-visible]:outline-2 has-[svg:focus-visible]:outline-offset-2 has-[svg:focus-visible]:outline-ring"
            style={{ "--chart-w": size ? `${size.width}px` : undefined } as CSSProperties}
          >
            {drawn && size ? (
              <Reading
                size={size}
                drawn={drawn}
                data={data}
                clip={clip}
                title={t.bTimeTitle}
                desc={
                  t.bTimeAlt(data[0]!.b.toFixed(2), data.at(-1)!.b.toFixed(2)) +
                  (incompleteRuns.length > 0
                    ? t.bTimeAltIncomplete(
                        incompleteRuns
                          .map(([i, j]) => t.bTimeAltSpan(fmtDay(data[i]!.t, lang), fmtDay(data[j]!.t, lang)))
                          .join(t.bTimeAltAnd),
                      )
                    : "")
                }
                marks={marks}
                labels={labels}
              />
            ) : null}
          </div>
        )}
        <BTimeKey stats={stats} other={other} otherKey={otherKey} />
      </CardContent>
    </Card>
  );
});

/**
 * The drawing and what a pointer, a finger or the keyboard reads off it. The reading's state lives here
 * and not in the card: a move then renders the cursor, the three dots and the tooltip, and nothing of the
 * card around them (`marks` and `labels` are the same elements from one move to the next).
 */
function Reading({
  size,
  drawn,
  data,
  clip,
  title,
  desc,
  marks,
  labels,
}: {
  size: PlotSize;
  drawn: Drawn;
  data: Win[];
  /** The id of the clip path `marks` defines: the plot's height. */
  clip: string;
  title: string;
  desc: string;
  marks: ReactNode;
  labels: ReactNode;
}) {
  const { t, lang } = useI18n();
  const { plot, xs } = drawn;
  // The pointer reads the window nearest it, anywhere in the plot and nothing outside it.
  const { svg, active, frame, keys } = useReading(data.length, (px, py) => {
    if (!inPlot(plot, px, py)) return null;
    // A point exactly halfway between two windows is the earlier one's.
    let i = 0;
    for (let k = 1; k < xs.length; k++) if (Math.abs(xs[k]! - px) < Math.abs(xs[i]! - px)) i = k;
    return { i, y: py };
  });
  const p = active ? data[active.i]! : null;
  // The keyboard's tooltip sits over the window it reads, clear of its band, or under it where there is no
  // room above. Recharts put it halfway down the chart for every window, wherever the line was, and at the
  // pointer's 10 px below and right of the point it would lie on the windows the arrows go to next.
  const at = active && p ? { x: drawn.x(p.t), y: active.key ? drawn.y(p.b) : active.y } : null;
  const clear = active?.key && p ? ([drawn.y(p.band[1]), drawn.y(p.band[0])] as const) : undefined;

  return (
    // A whole number of pixels wide, from the plot box's left edge, as Recharts drew it.
    <div className="absolute inset-y-0 left-0 w-(--chart-w)" {...frame}>
      <svg
        role="application"
        tabIndex={0}
        width={size.width}
        height={size.height}
        viewBox={`0 0 ${size.width} ${size.height}`}
        ref={svg}
        className="block outline-hidden"
        {...keys}
      >
        <title>{title}</title>
        <desc>{desc}</desc>
        {marks}
        {at && p ? (
          <g pointerEvents="none">
            <line
              x1={at.x}
              x2={at.x}
              y1={plot.top}
              y2={plot.top + plot.height}
              strokeDasharray="3 3"
              className="stroke-border"
            />
            {/* The window's b and the two ends of its ±1σ, as Recharts marked them. */}
            <g clipPath={`url(#${clip})`} className="fill-chart-1">
              {[p.band[1], p.band[0], p.b].map((v, k) => (
                <circle key={k} cx={at.x} cy={drawn.y(v)} r={4} />
              ))}
            </g>
          </g>
        ) : null}
        {labels}
      </svg>
      {at && p ? (
        <ChartTip at={at} area={plot} clear={clear} className="tabular-nums">
          <div className="font-medium">
            b = {p.b.toFixed(2)} ± {p.sigma.toFixed(2)}
          </div>
          <div className="text-muted-foreground">
            {fmtDateTime(p.from, lang)} → {fmtDateTime(p.to, lang)}
          </div>
          {p.incomplete ? (
            <div className="mt-1 flex max-w-56 items-start gap-1 text-pretty">
              <AlertTriangleIcon className="mt-px size-3 shrink-0 text-caution-strong" />
              {t.bTimeTipIncomplete(p.mcOwn.toFixed(1), p.mc.toFixed(1))}
            </div>
          ) : null}
        </ChartTip>
      ) : null}
    </div>
  );
}
