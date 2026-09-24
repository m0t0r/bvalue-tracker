/**
 * The story's two west–east cuts, through Chocó and through Chaparral: their frames, the plate and the
 * ground under them, their depth axis and a locator map for each. Both are true to scale and share
 * one scale, so the distance from each source down to the plate compares by eye (docs/science.md).
 */
import { geoMercator, geoPath } from "d3-geo";
import { useId, useMemo } from "react";
import type { Lang } from "@/lib/i18n";
import { PEREIRA } from "../claims";
import { plateAlong, type Cut, type Plate } from "../plate";
import { REGION } from "../region";
import { fmtKm } from "../shared";
import { storyCopy } from "./copy";

export const KM_PER_DEG = 111.2;
/**
 * The cuts' depth at least, deep enough for the plate under Pereira (its top ~125 km, its bottom
 * ~190 km there). Under Chaparral the plate's bottom (~222 km) runs past it, and is clipped.
 */
export const SECTION_DEPTH_KM = 200;
/** Where the plate's label starts, in degrees east of the trench (~13 km). */
const LABEL_EAST_OF_TRENCH = 0.12;

export interface Section {
  cut: Cut;
  plate: ({ lon: number } & Plate)[];
  lon0: number;
  lon1: number;
  x: (lon: number) => number;
  y: (depth: number) => number;
  px: number;
  x0: number;
  x1: number;
  maxDepth: number;
}

/** A cut and where it ends in the east. Every cut starts at its trench, where Slab2's model begins. */
export interface CutSpan {
  cut: Cut;
  lon1: number;
}

export const kmPerDegLon = (lat: number) => KM_PER_DEG * Math.cos((lat * Math.PI) / 180);
const spanKm = ({ cut, lon1 }: CutSpan) => (lon1 - cut.trenchLon) * kmPerDegLon(cut.lat);

/** The easternmost longitude a cut has ground for: a cut drawn past it would end without a surface. */
export const cutEnd = (cut: Cut) => cut.lon0 + (cut.elevationM.length - 1) * cut.step;

/**
 * Every cut's frame at one scale: the pixels per kilometre that fit the longest of the cuts in
 * `scaleBy` (all of them by default) and the depth, across and down alike. Each cut is then centred
 * in the width on its own, and ends no further east than its ground data.
 */
export function frameSections<K extends string>(
  spans: Record<K, CutSpan>,
  maxDepth: number,
  width: number,
  height: number,
  small: boolean,
  scaleBy: readonly NoInfer<K>[] = Object.keys(spans) as K[],
): Record<K, Section> {
  const padL = small ? 46 : 60;
  const padR = small ? 8 : 24;
  const top = small ? 64 : 104;
  const bottom = small ? 38 : 56;
  const clamped = (s: CutSpan): CutSpan => ({ cut: s.cut, lon1: Math.min(s.lon1, cutEnd(s.cut)) });
  const px = Math.max(
    0.01,
    Math.min(
      (height - top - bottom) / maxDepth,
      ...scaleBy.map((k) => (width - padL - padR) / spanKm(clamped(spans[k]))),
    ),
  );
  const out = {} as Record<K, Section>;
  for (const k of Object.keys(spans) as K[]) {
    const s = clamped(spans[k]);
    const km = spanKm(s);
    const perDeg = kmPerDegLon(s.cut.lat);
    const x0 = padL + (width - padL - padR - km * px) / 2;
    out[k] = {
      cut: s.cut,
      lon0: s.cut.trenchLon,
      lon1: s.lon1,
      x: (lon: number) => x0 + (lon - s.cut.trenchLon) * perDeg * px,
      y: (depth: number) => top + depth * px,
      px,
      x0,
      x1: x0 + km * px,
      maxDepth,
      plate: plateAlong(s.cut, s.lon1),
    };
  }
  return out;
}

