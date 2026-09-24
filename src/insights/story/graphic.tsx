/**
 * The story's pinned drawing: one SVG whose scenes change as the reader scrolls. The map and the
 * west–east cross-section share one layer of event dots, which slide from their place on the map to
 * their depth when the earth is turned on its side. Every position comes from the data at render.
 */
import { geoCircle, geoMercator, geoPath, type GeoProjection } from "d3-geo";
import { quantileSorted } from "d3-array";
import { useId, useMemo, type CSSProperties } from "react";
import type { Lang } from "@/lib/i18n";
import { fmtDay } from "@/lib/format";
import { PEREIRA, SOURCES, type Insights, type Source } from "../claims";
import { REGION, TOWNS } from "../region";
import { insightsCopy } from "../copy";
import { storyCopy } from "./copy";
import { fmtKm } from "../shared";
import { FILL, STROKE } from "../tones";
import { Layer, SceneTitle, radius, star } from "./marks";
import type { Ev, StoryModel } from "./model";
import { Rich } from "./rich";
import { ClocksScene, EnergyScene, FeltScene, TolimaScene } from "./scenes";

export type SceneId = "where" | "energy" | "section" | "clocks" | "tolima" | "felt" | "unknown";
export interface SceneState {
  scene: SceneId;
  sub: string;
  threshold: number;
}

const KM_PER_DEG = 111.2;

/** Plain text for the drawing's text alternative: the template with its figures filled in. */
const fill = (t: string, v: Record<string, string>) => t.replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? "");

