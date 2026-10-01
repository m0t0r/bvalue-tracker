import "./figures.css";
import { RotateCcwIcon } from "lucide-react";
import { type CSSProperties, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Lang } from "@/lib/startup";
import { WORDS } from "./entries";

/**
 * The explainers' drawings: small, schematic, and drawn from made-up numbers chosen to show one idea
 * each, never the catalogue's. Each drawing is hidden from a screen reader (the card's text says what it
 * shows, and its caption and controls stay reachable) and moves only where the movement is the explanation, once, when its card opens; then it rests
 * on the finished picture, and a replay button plays it again (owner's rule: nothing moves by itself).
 * `figures.css` has the motion and the still picture reduced motion gets.
 */
export type FigureId =
  | "b-value"
  | "mc"
  | "sequence"
  | "energy"
  | "hypocentre"
  | "subduction"
  | "depth-groups"
  | "fmd"
  | "b-windows"
  | "magnitude-time";

const SVG = "block h-auto w-full overflow-visible";
const LABEL = "fill-muted-foreground text-xs";
const STRONG = "fill-foreground text-xs font-semibold";

/** The drawings whose motion is worth playing again; b's own buttons replay it, and Mc's is an entrance. */
const REPLAYABLE: ReadonlySet<FigureId> = new Set(["sequence", "energy", "hypocentre", "subduction", "b-windows"]);