/** The depth axis, the plate and the ground, and west and east along the bottom edge. */
export function SectionFrame({ sec, small, lang }: { sec: Section; small: boolean; lang: Lang }) {
  const c = storyCopy[lang].graphic;
  const fs = small ? 10 : 12;
  const ticks: number[] = [];
  for (let d = 0; d <= sec.maxDepth; d += small ? 40 : 20) ticks.push(d);
  return (
    <g>
      {ticks.map((d) => (
        <g key={d}>
          {d > 0 && <line x1={sec.x0} x2={sec.x1} y1={sec.y(d)} y2={sec.y(d)} className="stroke-border" />}
          <text
            x={sec.x0 - 6}
            y={sec.y(d) + 4}
            textAnchor="end"
            fontSize={fs - 1}
            className="fill-muted-foreground tabular-nums"
          >
            {d === 0 ? "0" : fmtKm(d)}
          </text>
        </g>
      ))}
      <PlateAndGround sec={sec} small={small} lang={lang} />
      <Locator sec={sec} small={small} />
      {/* West and east read along the bottom edge, clear of the labels on the surface. */}
      <text x={sec.x0} y={sec.y(sec.maxDepth) + (small ? 14 : 20)} fontSize={fs} className="fill-muted-foreground">
        {c.west}
      </text>
      <text
        x={sec.x1}
        y={sec.y(sec.maxDepth) + (small ? 14 : 20)}
        textAnchor="end"
        fontSize={fs}
        className="fill-muted-foreground"
      >
        {c.east}
      </text>
    </g>
  );
}

/**
 * The Nazca plate under the cut, as USGS's Slab2 models it, and the ground on top, true to scale.
 * The plate is its modelled body (top to top + thickness) with a lighter band for the model's stated
 * uncertainty about its top; both are clipped to the drawing. The ground is GEBCO's land and sea
 * floor, a thin edge at this scale, with the sea between the sea floor and sea level.
 */
function PlateAndGround({ sec, small, lang }: { sec: Section; small: boolean; lang: Lang }) {
  const c = storyCopy[lang].graphic;
  const clip = `sec-${useId().replace(/[^\w-]/g, "")}`;
  const fs = small ? 10 : 12;
  const pts = sec.plate;
  const xy = (lon: number, depth: number) => `${sec.x(lon).toFixed(1)},${sec.y(depth).toFixed(1)}`;
  const band = (upper: (p: Plate) => number, lower: (p: Plate) => number) =>
    pts.length < 2
      ? undefined
      : `M${pts.map((p) => xy(p.lon, upper(p))).join("L")}L${[...pts]
          .reverse()
          .map((p) => xy(p.lon, lower(p)))
          .join("L")}Z`;
  const ground = sec.cut.elevationM
    .map((m, i) => ({ lon: sec.cut.lon0 + i * sec.cut.step, km: -m / 1000 }))
    .filter((g) => g.lon >= sec.lon0 - 1e-9 && g.lon <= sec.lon1 + 1e-9);
  const surface = `M${ground.map((g) => xy(g.lon, g.km)).join("L")}`;
  const sea = `M${ground.map((g) => xy(g.lon, Math.max(0, g.km))).join("L")}L${xy(ground.at(-1)!.lon, 0)}L${xy(ground[0]!.lon, 0)}Z`;
  // The label sits in the plate's body just past the trench, west of the events, where it is shallow
  // enough to leave room for three lines above the drawing's bottom.
  const at = pts.find((p) => p.lon >= sec.cut.trenchLon + LABEL_EAST_OF_TRENCH);
  const trench = sec.x(sec.cut.trenchLon);

  return (
    <g>
      <defs>
        <clipPath id={clip}>
          <rect x={sec.x0} y={sec.y(0)} width={sec.x1 - sec.x0} height={sec.y(sec.maxDepth) - sec.y(0)} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <path
          d={band(
            (p) => p.topKm - p.uncertaintyKm,
            (p) => p.topKm + p.uncertaintyKm,
          )}
          className="fill-muted-foreground/10"
        />
        <path
          d={band(
            (p) => p.topKm,
            (p) => p.topKm + p.thicknessKm,
          )}
          className="fill-muted-foreground/20"
        />
        <path
          d={pts.length < 2 ? undefined : `M${pts.map((p) => xy(p.lon, p.topKm)).join("L")}`}
          fill="none"
          className="stroke-muted-foreground"
          strokeWidth={1.25}
        />
      </g>
      <path d={sea} className="fill-muted" />
      <path d={surface} fill="none" className="stroke-foreground" strokeWidth={1.5} strokeLinejoin="round" />
      <text x={trench} y={sec.y(0) - 6} fontSize={fs - 1} className="fill-muted-foreground">
        {c.trench}
      </text>
      {at && (
        <text
          x={sec.x(at.lon)}
          y={sec.y(at.topKm + at.thicknessKm * 0.35)}
          fontSize={fs}
          className="fill-foreground stroke-background"
          paintOrder="stroke"
          strokeWidth={4}
        >
          <tspan fontWeight={600}>{c.plate}</tspan>
          <tspan x={sec.x(at.lon)} dy="1.25em" fontSize={fs - 1} className="fill-muted-foreground">
            {c.plateModel}
          </tspan>
          {/* On a phone the third line reaches the shallow group; the prose explains the band. */}
          {!small && (
            <tspan x={sec.x(at.lon)} dy="1.25em" fontSize={fs - 1} className="fill-muted-foreground">
              {c.plateBand}
            </tspan>
          )}
        </text>
      )}
    </g>
  );
}

