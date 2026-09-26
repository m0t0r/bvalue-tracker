/**
 * The pinned drawing's scenes other than the map: energy, the two clocks, Chaparral, and Pereira
 * (the calendar and the waves). Each reads the page's `Insights` and the story's model; nothing
 * here is a fixed figure about the catalogue.
 */
import { max } from "d3-array";
import { geoMercator } from "d3-geo";
import { scaleLinear, scaleLog, scaleSymlog } from "d3-scale";
import { line } from "d3-shape";
import { useMemo, type CSSProperties } from "react";
import { energyRatio } from "@bvalue/seismo";
import type { Lang } from "@/lib/i18n";
import { fmtDateTime, fmtDay } from "@/lib/format";
import { arrivalSeconds, ratesSince, strongDays, type Insights, type Source } from "../claims";
import { insightsCopy } from "../copy";
import { storyCopy } from "./copy";
import { rankLayout, type Compared } from "../history";
import { fmt, fmtKm, fmtMag, fmtTimes, medianHorizontalErrorKm } from "../shared";
import { FILL, STROKE } from "../tones";
import { useProgress } from "./hooks";
import { SceneTitle, diamond, radius } from "./marks";
import type { StoryModel } from "./model";
import { Rich, fill } from "./rich";

const DAY = 86_400_000;

interface SceneProps {
  data: Insights;
  model: StoryModel;
  width: number;
  height: number;
  sub: string;
  small: boolean;
  lang: Lang;
}

// =============================================================================================
// Energy: the largest event's square against past Colombian earthquakes, then the ×32 ladder.

interface RankItem {
  id: string;
  mag: number;
  main: boolean;
  line1: string;
  line2: string;
}

/** Squares true to energy, largest first, one per row, right-aligned, with two lines of text beside each. */
function Ranks({
  items,
  width,
  top,
  height,
  small,
}: {
  items: RankItem[];
  width: number;
  top: number;
  height: number;
  small: boolean;
}) {
  const gap = small ? 10 : 16;
  const left = small ? 12 : 24;
  // Labels step down a pixel at a time until every row fits: a short phone holds nine rows only at 9 px.
  const fit = (fs: number) => ({
    fs,
    ...rankLayout(
      items.map((i) => i.mag),
      {
        height: height - top - (small ? 10 : 24),
        maxSide: Math.max(20, width - left * 2 - gap - fs * 13),
        minRow: 2 * fs + (small ? 5 : 8),
        gap: small ? 3 : 8,
      },
    ),
  });
  let layout = fit(small ? 11 : 13);
  while (!layout.rows.length && layout.fs > 9) layout = fit(layout.fs - 1);
  const { fs, rows } = layout;
  if (!rows.length) return null;
  // The largest square, which is not always the first: a mainshock in the same tenth as a past event
  // is listed first and may be the smaller of the two.
  const S = Math.max(...rows.map((r) => r.side));
  const tx = left + S + gap;
  return (
    <g>
      {items.map((it, i) => {
        const r = rows[i]!;
        return (
          <g key={it.id}>
            {/* Right-aligned, so each label sits beside its own square. */}
            <rect
              x={left + S - Math.max(1, r.side)}
              y={top + r.y}
              width={Math.max(1, r.side)}
              height={Math.max(1, r.side)}
              rx={Math.min(3, r.side / 6)}
              className={it.main ? "fill-chart-2" : "fill-muted-foreground"}
            />
            <RowLabel x={tx} y={top + r.y} fs={fs} small={small} line1={it.line1} line2={it.line2} />
          </g>
        );
      })}
    </g>
  );
}

/** A drawing row's two lines of text, the first bold, from the row's top `y`: the energy and duration rows. */
function RowLabel(p: { x: number; y: number; fs: number; small: boolean; line1: string; line2: string }) {
  return (
    <>
      <text x={p.x} y={p.y + p.fs} fontSize={p.fs} fontWeight={600} className="fill-foreground">
        {p.line1}
      </text>
      <text
        x={p.x}
        y={p.y + 2 * p.fs + (p.small ? 2 : 4)}
        fontSize={p.fs}
        className="fill-muted-foreground tabular-nums"
      >
        {p.line2}
      </text>
    </>
  );
}

export interface DurationRow {
  id: string;
  main: boolean;
  line1: string;
  line2: string;
  /** Seconds in which the central 90% of the moment came out. */
  seconds: number;
}

/** The duration drawing's rows, longest first, which its text alternative (`graphic.tsx`) lists too. */
export function durationRows(model: StoryModel, lang: Lang): DurationRow[] {
  const c = storyCopy[lang].graphic;
  const d = model.durations;
  const main = model.main;
  if (!d || !main) return [];
  const line2 = (mag: number, s: number) => `${fmtMag(mag)} · ${fill(c.durationSeconds, { s: fmt(s) })}`;
  return [
    {
      id: main.id,
      main: true,
      line1: fill(c.historyMain, { date: fmtDateTime(main.t, lang) }),
      line2: line2(main.mag, d.main.core),
      seconds: d.main.seconds,
    },
    ...d.past.map((r) => ({
      id: r.quake.id,
      main: false,
      line1: fill(c.historyRow, { name: r.quake.name[lang], date: fmtDateTime(r.quake.time, lang) }),
      line2: line2(r.quake.mag, r.core),
      seconds: r.seconds,
    })),
  ];
}

/**
 * The seconds in which each earthquake released the central 90% of its moment, as bars on one axis,
 * longest first, each under its two lines of text. Like `Ranks`, the text steps down a pixel at a time
 * (to 9 px) until the rows, the axis and its label fit the height.
 */
