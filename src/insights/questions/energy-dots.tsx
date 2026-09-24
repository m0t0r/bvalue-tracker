/** Question 2: the reference earthquake's energy as ~126 000 dots, each an M4.0. */
import { energyRatio } from "@bvalue/seismo";
import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useIsDark } from "@/lib/theme";
import type { Insights, QuakeLike } from "../claims";
import { questionsCopy, type Named } from "./copy";
import { fmtInt, roundSig } from "../shared";
import { energyInUnits } from "./derive";
import { Choice, Figure, Swatch, useWidth } from "./ui";

type Compare = "rest" | "swarm" | "m5" | "m6" | "m7";

/** Cells the lens shows per side, and the lens's pixels per cell. */
const LENS = 24;
const PITCH = 6;

/** A CSS custom property's current value, which a canvas can take as a colour. */
const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export const pct = (part: number, whole: number) => {
  const v = (100 * part) / whole;
  return v >= 1 ? v.toFixed(1) : v >= 0.01 ? v.toFixed(2) : v.toFixed(3);
};

export function EnergyDots({ data, reference, refEvent }: { data: Insights; reference: Named; refEvent: QuakeLike }) {
  const { lang } = useI18n();
  const c = questionsCopy[lang].big;
  const dark = useIsDark();
  const [box, w] = useWidth();
  const canvas = useRef<HTMLCanvasElement>(null);
  const lens = useRef<HTMLCanvasElement>(null);
  const [compare, setCompare] = useState<Compare>("rest");

  const n = Math.max(1, Math.round(energyRatio(reference.mag, 4)));
  const amounts = useMemo(() => {
    const rest = [...data.sources.shallow, ...data.sources.deep].filter((e) => e !== refEvent);
    return {
      rest: energyInUnits(rest),
      swarm: energyInUnits(data.sources.tolima),
      m5: energyRatio(5, 4),
      m6: energyRatio(6, 4),
      m7: energyRatio(7, 4),
    } satisfies Record<Compare, number>;
  }, [data, refEvent]);
  // Only magnitudes smaller than the reference make sense as a part of it.
  const options: { key: Compare; label: string }[] = [
    { key: "rest", label: c.rest },
    { key: "swarm", label: c.swarm },
    ...([5, 6, 7] as const)
      .filter((m) => m < reference.mag)
      .map((m) => ({ key: `m${m}` as Compare, label: `M${m}.0` })),
  ];
  const k = Math.max(1, Math.round(amounts[compare]));
  const tone = compare === "swarm" ? "tolima" : compare === "rest" ? "shallow" : "mainshock";
  const toneVar = { tolima: "--chart-5", shallow: "--chart-1", mainshock: "--chart-2" }[tone];

  // The rectangle keeps a 2:1 box whatever the width, so it never changes height when it measures;
  // the cells shrink or grow to fill it.
  const cols = Math.ceil(Math.sqrt(n * 2));
  const rows = Math.ceil(n / cols);

  useEffect(() => {
    const el = canvas.current,
      zl = lens.current;
    if (!el || !zl || w === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const width = w,
      height = w / 2;
    const cell = width / cols;
    const grey = token("--chart-3"),
      hi = token(toneVar),
      fg = token("--foreground");
    const side = Math.ceil(Math.sqrt(k));

    el.width = Math.round(width * dpr);
    el.height = Math.round(height * dpr);
    const ctx = el.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const full = Math.floor(n / cols);
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = grey;
    ctx.fillRect(0, 0, width, full * cell);
    ctx.fillRect(0, full * cell, (n - full * cols) * cell, cell);
    ctx.globalAlpha = 1;
    ctx.fillStyle = hi;
    const blockRows = Math.floor(k / side);
    ctx.fillRect(0, 0, side * cell, blockRows * cell);
    ctx.fillRect(0, blockRows * cell, (k - blockRows * side) * cell, cell);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, Math.max(4, LENS * cell), Math.max(4, LENS * cell));

    const size = LENS * PITCH;
    zl.width = size * dpr;
    zl.height = size * dpr;
    const zc = zl.getContext("2d");
    if (!zc) return;
    zc.setTransform(dpr, 0, 0, dpr, 0, 0);
    zc.clearRect(0, 0, size, size);
    for (let j = 0; j < LENS; j++)
      for (let i = 0; i < LENS; i++) {
        const on = i < side && j * side + i < k;
        zc.globalAlpha = on ? 1 : 0.45;
        zc.fillStyle = on ? hi : grey;
        zc.beginPath();
        zc.arc(i * PITCH + PITCH / 2, j * PITCH + PITCH / 2, PITCH / 2 - 0.9, 0, Math.PI * 2);
        zc.fill();
      }
  }, [w, cols, rows, n, k, toneVar, dark]);

  const label = options.find((o) => o.key === compare)?.label ?? "";
  return (
    <Figure caption={`${c.caption} ${questionsCopy[lang].magTypes}`}>
      <div className="mb-4 flex flex-col gap-3">
        <p className="max-w-prose text-sm text-pretty text-muted-foreground">{c.intro(fmtInt(roundSig(n)))}</p>
        <Choice label={c.compare} value={compare} onChange={setCompare} options={options} />
      </div>
      <div ref={box} className="aspect-2/1 w-full min-w-0">
        <canvas
          ref={canvas}
          role="img"
          aria-label={c.aria(fmtInt(n), fmtInt(k), label)}
          className="block size-full rounded-xs"
        />
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-5">
        <div className="relative shrink-0 rounded-lg border bg-background p-2">
          <canvas ref={lens} aria-hidden className="block size-36" />
          <span className="absolute -top-2.5 left-2 bg-card px-1 text-2xs font-medium text-muted-foreground">
            {c.lens}
          </span>
        </div>
        <div className="min-w-48 flex-1">
          <p className="flex items-baseline gap-2">
            <Swatch source={tone} square />
            <span>
              <strong className="text-xl tabular-nums">{fmtInt(k)}</strong> {c.dots}{" "}
              <span className="text-muted-foreground">{c.ofRef(pct(k, n), reference)}</span>
            </span>
          </p>
          <p className="mt-2 text-sm text-pretty text-muted-foreground">{k <= LENS * LENS ? c.fits : c.noFit}</p>
        </div>
      </div>
    </Figure>
  );
}