export function Graphic({
  data,
  model,
  state,
  width,
  height,
  lang,
}: {
  data: Insights;
  model: StoryModel;
  state: SceneState;
  width: number;
  height: number;
  lang: Lang;
}) {
  const c = storyCopy[lang].graphic;
  const share = insightsCopy[lang].claims.sharePhrase;
  const { scene, sub } = state;
  const small = width < 560;
  const k = small ? 0.8 : 1;

  // The map frames Pereira, the three sources and the bulk of the events, whatever the data holds.
  const map = useMemo(() => {
    const lons = model.all.map((e) => e.lon).sort((a, b) => a - b);
    const lats = model.all.map((e) => e.lat).sort((a, b) => a - b);
    const q = (xs: number[], p: number, fallback: number) => (xs.length ? quantileSorted(xs, p)! : fallback);
    const box = {
      type: "MultiPoint" as const,
      coordinates: [
        // West far enough to take in the Pacific coast, which is what makes the map read as Colombia.
        [
          Math.min(q(lons, 0.02, PEREIRA.lon), PEREIRA.lon) - 0.75,
          Math.min(q(lats, 0.02, PEREIRA.lat), PEREIRA.lat) - 0.25,
        ],
        [
          Math.max(q(lons, 0.98, PEREIRA.lon), PEREIRA.lon) + 0.3,
          Math.max(q(lats, 0.98, PEREIRA.lat), PEREIRA.lat) + 0.25,
        ],
      ],
    };
    const top = small ? 40 : 76;
    const proj = geoMercator().fitExtent(
      [
        [small ? 4 : 12, top],
        [Math.max(small ? 5 : 13, width - (small ? 4 : 12)), Math.max(top + 1, height - (small ? 8 : 16))],
      ],
      box,
    );
    return { proj, path: geoPath(proj), top };
  }, [model.all, width, height, small]);

  // The cross-section runs west–east through Chocó, true to scale: one pixel is the same distance
  // across and down. Its east edge reaches past Pereira so the reader sees where they stand.
  const sec = useMemo(() => {
    const lons = model.choco.map((e) => e.lon).sort((a, b) => a - b);
    const depths = model.choco.map((e) => e.depthKm).sort((a, b) => a - b);
    const lon0 = (lons.length ? quantileSorted(lons, 0.01)! : PEREIRA.lon - 1) - 0.12;
    const lon1 = Math.max(lons.length ? quantileSorted(lons, 0.99)! : PEREIRA.lon, PEREIRA.lon) + 0.15;
    const maxDepth = Math.max(120, Math.ceil(((depths.length ? quantileSorted(depths, 0.995)! : 100) + 10) / 20) * 20);
    const kmPerDegLon = KM_PER_DEG * Math.cos((PEREIRA.lat * Math.PI) / 180);
    const padL = small ? 46 : 60;
    const padR = small ? 8 : 24;
    const top = small ? 64 : 104;
    const bottom = small ? 38 : 56;
    const spanKm = (lon1 - lon0) * kmPerDegLon;
    const px = Math.max(0.01, Math.min((width - padL - padR) / spanKm, (height - top - bottom) / maxDepth));
    const x0 = padL + (width - padL - padR - spanKm * px) / 2;
    return {
      lon0,
      lon1,
      x: (lon: number) => x0 + (lon - lon0) * kmPerDegLon * px,
      y: (depth: number) => top + depth * px,
      px,
      x0,
      x1: x0 + spanKm * px,
      maxDepth,
    };
  }, [model.choco, width, height, small]);

  if (width === 0 || height === 0) return null;

  const onMap = scene === "where" || scene === "unknown";
  const onSec = scene === "section";
  const main = model.main;

  const pos = (e: Ev): [number, number] => {
    if (onSec && e.source !== "tolima") return [sec.x(e.lon), sec.y(e.depthKm)];
    return map.proj([e.lon, e.lat]) ?? [0, 0];
  };
  // On the cross-section, only Chocó's events inside the cut: the few beyond it would sit off the axes.
  const inCut = (e: Ev) => e.lon >= sec.lon0 && e.lon <= sec.lon1 && e.depthKm <= sec.maxDepth;
  const shown = (e: Ev) => onMap || (onSec && e.source !== "tolima" && inCut(e));

  const depthMedian = (s: Source) => data.distances[s]?.depthKm ?? null;
  // One text alternative for the whole drawing, for whichever scene is showing.
  const aria: Record<SceneId, string> = {
    where: c.mapAria,
    unknown: c.unknownAria,
    section: fill(c.sectionAria, {
      shallow: fmtKm(depthMedian("shallow") ?? 0),
      deep: fmtKm(depthMedian("deep") ?? 0),
    }),
    energy:
      sub === "ladder"
        ? c.ladderAria
        : fill(c.energyShareAria, { share: data.largestShare.choco === null ? "" : share(data.largestShare.choco) }),
    clocks: c.clocksAria,
    tolima: fill(c.tolimaAria, {
      choco: data.largestShare.choco === null ? "" : share(data.largestShare.choco),
      tolima: data.largestShare.tolima === null ? "" : share(data.largestShare.tolima),
    }),
    felt: sub === "waves" ? c.wavesAria : c.calendarAria,
  };

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block overflow-hidden select-none"
      role="img"
      aria-label={aria[scene]}
    >
      <Layer on={onMap}>
        <g>
          {REGION.features.map((f) => (
            <path key={f.properties.name} d={map.path(f) ?? undefined} className="fill-muted stroke-border" />
          ))}
        </g>
        <OceanLabel proj={map.proj} small={small} label={c.ocean} data={model} />
      </Layer>

      <Layer on={onSec}>
        <SectionBase data={data} model={model} sec={sec} small={small} sub={sub} lang={lang} />
      </Layer>

      {/* The dots the map and the cross-section share. Each slides on the compositor, deeper ones a
          little later, so the turn reads as the earth tipping rather than a cut. */}
      <g>
        {model.all.map((e) => {
          if (e.id === main?.id) return null;
          const [x, y] = pos(e);
          return (
            <circle
              key={e.id}
              r={radius(e.mag, k)}
              data-on={shown(e) || undefined}
              data-dim={scene === "unknown" || undefined}
              className={`${FILL[e.source]} translate-x-(--x) translate-y-(--y) opacity-0 transition delay-(--d) duration-1000 ease-(--ease-move) data-on:opacity-60 data-on:data-dim:opacity-25 motion-reduce:transition-none`}
              style={{ "--x": `${x}px`, "--y": `${y}px`, "--d": `${Math.min(400, e.depthKm * 3)}ms` } as CSSProperties}
            />
          );
        })}
        {main && (
          <path
            d={star(small ? 9 : 12)}
            data-on={onMap || onSec || undefined}
            className="translate-x-(--x) translate-y-(--y) fill-chart-2 stroke-background opacity-0 transition delay-300 duration-1000 ease-(--ease-move) data-on:opacity-100 motion-reduce:transition-none"
            strokeWidth={1.5}
            style={{ "--x": `${pos(main)[0]}px`, "--y": `${pos(main)[1]}px` } as CSSProperties}
          />
        )}
      </g>

      <Layer on={scene === "where"}>
        <WhereOverlay data={data} model={model} proj={map.proj} small={small} lang={lang} top={map.top} width={width} />
      </Layer>
      <Layer on={scene === "unknown"}>
        <UnknownOverlay model={model} proj={map.proj} small={small} />
      </Layer>
      <Layer on={onMap || onSec}>
        <SceneTitle small={small}>
          {onSec ? (
            c.sectionTitle
          ) : (
            <Rich text={c.mapTitle} parts={{ from: fmtDay(model.start, lang), to: fmtDay(data.now, lang) }} />
          )}
        </SceneTitle>
        <GroupLegend small={small} lang={lang} section={onSec} mainLabel={main ? `M${main.mag.toFixed(1)}` : null} />
      </Layer>

      <Layer on={scene === "energy"}>
        <EnergyScene data={data} model={model} width={width} height={height} sub={sub} small={small} lang={lang} />
      </Layer>
      <Layer on={scene === "clocks"}>
        <ClocksScene
          data={data}
          model={model}
          width={width}
          height={height}
          sub={sub}
          small={small}
          lang={lang}
          active={scene === "clocks"}
        />
      </Layer>
      <Layer on={scene === "tolima"}>
        <TolimaScene
          data={data}
          model={model}
          width={width}
          height={height}
          sub={sub}
          small={small}
          lang={lang}
          active={scene === "tolima"}
        />
      </Layer>
      <Layer on={scene === "felt"}>
        <FeltScene
          data={data}
          model={model}
          width={width}
          height={height}
          sub={sub}
          small={small}
          lang={lang}
          threshold={state.threshold}
          active={scene === "felt"}
        />
      </Layer>
    </svg>
  );
}