function Durations({
  rows,
  width,
  top,
  height,
  small,
  axis,
}: {
  rows: DurationRow[];
  width: number;
  top: number;
  height: number;
  small: boolean;
  axis: string;
}) {
  const left = small ? 12 : 24;
  const right = small ? 16 : 32;
  const layout = (fs: number) => {
    const barH = Math.round(fs * (small ? 1.1 : 1.4));
    const labelH = 2 * fs + (small ? 6 : 10);
    const rowH = labelH + barH + Math.round(fs * (small ? 1 : 1.6));
    // Below the axis: the tick labels' line and the axis label's, each with its descenders.
    const below = 2 * fs + 16;
    return { fs, barH, labelH, rowH, fits: top + rows.length * rowH + below <= height };
  };
  let l = layout(small ? 11 : 13);
  while (!l.fits && l.fs > 9) l = layout(l.fs - 1);
  if (!rows.length || !l.fits) return null;
  const { fs, barH, labelH, rowH } = l;
  const longest = Math.max(...rows.map((r) => r.seconds));
  const x = scaleLinear()
    .domain([0, Math.max(10, Math.ceil(longest / 10) * 10)])
    .range([left, width - right]);
  const ticks = x.ticks(small ? 3 : 6);
  const axisY = top + rows.length * rowH;
  return (
    <g>
      {rows.map((r, i) => {
        const y = top + i * rowH;
        return (
          <g key={r.id}>
            <RowLabel x={left} y={y} fs={fs} small={small} line1={r.line1} line2={r.line2} />
            <rect
              x={x(0)}
              y={y + labelH}
              width={Math.max(1, x(r.seconds) - x(0))}
              height={barH}
              className={r.main ? "fill-chart-2" : "fill-muted-foreground"}
            />
          </g>
        );
      })}
      <line x1={x(0)} x2={x.range()[1]} y1={axisY} y2={axisY} className="stroke-border" />
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={axisY} y2={axisY + 4} className="stroke-border" />
          <text
            x={x(t)}
            y={axisY + fs + 4}
            textAnchor="middle"
            fontSize={fs - 1}
            className="fill-muted-foreground tabular-nums"
          >
            {fmt(t)}
          </text>
        </g>
      ))}
      <text x={x(0)} y={axisY + 2 * fs + 10} fontSize={fs - 1} className="fill-muted-foreground">
        {axis}
      </text>
    </g>
  );
}

export function EnergyScene({ model, width, height, sub, small, lang }: SceneProps) {
  const c = storyCopy[lang].graphic;
  const main = model.main;
  const h = model.history;
  if (!main || !h) return null;
  const fs = small ? 11 : 13;
  const top = small ? 36 : 64;

  const mainItem: RankItem = {
    id: main.id,
    mag: main.mag,
    main: true,
    line1: fill(c.historyMain, { date: fmtDateTime(main.t, lang) }),
    line2: fmtMag(main.mag),
  };
  const item = (r: Compared): RankItem => ({
    id: r.quake.id,
    mag: r.quake.mag,
    main: false,
    line1: fill(c.historyRow, { name: r.quake.name[lang], date: fmtDateTime(r.quake.time, lang) }),
    line2: fill(c.historyTimes(r.relation), { mag: fmtMag(r.quake.mag), x: fmtTimes(r.times) }),
  });
  const below = h.smaller.map(item);
  const smaller = [mainItem, ...below];
  const everything = [...h.larger.map(item), mainItem, ...below];

  // The ladder: M4, M5, M6 side by side, each ~31.6× the area of the one before.
  const step = energyRatio(5, 4);
  // Each gap holds its "×32" with room either side (the label is ~1.9 em wide), so the label never
  // touches the squares it sits between; the squares are sized to the width left after both gaps.
  const gap = Math.round(fs * 1.9) + (small ? 12 : 20);
  const relSum = 1 + 1 / Math.sqrt(step) + 1 / step;
  const Lmax = Math.max(
    30,
    Math.min(height - top - (small ? 100 : 150), (width - (small ? 24 : 100) - 2 * gap) / relSum),
  );
  const sides = [Lmax / step, Lmax / Math.sqrt(step), Lmax];
  const total = sides.reduce((a, b) => a + b, 0) + gap * 2;
  const base = top + (height - top) / 2 + Lmax / 2 - (small ? 10 : 18);
  let lx = (width - total) / 2;
  const ladder = sides.map((side, i) => {
    const at = lx;
    lx += side + gap;
    return { side, at, m: 4 + i };
  });
  const tint = ["opacity-40", "opacity-70", "opacity-100"];

  const bars = durationRows(model, lang);

  return (
    <g>
      <SceneTitle small={small}>
        {sub === "ladder"
          ? c.energyTitle
          : sub === "duration"
            ? c.durationTitle
            : fill(c.historyTitle, { magLabel: fmtMag(main.mag) })}
      </SceneTitle>
      {bars.length > 0 && (
        <g
          data-on={sub === "duration" || undefined}
          aria-hidden={sub !== "duration"}
          className="opacity-0 transition-opacity duration-500 data-on:opacity-100 motion-reduce:transition-none"
        >
          <Durations rows={bars} width={width} top={top} height={height} small={small} axis={c.durationAxis} />
        </g>
      )}
      <g
        data-on={sub === "history" || undefined}
        aria-hidden={sub !== "history"}
        className="opacity-0 transition-opacity duration-500 data-on:opacity-100 motion-reduce:transition-none"
      >
        <Ranks items={smaller} width={width} top={top} height={height} small={small} />
      </g>
      <g
        data-on={sub === "larger" || undefined}
        aria-hidden={sub !== "larger"}
        className="opacity-0 transition-opacity duration-500 data-on:opacity-100 motion-reduce:transition-none"
      >
        <Ranks items={everything} width={width} top={top} height={height} small={small} />
      </g>
      <g
        data-on={sub === "ladder" || undefined}
        aria-hidden={sub !== "ladder"}
        className="opacity-0 transition-opacity duration-500 data-on:opacity-100 motion-reduce:transition-none"
      >
        {ladder.map((r, i) => (
          <g key={r.m}>
            <rect
              x={r.at}
              y={base - r.side}
              width={r.side}
              height={r.side}
              rx={Math.min(3, r.side / 6)}
              className={`fill-chart-1 ${tint[i]}`}
            />
            <text
              x={r.at + r.side / 2}
              y={base + (small ? 18 : 24)}
              textAnchor="middle"
              fontSize={fs + 2}
              fontWeight={650}
              className="fill-foreground"
            >
              {`M${r.m}`}
            </text>
            {/* On the squares' baseline, between the two it compares, at one height for both steps. */}
            {i > 0 && (
              <text
                x={r.at - gap / 2}
                y={base - (small ? 3 : 4)}
                textAnchor="middle"
                fontSize={fs}
                className="fill-muted-foreground tabular-nums"
              >
                {`×${fmt(step)}`}
              </text>
            )}
          </g>
        ))}
        <text
          x={width / 2}
          y={base + (small ? 42 : 56)}
          textAnchor="middle"
          fontSize={fs}
          className="fill-muted-foreground"
        >
          {c.ladderNote}
        </text>
      </g>
    </g>
  );
}

