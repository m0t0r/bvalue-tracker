/** Questions 3–6: the two clocks, the swarm against the sequence, both zones in time, and the calendar. */
import { hypocentralKm } from "@bvalue/seismo";
import { max as d3max } from "d3-array";
import { scaleBand, scaleLinear, scaleTime } from "d3-scale";
import { curveMonotoneX, line, symbol, symbolDiamond } from "d3-shape";
import { useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { TZ_OFFSET_MS, dayStart, fmtDay, fmtDayTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { PEREIRA, SOURCES, strongDays, type Insights, type QuakeLike, type Source } from "../claims";
import { insightsCopy } from "../copy";
import { questionsCopy } from "./copy";
import { fmtKm, median, medianHorizontalErrorKm, timeWindows } from "../shared";
import { BG, FILL } from "../tones";
import { colombianDays, dailyCounts, dayIndexOf, kmFrom, omoriFromFirstDay } from "./derive";
import { Figure, RangeField, Swatch, useWidth } from "./ui";

const DAY = 86_400_000;

// ---------------------------------------------------------------------------------------------
// Question 3

/** Daily counts of Chocó's two groups above Mc, on one shared scale, with the illustrative 1/t curve. */
export function TwoClocks({ data, reference }: { data: Insights; reference: QuakeLike }) {
  const { lang } = useI18n();
  const c = questionsCopy[lang].stop;
  const [box, w] = useWidth();
  const [curve, setCurve] = useState(true);
  const curveId = useId();
  const mc = data.mc.choco ?? 0;
  const days = useMemo(() => colombianDays(Date.parse(reference.time), data.now), [reference, data.now]);
  const rows = useMemo(
    () =>
      (["deep", "shallow"] as const).map((s) => ({
        s,
        counts: dailyCounts(data.sources[s], mc, days),
        strong: data.sources[s].filter((e) => e.mag >= 4),
        km: data.distances[s]?.depthKm ?? 0,
      })),
    [data, mc, days],
  );
  const lulls = useMemo(() => {
    const p = data.shallowPace;
    if (!p || p.case === "young") return [];
    const out = p.pastLulls.map((l) => ({ from: l.from, to: l.to }));
    if (p.quietSince !== null) out.push({ from: p.quietSince, to: dayStart(new Date(data.now).toISOString()) });
    return out;
  }, [data]);

  const width = Math.max(260, w);
  const H = 128;
  const m = { l: 30, r: 8, t: 26, b: 4 };
  const x = scaleBand<number>()
    .domain(days.map((_, i) => i))
    .range([m.l, width - m.r])
    .paddingInner(0.18);
  const y = scaleLinear()
    .domain([0, d3max(rows.flatMap((r) => r.counts)) ?? 1])
    .range([H - m.b, m.t])
    .nice();
  const top = y.domain()[1]!;
  const every = width < 520 ? 14 : 7;
  const mid = (i: number) => x(i)! + x.bandwidth() / 2;

  return (
    <Figure caption={c.caption(mc)}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{c.sameScale}</p>
        <div className="flex items-center gap-2">
          <Switch id={curveId} checked={curve} onCheckedChange={setCurve} />
          <Label htmlFor={curveId}>{c.curve}</Label>
        </div>
      </div>
      <div ref={box} className="flex min-w-0 flex-col gap-6">
        {rows.map((r) => {
          const label = r.s === "deep" ? c.deepRow(r.km) : c.shallowRow(r.km);
          const shape =
            line<number>()
              .x((_, i) => mid(i))
              .y((v) => y(Math.min(v, top)))
              .curve(curveMonotoneX)(omoriFromFirstDay(r.counts[0] ?? 0, days.length)) ?? "";
          return (
            <div key={r.s}>
              <p className="mb-1 flex items-center gap-2 text-sm font-medium">
                <Swatch source={r.s} square />
                {label}
              </p>
              <svg
                width={width}
                height={H + 22}
                role="img"
                aria-label={c.rowAria(
                  label,
                  r.counts.reduce((a, b) => a + b, 0),
                  days.length,
                )}
                className="block"
              >
                {r.s === "shallow"
                  ? lulls.map((l) => {
                      const a = dayIndexOf(days, l.from),
                        b = dayIndexOf(days, l.to);
                      if (b < 0 || a >= days.length) return null;
                      const x0 = x(Math.max(0, a))!,
                        x1 = x(Math.min(days.length - 1, b))! + x.bandwidth();
                      return (
                        <g key={l.from}>
                          <rect x={x0} y={m.t - 12} width={x1 - x0} height={y(0) - m.t + 12} className="fill-muted" />
                          {/* Kept inside the plot: a lull running to today would push its label off the right edge. */}
                          <text
                            x={Math.min(x0 + 3, width - m.r - 64)}
                            y={m.t - 2}
                            fontSize={10}
                            className="fill-muted-foreground"
                          >
                            {c.lull}
                          </text>
                        </g>
                      );
                    })
                  : null}
                {y.ticks(3).map((t) => (
                  <g key={t} transform={`translate(0,${y(t)})`}>
                    <line x1={m.l} x2={width - m.r} className="stroke-border" />
                    <text x={m.l - 6} y={3} textAnchor="end" fontSize={10} className="fill-muted-foreground">
                      {t}
                    </text>
                  </g>
                ))}
                <g className={FILL[r.s]}>
                  {r.counts.map((v, i) => (
                    <rect
                      key={days[i]}
                      x={x(i)}
                      width={x.bandwidth()}
                      y={y(v)}
                      height={y(0) - y(v)}
                      rx={Math.min(2, x.bandwidth() / 3)}
                    />
                  ))}
                </g>
                <g className="fill-foreground stroke-card">
                  {r.strong.map((e) => {
                    const i = dayIndexOf(days, Date.parse(e.time));
                    if (i < 0 || i >= days.length) return null;
                    return (
                      <path
                        key={e.id}
                        d={symbol(symbolDiamond, 22 + (e.mag - 4) * 40)() ?? ""}
                        transform={`translate(${mid(i)},10)`}
                        strokeWidth={1}
                      >
                        <title>{`M${e.mag.toFixed(1)} · ${fmtDay(Date.parse(e.time), lang)}`}</title>
                      </path>
                    );
                  })}
                </g>
                {curve ? (
                  <path d={shape} fill="none" strokeWidth={1.5} strokeDasharray="3 3" className="stroke-foreground" />
                ) : null}
                {days.map((d, i) =>
                  i % every === 0 ? (
                    <text
                      key={d}
                      x={mid(i)}
                      y={H + 16}
                      textAnchor="middle"
                      fontSize={10}
                      className="fill-muted-foreground"
                    >
                      {fmtDay(d, lang)}
                    </text>
                  ) : null,
                )}
              </svg>
            </div>
          );
        })}
      </div>
    </Figure>
  );
}

// ---------------------------------------------------------------------------------------------
// Question 4

/** How much of each zone's energy its largest event released. */
export function EnergyShare({ data }: { data: Insights }) {
  const { lang } = useI18n();
  const c = questionsCopy[lang].swarm;
  const share = insightsCopy[lang].claims.share;
  const bars = [
    {
      id: "choco",
      name: c.shareChoco(data.mainshock.choco.largest?.mag ?? 0),
      v: data.largestShare.choco,
      bg: BG.mainshock,
    },
    {
      id: "tolima",
      name: c.shareTolima(data.mainshock.tolima.largest?.mag ?? 0),
      v: data.largestShare.tolima,
      bg: BG.tolima,
    },
  ];
  return (
    <Figure caption={`${c.shareCaption} ${questionsCopy[lang].magTypes}`}>
      <p className="mb-4 text-sm text-muted-foreground">{c.shareTitle}</p>
      <div className="flex flex-col gap-5">
        {bars.map((b) =>
          b.v === null ? null : (
            <div key={b.id}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">{b.name}</span>
                <span className="text-lg font-semibold tabular-nums">{share(b.v)}</span>
              </div>
              <div
                role="meter"
                aria-label={b.name}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(b.v * 1000) / 10}
                className="h-4 w-full overflow-hidden rounded-full bg-muted"
              >
                <div
                  className={cn("h-full w-(--w) min-w-4 rounded-full", b.bg)}
                  style={{ "--w": `${b.v * 100}%` } as CSSProperties}
                />
              </div>
            </div>
          ),
        )}
      </div>
    </Figure>
  );
}

const DRIFT_KM = 6;

/** The swarm's epicentres every 12 hours, in km around where it began, with the centre's path. */
export function DriftMultiples({ data }: { data: Insights }) {
  const { lang } = useI18n();
  const c = questionsCopy[lang].swarm;
  // In km around where the swarm began (the median of its first 30 epicentres), for the panels.
  const windows = useMemo(() => {
    const tolima = data.sources.tolima;
    const first = tolima.slice(0, 30);
    const origin = { lat: median(first, (e) => e.lat) ?? 0, lon: median(first, (e) => e.lon) ?? 0 };
    return timeWindows(tolima, 12, 20).map((w) => ({
      start: w.start,
      points: w.events.map((e) => ({ ...kmFrom(origin, e), mag: e.mag })),
      centre: kmFrom(origin, w.centre),
    }));
  }, [data]);
  // The error the drift sentence above quotes, so the two never disagree; the whole swarm's otherwise.
  const err =
    data.tolimaDrift.case === "too-few" ? medianHorizontalErrorKm(data.sources.tolima) : data.tolimaDrift.errorKm;
  const S = 100;
  const sx = scaleLinear().domain([-DRIFT_KM, DRIFT_KM]).range([0, S]);
  const sy = scaleLinear().domain([-DRIFT_KM, DRIFT_KM]).range([S, 0]);
  if (windows.length === 0) return null;
  const km1 = sx(1) - sx(0);
  return (
    <Figure caption={c.driftCaption(err == null ? "?" : err.toFixed(1))}>
      <p className="mb-4 text-sm text-muted-foreground">{c.driftTitle(DRIFT_KM)}</p>
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
        {windows.map((win, i) => {
          const when = fmtDayTime(win.start, lang);
          const track =
            line<{ x: number; y: number }>()
              .x((p) => sx(p.x))
              .y((p) => sy(p.y))(windows.slice(0, i + 1).map((w) => w.centre)) ?? "";
          return (
            <div key={win.start} className="min-w-0">
              <svg
                viewBox={`0 0 ${S} ${S}`}
                role="img"
                aria-label={c.driftAria(when, win.points.length)}
                className="aspect-square w-full rounded-md bg-background"
              >
                <line x1={sx(0)} x2={sx(0)} y1={0} y2={S} strokeWidth={0.5} className="stroke-border" />
                <line x1={0} x2={S} y1={sy(0)} y2={sy(0)} strokeWidth={0.5} className="stroke-border" />
                <g className="fill-chart-5 opacity-40">
                  {win.points.map((p, j) => (
                    <circle key={j} cx={sx(p.x)} cy={sy(p.y)} r={Math.max(0.9, (p.mag - 1.5) * 0.6)} />
                  ))}
                </g>
                <path d={track} fill="none" strokeWidth={1} className="stroke-foreground" />
                <g
                  transform={`translate(${sx(win.centre.x)},${sy(win.centre.y)})`}
                  strokeWidth={1.5}
                  className="stroke-foreground"
                >
                  <line x1={-4} x2={4} />
                  <line y1={-4} y2={4} />
                </g>
                {/* The scale bar, in the first square only; the title says what it measures. */}
                {i === 0 ? (
                  <line
                    x1={S - 6 - km1}
                    x2={S - 6}
                    y1={S - 6}
                    y2={S - 6}
                    strokeWidth={1.5}
                    className="stroke-muted-foreground"
                  />
                ) : null}
              </svg>
              <p className="mt-1 text-2xs text-muted-foreground tabular-nums">
                {c.driftPanel(when, win.points.length)}
              </p>
            </div>
          );
        })}
      </div>
    </Figure>
  );
}

// ---------------------------------------------------------------------------------------------
// Question 5

/** Every event of both zones on one time axis, by magnitude. */
export function BothZonesTimeline({ data, reference }: { data: Insights; reference: QuakeLike }) {
  const { lang } = useI18n();
  const c = questionsCopy[lang].linked;
  const [box, w] = useWidth();
  const width = Math.max(260, w);
  const H = 220;
  const m = { l: 34, r: 12, t: 16, b: 26 };
  const start = dayStart(reference.time);
  const x = scaleTime()
    .domain([start, data.now + DAY / 4])
    .range([m.l, width - m.r]);
  const y = scaleLinear()
    .domain([2, Math.max(7.6, reference.mag + 0.2)])
    .range([H - m.b, m.t]);
  const tolimaStart = data.start.tolima;
  const dots = useMemo(
    () => SOURCES.flatMap((s) => data.sources[s].map((e) => ({ e, s }))).sort((a, b) => a.e.mag - b.e.mag),
    [data],
  );
  const ticks = x.ticks(width < 500 ? 4 : 7);
  return (
    <Figure caption={c.caption}>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-1.5">
          <Swatch source="shallow" />
          {c.legendShallow}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Swatch source="deep" />
          {c.legendDeep}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Swatch source="tolima" />
          {c.legendTolima}
        </span>
      </div>
      <div ref={box} className="min-w-0">
        <svg width={width} height={H} role="img" aria-label={c.aria} className="block">
          {[3, 4, 5, 6, 7].map((t) => (
            <g key={t} transform={`translate(0,${y(t)})`}>
              <line x1={m.l} x2={width - m.r} className="stroke-border" />
              <text x={m.l - 6} y={3} textAnchor="end" fontSize={10} className="fill-muted-foreground">
                M{t}
              </text>
            </g>
          ))}
          {tolimaStart !== null ? (
            <>
              <rect
                x={x(tolimaStart)}
                y={m.t}
                width={Math.max(0, width - m.r - x(tolimaStart))}
                height={H - m.t - m.b}
                className="fill-chart-5 opacity-10"
              />
              <text
                x={x(tolimaStart) - 6}
                y={m.t + 10}
                textAnchor="end"
                fontSize={11}
                fontWeight={600}
                className="fill-chart-5"
              >
                {c.begins(fmtDay(tolimaStart, lang))}
              </text>
            </>
          ) : null}
          {dots.map(({ e, s }) => (
            <circle
              key={e.id}
              cx={x(Date.parse(e.time))}
              cy={y(e.mag)}
              r={e === reference ? 7 : Math.max(1.5, (e.mag - 1.8) * 1.1)}
              strokeWidth={e === reference ? 2 : 0}
              className={cn(FILL[s], e.mag >= 4 ? "opacity-90" : "opacity-45", e === reference && "stroke-chart-2")}
            />
          ))}
          <text
            x={x(Date.parse(reference.time)) + 12}
            y={y(reference.mag) + 4}
            fontSize={11}
            fontWeight={600}
            className="fill-foreground"
          >
            {`M${reference.mag.toFixed(1)} · ${fmtDay(Date.parse(reference.time), lang)}`}
          </text>
          {ticks.map((t) => (
            <text key={+t} x={x(t)} y={H - 8} textAnchor="middle" fontSize={10} className="fill-muted-foreground">
              {fmtDay(+t, lang)}
            </text>
          ))}
        </svg>
      </div>
    </Figure>
  );
}

// ---------------------------------------------------------------------------------------------
// Question 6

const ORDER: readonly Source[] = ["deep", "shallow", "tolima"];

/** Days with at least one event at or above the reader's threshold, coloured by where it came from. */
export function FeltCalendar({
  data,
  threshold,
  onThreshold,
}: {
  data: Insights;
  threshold: number;
  onThreshold: (m: number) => void;
}) {
  const { lang } = useI18n();
  const c = questionsCopy[lang].felt;
  const [selected, setSelected] = useState<number | null>(null);
  const start = data.start.choco ?? data.now;
  const days = useMemo(() => strongDays(data.sources, start, data.now, threshold), [data, start, threshold]);
  const withAny = days.filter((d) => d.maxMag !== null).length;
  const total = days.reduce((s, d) => s + d.bySource.shallow + d.bySource.deep + d.bySource.tolima, 0);
  // Monday-first weeks: a Colombian midnight shifted by the offset reads as that day in UTC.
  const weekday = (t: number) => (new Date(t + TZ_OFFSET_MS).getUTCDay() + 6) % 7;
  const lead = days.length ? weekday(days[0]!.start) : 0;
  const picked = selected === null ? null : days.find((d) => d.start === selected);
  const events = useMemo(() => {
    if (selected === null) return [];
    return SOURCES.flatMap((s) =>
      data.sources[s].filter((e) => e.mag >= threshold && dayStart(e.time) === selected).map((e) => ({ e, s })),
    ).sort((a, b) => Date.parse(a.e.time) - Date.parse(b.e.time));
  }, [data, selected, threshold]);
  const name: Record<Source, string> = { shallow: c.shallowName, deep: c.deepName, tolima: c.tolimaName };
  // One tab stop for the whole month (a roving tabindex): the arrows move between days, and Tab
  // leaves. It was 45 buttons in the tab order. The stop is the day last moved to, else the chosen day,
  // else the first with an event.
  const cells = useRef<(HTMLButtonElement | null)[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const firstHit = Math.max(
    0,
    days.findIndex((d) => d.maxMag !== null),
  );
  const stop = Math.min(days.length - 1, cursor ?? (picked ? days.indexOf(picked) : firstHit));
  const step: Record<string, (i: number) => number> = {
    ArrowLeft: (i) => i - 1,
    ArrowRight: (i) => i + 1,
    ArrowUp: (i) => i - 7,
    ArrowDown: (i) => i + 7,
    Home: () => 0,
    End: () => days.length - 1,
  };
  const move = (i: number, e: KeyboardEvent) => {
    const to = step[e.key]?.(i);
    if (to === undefined || to < 0 || to >= days.length) return;
    e.preventDefault();
    setCursor(to);
    cells.current[to]?.focus();
  };

  return (
    <Figure caption={c.caption}>
      <div className="mb-5 grid gap-4 sm:grid-cols-2 sm:items-end">
        <RangeField
          label={c.threshold}
          value={threshold}
          display={`M${threshold.toFixed(1)}`}
          min={3}
          max={5}
          step={0.1}
          onChange={(v) => {
            onThreshold(Math.round(v * 10) / 10);
            setSelected(null);
          }}
        />
        <p className="text-sm sm:text-right">
          <strong className="text-2xl tabular-nums">{withAny}</strong>{" "}
          <span className="text-muted-foreground">
            {c.daysOf(days.length)} · {c.events(total)}
          </span>
        </p>
      </div>
      <div className="mx-auto grid max-w-md grid-cols-7 gap-1.5">
        {c.weekdays.map((d, i) => (
          <div key={i} aria-hidden className="pb-1 text-center text-2xs text-muted-foreground">
            {d}
          </div>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <div key={`lead-${i}`} />
        ))}
        {days.map((d, i) => {
          const n = d.bySource.shallow + d.bySource.deep + d.bySource.tolima;
          const on = selected === d.start;
          return (
            <button
              key={d.start}
              ref={(el) => {
                cells.current[i] = el;
              }}
              type="button"
              tabIndex={i === stop ? 0 : -1}
              onKeyDown={(e) => move(i, e)}
              onClick={() => {
                setCursor(i);
                setSelected(on ? null : d.start);
              }}
              aria-pressed={on}
              aria-label={c.dayAria(fmtDay(d.start, lang), n)}
              className={cn(
                "flex aspect-square flex-col overflow-hidden rounded-md border bg-background text-left outline-none focus-visible:ring-3 focus-visible:ring-ring",
                on && "border-foreground",
              )}
            >
              <span className="flex justify-between px-1 pt-0.5 text-2xs text-muted-foreground tabular-nums">
                <span>{new Date(d.start + TZ_OFFSET_MS).getUTCDate()}</span>
                {n > 1 ? <span className="font-semibold text-foreground">×{n}</span> : null}
              </span>
              {n > 0 ? (
                <span aria-hidden className="mt-auto flex h-2/5 w-full">
                  {ORDER.map((s) =>
                    d.bySource[s] ? (
                      <span
                        key={s}
                        className={cn("h-full w-(--w)", BG[s])}
                        style={{ "--w": `${(100 * d.bySource[s]) / n}%` } as CSSProperties}
                      />
                    ) : null,
                  )}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <p className="mx-auto mt-2 max-w-md text-center text-2xs text-muted-foreground">
        {days.length ? `${fmtDay(days[0]!.start, lang)} – ${fmtDay(days.at(-1)!.start, lang)} · ` : ""}
        {c.tapHint}
      </p>
      <div className="mx-auto mt-4 max-w-md" aria-live="polite">
        {picked && events.length > 0 ? (
          <ul className="divide-y rounded-lg border text-sm">
            {events.map(({ e, s }) => (
              <li key={e.id} className="flex items-center gap-3 px-3 py-2">
                <Swatch source={s} />
                <span className="w-12 font-semibold tabular-nums">M{e.mag.toFixed(1)}</span>
                <span className="text-muted-foreground tabular-nums">{fmtDayTime(Date.parse(e.time), lang)}</span>
                <span className="ml-auto text-right text-muted-foreground tabular-nums">
                  {name[s]} · {fmtKm(hypocentralKm(e, PEREIRA))}
                </span>
              </li>
            ))}
          </ul>
        ) : picked ? (
          <p className="text-center text-sm text-muted-foreground">{c.none(threshold)}</p>
        ) : null}
      </div>
    </Figure>
  );
}
