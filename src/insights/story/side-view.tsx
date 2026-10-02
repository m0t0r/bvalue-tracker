/**
 * The side view on the story's map: Pereira at the surface and each source's focus at its depth,
 * true to scale, on a card in a corner of the map. The map's lines measure distance over the surface;
 * these measure the straight line the prose gives, depth included. Layout in `side.ts`.
 */
import { useId } from "react";
import type { Lang } from "@/lib/i18n";
import { SOURCES, type Insights, type Source } from "../claims";
import { HaloText, overlaps, textBox, type Box, type textWidth } from "../drawing";
import { fmtKm } from "../shared";
import { FILL, STROKE } from "../tones";
import { storyCopy } from "./copy";
import { ARC_KM, sideFocus, sideScale } from "./side";

export interface SideLayout {
  width: number;
  height: number;
  small: boolean;
  title: string;
  fs: number;
  titleFs: number;
  dotR: number;
  /** Whether the arc's "120 km" is drawn: it is left off where it would run into Pereira's name. */
  arcLabel: boolean;
  /** Pereira's point, the ground's height and the arc's radius, px from the card's corner. */
  P: readonly [number, number];
  R: number;
  pad: number;
  foci: { source: Source; x: number; y: number; km: number; label: { x: number; y: number } }[];
}

/**
 * The card's size and everything in it, or null with no source to draw. It is sized before a corner
 * is chosen, so the corner can be chosen by what the card would cover.
 */
export function sideLayout(
  distances: Insights["distances"],
  {
    small,
    width,
    height,
    lang,
    measure,
  }: {
    small: boolean;
    width: number;
    height: number;
    lang: Lang;
    measure: typeof textWidth;
  },
): SideLayout | null {
  const c = storyCopy[lang].graphic;
  const sources = SOURCES.flatMap((s) => (distances[s] ? [{ s, d: distances[s], f: sideFocus(distances[s]) }] : []));
  if (sources.length === 0) return null;
  const pad = small ? 6 : 10;
  const fs = small ? 10 : 12;
  const titleFs = small ? 9.5 : 11;
  const dotR = small ? 3 : 3.5;
  const labelW = Math.max(...sources.map(({ d }) => measure(fmtKm(d.hypocentralKm), fs, { weight: 600 })));
  // At most a third of the drawing across and a sixth of a desktop's down, so the map stays the drawing.
  const s = sideScale(
    sources.map(({ f }) => f),
    small
      ? { width: Math.min(120, width * 0.33), height: 70 }
      : { width: Math.min(200, width * 0.3), height: Math.min(120, height * 0.17) },
  );
  const across = Math.max(ARC_KM, ...sources.map(({ f }) => f.acrossKm)) * s;
  const depth = Math.max(...sources.map(({ f }) => f.depthKm)) * s;
  const left = pad + labelW + dotR + 6;
  const ground = pad + titleFs + fs + 9;
  const plotW = left + across + dotR + 3 + pad;
  // The long title where it fits over the plot, else the short one, which widens the card if it must.
  const titles = small ? [c.sideTitleShort] : [c.sideTitle, c.sideTitleShort];
  const titleW = (t: string) => measure(t, titleFs, { weight: 500 }) + 2 * pad;
  const title = titles.find((t) => titleW(t) <= plotW) ?? titles.at(-1)!;
  const w = Math.max(plotW, titleW(title));
  const P = [w - pad - dotR - 3, ground] as const;
  const foci = sources.map(({ s: source, d, f }) => {
    const x = P[0] - f.acrossKm * s;
    const y = ground + f.depthKm * s;
    return { source, x, y, km: d.hypocentralKm, label: { x: x - dotR - 4, y: y + fs * 0.35 } };
  });
  // A label that would run into one above it, or into another focus's dot, moves down until it
  // clears, two pixels at a time.
  const dot = (f: (typeof foci)[number]): Box => ({
    x0: f.x - dotR,
    x1: f.x + dotR,
    y0: f.y - dotR,
    y1: f.y + dotR,
  });
  const placed: Box[] = [];
  for (const f of [...foci].sort((a, b) => a.y - b.y)) {
    const avoid = [...placed, ...foci.filter((o) => o !== f).map(dot)];
    const box = () => textBox({ ...f.label, width: labelW, fontSize: fs, anchor: "end" });
    while (avoid.some((b) => overlaps(box(), b, 2))) f.label.y += 2;
    placed.push(box());
  }
  const R = ARC_KM * s;
  const arcBox = textBox({
    x: P[0] - R,
    y: P[1] - 4,
    width: measure(fmtKm(ARC_KM), fs - 1.5),
    fontSize: fs - 1.5,
    anchor: "middle",
  });
  const pereiraBox = textBox({
    x: P[0] + 3,
    y: P[1] - 5,
    width: measure(storyCopy[lang].legend.pereira, fs - 1, { weight: 650 }),
    fontSize: fs - 1,
    anchor: "end",
  });
  const bottom = Math.max(depth + ground + dotR, ...placed.map((b) => b.y1));
  return {
    width: w,
    height: bottom + pad,
    small,
    title,
    fs,
    titleFs,
    dotR,
    arcLabel: !overlaps(arcBox, pereiraBox, 4) && arcBox.x0 >= pad,
    P,
    R,
    pad,
    foci,
  };
}

