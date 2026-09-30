// PROTOTYPE (issue #144): throwaway. Two small animated SVGs that explain a term by movement.
import { useEffect, useState } from "react";
import { cn } from "cn";
import { useReducedMotion } from "@/insights/use-reduced-motion";
import type { Lang } from "@/lib/startup";
import { CARD_COPY } from "./entries.prototype";

// ---------------------------------------------------------------------------------------------
// b-value: three columns of event counts on a log scale, and the line through their tops, tilting
// between b = 1 and a lower b. The counts say the ratio in numbers.

const B_STATES = {
  1: { counts: ["100", "10", "1"], logs: [2, 1, 0], angle: 25.3 },
  0.7: { counts: ["100", "≈20", "≈4"], logs: [2, 1.3, 0.6], angle: 18.3 },
} as const;
type B = keyof typeof B_STATES;

const BASE = 112;
const UNIT = 38;
const PAD = 0.35;
const FULL = (2 + PAD) * UNIT;
const COLS = [70, 150, 230];

export function BValueFigure({ lang, large = false }: { lang: Lang; large?: boolean }) {
  const reduced = useReducedMotion();
  const [b, setB] = useState<B>(1);
  const [auto, setAuto] = useState(true);
  const k = CARD_COPY[lang];

  useEffect(() => {
    if (!auto || reduced) return;
    const id = window.setInterval(() => setB((x) => (x === 1 ? 0.7 : 1)), 2400);
    return () => window.clearInterval(id);
  }, [auto, reduced]);

  const s = B_STATES[b];
  const move = reduced ? "" : "transition-transform duration-700 ease-(--ease-slide)";
  return (
    <figure className="flex flex-col gap-2">
      <svg viewBox="0 0 300 136" className={cn("w-full", large ? "max-h-56" : "max-h-36")} aria-hidden>
        <line x1={30} x2={290} y1={BASE} y2={BASE} className="stroke-border" />
        {COLS.map((x, i) => {
          const h = (s.logs[i]! + PAD) * UNIT;
          return (
            <g key={x}>
              <rect
                x={x - 22}
                y={BASE - FULL}
                width={44}
                height={FULL}
                rx={3}
                className={cn("fill-chart-1/80", move)}
                style={{ transformBox: "fill-box", transformOrigin: "bottom", transform: `scaleY(${h / FULL})` }}
              />
              <text
                x={x}
                y={BASE - 6}
                textAnchor="middle"
                className={cn("fill-foreground text-[12px] font-semibold tabular-nums", move)}
                style={{ transform: `translateY(${-h}px)` }}
              >
                {s.counts[i]}
              </text>
              <text x={x} y={BASE + 16} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                M{i + 2}
              </text>
            </g>
          );
        })}
        <line
          x1={COLS[0]}
          x2={COLS[0]! + 172}
          y1={BASE - FULL}
          y2={BASE - FULL}
          className={cn("stroke-chart-2 [stroke-dasharray:5_4]", move)}
          strokeWidth={2}
          style={{
            transformBox: "view-box",
            transformOrigin: `${COLS[0]}px ${BASE - FULL}px`,
            transform: `rotate(${s.angle}deg)`,
          }}
        />
      </svg>
      <figcaption className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{k.counts}</span>
        <span className="inline-flex rounded-md border p-0.5" role="group" aria-label="b">
          {([1, 0.7] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={b === v}
              onClick={() => {
                setAuto(false);
                setB(v);
              }}
              className={cn(
                "rounded-sm px-2 py-0.5 tabular-nums",
                b === v ? "bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
            >
              b = {v}
            </button>
          ))}
        </span>
      </figcaption>
    </figure>
  );
}

// ---------------------------------------------------------------------------------------------
// Swarm against aftershocks: two little "magnitude in time" drawings filling in as a clock sweeps.

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
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
  const T = 0.9;
  const after = Array.from({ length: 30 }, () => {
    const u = r();
    // Omori: rate ~ 1/(t + c), sampled by its inverse CDF.
    const t = 0.06 + c * ((T / c + 1) ** u - 1);
    const m = Math.min(4.6, 2 - Math.log10(Math.max(r(), 1e-3)));
    return { t, m };
  });
  return [{ t: 0.05, m: 6.2 }, ...after].sort((a, b) => a.t - b.t);
})();

const SWEEP_MS = 5200;
const HOLD_MS = 1600;

function useClock(run: boolean) {
  const [t, setT] = useState(run ? 0 : 1);
  useEffect(() => {
    if (!run) return;
    const start = performance.now();
    const id = window.setInterval(() => {
      const e = (performance.now() - start) % (SWEEP_MS + HOLD_MS);
      setT(Math.min(1, e / SWEEP_MS) + (e > SWEEP_MS + HOLD_MS - 300 ? 1 : 0));
    }, 50);
    return () => window.clearInterval(id);
  }, [run]);
  return run ? t : 1;
}

function Panel({ x, label, events, clock }: { x: number; label: string; events: Ev[]; clock: number }) {
  const W = 132;
  const fading = clock > 1;
  return (
    <g transform={`translate(${x} 0)`}>
      <text x={0} y={12} className="fill-foreground text-[12px] font-semibold">
        {label}
      </text>
      <line x1={0} x2={W} y1={96} y2={96} className="stroke-border" />
      {events.map((e, i) => {
        const cx = e.t * W;
        const h = (e.m - 1.6) * 13;
        const shown = !fading && e.t <= clock;
        return (
          <g
            key={i}
            className={cn("transition-opacity duration-300", shown ? "opacity-100" : "opacity-0")}
          >
            <line x1={cx} x2={cx} y1={96} y2={96 - h} className="stroke-chart-1/60" />
            <circle
              cx={cx}
              cy={96 - h}
              r={1.6 + Math.max(0, e.m - 2) * (e.m > 5 ? 1.1 : 0.8)}
              className={e.m > 5 ? "fill-chart-2" : "fill-chart-1"}
            />
          </g>
        );
      })}
      {clock < 1 ? (
        <line x1={clock * W} x2={clock * W} y1={20} y2={96} className="stroke-muted-foreground/50 [stroke-dasharray:2_3]" />
      ) : null}
    </g>
  );
}

export function SwarmFigure({ lang, large = false }: { lang: Lang; large?: boolean }) {
  const reduced = useReducedMotion();
  const clock = useClock(!reduced);
  const k = CARD_COPY[lang];
  return (
    <figure className="flex flex-col gap-1">
      <svg viewBox="0 0 300 104" className={cn("w-full", large ? "max-h-52" : "max-h-32")} aria-hidden>
        <Panel x={8} label={k.swarm} events={SWARM} clock={clock} />
        <Panel x={160} label={k.aftershocks} events={AFTERSHOCKS} clock={clock} />
      </svg>
      <figcaption className="flex justify-between text-xs text-muted-foreground">
        <span>{k.time} →</span>
        <span>{k.height}</span>
      </figcaption>
    </figure>
  );
}