function OceanLabel({
  proj,
  small,
  label,
  data,
}: {
  proj: GeoProjection;
  small: boolean;
  label: string;
  data: StoryModel;
}) {
  // West of the westernmost events and south of Pereira, which on this coast is open sea.
  const lon = Math.min(...data.all.map((e) => e.lon)) - 0.08;
  const at = proj([lon, PEREIRA.lat - 0.75]);
  if (!at) return null;
  return (
    <text
      x={Math.max(small ? 4 : 12, at[0] - (small ? 70 : 110))}
      y={at[1]}
      className="fill-muted-foreground italic"
      fontSize={small ? 10 : 12}
    >
      {label}
    </text>
  );
}

function GroupLegend({
  small,
  lang,
  section,
  mainLabel,
}: {
  small: boolean;
  lang: Lang;
  section: boolean;
  mainLabel: string | null;
}) {
  const l = storyCopy[lang].legend;
  const items: { key: string; label: string; source?: Source }[] = [
    { key: "shallow", label: l.shallow, source: "shallow" },
    { key: "deep", label: l.deep, source: "deep" },
    ...(section ? [] : [{ key: "tolima", label: l.tolima, source: "tolima" as const }]),
    ...(mainLabel ? [{ key: "main", label: mainLabel }] : []),
  ];
  const fs = small ? 10 : 11.5;
  let x = 0;
  const laid = items.map((it) => {
    const at = x;
    x += 14 + it.label.length * fs * 0.55 + (small ? 8 : 14);
    return { ...it, at };
  });
  return (
    <g transform={`translate(${small ? 4 : 8}, ${small ? 30 : 46})`}>
      {laid.map((it) => (
        <g key={it.key} transform={`translate(${it.at}, 0)`}>
          {it.source ? (
            <circle cx={4} cy={-4} r={4} className={FILL[it.source]} />
          ) : (
            <path d={star(6)} transform="translate(4,-4)" className="fill-chart-2" />
          )}
          <text x={12} y={0} fontSize={fs} className="fill-muted-foreground">
            {it.label}
          </text>
        </g>
      ))}
    </g>
  );
}