// =============================================================================================
// The two clocks: events per day for each Chocó group, on log axes, against the 1/t curve.

export function ClocksScene({
  data,
  model,
  width,
  height,
  sub,
  small,
  lang,
  active,
}: SceneProps & { active: boolean }) {
  const c = storyCopy[lang].graphic;
  const mc = data.mc.choco;
  const span = Math.max(1, (data.now - model.start) / DAY);
  const bins = useMemo(
    () =>
      mc === null
        ? null
        : {
            deep: ratesSince(data.sources.deep, mc, model.start, data.now),
            shallow: ratesSince(data.sources.shallow, mc, model.start, data.now),
          },
    [data.sources, mc, model.start, data.now],
  );
  if (mc === null || !bins) return null;

  const m = { l: small ? 34 : 56, r: small ? 64 : 104, t: small ? 86 : 124, b: small ? 40 : 58 };
  const fs = small ? 10 : 12;
  const peak = max([...bins.deep, ...bins.shallow], (b) => b.perDay) ?? 10;
  const x = scaleSymlog()
    .constant(1)
    .domain([0, span])
    .range([m.l, width - m.r]);
  const y = scaleLog()
    .domain([0.1, Math.max(100, peak * 1.3)])
    .range([height - m.b, m.t])
    .clamp(true);
  const floor = (r: number) => Math.max(0.1, r);
  const stepPath = (bs: typeof bins.deep) =>
    line()(
      bs.flatMap((b) => [
        [x(b.fromDay), y(floor(b.perDay))] as [number, number],
        [x(b.toDay), y(floor(b.perDay))] as [number, number],
      ]),
    ) ?? "";
  const omoriPts: [number, number][] = [];
  for (let e = -2; e <= Math.log10(span) + 1e-9; e += 0.02) {
    const t = 10 ** e;
    const r = model.omori(t);
    if (r <= y.domain()[1]!) omoriPts.push([x(t), y(r)]);
  }
  const omoriPath = line()(omoriPts) ?? "";
  const xt = [0, 1, 2, 5, 10, 20, 40, 80].filter((d) => d <= span);
  const yt = [0.1, 1, 10, 100, 1000].filter((v) => v <= y.domain()[1]!);
  const showShallow = active && (sub === "shallow" || sub === "pace");
  const showLulls = active && sub === "pace";
  const pace = data.shallowPace;
  const dayOf = (t: number) => (t - model.start) / DAY;
  const lulls =
    pace && pace.case !== "young"
      ? [
          ...pace.pastLulls.map((l) => ({ from: dayOf(l.from), to: dayOf(l.to + DAY) })),
          ...(pace.quietSince !== null ? [{ from: dayOf(pace.quietSince), to: span }] : []),
        ]
      : [];
  const lastDeep = bins.deep.at(-1);
  const lastShallow = bins.shallow.at(-1);
  const rowY = m.t - (small ? 24 : 32);
  const strong = model.strongSince.filter((e) => e.source !== "tolima");

  return (
    <g>
      <SceneTitle small={small}>
        <Rich text={c.clocksTitle} parts={{ mc: fmtMag(mc) }} />
      </SceneTitle>
      {yt.map((v) => (
        <g key={v}>
          <line x1={m.l} x2={width - m.r} y1={y(v)} y2={y(v)} className="stroke-border" />
          <text x={m.l - 6} y={y(v) + 4} textAnchor="end" fontSize={fs} className="fill-muted-foreground tabular-nums">
            {v < 1 ? v.toFixed(1) : fmt(v)}
          </text>
        </g>
      ))}
      {xt.map((d) => (
        <g key={d}>
          <line x1={x(d)} x2={x(d)} y1={height - m.b} y2={height - m.b + 5} className="stroke-muted-foreground" />
          <text
            x={x(d)}
            y={height - m.b + (small ? 16 : 20)}
            textAnchor="middle"
            fontSize={fs}
            className="fill-muted-foreground tabular-nums"
          >
            {d}
          </text>
        </g>
      ))}
      <text
        x={(m.l + width - m.r) / 2}
        y={height - m.b + (small ? 32 : 42)}
        textAnchor="middle"
        fontSize={fs}
        className="fill-muted-foreground"
      >
        <Rich text={c.clocksAxis} parts={{ date: fmtDay(model.start, lang) }} />
      </text>

      <g
        data-on={showLulls || undefined}
        className="opacity-0 transition-opacity duration-500 data-on:opacity-100 data-on:delay-200 motion-reduce:transition-none"
      >
        {lulls.map((l) => (
          <g key={l.from}>
            <rect
              x={x(l.from)}
              y={m.t}
              width={Math.max(2, x(l.to) - x(l.from))}
              height={height - m.b - m.t}
              className="fill-muted"
            />
            <text x={x(l.from) + 4} y={height - m.b - 8} fontSize={fs - 0.5} className="fill-muted-foreground">
              {c.lull}
            </text>
          </g>
        ))}
      </g>

      <path d={omoriPath} fill="none" className="stroke-muted-foreground" strokeWidth={1.5} strokeDasharray="5 5" />
      {/* The reference curve's key sits under the title rather than at the curve's end, where on a
          phone it would run into the groups' own labels. */}
      <g transform={`translate(${m.l}, ${small ? 32 : 46})`}>
        <line
          x1={0}
          x2={22}
          y1={-4}
          y2={-4}
          className="stroke-muted-foreground"
          strokeWidth={1.5}
          strokeDasharray="5 5"
        />
        <text x={28} y={0} fontSize={fs - 0.5} className="fill-muted-foreground">
          {`${c.omori[0]} ${c.omori[1]}`}
        </text>
      </g>

      <Reveal on={active}>
        <path
          d={stepPath(bins.deep)}
          fill="none"
          className={STROKE.deep}
          strokeWidth={small ? 2.5 : 3}
          strokeLinejoin="round"
        />
      </Reveal>
      {lastDeep && (
        <text
          x={x(lastDeep.toDay) + 6}
          y={y(floor(lastDeep.perDay)) + 4}
          fontSize={fs}
          fontWeight={600}
          className="fill-foreground"
        >
          {c.lines.deep}
        </text>
      )}

      <Reveal on={showShallow}>
        <path
          d={stepPath(bins.shallow)}
          fill="none"
          className={STROKE.shallow}
          strokeWidth={small ? 2.5 : 3}
          strokeLinejoin="round"
        />
      </Reveal>
      <g
        data-on={showShallow || undefined}
        className="opacity-0 transition-opacity duration-500 data-on:opacity-100 data-on:delay-700 motion-reduce:transition-none"
      >
        {lastShallow && (
          <text
            x={x(lastShallow.toDay) + 6}
            y={
              y(floor(lastShallow.perDay)) +
              (lastDeep && Math.abs(y(floor(lastShallow.perDay)) - y(floor(lastDeep.perDay))) < 14 ? -10 : 4)
            }
            fontSize={fs}
            fontWeight={600}
            className="fill-foreground"
          >
            {c.lines.shallow}
          </text>
        )}
        <text x={m.l} y={rowY - (small ? 12 : 16)} fontSize={fs - 0.5} className="fill-muted-foreground">
          {c.strongRow}
        </text>
        <line x1={m.l} x2={width - m.r} y1={rowY} y2={rowY} className="stroke-border" />
        {strong.map((e) => (
          <path
            key={e.id}
            d={diamond(radius(e.mag, small ? 0.9 : 1.15))}
            transform={`translate(${x(dayOf(e.t))},${rowY})`}
            className={FILL[e.source]}
          />
        ))}
      </g>
    </g>
  );
}