export function Figure({ id, lang, large = false }: { id: FigureId; lang: Lang; large?: boolean }) {
  // A new key remounts the drawing, which starts its CSS animations over.
  const [run, setRun] = useState(0);
  const f = {
    "b-value": BValue,
    mc: Completeness,
    sequence: Sequence,
    energy: Energy,
    hypocentre: Hypocentre,
    subduction: Subduction,
    "depth-groups": DepthGroups,
    fmd: Fmd,
    "b-windows": BWindows,
    "magnitude-time": MagnitudeTime,
  }[id];
  const Drawing = f;
  return (
    <div className="flex items-end gap-1">
      <figure className={large ? "flex min-w-0 flex-1 flex-col gap-2" : "flex min-w-0 flex-1 flex-col gap-1.5"}>
        <Drawing key={run} lang={lang} />
      </figure>
      {REPLAYABLE.has(id) ? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={WORDS[lang].fig.replay}
          className="-me-1 motion-reduce:hidden"
          onClick={() => setRun((r) => r + 1)}
        >
          <RotateCcwIcon />
        </Button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// b-value: how many events of M2, M3 and M4, on a log scale, and the line through the tops. It tilts
// between b = 1 (ten times fewer per magnitude) and a lower b, where the large ones weigh more.

const B_STATES = {
  "1": { logs: [2, 1, 0], counts: ["100", "10", "1"], angle: 25.3 },
  "0.7": { logs: [2, 1.3, 0.6], counts: ["100", "≈20", "≈4"], angle: 18.3 },
} as const;
type B = keyof typeof B_STATES;
const B_BASE = 112;
const B_UNIT = 38;
const B_PAD = 0.35;
const B_FULL = (2 + B_PAD) * B_UNIT;
const B_COLS = [70, 150, 230] as const;
const B_MOVE = "duration-700 ease-(--ease-move) motion-reduce:transition-none";

function BValue({ lang }: { lang: Lang }) {
  const w = WORDS[lang].fig;
  const [b, setB] = useState<B>("1");
  const [auto, setAuto] = useState(true);

  // It tilts once, from b = 1 to the lower b, a moment after the card opens, and then rests; the two
  // buttons are the way to see it again. Never under reduced motion, which is read when the card opens,
  // not subscribed to: the story's `useReducedMotion` would put a shared chunk of its own in /insights'
  // startup requests (docs/performance.md), and a card is open for seconds.
  useEffect(() => {
    if (!auto || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setTimeout(() => setB("0.7"), 1200);
    return () => window.clearTimeout(id);
  }, [auto]);

  const s = B_STATES[b];
  return (
    <>
      <svg viewBox="0 0 300 136" aria-hidden className={SVG}>
        <line x1={30} x2={290} y1={B_BASE} y2={B_BASE} className="stroke-border" />
        {B_COLS.map((x, i) => {
          const h = (s.logs[i]! + B_PAD) * B_UNIT;
          return (
            <g key={x}>
              <rect
                x={x - 22}
                y={B_BASE - B_FULL}
                width={44}
                height={B_FULL}
                rx={3}
                style={{ "--s": h / B_FULL } as CSSProperties}
                className={`origin-bottom fill-chart-1 [transform-box:fill-box] scale-y-(--s) transition-transform ${B_MOVE}`}
              />
              {(Object.keys(B_STATES) as B[]).map((k) => (
                // Both readings' counts ride on the bar and cross-fade, so the number arrives with
                // the bar that shows it rather than before it.
                <text
                  key={k}
                  x={x}
                  y={B_BASE - 6}
                  textAnchor="middle"
                  style={{ "--ty": `${-h}px` } as CSSProperties}
                  className={`${STRONG} tabular-nums translate-y-(--ty) transition ${B_MOVE} ${
                    k === b ? "opacity-100" : "opacity-0 blur-xs"
                  }`}
                >
                  {B_STATES[k].counts[i]}
                </text>
              ))}
              <text x={x} y={B_BASE + 16} textAnchor="middle" className={LABEL}>
                M{i + 2}
              </text>
            </g>
          );
        })}
        <line
          x1={B_COLS[0]}
          x2={B_COLS[0] + 172}
          y1={B_BASE - B_FULL}
          y2={B_BASE - B_FULL}
          strokeWidth={2}
          strokeDasharray="5 4"
          style={{ "--a": `${s.angle}deg`, "--pivot": `${B_COLS[0]}px ${B_BASE - B_FULL}px` } as CSSProperties}
          className={`stroke-chart-2 [transform-box:view-box] origin-(--pivot) rotate-(--a) transition-transform ${B_MOVE}`}
        />
      </svg>
      <figcaption className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{w.eventsPerMagnitude}</span>
        {/* Two buttons, not a ToggleGroup: its roving focus is shared with the page's tabs, and the
            bundler then split that code into chunks of its own on /insights' startup path. */}
        <span role="group" aria-label={w.bToggle} className="flex gap-1">
          {(Object.keys(B_STATES) as B[]).map((k) => (
            <Button
              key={k}
              size="xs"
              variant={k === b ? "default" : "outline"}
              aria-pressed={k === b}
              onClick={() => {
                setAuto(false);
                setB(k);
              }}
            >
              b = {k}
            </Button>
          ))}
        </span>
      </figcaption>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Mc: how many events of each magnitude, on a log scale. Above Mc they fall along the line; below
// it the network misses more and more of the small ones, drawn as the dashed bars it would have seen.

const MC_BINS = [2.0, 2.2, 2.4, 2.6, 2.8, 3.0, 3.2, 3.4, 3.6, 3.8, 4.0];
const MC = 2.6;
const MC_SEEN = [12, 28, 45];
const mcExpected = (m: number) => 60 * 10 ** -(m - MC);
const MC_BASE = 104;
const MC_UNIT = 30;
const mcH = (n: number) => (Math.log10(n) + 0.4) * MC_UNIT;

function Completeness({ lang }: { lang: Lang }) {
  const w = WORDS[lang].fig;
  const x = (i: number) => 24 + i * 24;
  const mcX = x(MC_BINS.indexOf(MC)) + 9;
  return (
    <>
      <svg viewBox="0 0 300 128" aria-hidden className={SVG}>
        <line x1={16} x2={290} y1={MC_BASE} y2={MC_BASE} className="stroke-border" />
        {MC_BINS.map((m, i) => {
          const seen = i < MC_SEEN.length ? MC_SEEN[i]! : mcExpected(m);
          const expected = mcExpected(m);
          const hs = mcH(seen);
          return (
            <g key={m}>
              {i < MC_SEEN.length ? (
                <rect
                  x={x(i)}
                  y={MC_BASE - mcH(expected)}
                  width={18}
                  height={mcH(expected) - hs}
                  rx={2}
                  strokeDasharray="3 2"
                  style={{ "--i": 14 + i } as CSSProperties}
                  fill="none"
                  className="enter stroke-muted-foreground"
                />
              ) : null}
              <rect
                x={x(i)}
                y={MC_BASE - hs}
                width={18}
                height={hs}
                rx={2}
                style={{ "--i": i } as CSSProperties}
                className="enter fill-chart-1"
              />
            </g>
          );
        })}
        <line x1={mcX} x2={mcX} y1={6} y2={MC_BASE} strokeDasharray="2 3" className="stroke-foreground" />
        <text x={mcX + 5} y={14} className={STRONG}>
          Mc
        </text>
        {[0, 5, 10].map((i) => (
          <text key={i} x={x(i) + 9} y={MC_BASE + 16} textAnchor="middle" className={LABEL}>
            M{MC_BINS[i]!.toFixed(0)}
          </text>
        ))}
      </svg>
      <figcaption className="text-xs text-muted-foreground">
        {w.eventsPerMagnitudeLog} · {w.missed}
      </figcaption>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// A swarm against aftershocks: two little "magnitude in time" drawings filling in as time sweeps by.

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Ev {
  t: number;
  m: number;
}

const SWARM: Ev[] = (() => {
  const r = mulberry32(7);
  return Array.from({ length: 26 }, () => ({ t: 0.04 + r() * 0.9, m: 2 + r() * 1.3 + (r() < 0.12 ? 0.6 : 0) })).sort(
    (a, b) => a.t - b.t,
  );
})();

const AFTERSHOCKS: Ev[] = (() => {
  const r = mulberry32(11);
  const c = 0.012;
  const span = 0.9;
  const after = Array.from({ length: 30 }, () => {
    // Omori's decay: a rate falling as 1 / (t + c), sampled through its inverse.
    const t = 0.06 + c * ((span / c + 1) ** r() - 1);
    // Gutenberg–Richter with b = 1: each magnitude up, ten times fewer.
    const m = Math.min(4.6, 2 - Math.log10(Math.max(r(), 1e-3)));
    return { t, m };
  });
  return [{ t: 0.05, m: 6.2 }, ...after].sort((a, b) => a.t - b.t);
})();

/** How long the sweep takes to cross a panel: `seq-sweep` in `figures.css`, less its fade. */
const SWEEP_S = 3.45;
const SEQ_W = 132;

function Panel({ x, label, events }: { x: number; label: string; events: Ev[] }) {
  return (
    <g transform={`translate(${x} 0)`}>
      <text x={0} y={12} className={STRONG}>
        {label}
      </text>
      <line x1={0} x2={SEQ_W} y1={96} y2={96} className="stroke-border" />
      {events.map((e, i) => {
        const cx = e.t * SEQ_W;
        const h = (e.m - 1.6) * 13;
        const big = e.m > 5;
        return (
          <g key={i} data-seq="event" style={{ "--d": `${(e.t * SWEEP_S).toFixed(2)}s` } as CSSProperties}>
            <line x1={cx} x2={cx} y1={96} y2={96 - h} className={big ? "stroke-chart-2" : "stroke-chart-1/60"} />
            <circle
              cx={cx}
              cy={96 - h}
              r={1.6 + Math.max(0, e.m - 2) * (big ? 1.1 : 0.8)}
              className={big ? "fill-chart-2" : "fill-chart-1"}
            />
          </g>
        );
      })}
      <line
        x1={0}
        x2={0}
        y1={20}
        y2={96}
        strokeDasharray="2 3"
        style={{ "--w": `${SEQ_W}px` } as CSSProperties}
        data-seq="sweep"
        className="stroke-muted-foreground"
      />
    </g>
  );
}

function Sequence({ lang }: { lang: Lang }) {
  const w = WORDS[lang].fig;
  return (
    <>
      <svg viewBox="0 0 300 104" aria-hidden className={SVG}>
        <Panel x={8} label={w.swarm} events={SWARM} />
        <Panel x={160} label={w.aftershocks} events={AFTERSHOCKS} />
      </svg>
      <figcaption className="text-xs text-muted-foreground">
        {w.time} → · {w.heightIsMagnitude}
      </figcaption>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Energy: squares true to energy. M6 grows out of M5 and M7 out of M6, each 32 times the area.

const E_X = 20;
const E_BASE = 150;
const E5 = 4;
const E6 = E5 * Math.sqrt(32);
const E7 = E6 * Math.sqrt(32);

function Energy({ lang }: { lang: Lang }) {
  const w = WORDS[lang].fig;
  const sq = (side: number) => ({ x: E_X, y: E_BASE - side, width: side, height: side });
  return (
    <>
      <svg viewBox="0 0 300 168" aria-hidden className={SVG}>
        <rect
          {...sq(E7)}
          style={{ "--from": E6 / E7 } as CSSProperties}
          data-energy="m7"
          className="origin-bottom-left fill-chart-2/20 stroke-chart-2 [transform-box:fill-box]"
        />
        <rect
          {...sq(E6)}
          style={{ "--from": E5 / E6 } as CSSProperties}
          data-energy="m6"
          className="origin-bottom-left fill-muted-foreground/40 stroke-muted-foreground [transform-box:fill-box]"
        />
        <rect {...sq(E5)} className="fill-foreground" />
        <text x={E_X} y={E_BASE + 15} className={STRONG}>
          M5
        </text>
        {/* The labels fade with their squares: a `--from` of 1 leaves them their size. */}
        <text
          x={E_X + E6 + 6}
          y={E_BASE - E6 + 10}
          style={{ "--from": 1 } as CSSProperties}
          data-energy="m6"
          className={STRONG}
        >
          M6 · {w.times32}
        </text>
        <text
          x={E_X + E7 + 6}
          y={E_BASE - E7 + 10}
          style={{ "--from": 1 } as CSSProperties}
          data-energy="m7"
          className={STRONG}
        >
          M7 · {w.times1000}
        </text>
      </svg>
      <figcaption className="text-xs text-muted-foreground">{w.areaIsEnergy}</figcaption>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Hypocentre and epicentre: where the rock breaks, underground, and the point on the map above it.

function Hypocentre({ lang }: { lang: Lang }) {
  const w = WORDS[lang].fig;
  const hx = 150;
  const hy = 112;
  const ground = 36;
  return (
    <>
      <svg viewBox="0 0 300 150" aria-hidden className={SVG}>
        <rect x={0} y={ground} width={300} height={114} className="fill-muted-foreground/15" />
        <line x1={0} x2={300} y1={ground} y2={ground} className="stroke-muted-foreground" />
        {[0, 1, 2].map((i) => (
          <circle
            key={i}
            cx={hx}
            cy={hy}
            r={78}
            style={{ "--d": `${i * 0.8}s`, "--rest": 0.35 + i * 0.3 } as CSSProperties}
            data-wave=""
            fill="none"
            className="origin-center stroke-chart-2 [transform-box:fill-box]"
          />
        ))}
        <line x1={hx} x2={hx} y1={ground} y2={hy} strokeDasharray="3 3" className="stroke-foreground" />
        <circle cx={hx} cy={hy} r={5} className="fill-chart-2" />
        <path
          d={`M${hx} ${ground - 11} l3.2 6.6 7.3 1 -5.3 5.1 1.3 7.2 -6.5 -3.4 -6.5 3.4 1.3 -7.2 -5.3 -5.1 7.3 -1z`}
          className="fill-foreground"
        />
        <text x={hx + 14} y={ground - 10} className={STRONG}>
          {w.epicentre}
        </text>
        <text x={hx + 12} y={hy + 4} className={STRONG}>
          {w.hypocentre}
        </text>
        <text x={hx - 8} y={(ground + hy) / 2 + 4} textAnchor="end" className={LABEL}>
          {w.depth}
        </text>
      </svg>
      <figcaption className="text-xs text-muted-foreground">{w.surfaceAbove}</figcaption>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Subduction: the ocean plate sinking under South America at the trench, its dashes drifting down.

function Subduction({ lang }: { lang: Lang }) {
  const w = WORDS[lang].fig;
  return (
    <>
      <svg viewBox="0 0 300 150" aria-hidden className={SVG}>
        {/* Sea, then the continent rising from the trench to the mountains, resting on the plate. */}
        <path d="M0 40 H108 V46 H0 Z" className="fill-chart-1/25" />
        <path
          d="M108 46 L122 36 L170 30 L200 16 L214 26 L232 12 L252 26 L300 24 V128 Q130 50 100 46 Z"
          className="fill-muted-foreground/15"
        />
        {/* The plate: along the sea floor, then bending down under the continent. */}
        <path d="M0 46 H100 Q130 50 300 128 V150 L300 150 Q140 70 100 64 H0 Z" className="fill-muted-foreground/40" />
        <path
          d="M0 46 H100 Q130 50 300 128"
          strokeDasharray="8 12"
          strokeWidth={2}
          data-drift=""
          fill="none"
          className="stroke-muted-foreground"
        />
        <path d="M262 108 l14 8 -15 3" fill="none" className="stroke-foreground" strokeWidth={1.5} />
        <text x={8} y={78} className={STRONG}>
          {w.nazca}
        </text>
        <text x={8} y={34} className={LABEL}>
          {w.pacific}
        </text>
        <text x={190} y={60} className={STRONG}>
          {w.southAmerica}
        </text>
        <text x={112} y={12} textAnchor="end" className={LABEL}>
          {w.trench} ↓
        </text>
      </svg>
      <figcaption className="text-xs text-muted-foreground">{w.plateSinks}</figcaption>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// The depth groups: two clouds of events, split at 70 km, with nearly none between.

const DG = (() => {
  const r = mulberry32(3);
  const cloud = (n: number, cx: number, cy: number, sx: number, sy: number) =>
    Array.from({ length: n }, () => ({ x: cx + (r() - 0.5) * sx, y: cy + (r() - 0.5) * sy }));
  return { shallow: cloud(34, 170, 58, 100, 22), deep: cloud(14, 220, 108, 60, 26) };
})();

function DepthGroups({ lang }: { lang: Lang }) {
  const w = WORDS[lang].fig;
  const cut = 84;
  return (
    <>
      <svg viewBox="0 0 300 140" aria-hidden className={SVG}>
        <line x1={0} x2={300} y1={16} y2={16} className="stroke-muted-foreground" />
        <line x1={0} x2={300} y1={cut} y2={cut} strokeDasharray="3 3" className="stroke-foreground" />
        <text x={296} y={cut - 4} textAnchor="end" className={LABEL}>
          70 km
        </text>
        {DG.shallow.map((p, i) => (
          <circle key={`s${i}`} cx={p.x} cy={p.y} r={2.4} className="fill-chart-1" />
        ))}
        {DG.deep.map((p, i) => (
          <circle key={`d${i}`} cx={p.x} cy={p.y} r={2.4} className="fill-chart-4" />
        ))}
        <text x={8} y={62} className={STRONG}>
          {w.shallow}
        </text>
        <text x={8} y={112} className={STRONG}>
          {w.deep}
        </text>
      </svg>
      <figcaption className="text-xs text-muted-foreground">{w.depthDown}</figcaption>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// The monitor's charts (issue #145), each a small version of the chart with its marks named. Made-up
// numbers, chosen to show the reading, never the catalogue's.

// "Distribución frecuencia–magnitud": squares per magnitude, circles for that magnitude or larger, the
// line above Mc and, dashed, where it would go below Mc, which is where the small events are missing.
// The counts peak just below Mc, as a maximum-curvature Mc puts it (the most common magnitude + 0.2).
const FMD_BINS: [number, number][] = [
  [2.0, 20],
  [2.2, 40],
  [2.4, 70],
  [2.6, 60],
  [2.8, 38],
  [3.0, 24],
  [3.2, 15],
  [3.4, 10],
  [3.6, 6],
  [3.8, 4],
  [4.0, 2],
  [4.2, 1],
  [4.4, 1],
];
const FMD_MC = 2.6;
const FMD_BASE = 112;
const fmdX = (m: number) => 40 + ((m - 2) / 2.4) * 240;
const fmdY = (n: number) => FMD_BASE - Math.log10(n) * 32;
const FMD_CUMULATIVE = FMD_BINS.map(([m], i) => [m, FMD_BINS.slice(i).reduce((s, [, n]) => s + n, 0)] as const);
const FMD_AT_MC = FMD_CUMULATIVE.find(([m]) => m === FMD_MC)![1];
/** Gutenberg–Richter with b = 1 through the cumulative count at Mc. */
const fmdLine = (m: number) => FMD_AT_MC * 10 ** -(m - FMD_MC);

function Fmd({ lang }: { lang: Lang }) {
  const w = WORDS[lang].fig;
  const mcX = fmdX(FMD_MC);
  return (
    <>
      <svg viewBox="0 0 300 136" aria-hidden className={SVG}>
        {[10, 100].map((n) => (
          <line key={n} x1={34} x2={290} y1={fmdY(n)} y2={fmdY(n)} strokeDasharray="2 3" className="stroke-border" />
        ))}
        <line x1={34} x2={290} y1={FMD_BASE} y2={FMD_BASE} className="stroke-border" />
        {[1, 10, 100].map((n) => (
          <text key={n} x={30} y={fmdY(n) + 4} textAnchor="end" className={LABEL}>
            {n}
          </text>
        ))}
        <line x1={mcX} x2={mcX} y1={16} y2={FMD_BASE} strokeDasharray="2 3" className="stroke-foreground" />
        <text x={mcX + 5} y={12} className={STRONG}>
          Mc
        </text>
        <text x={mcX - 6} y={12} textAnchor="end" className={LABEL}>
          {w.missedSmall}
        </text>
        {/* Where the line would go below Mc, if no small event were missed. */}
        <line
          x1={fmdX(2)}
          x2={mcX}
          y1={fmdY(fmdLine(2))}
          y2={fmdY(FMD_AT_MC)}
          strokeDasharray="3 3"
          className="stroke-muted-foreground"
        />
        <line
          x1={mcX}
          x2={fmdX(4.4)}
          y1={fmdY(FMD_AT_MC)}
          y2={fmdY(fmdLine(4.4))}
          strokeWidth={2}
          className="stroke-foreground"
        />
        <text x={fmdX(3.6)} y={fmdY(fmdLine(3.2))} className={STRONG}>
          {w.slopeIsB}
        </text>
        {FMD_BINS.map(([m, n]) => (
          <rect key={m} x={fmdX(m) - 3} y={fmdY(n) - 3} width={6} height={6} className="fill-chart-3" />
        ))}
        {FMD_CUMULATIVE.map(([m, n]) => (
          <circle key={m} cx={fmdX(m)} cy={fmdY(n)} r={3.2} className="fill-chart-1" />
        ))}
        {[2, 3, 4].map((m) => (
          <text key={m} x={fmdX(m)} y={FMD_BASE + 16} textAnchor="middle" className={LABEL}>
            M{m}
          </text>
        ))}
      </svg>
      <figcaption className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 bg-chart-3" />
          {w.eachMagnitude}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-chart-1" />
          {w.orLarger}
        </span>
        <span>{w.eventsPerMagnitudeLog}</span>
      </figcaption>
    </>
  );
}

// "Valor b en el tiempo": a window of 8 events steps along the catalogue 2 at a time (the page's are 150
// and 10), and each step adds its b at its last event. It plays once and rests on the last window; the
// dots are on the windows that share no event, counted back from the latest as the chart counts them.
const BW_EVENTS = (() => {
  const r = mulberry32(5);
  const raw: number[] = [];
  let x = 0;
  for (let i = 0; i < 26; i++) {
    raw.push(x);
    x += 6 + r() * 14;
  }
  const end = raw.at(-1)!;
  return raw.map((v) => 22 + (v / end) * 256);
})();
const BW_SIZE = 8;
const BW_STEP = 2;
const BW_B = [1.05, 1.0, 0.98, 0.92, 0.88, 0.85, 0.8, 0.77, 0.75, 0.73];
const BW_SIGMA = 0.08;
/** One step of the window, in seconds: `--d` in `figures.css`. */
const BW_TICK = 0.35;
const bwY = (b: number) => 102 - (b - 0.55) * 120;
const BW_DOTS = new Set(BW_B.map((_, k) => k).filter((k) => (BW_B.length - 1 - k) % (BW_SIZE / BW_STEP) === 0));
const BW_WINDOWS = BW_B.map((b, k) => ({
  b,
  first: BW_EVENTS[k * BW_STEP]!,
  last: BW_EVENTS[k * BW_STEP + BW_SIZE - 1]!,
  y: bwY(b),
}));

function BWindows({ lang }: { lang: Lang }) {
  const w = WORDS[lang].fig;
  const lastK = BW_WINDOWS.length - 1;
  return (
    <>
      <svg viewBox="0 0 300 150" aria-hidden className={SVG}>
        <text x={4} y={14} className={LABEL}>
          b
        </text>
        {BW_WINDOWS.map((v, k) => {
          const prev = BW_WINDOWS[k - 1];
          return (
            <g key={k} data-bw="point" style={{ "--d": `${(k * BW_TICK).toFixed(2)}s` } as CSSProperties}>
              {prev ? (
                <>
                  <path
                    d={`M${prev.last} ${bwY(prev.b + BW_SIGMA)} L${v.last} ${bwY(v.b + BW_SIGMA)} L${v.last} ${bwY(v.b - BW_SIGMA)} L${prev.last} ${bwY(prev.b - BW_SIGMA)} Z`}
                    className="fill-chart-1/15"
                  />
                  <line x1={prev.last} x2={v.last} y1={prev.y} y2={v.y} strokeWidth={2} className="stroke-chart-1" />
                </>
              ) : null}
              {BW_DOTS.has(k) ? <circle cx={v.last} cy={v.y} r={3.5} className="fill-chart-1" /> : null}
            </g>
          );
        })}
        {/* One window at a time: each shows for its own step, and the last one stays. */}
        {BW_WINDOWS.map((v, k) => (
          <g
            key={k}
            data-bw={k === lastK ? "last" : "window"}
            style={{ "--d": `${(k * BW_TICK).toFixed(2)}s` } as CSSProperties}
          >
            <rect
              x={v.first - 4}
              y={110}
              width={v.last - v.first + 8}
              height={20}
              rx={4}
              className="fill-chart-1/15 stroke-chart-1"
            />
            <line x1={v.last} x2={v.last} y1={v.y + 4} y2={110} strokeDasharray="2 3" className="stroke-chart-1" />
            <text x={v.first - 4} y={144} className={STRONG}>
              {w.window}
            </text>
          </g>
        ))}
        {BW_EVENTS.map((x) => (
          <line key={x} x1={x} x2={x} y1={114} y2={126} className="stroke-foreground" />
        ))}
      </svg>
      <figcaption className="text-xs text-muted-foreground">
        {w.time} → · {w.onePointPerWindow}
      </figcaption>
    </>
  );
}

// "Magnitud en el tiempo": a large earthquake and its aftershocks, each a dot at its time and magnitude,
// and under them the events of each day. A slower decay than the sequence drawing's, so the dots reach
// across the whole span as the chart's do.
const MT_DAYS = 14;
const mtX = (t: number) => 20 + t * 270;
const mtY = (m: number) => 88 - (m - 1.8) * 16;
const MT_MAIN: Ev = { t: 0.03, m: 6.2 };
const MT_EVENTS: Ev[] = (() => {
  const r = mulberry32(13);
  const c = 0.06;
  const span = 0.95;
  return Array.from({ length: 56 }, () => {
    // Omori's decay, sampled through its inverse, and Gutenberg–Richter with b = 1, as in `AFTERSHOCKS`.
    const t = 0.04 + c * ((span / c + 1) ** r() - 1);
    const m = Math.min(4.6, 2 - Math.log10(Math.max(r(), 1e-3)));
    return { t, m };
  });
})();
const MT_COUNTS = (() => {
  const c = Array.from({ length: MT_DAYS }, () => 0);
  for (const e of [MT_MAIN, ...MT_EVENTS]) c[Math.min(MT_DAYS - 1, Math.floor(e.t * MT_DAYS))]! += 1;
  return c;
})();
const MT_MAX = Math.max(...MT_COUNTS);
const MT_DAY_W = 270 / MT_DAYS;

function MagnitudeTime({ lang }: { lang: Lang }) {
  const w = WORDS[lang].fig;
  const sx = mtX(MT_MAIN.t);
  const sy = mtY(MT_MAIN.m);
  return (
    <>
      <svg viewBox="0 0 300 134" aria-hidden className={SVG}>
        <line x1={14} x2={294} y1={90} y2={90} className="stroke-border" />
        {MT_EVENTS.map((e, i) => (
          <circle key={i} cx={mtX(e.t)} cy={mtY(e.m)} r={2.4} className="fill-chart-1" />
        ))}
        <path
          d={`M${sx} ${sy - 9} l2.6 5.4 6 .8 -4.3 4.2 1 5.9 -5.3 -2.8 -5.3 2.8 1 -5.9 -4.3 -4.2 6 -.8z`}
          className="fill-chart-2"
        />
        <text x={sx + 12} y={sy + 4} className={STRONG}>
          {w.mainshock}
        </text>
        {MT_COUNTS.map((n, i) => {
          const h = (n / MT_MAX) * 30;
          return (
            <rect
              key={i}
              x={20 + i * MT_DAY_W + 2}
              y={128 - h}
              width={MT_DAY_W - 4}
              height={h}
              rx={1}
              className="fill-chart-1/60"
            />
          );
        })}
        <line x1={14} x2={294} y1={128} y2={128} className="stroke-border" />
        <text x={294} y={112} textAnchor="end" className={LABEL}>
          {w.perDay}
        </text>
      </svg>
      <figcaption className="text-xs text-muted-foreground">
        {w.time} → · {w.heightIsMagnitude}
      </figcaption>
    </>
  );
}