/** Pereira, the reader's own place, in its own red (`--place`); the label stays in the text colour. */
function PereiraMark({ x, y, small, label }: { x: number; y: number; small: boolean; label: string }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <circle
        r={small ? 10 : 13}
        className="origin-center fill-place/25 [transform-box:fill-box] motion-safe:animate-beacon"
      />
      <circle r={small ? 4.5 : 5.5} className="fill-place stroke-background" strokeWidth={2} />
      <text
        x={small ? 8 : 10}
        y={-8}
        fontSize={small ? 12 : 14}
        fontWeight={650}
        className="fill-foreground stroke-background"
        paintOrder="stroke"
        strokeWidth={4}
      >
        {label}
      </text>
    </g>
  );
}

function WhereOverlay({
  data,
  model,
  proj,
  small,
  lang,
  top,
  width,
}: {
  data: Insights;
  model: StoryModel;
  proj: GeoProjection;
  small: boolean;
  lang: Lang;
  top: number;
  width: number;
}) {
  const c = storyCopy[lang];
  const P = proj([PEREIRA.lon, PEREIRA.lat]);
  // The ring stops under the legend and its note (baselines 50 and 66), which it used to cut through.
  const clip = `ring-${useId().replace(/[^\w-]/g, "")}`;
  if (!P) return null;
  const ring = geoCircle()
    .center([PEREIRA.lon, PEREIRA.lat])
    .radius(120 / KM_PER_DEG)();
  const path = geoPath(proj);
  const fs = small ? 10.5 : 12.5;
  return (
    <g>
      <clipPath id={clip}>
        <rect y={small ? 55 : 71} width={width} height={9999} />
      </clipPath>
      <path
        d={path(ring) ?? undefined}
        clipPath={`url(#${clip})`}
        fill="none"
        className="stroke-foreground/50"
        strokeWidth={1.25}
        strokeDasharray="4 5"
      />
      {TOWNS.filter((t) => t.kind === "city").map((t) => {
        const xy = proj([t.lon, t.lat]);
        if (!xy || xy[0] < 4 || xy[1] < top || xy[0] > width - 60) return null;
        return (
          <g key={t.id} transform={`translate(${xy[0]},${xy[1]})`}>
            <circle r={2.2} className="fill-muted-foreground" />
            <text
              x={5}
              y={4}
              fontSize={fs - 1.5}
              paintOrder="stroke"
              strokeWidth={3}
              className="fill-muted-foreground stroke-background"
            >
              {t.name}
            </text>
          </g>
        );
      })}
      {SOURCES.map((s, i) => {
        const at = model.centres[s];
        const d = data.distances[s];
        if (!at || !d) return null;
        const xy = proj([at.lon, at.lat]);
        if (!xy) return null;
        // Labels sit off the line's midpoint, alternately above and below, so they do not collide.
        const mx = (xy[0] + P[0]) / 2;
        const my = (xy[1] + P[1]) / 2 + (i % 2 === 0 ? 1 : -1) * (small ? 16 : 22);
        return (
          <g key={s}>
            <line x1={P[0]} y1={P[1]} x2={xy[0]} y2={xy[1]} className={STROKE[s]} strokeWidth={1.75} />
            <g transform={`translate(${mx},${my})`}>
              <text
                textAnchor="middle"
                fontSize={fs}
                fontWeight={600}
                className="fill-foreground stroke-background tabular-nums"
                paintOrder="stroke"
                strokeWidth={4}
              >
                {fmtKm(d.hypocentralKm)}
              </text>
              <text
                textAnchor="middle"
                y={fs + 2}
                fontSize={fs - 1.5}
                className="fill-muted-foreground stroke-background"
                paintOrder="stroke"
                strokeWidth={4}
              >
                {c.legend[s]}
              </text>
            </g>
          </g>
        );
      })}
      <PereiraMark x={P[0]} y={P[1]} small={small} label={c.legend.pereira} />
      <text x={small ? 4 : 8} y={small ? 50 : 66} fontSize={fs - 2} className="fill-muted-foreground">
        {c.graphic.mapNote}
      </text>
    </g>
  );
}