/** The first `f` (0–1) of a polyline's length, so a track draws from its start whatever its direction. */
export function partialLine(pts: readonly [number, number][], f: number): [number, number][] {
  if (pts.length < 2 || f >= 1) return [...pts];
  const seg = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i]![0], p[1] - pts[i]![1]));
  let left = seg.reduce((a, b) => a + b, 0) * Math.max(0, f);
  const out: [number, number][] = [pts[0]!];
  for (let i = 0; i < seg.length; i++) {
    const a = pts[i]!,
      b = pts[i + 1]!;
    if (left >= seg[i]!) {
      out.push(b);
      left -= seg[i]!;
      continue;
    }
    const t = seg[i]! === 0 ? 0 : left / seg[i]!;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    break;
  }
  return out;
}

/** A line drawn in from the left when `on` turns true. */
function Reveal({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <g
      className="transition-clip-path duration-1000 ease-(--ease-move) [clip-path:inset(-10px_var(--cut)_-10px_-10px)] motion-reduce:transition-none"
      style={{ "--cut": on ? "0%" : "100%" } as CSSProperties}
    >
      {children}
    </g>
  );
}

// =============================================================================================
// Chaparral: energy strips for both zones, then the swarm close up, replayed in time order.

export function TolimaScene({
  data,
  model,
  width,
  height,
  sub,
  small,
  lang,
  active,
}: SceneProps & { active: boolean }) {
  const c = storyCopy[lang].graphic;
  const share = insightsCopy[lang].claims.share;
  const drift = active && sub === "drift";
  const progress = useProgress(drift, 3600);
  const tolima = model.bySrc.tolima;
  const fs = small ? 10.5 : 12.5;
  const padX = small ? 4 : 12;
  const top = small ? 34 : 60;
  const stripW = width - padX * 2;
  const stripH = small ? 14 : 20;
  const y1 = top + (small ? 18 : 26);
  const y2 = y1 + stripH + (small ? 30 : 42);
  const mapTop = y2 + stripH + (small ? 36 : 56);
  const mapBottom = height - (small ? 10 : 26);

  const proj = useMemo(() => {
    if (tolima.length === 0) return null;
    const lats = tolima.map((e) => e.lat).sort((a, b) => a - b);
    const lons = tolima.map((e) => e.lon).sort((a, b) => a - b);
    const q = (xs: number[], p: number) => xs[Math.min(xs.length - 1, Math.floor(p * xs.length))]!;
    return geoMercator().fitExtent(
      [
        [padX + (small ? 0 : 30), mapTop + (small ? 30 : 14)],
        [width - padX - (small ? 0 : 30), Math.max(mapTop + 40, mapBottom - 24)],
      ],
      {
        type: "MultiPoint",
        coordinates: [
          [q(lons, 0.06) - 0.004, q(lats, 0.06) - 0.004],
          [q(lons, 0.94) + 0.004, q(lats, 0.94) + 0.004],
        ],
      },
    );
  }, [tolima, width, mapTop, mapBottom, padX, small]);

  const strip = (shares: number[], first: string, rest: string, y: number) => {
    // Slices under a pixel merge into one, so a thousand events do not become a thousand nodes.
    const out: { x: number; w: number; cls: string }[] = [];
    let acc = 0;
    let tail = 0;
    shares.forEach((s, i) => {
      const w = s * stripW;
      if (i > 0 && w < 1) tail += w;
      else out.push({ x: padX + acc * stripW, w, cls: i === 0 ? first : rest });
      acc += s;
    });
    if (tail > 0) out.push({ x: padX + stripW - tail, w: tail, cls: rest });
    return out.map((r, i) => (
      <rect key={i} x={r.x} y={y} width={Math.max(0.5, r.w - (r.w > 2 ? 1 : 0))} height={stripH} className={r.cls} />
    ));
  };

  const t0 = tolima[0]?.t ?? 0;
  const tSpan = Math.max(1, (tolima.at(-1)?.t ?? 0) - t0);
  const age = ["opacity-30", "opacity-50", "opacity-70", "opacity-95"];
  const moved = data.tolimaDrift.case === "moved";
  const trackPts =
    proj && moved
      ? model.tolimaWindows.flatMap((w) => {
          const xy = proj([w.centre.lon, w.centre.lat]);
          return xy ? [xy] : [];
        })
      : [];
  const dotsProgress = Math.min(1, progress / 0.65);
  const trackProgress = Math.max(0, (progress - 0.6) / 0.4);
  // One kilometre east–west at the swarm's own centre, in pixels, for the scale bar and the error circle.
  const at = model.centres.tolima;
  const kmPx =
    proj && at
      ? (() => {
          const a = proj([at.lon, at.lat])!;
          const b = proj([at.lon + 1 / (111.2 * Math.cos((at.lat * Math.PI) / 180)), at.lat])!;
          return b[0] - a[0];
        })()
      : 0;
  // The circle is the error the drift sentence beside it quotes, so the step names one figure. When
  // the claim has too few events to say anything, the circle shows the swarm's own median instead.
  const err =
    data.tolimaDrift.case === "too-few" ? (medianHorizontalErrorKm(tolima) ?? null) : data.tolimaDrift.errorKm;
  const end = model.tolimaWindows.at(-1)?.centre;
  const endXY = proj && end ? proj([end.lon, end.lat]) : null;

  return (
    <g>
      <SceneTitle small={small}>{c.tolimaTitle}</SceneTitle>
      {model.main && data.largestShare.choco !== null && (
        <text x={padX} y={y1 - 8} fontSize={fs} className="fill-foreground">
          <Rich text={c.stripChoco} parts={{ mag: fmtMag(model.main.mag), share: share(data.largestShare.choco) }} />
        </text>
      )}
      {strip(model.energy.choco, "fill-chart-2", "fill-muted-foreground", y1)}
      {model.tolimaLargest && data.largestShare.tolima !== null && (
        <text x={padX} y={y2 - 8} fontSize={fs} className="fill-foreground">
          <Rich
            text={c.stripTolima}
            parts={{ mag: fmtMag(model.tolimaLargest.mag), share: share(data.largestShare.tolima) }}
          />
        </text>
      )}
      {strip(model.energy.tolima, "fill-chart-5", "fill-chart-5 opacity-50", y2)}
      <text x={padX} y={y2 + stripH + (small ? 14 : 18)} fontSize={fs - 1.5} className="fill-muted-foreground">
        {c.stripNote}
      </text>

      <text
        x={padX}
        y={mapTop}
        fontSize={fs - 0.5}
        fontWeight={500}
        className="fill-muted-foreground uppercase"
        letterSpacing="0.06em"
      >
        {c.closeUp}
      </text>
      {proj && (
        <g>
          <clipPath id="story-tolima-clip">
            <rect
              x={padX}
              y={mapTop + 8}
              width={Math.max(0, width - padX * 2)}
              height={Math.max(0, mapBottom - mapTop - 22)}
            />
          </clipPath>
          <g clipPath="url(#story-tolima-clip)">
            {tolima.map((e) => {
              const xy = proj([e.lon, e.lat]);
              if (!xy) return null;
              const frac = (e.t - t0) / tSpan;
              const visible = !drift || frac <= dotsProgress;
              return (
                <circle
                  key={e.id}
                  cx={xy[0]}
                  cy={xy[1]}
                  r={radius(e.mag, small ? 0.8 : 1)}
                  className={`fill-chart-5 ${visible ? age[Math.min(3, Math.floor(frac * 4))] : "opacity-0"}`}
                />
              );
            })}
            {moved && trackPts.length > 1 && (
              <g>
                <path
                  d={line()(partialLine(trackPts, drift ? trackProgress : 1)) ?? ""}
                  fill="none"
                  className="stroke-foreground"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {trackPts.map((xy, i) => (
                  <circle
                    key={i}
                    cx={xy[0]}
                    cy={xy[1]}
                    r={i === 0 || i === trackPts.length - 1 ? 4.5 : 3}
                    data-on={!drift || trackProgress >= i / (trackPts.length - 1) || undefined}
                    className="fill-foreground stroke-background opacity-0 data-on:opacity-100"
                    strokeWidth={1.5}
                  />
                ))}
              </g>
            )}
          </g>
          {moved && endXY && (
            <text
              x={endXY[0] - 10}
              y={endXY[1] - 14}
              textAnchor="end"
              fontSize={fs}
              fontWeight={600}
              data-on={!drift || trackProgress >= 1 || undefined}
              className="fill-foreground stroke-background opacity-0 transition-opacity data-on:opacity-100 motion-reduce:transition-none"
              paintOrder="stroke"
              strokeWidth={4}
            >
              {c.track}
            </text>
          )}
          <g transform={`translate(${padX}, ${mapBottom - 4})`}>
            <line x1={0} x2={kmPx} y1={0} y2={0} className="stroke-foreground" strokeWidth={2} />
            <line x1={0} x2={0} y1={-4} y2={4} className="stroke-foreground" strokeWidth={2} />
            <line x1={kmPx} x2={kmPx} y1={-4} y2={4} className="stroke-foreground" strokeWidth={2} />
            <text x={kmPx + 6} y={4} fontSize={fs - 1} className="fill-muted-foreground">
              {fmtKm(1)}
            </text>
          </g>
          {err !== null && Number.isFinite(err) && (
            <g transform={`translate(${width - padX - err * kmPx}, ${mapBottom - err * kmPx - 4})`}>
              <circle r={err * kmPx} fill="none" className="stroke-muted-foreground" strokeDasharray="3 3" />
              <text
                y={-err * kmPx - 6}
                x={err * kmPx}
                textAnchor="end"
                fontSize={fs - 1.5}
                className="fill-muted-foreground"
              >
                <Rich text={c.errorCircle} parts={{ km: fmtKm(err, 1) }} />
              </text>
            </g>
          )}
        </g>
      )}
    </g>
  );
}