export function SideView({ at, layout, lang }: { at: Box; layout: SideLayout; lang: Lang }) {
  const c = storyCopy[lang];
  const clip = `side-${useId().replace(/[^\w-]/g, "")}`;
  const { width: w, height: h, P, R, pad, fs, titleFs, small, dotR } = layout;
  return (
    <g transform={`translate(${at.x0},${at.y0})`}>
      <rect width={w} height={h} rx={6} className="fill-background stroke-border" />
      <clipPath id={clip}>
        <rect x={0} y={P[1]} width={w} height={h - P[1]} />
      </clipPath>
      <text x={pad} y={pad + titleFs} fontSize={titleFs} fontWeight={500} className="fill-muted-foreground">
        {layout.title}
      </text>
      <line x1={pad} x2={w - pad} y1={P[1]} y2={P[1]} className="stroke-muted-foreground" strokeWidth={1} />
      {/*
        120 km in a straight line from Pereira. The figure is the map circle's, but the circle is 120 km
        over the surface: a group on the circle can lie outside the arc, which is the depth showing.
      */}
      <path
        d={`M${P[0] - R},${P[1]} A${R},${R} 0 0 0 ${P[0]},${P[1] + R}`}
        clipPath={`url(#${clip})`}
        fill="none"
        className="stroke-foreground/50"
        strokeWidth={1.25}
        strokeDasharray="4 5"
      />
      {layout.arcLabel && (
        <text
          x={P[0] - R}
          y={P[1] - 4}
          textAnchor="middle"
          fontSize={fs - 1.5}
          className="fill-muted-foreground tabular-nums"
        >
          {fmtKm(ARC_KM)}
        </text>
      )}
      {layout.foci.map((f) => (
        <line key={f.source} x1={P[0]} y1={P[1]} x2={f.x} y2={f.y} className={STROKE[f.source]} strokeWidth={1.75} />
      ))}
      {layout.foci.map((f) => (
        <g key={f.source}>
          <circle cx={f.x} cy={f.y} r={dotR} className={`${FILL[f.source]} stroke-background`} />
          <HaloText
            x={f.label.x}
            y={f.label.y}
            textAnchor="end"
            fontSize={fs}
            fontWeight={600}
            className="fill-foreground tabular-nums"
            halo={3}
          >
            {fmtKm(f.km)}
          </HaloText>
        </g>
      ))}
      <circle cx={P[0]} cy={P[1]} r={small ? 3.5 : 4} className="fill-place stroke-background" strokeWidth={1.5} />
      <text x={P[0] + 3} y={P[1] - 5} textAnchor="end" fontSize={fs - 1} fontWeight={650} className="fill-foreground">
        {c.legend.pereira}
      </text>
    </g>
  );
}
