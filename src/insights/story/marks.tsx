/**
 * Small shared pieces of the story's drawings and prose: dot sizes, the star, and the inline markers
 * the text uses. The colours per source are the page's, in `../tones.ts`.
 */
import type { ReactNode } from "react";
import type { Source } from "../claims";
import { BG } from "../tones";

/** Dot radius for a magnitude, in px at scale `k`. Area grows with magnitude, never below a visible minimum. */
export const radius = (mag: number, k = 1) => Math.max(1.3, (mag - 1.6) * 1.15) * k;

/** A five-pointed star centred on the origin, for the mainshock. */
export function star(r: number) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push(`${(Math.cos(a) * rr).toFixed(2)},${(Math.sin(a) * rr).toFixed(2)}`);
  }
  return `M${pts.join("L")}Z`;
}

/** A diamond centred on the origin with half-diagonal `r`. */
export const diamond = (r: number) => `M0,${-r}L${r},0L0,${r}L${-r},0Z`;

/**
 * A source named in the prose: a dot of its colour beside the word, which stays in the text colour.
 * The colours are chart colours, not text colours, and several of them fall under 4.5:1 as text.
 */
export function SourceName({ source, children }: { source: Source; children: ReactNode }) {
  return (
    <span className="font-semibold whitespace-nowrap text-foreground">
      <span aria-hidden className={`mr-1.5 inline-block size-2.5 rounded-full align-middle ${BG[source]}`} />
      {children}
    </span>
  );
}

/** The mainshock named in the prose, with its star colour. */
export function MainName({ children }: { children: ReactNode }) {
  return (
    <span className="font-semibold whitespace-nowrap text-foreground">
      <span aria-hidden className="mr-1.5 inline-block size-2.5 rotate-45 bg-chart-2 align-middle" />
      {children}
    </span>
  );
}

/** A figure in running text. */
export function Num({ children }: { children: ReactNode }) {
  return <span className="font-semibold whitespace-nowrap text-foreground tabular-nums">{children}</span>;
}

/** A small print aside under a step. */
export function Note({ children }: { children: ReactNode }) {
  return <p className="border-l-2 pl-4 text-sm leading-relaxed text-muted-foreground">{children}</p>;
}

/** A drawing's title, top left, in small capitals. */
export function SceneTitle({ small, children }: { small: boolean; children: ReactNode }) {
  return (
    <text
      x={small ? 4 : 8}
      y={small ? 14 : 22}
      className="fill-muted-foreground uppercase"
      fontSize={small ? 10 : 11.5}
      fontWeight={500}
      letterSpacing="0.06em"
    >
      {children}
    </text>
  );
}

/**
 * One scene of the pinned drawing. Scenes cross-fade: only the current one is visible and takes
 * pointer events, and a reader who asked for less motion gets the swap without the fade.
 */
export function Layer({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <g
      aria-hidden={!on}
      data-on={on || undefined}
      className="pointer-events-none opacity-0 transition-opacity duration-500 data-on:pointer-events-auto data-on:opacity-100 data-on:delay-200 motion-reduce:transition-none"
    >
      {children}
    </g>
  );
}