// =============================================================================================
// Pereira: the calendar of days above the reader's threshold, and the waves' travel times.

const TINTS = ["opacity-40", "opacity-65", "opacity-90"] as const;
const tintStep = (n: number) => (n >= 4 ? 2 : n >= 2 ? 1 : 0);
/**
 * The text on a day, per source and tint step: the page's text colour where the tint is light and
 * the page's own ground where it is dark, in each theme. Measured on the composited tile; each pick
 * clears 4.5:1 (worst 4.56 in the browser, the dark shallow blue at 90 %). The text colour alone fell to 1.72:1 on
 * Chaparral's violet in light mode and 1.80:1 on the deep teal in dark.
 */
const TILE_TEXT: Record<Source, readonly [string, string, string]> = {
  shallow: ["fill-foreground", "fill-foreground", "fill-foreground dark:fill-background"],
  deep: ["fill-foreground", "fill-foreground dark:fill-background", "fill-background"],
  tolima: ["fill-foreground", "fill-background dark:fill-foreground", "fill-background dark:fill-foreground"],
};

export function FeltScene({
  data,
  model,
  width,
  height,
  sub,
  small,
  lang,
  threshold,
  active,
}: SceneProps & { threshold: number; active: boolean }) {
  const fs = small ? 10 : 12;
  const days = useMemo(
    () => strongDays(data.sources, model.start, data.now, threshold),
    [data.sources, model.start, data.now, threshold],
  );
  const cal = sub === "calendar";
  const waves = active && sub === "waves";

  return (
    <g>
      <g
        data-on={cal || undefined}
        className="opacity-0 transition-opacity duration-500 data-on:opacity-100 data-on:delay-200 motion-reduce:transition-none"
      >
        <Calendar
          days={days}
          model={model}
          width={width}
          height={height}
          small={small}
          lang={lang}
          threshold={threshold}
          fs={fs}
        />
      </g>
      <g
        data-on={waves || undefined}
        aria-hidden={!waves}
        className="opacity-0 transition-opacity duration-500 data-on:opacity-100 data-on:delay-200 motion-reduce:transition-none"
      >
        <Waves data={data} model={model} width={width} height={height} small={small} lang={lang} fs={fs} on={waves} />
      </g>
    </g>
  );
}

