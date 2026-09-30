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
export type FigureId = "b-value" | "mc" | "sequence" | "energy" | "hypocentre" | "subduction" | "depth-groups";

const SVG = "block h-auto w-full overflow-visible";
const LABEL = "fill-muted-foreground text-xs";
const STRONG = "fill-foreground text-xs font-semibold";

/** The drawings whose motion is worth playing again; b's own buttons replay it, and Mc's is an entrance. */
const REPLAYABLE: ReadonlySet<FigureId> = new Set(["sequence", "energy", "hypocentre", "subduction"]);

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
