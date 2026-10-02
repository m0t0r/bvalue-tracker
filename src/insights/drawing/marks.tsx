/**
 * Marks both tabs' drawings draw: the page's halo, a town and Pereira. The colours per source are the
 * page's, in `../tones.ts`.
 */
import type { SVGProps } from "react";

/**
 * Text with the page's halo: a stroke of the background's colour, `halo` px wide, painted under the
 * letters, so a line or a dot it crosses cannot break them. Every text on a drawing that may cross
 * its marks is one of these.
 */
export function HaloText({ halo = 4, className, ...text }: SVGProps<SVGTextElement> & { halo?: number }) {
  return (
    <text
      {...text}
      paintOrder="stroke"
      strokeWidth={halo}
      className={className ? `${className} stroke-background` : "stroke-background"}
    />
  );
}

/**
 * A town the reader knows: a grey dot and its name with the page's halo, 5 px right and 4 px down of
 * it on a map, or `above` it on a cut's surface. A drawing that scales with its column passes its
 * viewBox units per pixel as `k`, which sizes the name and its halo in screen pixels.
 */
export function TownMark({
  x,
  y,
  name,
  fontSize,
  k = 1,
  dot = 2.2,
  above = false,
}: {
  x: number;
  y: number;
  name: string;
  fontSize: number;
  k?: number;
  /** The dot's radius: 2.2 on the story's drawings, 2 on the questions tab's map. */
  dot?: number;
  above?: boolean;
}) {
  return (
    <g transform={`translate(${x},${y})`}>
      <circle r={dot} className="fill-muted-foreground" />
      <HaloText
        x={above ? 0 : 5}
        y={above ? -7 : 4}
        textAnchor={above ? "middle" : undefined}
        fontSize={fontSize * k}
        halo={3 * k}
        className="fill-muted-foreground"
      >
        {name}
      </HaloText>
    </g>
  );
}

/**
 * How a drawing draws Pereira: its faint disc, its dot and outline, and its label's place, size and
 * halo, in px (the label's size and halo are scaled by `PereiraMark`'s `k`, as `TownMark`'s are).
 */
export interface PereiraLook {
  disc: number;
  /** Whether the disc pulses (`animate-beacon`; never under reduced motion). */
  beacon: boolean;
  dot: number;
  outline: number;
  /** The label's start, right of the dot; its baseline is 8 px above it. */
  dx: number;
  fontSize: number;
  weight: number;
  halo: number;
}

/** The story's Pereira, on a phone and wider. */
export const pereiraLook = (small: boolean): PereiraLook => ({
  disc: small ? 10 : 13,
  beacon: true,
  dot: small ? 4.5 : 5.5,
  outline: 2,
  dx: small ? 8 : 10,
  fontSize: small ? 12 : 14,
  weight: 650,
  halo: 4,
});

/**
 * Pereira, the reader's own place, in its own red (`--place`); the label stays in the text colour. A
 * drawing that scales with its column passes its viewBox units per pixel as `k`, as for `TownMark`.
 */
export function PereiraMark({
  x,
  y,
  label,
  look,
  k = 1,
}: {
  x: number;
  y: number;
  label: string;
  look: PereiraLook;
  k?: number;
}) {
  return (
    <g transform={`translate(${x},${y})`}>
      <circle
        r={look.disc}
        className={
          look.beacon
            ? "origin-center fill-place/25 [transform-box:fill-box] motion-safe:animate-beacon"
            : "fill-place/25"
        }
      />
      <circle r={look.dot} className="fill-place stroke-background" strokeWidth={look.outline} />
      <HaloText
        x={look.dx}
        y={-8}
        fontSize={look.fontSize * k}
        fontWeight={look.weight}
        halo={look.halo * k}
        className="fill-foreground"
      >
        {label}
      </HaloText>
    </g>
  );
}