function UnknownOverlay({ model, proj, small }: { model: StoryModel; proj: GeoProjection; small: boolean }) {
  const P = proj([PEREIRA.lon, PEREIRA.lat]);
  return (
    <g>
      {SOURCES.map((s) => {
        const at = model.centres[s];
        const xy = at && proj([at.lon, at.lat]);
        if (!xy) return null;
        return (
          <text
            key={s}
            x={xy[0]}
            y={xy[1] + (small ? 14 : 24)}
            textAnchor="middle"
            fontSize={small ? 44 : 72}
            fontWeight={300}
            className={FILL[s]}
          >
            ?
          </text>
        );
      })}
      {P && <PereiraMark x={P[0]} y={P[1]} small={small} label="Pereira" />}
    </g>
  );
}

interface Section {
  lon0: number;
  lon1: number;
  x: (lon: number) => number;
  y: (depth: number) => number;
  px: number;
  x0: number;
  x1: number;
  maxDepth: number;
}

function SectionBase({
  data,
  model,
  sec,
  small,
  sub,
  lang,
}: {
  data: Insights;
  model: StoryModel;
  sec: Section;
  small: boolean;
  sub: string;
  lang: Lang;
}) {
  const c = storyCopy[lang].graphic;
  const fs = small ? 10 : 12;
  const ticks: number[] = [];
  for (let d = 0; d <= sec.maxDepth; d += 20) ticks.push(d);
  const P = sec.x(PEREIRA.lon);
  const main = model.main;
  const groups = (["shallow", "deep"] as const).flatMap((s) => {
    const at = model.centres[s];
    const depth = data.distances[s]?.depthKm;
    return at && depth !== undefined ? [{ s, x: sec.x(at.lon), y: sec.y(depth), depth }] : [];
  });
  const shallow = groups.find((g) => g.s === "shallow");
  const deep = groups.find((g) => g.s === "deep");
  // "Deeper towards the east": drawn only when the model's rule says so, the same rule the sentence beside it follows.
  const eastDeeper = model.facts.eastDeeper && shallow && deep;
  const err = model.errors.choco;

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
      <line x1={sec.x0} x2={sec.x1} y1={sec.y(0)} y2={sec.y(0)} className="stroke-foreground" strokeWidth={1.5} />
      {/* West and east read along the bottom edge, clear of Pereira's label on the surface. */}
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
      <g transform={`translate(${P},${sec.y(0)})`}>
        <path d="M-7,0 L0,-9 L7,0 Z" className="fill-place" />
        <text y={-14} textAnchor="middle" fontSize={fs + 1} fontWeight={650} className="fill-foreground">
          Pereira
        </text>
      </g>
      {main && model.mainHypoKm !== null && (
        <g>
          <line
            x1={P}
            y1={sec.y(0)}
            x2={sec.x(main.lon)}
            y2={sec.y(main.depthKm)}
            className="stroke-foreground/60"
            strokeDasharray="2 4"
          />
          <text
            x={(P + sec.x(main.lon)) / 2 + 8}
            y={(sec.y(0) + sec.y(main.depthKm)) / 2}
            fontSize={fs}
            className="fill-foreground stroke-background tabular-nums"
            paintOrder="stroke"
            strokeWidth={4}
          >
            {fmtKm(model.mainHypoKm)}
          </text>
          <text
            x={sec.x(main.lon) + (small ? 12 : 18)}
            y={sec.y(main.depthKm) + 4}
            fontSize={fs}
            fontWeight={600}
            className="fill-foreground stroke-background"
            paintOrder="stroke"
            strokeWidth={4}
          >
            {`M${main.mag.toFixed(1)} · ${fmtKm(main.depthKm)}`}
          </text>
        </g>
      )}
      {groups.map((g) => (
        <text
          key={g.s}
          x={g.x + (g.s === "deep" ? (small ? -16 : -30) : 0)}
          y={g.y + (g.s === "shallow" ? (small ? -22 : -30) : small ? 24 : 36)}
          textAnchor={g.s === "deep" ? "end" : "middle"}
          fontSize={fs}
          fontWeight={600}
          className="fill-foreground stroke-background"
          paintOrder="stroke"
          strokeWidth={4}
        >
          <Rich text={c.groupAt[g.s]} parts={{ km: fmtKm(g.depth) }} />
        </text>
      ))}
      {eastDeeper && (
        <g className="text-muted-foreground">
          <line
            x1={shallow.x + (deep.x - shallow.x) * 0.3}
            y1={shallow.y + (deep.y - shallow.y) * 0.3 + (small ? 18 : 26)}
            x2={shallow.x + (deep.x - shallow.x) * 0.72}
            y2={shallow.y + (deep.y - shallow.y) * 0.72 + (small ? 18 : 26)}
            className="stroke-muted-foreground"
            strokeWidth={1.25}
            markerEnd="url(#story-arrow)"
          />
          <defs>
            <marker
              id="story-arrow"
              viewBox="0 0 10 10"
              refX="7"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M0,1 L9,5 L0,9 z" className="fill-muted-foreground" />
            </marker>
          </defs>
          {/* Above and right of the arrow's middle, in the empty band between the two groups, with
              the page's halo so a stray dot under it cannot break a letter. */}
          <text
            x={shallow.x + (deep.x - shallow.x) * 0.5 + 10}
            y={shallow.y + (deep.y - shallow.y) * 0.5 + (small ? 18 : 26) - 8}
            fontSize={fs - 0.5}
            className="fill-muted-foreground stroke-background italic"
            paintOrder="stroke"
            strokeWidth={4}
          >
            {c.eastDeeper}
          </text>
        </g>
      )}
      {sub === "caveat" && err.h !== null && err.depth !== null && (
        <g>
          {groups.map((g) => {
            const hx = err.h! * sec.px;
            const hy = err.depth! * sec.px;
            return (
              <g key={g.s} className="stroke-foreground" strokeWidth={2}>
                <line x1={g.x - hx} x2={g.x + hx} y1={g.y} y2={g.y} />
                <line x1={g.x} x2={g.x} y1={g.y - hy} y2={g.y + hy} />
                <line x1={g.x - hx} x2={g.x - hx} y1={g.y - 4} y2={g.y + 4} />
                <line x1={g.x + hx} x2={g.x + hx} y1={g.y - 4} y2={g.y + 4} />
                <line x1={g.x - 4} x2={g.x + 4} y1={g.y - hy} y2={g.y - hy} />
                <line x1={g.x - 4} x2={g.x + 4} y1={g.y + hy} y2={g.y + hy} />
              </g>
            );
          })}
          <text
            x={sec.x1}
            y={sec.y(sec.maxDepth) + (small ? 30 : 40)}
            textAnchor="end"
            fontSize={fs - 0.5}
            className="fill-foreground"
          >
            <Rich text={c.errorLegend} parts={{ h: fmtKm(err.h, 1), depth: fmtKm(err.depth, 1) }} />
          </text>
        </g>
      )}
    </g>
  );
}
