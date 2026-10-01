import { scaleLinear, scaleLog } from "d3-scale";
import { line, symbol, symbolCircle, symbolSquare } from "d3-shape";
import {
  ChartKey,
  ChartTip,
  Drawing,
  GridRows,
  PlotClip,
  TickLabels,
  focusRing,
  inPlot,
  labelWidth,
  preserveEndTicks,
  usePlotSize,
  useReading,
  type PlotArea,
} from "@bvalue/charts";
import { memo, useId, useMemo, useRef, type CSSProperties } from "react";
import { CardContent } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";
import type { Stats } from "@/lib/stats";
import { cn } from "@/lib/utils";
import { magnitudeTicks } from "./magnitude-ticks";

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

/** "Distribución frecuencia–magnitud", under the header `Deferred` draws. */
export const FmdChart = memo(function FmdChart({ stats }: { stats: Stats }) {
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
  const [plotRef, size] = usePlotSize();

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
    // within `MIN_TICK_GAP` of the next is dropped, as "4.3" is before "4.5" on a phone.
    const xTicks = preserveEndTicks(magnitudeTicks([lo, hi], 8), {
      x,
      width: (v) => labelWidth(v.toFixed(1), size.font),
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
        <PlotClip id={clip} plot={area} width={size.width} />
        <GridRows plot={area} ys={yTicks.map((v) => y(v))} />
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
        <TickLabels
          below={{ ticks: xTicks, at: x, label: (v) => v.toFixed(1), edge: bottom }}
          beside={{ ticks: yTicks, at: y, label: String, edge: area.left }}
        />
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

  const n = data.length;
  // The pointer's reading is the bin nearest it, as Recharts' axis tooltip finds it; nothing outside the
  // plot. The bins are evenly spaced, so it is the nearest step from the first. The keyboard's tooltip
  // sits at one height for every magnitude, where Recharts put it: halfway between the plot's top and the
  // chart's bottom, key included. A move's render is the cursor and the tooltip alone (`marks`).
  const reading = useReading({
    n,
    // The pointer's place in whole pixels, as Recharts read it.
    read: (rawX, rawY) => {
      if (!drawn) return null;
      const px = Math.round(rawX),
        py = Math.round(rawY);
      const { area, x, lo, hi } = drawn;
      if (!inPlot(area, px, py)) return null;
      const step = n > 1 ? (hi - lo) / (n - 1) : 1;
      // A point exactly halfway between two bins is the lower one's, as in Recharts.
      return { i: Math.min(n - 1, Math.max(0, Math.ceil((x.invert(px) - lo) / step - 0.5))), y: py };
    },
    // A bin is its magnitude, in whole tenths: a filter that moves the smallest magnitude moves every
    // bin's index, and the keyboard stays on the magnitude it was on.
    id: (i) => Math.round(data[i]!.mag * 10),
    keyY: () => (TOP + Math.round(box.current!.getBoundingClientRect().height)) / 2,
  });
  const { active } = reading;
  const at = drawn && active ? { x: drawn.x(data[active.i]!.mag), y: active.y } : null;
  const p = active ? data[active.i]! : null;

  return (
    <Frame t={t} stats={stats} plotRef={plotRef} box={box} width={size?.width} {...reading.frame}>
      {drawn && size ? (
        <>
          <Drawing width={size.width} height={size.height} title={t.fmdTitle} desc={t.fmdAlt} reading={reading}>
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
          </Drawing>
          {at && p ? (
            <ChartTip at={at} area={drawn.area} className="tabular-nums">
              <div className="font-medium">M{p.mag.toFixed(1)}</div>
              <div>
                {t.cumulative}: {p.cumulativeAll}
              </div>
              <div>
                {t.perBin}: {p.count ?? 0}
              </div>
            </ChartTip>
          ) : null}
        </>
      ) : null}
    </Frame>
  );
});

/**
 * The content under the card's header (`Deferred` draws the header). The plot takes the height the card is given beside the map, less the
 * key's, and the drawing fills it from outside the flow, so the card's height never depends on it.
 */
function Frame({
  t,
  stats,
  plotRef,
  box,
  width,
  children,
  ...pointer
}: {
  t: ReturnType<typeof useI18n>["t"];
  stats: Stats;
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
    // The card is stretched to the map beside it, so the chart takes the leftover height rather than
    // leaving it blank under the key.
    <CardContent className="flex flex-1 flex-col">
      <div
        ref={box}
        className={cn("flex min-h-80 w-full flex-1 flex-col text-xs", focusRing)}
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
  );
}
