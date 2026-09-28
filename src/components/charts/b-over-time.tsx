import { AlertTriangleIcon } from "lucide-react";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, XAxis, YAxis } from "recharts";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { fmtDateTime, fmtDay, fmtDayTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { WINDOW_SIZE, independentWindows, windowIncomplete, type Stats } from "@/lib/stats";
import { BTimeCsvButton } from "./b-over-time-csv";
import { BASE_H, bAxis } from "./b-axis";
import { bTimeDescription } from "./b-over-time-description";
import { BTimeKey } from "./b-over-time-key";
import type { Cluster } from "../../../core/clusters";

/** Below this span the axis labels carry the hour as well as the date. */
const SHORT_SPAN_MS = 4 * 86_400_000;

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
  const config = {
    b: { label: t.bTitle, color: "var(--chart-1)" },
    band: { label: t.band, color: "var(--chart-1)" },
  } satisfies ChartConfig;

  const data = useMemo(() => {
    const independent = new Set(independentWindows(stats.windows.length));
    return stats.windows.map((w, i) => ({
      t: Date.parse(w.to),
      b: w.b,
      band: [w.b - w.sigmaB, w.b + w.sigmaB] as [number, number],
      from: w.from,
      to: w.to,
      sigma: w.sigmaB,
      mc: w.mc,
      mcOwn: w.mcOwn,
      independent: independent.has(i),
      incomplete: windowIncomplete(w),
    }));
  }, [stats.windows]);
  // Runs of windows that may have lost small events, each shaded as one stretch. A run of one window
  // reaches halfway to its neighbours, or it would be a line no wider than the plot's stroke.
  const incompleteRuns = useMemo(() => {
    const runs: { x1: number; x2: number }[] = [];
    const mid = (i: number, j: number) => (data[i]!.t + data[j]!.t) / 2;
    for (let i = 0; i < data.length; i++) {
      if (!data[i]!.incomplete) continue;
      let j = i;
      while (j + 1 < data.length && data[j + 1]!.incomplete) j++;
      runs.push({ x1: i > 0 ? mid(i - 1, i) : data[i]!.t, x2: j + 1 < data.length ? mid(j, j + 1) : data[j]!.t });
      i = j;
    }
    return runs;
  }, [data]);
  // The same stretches as dates, for the text alternative: by the ends of the first and last windows.
  const incompleteSpans = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < data.length; i++) {
      if (!data[i]!.incomplete) continue;
      let j = i;
      while (j + 1 < data.length && data[j + 1]!.incomplete) j++;
      out.push(t.bTimeAltSpan(fmtDay(data[i]!.t, lang), fmtDay(data[j]!.t, lang)));
      i = j;
    }
    return out;
  }, [data, t, lang]);
  const otherData = useMemo(
    () => (other?.windows ?? []).map((w) => ({ t: Date.parse(w.to), b: w.b })),
    [other?.windows],
  );
  const lo = Math.min(...data.map((d) => d.band[0]), ...otherData.map((d) => d.b));
  const hi = Math.max(...data.map((d) => d.band[1]), ...otherData.map((d) => d.b));
  // The plot takes the height its card is given beside the b card (at least `BASE_H`), and `bAxis`
  // turns the extra height into more axis rather than a steeper line.
  const [height, setHeight] = useState(BASE_H);
  const observer = useRef<ResizeObserver | null>(null);
  const measure = useCallback((el: HTMLDivElement | null) => {
    observer.current?.disconnect();
    if (!el) return;
    // At once, not only when the observer first reports: a ref callback runs in the commit, and an
    // update from it is drawn before the browser paints. Waiting for the observer drew one frame of
    // the resting axis stretched over the taller plot, which is the steeper slope this avoids.
    setHeight(el.clientHeight);
    observer.current = new ResizeObserver(([e]) => setHeight(Math.round(e!.contentRect.height)));
    observer.current.observe(el);
  }, []);
  const axis = bAxis(lo, hi, height);

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
          // The wrapper takes the room and the chart fills it from outside the flow, so the card's height
          // never depends on what the chart drew: in the flow, each render measured a couple of pixels
          // taller than the last, and the row crept down under the Mc slider.
          <div ref={measure} className="relative min-h-80 w-full flex-1">
            <ChartContainer config={config} className="absolute inset-0 aspect-auto">
              <ComposedChart
                data={data}
                // The right margin holds the "b = 1" label, and the last date tick with it.
                margin={{ left: 0, right: 40, top: 16 }}
                title={t.bTimeTitle}
                desc={
                  t.bTimeAlt(data[0]!.b.toFixed(2), data[data.length - 1]!.b.toFixed(2)) +
                  (incompleteSpans.length > 0 ? t.bTimeAltIncomplete(incompleteSpans.join(t.bTimeAltAnd)) : "")
                }
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="t"
                  type="number"
                  scale="time"
                  domain={["dataMin", "dataMax"]}
                  // Over a few days a date alone repeats on every tick ("22 sept, 22 sept, 23 sept"),
                  // which a young swarm's windows always span; the hour tells the ticks apart.
                  tickFormatter={(ms: number) =>
                    data.at(-1)!.t - data[0]!.t < SHORT_SPAN_MS ? fmtDayTime(ms, lang) : fmtDay(ms, lang)
                  }
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={40}
                />
                <YAxis
                  type="number"
                  domain={axis.domain}
                  ticks={axis.ticks}
                  interval={0}
                  allowDataOverflow
                  tickFormatter={(v: number) => v.toFixed(1)}
                  tickLine={false}
                  axisLine={false}
                  width={32}
                />
                <ChartTooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  content={({ active, payload }) => {
                    const p = payload?.[0]?.payload as (typeof data)[number] | undefined;
                    if (!active || !p) return null;
                    return (
                      <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-xl tabular-nums">
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
                      </div>
                    );
                  }}
                />
                {mainshockTime !== null ? (
                  <ReferenceLine
                    x={Date.parse(mainshockTime)}
                    ifOverflow="discard"
                    stroke="var(--chart-2)"
                    strokeDasharray="4 4"
                    label={{
                      value: t.mainshock.label,
                      position: "insideTopLeft",
                      fill: "var(--muted-foreground)",
                      fontSize: 12,
                    }}
                  />
                ) : null}
                {incompleteRuns.map((r) => (
                  <ReferenceArea
                    key={r.x1}
                    x1={r.x1}
                    x2={r.x2}
                    ifOverflow="hidden"
                    fill="var(--caution-edge)"
                    fillOpacity={0.45}
                    stroke="none"
                  />
                ))}
                <Area
                  dataKey="band"
                  stroke="none"
                  fill="var(--color-band)"
                  fillOpacity={0.18}
                  isAnimationActive={false}
                />
                {/* Only with its name in the key: a dashed line the key does not explain is worse than none. */}
                {otherKey !== null && otherData.length >= 2 ? (
                  <Line
                    data={otherData}
                    dataKey="b"
                    stroke="var(--color-b)"
                    strokeWidth={1.5}
                    strokeDasharray="5 4"
                    strokeOpacity={0.75}
                    dot={false}
                    activeDot={false}
                    tooltipType="none"
                    isAnimationActive={false}
                  />
                ) : null}
                {/* A dot only on the windows that share no events: the readings that really are separate. */}
                <Line
                  dataKey="b"
                  stroke="var(--color-b)"
                  strokeWidth={2}
                  isAnimationActive={false}
                  dot={(props: { cx?: number; cy?: number; index?: number }) =>
                    data[props.index ?? -1]?.independent && props.cx !== undefined && props.cy !== undefined ? (
                      <circle
                        key={props.index}
                        cx={props.cx}
                        cy={props.cy}
                        r={4}
                        fill="var(--color-b)"
                        stroke="var(--card)"
                        strokeWidth={2}
                      />
                    ) : (
                      <g key={props.index} />
                    )
                  }
                  activeDot={{ r: 4 }}
                />
                {/* After the band and the line, so the reference stays visible across them. Its label sits
                  in the right margin, past the end of the plot, where no series can cross it: inside,
                  it sat on the ±1σ band at 3.76:1 and the b line ran through it. The halo keeps it
                  legible over a grid line. */}
                <ReferenceLine
                  y={1}
                  stroke="var(--muted-foreground)"
                  strokeDasharray="4 4"
                  label={{
                    value: "b = 1",
                    position: "right",
                    fill: "var(--muted-foreground)",
                    fontSize: 12,
                    stroke: "var(--card)",
                    strokeWidth: 3,
                    paintOrder: "stroke",
                  }}
                />
              </ComposedChart>
            </ChartContainer>
          </div>
        )}
        <BTimeKey stats={stats} other={other} otherKey={otherKey} />
      </CardContent>
    </Card>
  );
});