function Calendar({
  days,
  model,
  width,
  height,
  small,
  lang,
  threshold,
  fs,
}: {
  days: ReturnType<typeof strongDays>;
  model: StoryModel;
  width: number;
  height: number;
  small: boolean;
  lang: Lang;
  threshold: number;
  fs: number;
}) {
  const c = storyCopy[lang].graphic;
  const hit = days.filter((d) => d.bySource.shallow + d.bySource.deep + d.bySource.tolima > 0).length;
  // Weeks start on Monday. A day start is the instant Colombian midnight falls, 05:00 UTC, which is
  // on the same calendar date in UTC, so its UTC weekday is the Colombian one.
  const lead = days.length ? (new Date(days[0]!.start).getUTCDay() + 6) % 7 : 0;
  const rows = Math.ceil((days.length + lead) / 7);
  const top = small ? 64 : 100;
  const cell = Math.max(
    8,
    Math.min((width - (small ? 8 : 60)) / 7, (height - top - (small ? 36 : 60)) / (rows + 0.5), 64),
  );
  const gx = (width - cell * 7) / 2;
  const gy = top + cell * 0.5;
  const mainDay = model.main ? days.find((d) => model.main!.t >= d.start && model.main!.t < d.start + DAY) : undefined;
  const order: Source[] = ["shallow", "deep", "tolima"];

  return (
    <g>
      <SceneTitle small={small}>
        <Rich text={c.calendarTitle} parts={{ mag: fmtMag(threshold) }} />
      </SceneTitle>
      <text
        x={small ? 4 : 8}
        y={small ? 40 : 58}
        fontSize={small ? 18 : 26}
        fontWeight={650}
        className="fill-foreground tabular-nums"
      >
        <Rich text={c.calendarCount} parts={{ k: fmt(hit), n: fmt(days.length) }} />
      </text>
      {days.length > 0 && (
        <text
          x={width - (small ? 4 : 8)}
          y={small ? 40 : 58}
          textAnchor="end"
          fontSize={fs}
          className="fill-muted-foreground"
        >
          {`${fmtDay(days[0]!.start, lang)} – ${fmtDay(days.at(-1)!.start, lang)}`}
        </text>
      )}
      {c.weekdays.map((d, i) => (
        <text
          key={i}
          x={gx + cell * i + cell / 2}
          y={gy - 8}
          textAnchor="middle"
          fontSize={fs}
          className="fill-muted-foreground"
        >
          {d}
        </text>
      ))}
      {days.map((d, i) => {
        const at = i + lead;
        const x = gx + (at % 7) * cell;
        const y = gy + Math.floor(at / 7) * cell;
        const n = d.bySource.shallow + d.bySource.deep + d.bySource.tolima;
        const leader = n ? order.reduce((a, b) => (d.bySource[b] > d.bySource[a] ? b : a)) : null;
        const dom = new Date(d.start).getUTCDate();
        const r = small ? 4 : 7;
        return (
          <g key={d.start} transform={`translate(${x + 2},${y + 2})`}>
            <rect
              width={cell - 4}
              height={cell - 4}
              rx={r}
              className={leader ? `${FILL[leader]} ${TINTS[tintStep(n)]} transition-opacity` : "fill-muted"}
            />
            {d === mainDay && (
              <rect width={cell - 4} height={cell - 4} rx={r} fill="none" className="stroke-chart-2" strokeWidth={3} />
            )}
            {cell >= 30 && (
              <text
                x={small ? 4 : 7}
                y={small ? 12 : 16}
                fontSize={fs - 1}
                className={leader ? TILE_TEXT[leader][tintStep(n)] : "fill-muted-foreground"}
                fontWeight={dom === 1 ? 700 : 400}
              >
                {dom === 1 || i === 0 ? fmtDay(d.start, lang) : dom}
              </text>
            )}
            {leader && cell >= 22 && (
              <text
                x={cell - (small ? 8 : 12)}
                y={cell - (small ? 8 : 12)}
                textAnchor="end"
                fontSize={small ? 11 : 15}
                fontWeight={650}
                className={`${TILE_TEXT[leader][tintStep(n)]} tabular-nums`}
              >
                {n}
              </text>
            )}
          </g>
        );
      })}
      <g transform={`translate(${gx}, ${gy + rows * cell + (small ? 16 : 22)})`}>
        {order.map((s, i) => (
          <g key={s} transform={`translate(${i * (small ? 112 : 150)}, 0)`}>
            <rect width={10} height={10} y={-9} rx={2} className={FILL[s]} />
            <text x={15} fontSize={fs} className="fill-muted-foreground">
              {storyCopy[lang].legend[s]}
            </text>
          </g>
        ))}
      </g>
    </g>
  );
}

