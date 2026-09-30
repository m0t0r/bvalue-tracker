import { scaleLinear, scaleLog } from "d3-scale";
import { line, symbol, symbolCircle, symbolSquare } from "d3-shape";
import { memo, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";
import type { Stats } from "@/lib/stats";
import type { Cluster } from "../../../core/clusters";
import { magnitudeTicks } from "./magnitude-ticks";
import { fmdDescription } from "./fmd-description";
import { ChartKey, ChartTip, textWidth, usePlotSize, type PlotArea } from "./svg-chart";
import { preserveEndTicks } from "./time-ticks";

// The drawing's margins, as the Recharts version had them: the y axis' 40 px on the left, 12 px on the
// right for the last magnitude label, 16 px on top for "Mc", and the x axis' 30 px at the bottom.
const Y_AXIS_W = 40;
const RIGHT = 12;
const TOP = 16;
const X_AXIS_H = 30;
/** Recharts' default least room between two axis labels, in px. */
const MIN_TICK_GAP = 5;
/** Recharts' default symbols, 64 px² (a square of 8 px, a circle of radius ~4.51), drawn as it draws them. */
const SQUARE = symbol(symbolSquare, 64).digits(3)()!;
const CIRCLE = symbol(symbolCircle, 64).digits(3)()!;

/** Which magnitude the tooltip is on, and its height: the pointer's, or the keyboard's fixed one. */
type Active = { i: number; y: number };

/** `cluster` is set while the page is narrowed to one depth cluster; `magType` while the b card limits the statistics to one magnitude type. */
export const FmdChart = memo(function FmdChart({
  stats,
  magType,
  cluster,
}: {
  stats: Stats;
  magType: string | null;
  cluster: Cluster | null;
}) {
  const { t } = useI18n();
  const { bins, fit, mc } = stats;
  const clip = useId();

  const data = useMemo(
    () =>
      bins.map((b) => ({
        mag: b.mag,
        // Drawn only where an event exists. A dot at every step turns the lone mainshock into a
        // long flat run at N = 1, which reads as data. The tooltip still reports every step.
        cumulative: b.count > 0 ? b.cumulative : null,
        cumulativeAll: b.cumulative,
        count: b.count > 0 ? b.count : null, // zero cannot be drawn on a log axis
        fit:
          fit && mc !== null && b.mag >= mc - 1e-9 && fit.a - fit.b * b.mag >= 0 ? 10 ** (fit.a - fit.b * b.mag) : null,
      })),
    [bins, fit, mc],
  );
  const top = Math.max(10, ...bins.map((b) => b.cumulative));

  const box = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [plotRef, size] = usePlotSize();
  // The pointer's reading wins over the keyboard's, as in Recharts; the keyboard's is kept while the
  // pointer is away, and lets go when the chart loses focus.
  const [pointer, setPointer] = useState<Active | null>(null);
  const [key, setKey] = useState<{ i: number; on: boolean; y: number } | null>(null);

  const drawn = useMemo(() => {
    if (!size || data.length === 0) return null;
    const area: PlotArea = {
      left: Y_AXIS_W,
      top: TOP,
      width: Math.max(0, size.width - Y_AXIS_W - RIGHT),
      height: Math.max(0, size.height - TOP - X_AXIS_H),
    };
    const lo = data[0]!.mag,
      hi = data.at(-1)!.mag;
    const x = scaleLinear()
      .domain([lo, hi])
      .range([area.left, area.left + area.width]);
    const y = scaleLog()
      .domain([0.8, top * 1.5])
      .range([area.top + area.height, area.top]);
    const fitPath = line<(typeof data)[number]>()
      .defined((d) => d.fit !== null)
      .x((d) => x(d.mag))
      .y((d) => y(d.fit!))
      .digits(3)(data);
    // Recharts' default thinning (`interval="preserveEnd"`): from the last label back, one that would come
    // within `MIN_TICK_GAP` of the next is dropped, as "4.3" is before "4.5" on a phone. Without a canvas
    // to measure with, a label is taken as 0.6 em a character, a little wider than Geist's digits.
    const em = parseFloat(size.font) || 12;
    const xTicks = preserveEndTicks(magnitudeTicks([lo, hi], 8), {
      x,
      width: (v) => {
        const label = v.toFixed(1);
        return textWidth(label, size.font) ?? label.length * 0.6 * em;
      },
      start: 0,
      end: size.width,
      gap: MIN_TICK_GAP,
    });
    return {
      area,
      x,
      y,
      lo,
      hi,
      xTicks,
      yTicks: [1, 10, 100, 1000, 10000].filter((v) => v <= top * 1.5),
      fitPath,
    };
  }, [size, data, top]);

  // Mc is drawn only on the magnitude axis: Recharts discarded a reference line past its domain, which a
  // minimum magnitude above a manual Mc makes.
  const mcAt = drawn && mc !== null && mc >= drawn.lo - 1e-9 && mc <= drawn.hi + 1e-9 ? drawn.x(mc) : null;

  // What a pointer or a key does not change, built once per catalogue and size: a move redraws only the
  // cursor and the tooltip. Mc's label is drawn over the cursor, as Recharts layered its labels.
  const marks = useMemo(() => {
    if (!drawn || !size) return null;
    const { area, x, y, xTicks, yTicks, fitPath } = drawn;
    const bottom = area.top + area.height;
    return (
      <>
        <defs>
          <clipPath id={clip}>
            <rect x={0} y={area.top} width={size.width} height={area.height} />
          </clipPath>
        </defs>
        <g className="stroke-border/50">
          {[...yTicks.map((v) => y(v)), area.top, bottom].map((py) => (
            <line key={py} x1={area.left} x2={area.left + area.width} y1={py} y2={py} fill="none" />
          ))}
        </g>
        {mcAt !== null ? (
          <line
            x1={mcAt}
            x2={mcAt}
            y1={bottom}
            y2={area.top}
            strokeDasharray="4 4"
            className="stroke-muted-foreground"
            fill="none"
          />
        ) : null}
        <path d={fitPath ?? ""} clipPath={`url(#${clip})`} strokeWidth={2} fill="none" className="stroke-foreground" />
        <g className="fill-muted-foreground">
          {xTicks.map((v) => (
            <text key={v} x={x(v)} y={bottom + 14} textAnchor="middle">
              <tspan x={x(v)} dy="0.71em">
                {v.toFixed(1)}
              </tspan>
            </text>
          ))}
          {yTicks.map((v) => (
            <text key={v} x={Y_AXIS_W - 8} y={y(v)} textAnchor="end">
              <tspan x={Y_AXIS_W - 8} dy="0.355em">
                {v}
              </tspan>
            </text>
          ))}
        </g>
        <g clipPath={`url(#${clip})`}>
          <g className="fill-chart-3">
            {data.map((d) =>
              d.count !== null ? (
                <path key={d.mag} d={SQUARE} transform={`translate(${x(d.mag)}, ${y(d.count)})`} />
              ) : null,
            )}
          </g>
          <g className="fill-chart-1">
            {data.map((d) =>
              d.cumulative !== null ? (
                <path key={d.mag} d={CIRCLE} transform={`translate(${x(d.mag)}, ${y(d.cumulative)})`} />
              ) : null,
            )}
          </g>
        </g>
      </>
    );
  }, [drawn, size, data, mcAt, clip]);

  // A reading is of a bin by its index, and a new catalogue can have fewer bins: an index past the end
  // is no reading at all, as Recharts dropped an active index outside its data.
  const n = data.length;
  const keyI = key && key.i < n ? key.i : null;
  const active: Active | null =
    pointer && pointer.i < n ? pointer : key?.on && keyI !== null ? { i: keyI, y: key.y } : null;
  const at = drawn && active ? { x: drawn.x(data[active.i]!.mag), y: active.y } : null;
  const p = active ? data[active.i]! : null;

  // The bin nearest the pointer, as Recharts' axis tooltip finds it; nothing outside the plot. The bins
  // are evenly spaced, so it is the nearest step from the first.
  const read = (clientX: number, clientY: number) => {
    if (!drawn) return;
    const { area, x, lo, hi } = drawn;
    const r = svg.current!.getBoundingClientRect();
    // In whole pixels, as Recharts reads a pointer.
    const px = Math.round(clientX - r.left),
      py = Math.round(clientY - r.top);
    const inside = px >= area.left && px <= area.left + area.width && py >= area.top && py <= area.top + area.height;
    const step = n > 1 ? (hi - lo) / (n - 1) : 1;
    // A point exactly halfway between two bins is the lower one's, as in Recharts.
    const i = Math.min(n - 1, Math.max(0, Math.ceil((x.invert(px) - lo) / step - 0.5)));
    // Drawn within the event, before the next frame, as Recharts' store drew it: left to React's scheduler,
    // a move's tooltip reached the screen a frame later (~35 against ~30 ms at 4× CPU). The render is the
    // cursor and the tooltip alone (`marks`).
    const next = inside ? { i, y: py } : null;
    if (next?.i !== pointer?.i || next?.y !== pointer?.y) flushSync(() => setPointer(next));
  };
  // The keyboard's tooltip sits at one height for every magnitude, where Recharts put it: halfway between
  // the plot's top and the chart's bottom, key included. Read when a key is pressed, not in the render.
  const showKey = (i: number) => {
    const chartH = Math.round(box.current!.getBoundingClientRect().height);
    setKey({ i, on: true, y: (TOP + chartH) / 2 });
  };

  return (
    <Frame
      t={t}
      stats={stats}
      magType={magType}
      cluster={cluster}
      plotRef={plotRef}
      box={box}
      width={size?.width}
      onMouseMove={(e) => read(e.clientX, e.clientY)}
      onMouseLeave={() => setPointer(null)}
      onTouchMove={(e) => {
        const touch = e.touches[0];
        if (touch) read(touch.clientX, touch.clientY);
      }}
      // A finger lifted lets go. Recharts left the tooltip where a sideways drag ended, over the chart while
      // the reader scrolled on, until a tap elsewhere. A tap still shows it: the browser follows the touch
      // with the mouse events of a click, and their move comes after this.
      onTouchEnd={() => setPointer(null)}
      onTouchCancel={() => setPointer(null)}
    >
      {drawn && size ? (
        <>
          <svg
            role="application"
            tabIndex={0}
            width={size.width}
            height={size.height}
            viewBox={`0 0 ${size.width} ${size.height}`}
            ref={svg}
            className="block outline-hidden"
            onFocus={() => {
              // Focus shows the magnitude the keyboard was last on, or the first. Recharts showed it on the
              // first focus only, and a reader who tabbed back found the chart silent until an arrow.
              showKey(keyI ?? 0);
            }}
            onBlur={() => setKey((k) => (k ? { ...k, on: false } : k))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (key && keyI !== null) setKey({ ...key, on: !key.on });
                return;
              }
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              const step = e.key === "ArrowRight" ? 1 : -1;
              if (keyI === null) showKey(step > 0 ? 0 : n - 1);
              else if (keyI + step >= 0 && keyI + step < n) showKey(keyI + step);
            }}
          >
            <title>{t.fmdTitle}</title>
            <desc>{t.fmdDesc}</desc>
            {marks}
            {at ? (
              <line
                x1={at.x}
                x2={at.x}
                y1={drawn.area.top}
                y2={drawn.area.top + drawn.area.height}
                className="stroke-border"
                pointerEvents="none"
              />
            ) : null}
            {mcAt !== null && mc !== null ? (
              <text x={mcAt} y={drawn.area.top - 5} fontSize={12} textAnchor="middle" className="fill-muted-foreground">
                {/* One string: two text nodes ("Mc ", "2.7") are shaped apart, and the last digit moved a pixel. */}
                {`Mc ${mc.toFixed(1)}`}
              </text>
            ) : null}
          </svg>
          {at && p ? (
            <ChartTip at={at} area={drawn.area}>
              <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-xl tabular-nums">
                <div className="font-medium">M{p.mag.toFixed(1)}</div>
                <div>
                  {t.cumulative}: {p.cumulativeAll}
                </div>
                <div>
                  {t.perBin}: {p.count ?? 0}
                </div>
              </div>
            </ChartTip>
          ) : null}
        </>
      ) : null}
    </Frame>
  );
});