/** What every locator shows, whichever cut it is for: both zones, Pereira and the coast. */
const LOCATOR_BOX = {
  type: "MultiPoint" as const,
  coordinates: [
    [-79, 3.2],
    [-74.8, 5.6],
  ],
};

/**
 * Where the cut runs, on a small map in the drawing's lower-left corner: under the plate near the
 * trench, the one part of either cut the plate and the events leave empty. Pereira is marked in its
 * own red, so the reader sees that it lies on Chocó's cut and north of Chaparral's.
 */
function Locator({ sec, small }: { sec: Section; small: boolean }) {
  const clip = `loc-${useId().replace(/[^\w-]/g, "")}`;
  // Projected once per frame: the drawing re-renders on every step and slider change, and both
  // cuts' locators stay mounted (a layer only fades), each over the whole region's outlines.
  const { x, y, w, h, outlines, a, b, P } = useMemo(() => {
    const w = small ? 56 : 104;
    const h = small ? 38 : 72;
    const x = sec.x0 + 6;
    const y = sec.y(sec.maxDepth) - h - 6;
    const proj = geoMercator().fitExtent(
      [
        [x, y],
        [x + w, y + h],
      ],
      LOCATOR_BOX,
    );
    const path = geoPath(proj);
    return {
      x,
      y,
      w,
      h,
      outlines: REGION.features.map((f) => ({ name: f.properties.name, d: path(f) ?? undefined })),
      a: proj([sec.lon0, sec.cut.lat]),
      b: proj([sec.lon1, sec.cut.lat]),
      P: proj([PEREIRA.lon, PEREIRA.lat]),
    };
  }, [sec, small]);
  return (
    <g>
      <defs>
        <clipPath id={clip}>
          <rect x={x} y={y} width={w} height={h} />
        </clipPath>
      </defs>
      <rect x={x} y={y} width={w} height={h} className="fill-background stroke-border" />
      <g clipPath={`url(#${clip})`}>
        {outlines.map((o) => (
          <path key={o.name} d={o.d} className="fill-muted stroke-border" />
        ))}
      </g>
      {a && b && (
        <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className="stroke-foreground" strokeWidth={small ? 1.5 : 2} />
      )}
      {P && <circle cx={P[0]} cy={P[1]} r={small ? 2 : 2.5} className="fill-place" />}
    </g>
  );
}