const WAVE_SPEEDUP = 4;

function Waves({
  data,
  model,
  width,
  height,
  small,
  lang,
  fs,
  on,
}: {
  data: Insights;
  model: StoryModel;
  width: number;
  height: number;
  small: boolean;
  lang: Lang;
  fs: number;
  on: boolean;
}) {
  const c = storyCopy[lang].graphic;
  const l = storyCopy[lang].legend;
  const rows: { key: string; label: string; km: number; cls: string; fill: string }[] = [
    ...(model.main && model.mainHypoKm !== null
      ? [
          {
            key: "main",
            label: `${fmtMag(model.main.mag)} · ${fmtDay(model.main.t, lang)}`,
            km: model.mainHypoKm,
            cls: "stroke-chart-2",
            fill: "fill-chart-2",
          },
        ]
      : []),
    ...(["shallow", "tolima"] as const).flatMap((s) => {
      const d = data.distances[s];
      return d ? [{ key: s, label: l[s], km: d.hypocentralKm, cls: STROKE[s], fill: FILL[s] }] : [];
    }),
  ];
  const maxS = Math.max(10, ...rows.map((r) => arrivalSeconds(r.km).s));
  const axisMax = Math.ceil((maxS + 4) / 10) * 10;
  const progress = useProgress(on, (axisMax * 1000) / WAVE_SPEEDUP);
  const wl = small ? 6 : 170;
  const wr = small ? 18 : 40;
  const tx = scaleLinear()
    .domain([0, axisMax])
    .range([wl, width - wr]);
  const rowH = small ? 62 : 84;
  const wTop = (height - rowH * rows.length) / 2 + (small ? 56 : 84);
  const first = rows[0] ? arrivalSeconds(rows[0].km) : null;
  const now = progress * axisMax;
  const ticks: number[] = [];
  for (let s = 0; s <= axisMax; s += 10) ticks.push(s);

  return (
    <g>
      <SceneTitle small={small}>{c.wavesTitle}</SceneTitle>
      {first && (
        <Seismogram
          x0={tx(0)}
          x1={tx(axisMax)}
          y={wTop - (small ? 76 : 116)}
          amp={small ? 18 : 28}
          tx={tx}
          p={first.p}
          s={first.s}
          until={axisMax}
          fs={fs}
          label={c.seismogram}
        />
      )}
      {ticks.map((s) => (
        <g key={s}>
          <line x1={tx(s)} x2={tx(s)} y1={wTop - 20} y2={wTop + rowH * rows.length - 20} className="stroke-border" />
          <text
            x={tx(s)}
            y={wTop + rowH * rows.length}
            textAnchor="middle"
            fontSize={fs}
            className="fill-muted-foreground tabular-nums"
          >
            {`${s} s`}
          </text>
        </g>
      ))}
      {rows.map((r, i) => {
        const a = arrivalSeconds(r.km);
        const yy = wTop + i * rowH;
        const reach = Math.min(now, a.s);
        return (
          <g key={r.key}>
            {small ? (
              <text x={wl} y={yy - 24} fontSize={fs + 0.5} fontWeight={600} className="fill-foreground">
                {r.label}
                <tspan className="fill-muted-foreground tabular-nums" fontWeight={400}>{` · ${fmtKm(r.km)}`}</tspan>
              </text>
            ) : (
              <>
                <text x={8} y={yy - 4} fontSize={fs + 0.5} fontWeight={600} className="fill-foreground">
                  {r.label}
                </text>
                <text x={8} y={yy + fs + 2} fontSize={fs - 1} className="fill-muted-foreground tabular-nums">
                  {fmtKm(r.km)}
                </text>
              </>
            )}
            <line
              x1={tx(0)}
              x2={tx(axisMax)}
              y1={yy}
              y2={yy}
              className="stroke-border"
              strokeWidth={6}
              strokeLinecap="round"
            />
            <line x1={tx(0)} x2={tx(reach)} y1={yy} y2={yy} className={r.cls} strokeWidth={6} strokeLinecap="round" />
            {(["p", "s"] as const).map((k) => (
              <g
                key={k}
                transform={`translate(${tx(a[k])},${yy})`}
                data-on={now >= a[k] || undefined}
                className="opacity-0 transition-opacity data-on:opacity-100 motion-reduce:transition-none"
              >
                <circle
                  r={k === "p" ? 5 : 7}
                  className={k === "p" ? `fill-background ${r.cls}` : `${r.fill} ${r.cls}`}
                  strokeWidth={2.5}
                />
                <text
                  y={-12}
                  textAnchor="middle"
                  fontSize={fs}
                  fontWeight={600}
                  className="fill-foreground tabular-nums"
                >
                  {`${k.toUpperCase()} ${Math.round(a[k])} s`}
                </text>
              </g>
            ))}
          </g>
        );
      })}
      <text
        x={width - wr}
        y={wTop + rowH * rows.length + (small ? 18 : 24)}
        textAnchor="end"
        fontSize={fs - 1}
        className="fill-muted-foreground"
      >
        {c.wavesNote}
      </text>
    </g>
  );
}