/**
 * The card around the drawing. The plot takes the height the card is given beside the map, less the
 * key's, and the drawing fills it from outside the flow, so the card's height never depends on it.
 */
function Frame({
  t,
  stats,
  magType,
  cluster,
  plotRef,
  box,
  width,
  children,
  ...pointer
}: {
  t: ReturnType<typeof useI18n>["t"];
  stats: Stats;
  magType: string | null;
  cluster: Cluster | null;
  plotRef: (el: HTMLElement | null) => void;
  box: React.RefObject<HTMLDivElement | null>;
  /** The drawing's width in whole pixels, once measured. */
  width?: number;
  children?: React.ReactNode;
  onMouseMove?: React.MouseEventHandler;
  onMouseLeave?: React.MouseEventHandler;
  onTouchMove?: React.TouchEventHandler;
  onTouchEnd?: React.TouchEventHandler;
  onTouchCancel?: React.TouchEventHandler;
}) {
  const { fit } = stats;
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{t.fmdTitle}</CardTitle>
        <CardDescription>{fmdDescription(t, stats, magType, cluster)}</CardDescription>
      </CardHeader>
      {/* The card is stretched to the map beside it, so the chart takes the leftover height
          rather than leaving it blank under the key. */}
      <CardContent className="flex flex-1 flex-col">
        <div
          ref={box}
          className="flex min-h-80 w-full flex-1 flex-col text-xs has-[svg:focus-visible]:rounded-sm has-[svg:focus-visible]:outline-2 has-[svg:focus-visible]:outline-offset-2 has-[svg:focus-visible]:outline-ring"
          style={{ "--chart-w": width === undefined ? undefined : `${width}px` } as CSSProperties}
          {...pointer}
        >
          {/* The drawing is a whole number of pixels wide, from the plot box's left edge, as Recharts drew
              it; the key is centred under the drawing less its right margin, so as wide as the drawing. */}
          <div ref={plotRef} className="relative min-h-0 flex-1">
            <div className="absolute inset-y-0 left-0 w-(--chart-w)">{children}</div>
          </div>
          <div className="w-(--chart-w)">
            <ChartKey
              items={[
                { label: t.perBin, colour: "chart-3" },
                { label: t.cumulative, colour: "chart-1" },
                // The text colour, not a chart colour: orange is the mainshock's alone (docs/frontend.md), and the
                // line must stay apart from the blue curve it is fitted to and the grey squares under it.
                {
                  label: fit ? `${t.grFit}: b = ${fit.b.toFixed(2)} ± ${fit.sigmaB.toFixed(2)}` : t.grFit,
                  colour: "foreground",
                },
              ]}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
