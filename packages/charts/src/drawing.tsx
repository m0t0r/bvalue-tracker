import { cn } from "cn";
import type { ReactNode } from "react";
import type { PlotArea } from "./plot";
import type { ReadingHandlers } from "./reading";

/**
 * The focus ring of a drawing, for the element around it: a drawing is a tab stop, and shows focus with
 * a 2 px outline set off from its wrapper rather than a ring against its own marks (docs/frontend.md,
 * "Every tab stop shows focus"). The drawing itself draws none (`Drawing`).
 */
export const focusRing =
  "has-[svg:focus-visible]:rounded-sm has-[svg:focus-visible]:outline-2 has-[svg:focus-visible]:outline-offset-2 has-[svg:focus-visible]:outline-ring";

/**
 * A chart's drawing: an `svg` of `width` × `height` px that is a tab stop with a keyboard layer of its
 * own (`role="application"`, `reading` from `useReading`), and whose `title` and `desc` are its text
 * alternative. The element around it takes `reading.frame` and `focusRing`.
 */
export function Drawing({
  width,
  height,
  title,
  desc,
  reading,
  children,
}: {
  width: number;
  height: number;
  title: string;
  desc: string;
  reading: Pick<ReadingHandlers, "svg" | "keys">;
  children: ReactNode;
}) {
  const { svg, keys } = reading;
  return (
    <svg
      role="application"
      tabIndex={0}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      ref={svg}
      className="block outline-hidden"
      {...keys}
    >
      <title>{title}</title>
      <desc>{desc}</desc>
      {children}
    </svg>
  );
}

/**
 * The clip path of a plot's height, at any width: a line's ends and a dot on the plot's edge may reach
 * into the side margins, as Recharts let them, but nothing is drawn over the top margin or the axis below.
 */
export function PlotClip({ id, plot, width }: { id: string; plot: PlotArea; width: number }) {
  return (
    <defs>
      <clipPath id={id}>
        <rect x={0} y={plot.top} width={width} height={plot.height} />
      </clipPath>
    </defs>
  );
}

/**
 * The grid's horizontal lines: one at each of `ys` (the y ticks, in px) and one at each edge of the
 * plot, once where a tick is on an edge. Each at its unrounded height: half a pixel row is where a line
 * changes rows, and 394.5 is not 394.50000000000006.
 */
export function GridRows({ plot, ys }: { plot: PlotArea; ys: readonly number[] }) {
  const rows = [...ys, plot.top, plot.top + plot.height].filter(
    (py, i, all) => all.findIndex((row) => Math.abs(row - py) < 1e-6) === i,
  );
  return (
    <g className="stroke-border/50">
      {rows.map((py) => (
        <line key={py} x1={plot.left} x2={plot.left + plot.width} y1={py} y2={py} fill="none" />
      ))}
    </g>
  );
}

/** One axis' labels: the values that get one, where each sits along the axis, and what it says. */
export interface AxisLabels {
  ticks: readonly number[];
  at: (v: number) => number;
  label: (v: number) => string;
  /** The plot's edge the axis is on, in px: its bottom for the axis below, its left for the axis beside. */
  edge: number;
}

/**
 * The labels of the axis below a plot and of the axis to its left, where Recharts put them: a label
 * below hangs 14 px under the plot, centred on its tick; a label beside ends 8 px before the plot,
 * centred on its tick's height.
 */
export function TickLabels({ below, beside }: { below?: AxisLabels; beside?: AxisLabels }) {
  return (
    <g className="fill-muted-foreground">
      {below?.ticks.map((v) => (
        <text key={v} x={below.at(v)} y={below.edge + 14} textAnchor="middle">
          <tspan x={below.at(v)} dy="0.71em">
            {below.label(v)}
          </tspan>
        </text>
      ))}
      {beside?.ticks.map((v) => (
        <text key={v} x={beside.edge - 8} y={beside.at(v)} textAnchor="end">
          <tspan x={beside.edge - 8} dy="0.355em">
            {beside.label(v)}
          </tspan>
        </text>
      ))}
    </g>
  );
}

/** The colours a key's square can take, each a whole class so the design-system lint can read it. */
const SWATCH = {
  "chart-1": "bg-chart-1",
  "chart-3": "bg-chart-3",
  foreground: "bg-foreground",
} as const;

/** A chart's key, drawn as shadcn's `ChartLegendContent` drew it: a small square of each series' colour and its name. */
export function ChartKey({ items }: { items: { label: ReactNode; colour: keyof typeof SWATCH }[] }) {
  return (
    // The right margin is the plot's, so the key is centred under the plot as Recharts centred it.
    <div className="mr-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-3">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5 whitespace-nowrap">
          <div className={cn("h-2 w-2 shrink-0 rounded-xs", SWATCH[item.colour])} />
          {item.label}
        </div>
      ))}
    </div>
  );
}