/** A deterministic stand-in for noise, so the drawn seismogram is the same on every render. */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32 - 0.5;
  };
}

/** A schematic seismogram: quiet, a small sharp P arrival, then a larger, longer S. Drawn, not recorded. */
function Seismogram({
  x0,
  x1,
  y,
  amp,
  tx,
  p,
  s,
  until,
  fs,
  label,
}: {
  x0: number;
  x1: number;
  y: number;
  amp: number;
  tx: (t: number) => number;
  p: number;
  s: number;
  until: number;
  fs: number;
  label: string;
}) {
  const d = useMemo(() => {
    const rnd = lcg(7);
    const pts: [number, number][] = [];
    const env = (t: number, t0: number, a: number, decay: number) =>
      t < t0 ? 0 : a * Math.exp(-(t - t0) / decay) * Math.min(1, (t - t0) * 6);
    for (let t = 0; t <= until; t += 0.04) {
      const e = 0.03 + env(t, p, 0.35, 2.2) + env(t, s, 1, 4.5);
      const v = e * (Math.sin(t * 9.1) * 0.6 + Math.sin(t * 15.7 + 1) * 0.4 + rnd() * 0.7);
      pts.push([tx(t), y - Math.max(-1.2, Math.min(1.2, v)) * amp]);
    }
    return line()(pts) ?? "";
  }, [tx, y, amp, p, s, until]);
  return (
    <g>
      <text x={x0} y={y - amp - 16} fontSize={fs - 1} className="fill-muted-foreground">
        {label}
      </text>
      <line x1={x0} x2={x1} y1={y} y2={y} className="stroke-border" />
      <path d={d} fill="none" className="stroke-foreground" strokeWidth={1} />
      {[
        { t: p, k: "P" },
        { t: s, k: "S" },
      ].map((m) => (
        <text
          key={m.k}
          x={tx(m.t)}
          y={y + amp + 14}
          textAnchor="middle"
          fontSize={fs}
          fontWeight={650}
          className="fill-foreground"
        >
          {m.k}
        </text>
      ))}
    </g>
  );
}
