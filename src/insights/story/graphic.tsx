/**
 * The story's pinned drawing: one SVG whose scenes change as the reader scrolls. The map and the
 * west–east cross-section share one layer of event dots, which slide from their place on the map to
 * their depth when the earth is turned on its side. Every position comes from the data at render.
 */
import { geoCircle, geoMercator, geoPath, type GeoProjection } from "d3-geo";
import { quantileSorted } from "d3-array";
import { useId, useMemo } from "react";
import type { Lang } from "@/lib/i18n";
import { fmtDateTime, fmtDay } from "@/lib/format";
import { SOURCES, type Insights, type Source } from "../claims";
import { PEREIRA } from "../../../core/places";
import { CUTS, groundAt } from "../plate";
import { REGION, TOWNS, onCut } from "../region";
import { insightsCopy } from "../copy";
import { storyCopy } from "./copy";
import type { Compared } from "../history";
import { fmtKm, fmtMag, fmtTimes, roundSig } from "../shared";
import { shakingParts } from "../durations";
import { FILL, STROKE } from "../tones";
import { flowRow } from "./layout";
import { DotLayer, type Mark } from "./dots";
import { Layer, SceneTitle, radius, star } from "./marks";
import { useTextWidth } from "../measure";
import type { Ev, StoryModel } from "./model";
import { Rich, fill } from "@/lib/rich";
import { ClocksScene, EnergyScene, FeltScene, TolimaScene } from "./scenes";
import { KM_PER_DEG, RATE, SECTION_DEPTH_KM, SectionFrame, frameSections, type Section } from "./section";

export type SceneId = "where" | "energy" | "section" | "clocks" | "tolima" | "tolimaSection" | "felt" | "unknown";
export interface SceneState {
  scene: SceneId;
  sub: string;
  threshold: number;
}

/** The history drawing's text alternative: every square, largest first, with what its label says. */
function historyAria(model: StoryModel, withLarger: boolean, lang: Lang) {
  const c = storyCopy[lang].graphic;
  const h = model.history;
  const main = model.main;
  if (!h || !main) return "";
  const row = (r: Compared) =>
    `${fill(c.historyRow, { name: r.quake.name[lang], date: fmtDateTime(r.quake.time, lang) })}, ${fill(
      c.historyTimes(r.relation),
      { mag: fmtMag(r.quake.mag), x: fmtTimes(r.times) },
    )}`;
  const mainRow = `${fill(c.historyMain, { date: fmtDateTime(main.t, lang) })}, ${fmtMag(main.mag)}`;
  const list = [...(withLarger ? h.larger.map(row) : []), mainRow, ...h.smaller.map(row)];
  return fill(c.historyAria, { list: list.join("; ") });
}

/** The duration drawing's text alternative: both bars, with the figures the drawing shows. */
function durationAria(model: StoryModel, lang: Lang) {
  const d = model.durations;
  return d ? fill(storyCopy[lang].graphic.durationAria, shakingParts(d)) : "";
}

export function Graphic({
  data,
  model,
  state,
  width,
  height,
  lang,
  mounted,
}: {
  data: Insights;
  model: StoryModel;
  state: SceneState;
  width: number;
  height: number;
  lang: Lang;
  // `width` and `height` are the measured box, never zero: `Story` draws nothing until it is measured.
  /** The scenes whose drawings are mounted (the story decides which: see `Story`). */
  mounted: ReadonlySet<SceneId>;
}) {
  const c = storyCopy[lang].graphic;
  const share = insightsCopy[lang].claims.sharePhrase;
  const { scene, sub } = state;
  const small = width < 560;
  const k = small ? 0.8 : 1;
  const near = (id: SceneId) => mounted.has(id);

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

  // Two cross-sections, west–east through Chocó and through Chaparral, true to scale and at one
  // scale: one pixel is the same distance across and down, in both. Each starts at the trench, where
  // the plate goes down and where Slab2's model of it begins. Chocó's reaches past Pereira so the
  // reader sees where they stand; Chaparral's ends just past the swarm.
  const secs = useMemo(() => {
    const east = (es: readonly Ev[], also: number) => {
      const lons = es.map((e) => e.lon).sort((a, b) => a - b);
      return Math.max(lons.length ? quantileSorted(lons, 0.99)! : also, also) + 0.15;
    };
    const depths = model.choco.map((e) => e.depthKm).sort((a, b) => a - b);
    const maxDepth = Math.max(
      SECTION_DEPTH_KM,
      Math.ceil(((depths.length ? quantileSorted(depths, 0.995)! : 100) + 10) / 20) * 20,
    );
    const tolima = model.bySrc.tolima;
    return frameSections(
      {
        choco: { cut: CUTS.choco, lon1: east(model.choco, PEREIRA.lon) },
        tolima: { cut: CUTS.tolima, lon1: east(tolima, tolima.length ? -Infinity : PEREIRA.lon) },
      },
      maxDepth,
      width,
      height,
      small,
      // A cut whose step is not shown does not get to shrink the one that is.
      model.tolimaCut ? ["choco", "tolima"] : ["choco"],
    );
  }, [model.choco, model.bySrc.tolima, model.tolimaCut, width, height, small]);
  const sec = secs.choco;
  const secT = secs.tolima;

  const onMap = scene === "where" || scene === "unknown";
  const onSec = scene === "section";
  const onSecT = scene === "tolimaSection";
  const main = model.main;

  const dim = scene === "unknown";
  // The swarm's dots wait on its cut while its own scene shows (they are hidden, and that scene draws
  // its own map), so on the turn they fade in where they belong rather than fly in from a map the
  // reader is not looking at.
  const swarmOnCut = onSecT || scene === "tolima";

  // Where every dot and the star sit in this scene, and how opaque; `DotLayer` glides them there. Kept
  // while the scene's layout is, so a step that changes nothing here draws nothing.
  const marks = useMemo(() => {
    const pos = (e: Ev): [number, number] => {
      if (onSec && e.source !== "tolima") return [sec.x(e.lon), sec.y(e.depthKm)];
      if (swarmOnCut && e.source === "tolima") return [secT.x(e.lon), secT.y(e.depthKm)];
      return map.proj([e.lon, e.lat]) ?? [0, 0];
    };
    // On a cross-section, only its own zone's events inside the cut: the few beyond it would sit off the axes.
    const inCut = (e: Ev, s: Section) => e.lon >= s.lon0 && e.lon <= s.lon1 && e.depthKm <= s.maxDepth;
    const shown = (e: Ev) =>
      onMap || (onSec && e.source !== "tolima" && inCut(e, sec)) || (onSecT && e.source === "tolima" && inCut(e, secT));
    const out: Mark[] = [];
    for (const e of model.all) {
      if (e.id === main?.id) continue;
      const [x, y] = pos(e);
      const a = shown(e) ? (dim ? 0.25 : 0.6) : 0;
      out.push({ id: e.id, x, y, r: radius(e.mag, k), a, tone: e.source, delay: Math.min(400, e.depthKm * 3) });
    }
    if (main) {
      const [x, y] = pos(main);
      out.push({ id: main.id, x, y, r: small ? 9 : 12, a: onMap || onSec ? 1 : 0, tone: "mainshock", delay: 300 });
    }
    return out;
  }, [model.all, main, map, sec, secT, onMap, onSec, onSecT, swarmOnCut, dim, k, small]);

  const depthMedian = (s: Source) => data.distances[s]?.depthKm ?? null;
  // One text alternative for the whole drawing, for whichever scene is showing.
  const aria: Record<SceneId, string> = {
    where: c.mapAria,
    unknown: c.unknownAria,
    section: fill(c.sectionAria, {
      shallow: fmtKm(depthMedian("shallow") ?? 0),
      deep: fmtKm(depthMedian("deep") ?? 0),
      rate: RATE,
    }),
    energy:
      sub === "ladder"
        ? c.ladderAria
        : sub === "duration"
          ? durationAria(model, lang)
          : historyAria(model, sub === "larger", lang),
    clocks: c.clocksAria,
    tolima: fill(c.tolimaAria, {
      choco: data.largestShare.choco === null ? "" : share(data.largestShare.choco),
      tolima: data.largestShare.tolima === null ? "" : share(data.largestShare.tolima),
    }),
    tolimaSection: fill(c.tolimaSectionAria, {
      depth: fmtKm(depthMedian("tolima") ?? 0),
      top: fmtKm(model.plate.tolima?.plate.topKm ?? 0),
      rate: RATE,
    }),
    felt: sub === "waves" ? c.wavesAria : c.calendarAria,
  };

  // Three layers, one box: the map and the cuts, the dots on a canvas, and everything drawn over the
  // dots. The box is the image, named for the scene; the layers inside it are presentation.
  const viewBox = `0 0 ${width} ${height}`;
  return (
    <div role="img" aria-label={aria[scene]} className="relative size-full overflow-hidden select-none">
      <svg width={width} height={height} viewBox={viewBox} className="absolute inset-0 block overflow-hidden">
        <Layer on={onMap}>
          <g>
            {REGION.features.map((f) => (
              <path key={f.properties.name} d={map.path(f) ?? undefined} className="fill-muted stroke-border" />
            ))}
          </g>
          <OceanLabel proj={map.proj} small={small} label={c.ocean} data={model} />
        </Layer>

        <Layer on={onSec}>
          {near("section") && (
            <>
              <SectionFrame sec={sec} small={small} lang={lang} />
              <SectionBase data={data} model={model} sec={sec} small={small} sub={sub} lang={lang} />
            </>
          )}
        </Layer>
        <Layer on={onSecT}>
          {near("tolimaSection") && (
            <>
              <SectionFrame sec={secT} small={small} lang={lang} />
              <TolimaSectionBase data={data} model={model} sec={secT} small={small} lang={lang} />
            </>
          )}
        </Layer>
      </svg>

      {/* The dots the map and the cross-sections share. */}
      <DotLayer marks={marks} width={width} height={height} />

      <svg width={width} height={height} viewBox={viewBox} className="absolute inset-0 block overflow-hidden">
        <Layer on={scene === "where"}>
          <WhereOverlay
            data={data}
            model={model}
            proj={map.proj}
            small={small}
            lang={lang}
            top={map.top}
            width={width}
            height={height}
          />
        </Layer>
        <Layer on={scene === "unknown"}>
          {near("unknown") && <UnknownOverlay model={model} proj={map.proj} small={small} />}
        </Layer>
        <Layer on={onMap || onSec || onSecT}>
          <SceneTitle small={small}>
            {onSec ? (
              c.sectionTitle
            ) : onSecT ? (
              c.tolimaSectionTitle
            ) : (
              <Rich text={c.mapTitle} parts={{ from: fmtDay(model.start, lang), to: fmtDay(data.now, lang) }} />
            )}
          </SceneTitle>
          <GroupLegend
            small={small}
            width={width}
            lang={lang}
            sources={onSec ? ["shallow", "deep"] : onSecT ? ["tolima"] : SOURCES}
            mainLabel={main && !onSecT ? `M${main.mag.toFixed(1)}` : null}
          />
        </Layer>

        <Layer on={scene === "energy"}>
          {near("energy") && (
            <EnergyScene data={data} model={model} width={width} height={height} sub={sub} small={small} lang={lang} />
          )}
        </Layer>
        <Layer on={scene === "clocks"}>
          {near("clocks") && (
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
          )}
        </Layer>
        <Layer on={scene === "tolima"}>
          {near("tolima") && (
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
          )}
        </Layer>
        <Layer on={scene === "felt"}>
          {near("felt") && (
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
          )}
        </Layer>
      </svg>
    </div>
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
  width,
  lang,
  sources,
  mainLabel,
}: {
  small: boolean;
  width: number;
  lang: Lang;
  sources: readonly Source[];
  mainLabel: string | null;
}) {
  const measure = useTextWidth();
  const l = storyCopy[lang].legend;
  const items: { key: string; label: string; source?: Source }[] = [
    ...sources.map((s) => ({ key: s, label: l[s], source: s })),
    ...(mainLabel ? [{ key: "main", label: mainLabel }] : []),
  ];
  const x0 = small ? 4 : 8;
  // Spaced by the labels' measured widths, a pixel smaller at a time (to 9 px) until one row fits:
  // at 320 px the four entries ran 37 px past the edge at 10 px.
  const place = (fs: number) => {
    const at = flowRow(
      items.map((it) => 12 + measure(it.label, fs)),
      small ? 8 : 14,
      width - 2 * x0,
    );
    return { fs, at, rows: Math.max(...at.map((a) => a.row)) + 1 };
  };
  let laid = place(small ? 10 : 11.5);
  while (laid.rows > 1 && laid.fs > 9) laid = place(Math.max(9, laid.fs - 1));
  const { fs } = laid;
  return (
    <g transform={`translate(${x0}, ${small ? 30 : 46})`}>
      {items.map((it, i) => (
        <g key={it.key} transform={`translate(${laid.at[i]!.x}, ${laid.at[i]!.row * (fs + 4)})`}>
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

/**
 * A town the reader knows: a grey dot and its name with the page's halo, to the right on a map or
 * `above` it on a cut's surface.
 */
function TownMark({
  x,
  y,
  name,
  fontSize,
  above = false,
}: {
  x: number;
  y: number;
  name: string;
  fontSize: number;
  above?: boolean;
}) {
  return (
    <g transform={`translate(${x},${y})`}>
      <circle r={2.2} className="fill-muted-foreground" />
      <text
        x={above ? 0 : 5}
        y={above ? -7 : 4}
        textAnchor={above ? "middle" : undefined}
        fontSize={fontSize}
        paintOrder="stroke"
        strokeWidth={3}
        className="fill-muted-foreground stroke-background"
      >
        {name}
      </text>
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
  height,
}: {
  data: Insights;
  model: StoryModel;
  proj: GeoProjection;
  small: boolean;
  lang: Lang;
  top: number;
  width: number;
  height: number;
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
        // A town whose name would cross the drawing's edge is left off.
        if (!xy || xy[0] < 4 || xy[1] < top || xy[0] > width - 60 || xy[1] > height - fs) return null;
        return <TownMark key={t.id} x={xy[0]} y={xy[1]} name={t.name} fontSize={fs - 1.5} />;
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
        // The mark sits on its own group's dots, in their colour, so a background halo keeps its
        // outline apart from them.
        return (
          <text
            key={s}
            x={xy[0]}
            y={xy[1] + (small ? 14 : 24)}
            textAnchor="middle"
            fontSize={small ? 44 : 72}
            fontWeight={500}
            className={`${FILL[s]} stroke-background`}
            paintOrder="stroke"
            strokeWidth={small ? 5 : 7}
            strokeLinejoin="round"
          >
            ?
          </text>
        );
      })}
      {P && <PereiraMark x={P[0]} y={P[1]} small={small} label="Pereira" />}
    </g>
  );
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
            {/* On a phone the cut is ~1 px per km and the star sits near its east edge: the depth,
                which the scale and the prose both give, would run off it. */}
            {small ? `M${main.mag.toFixed(1)}` : `M${main.mag.toFixed(1)} · ${fmtKm(main.depthKm)}`}
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
              the page's halo so a stray dot under it cannot break a letter. On a phone the cut is too
              narrow for it, and the sentence beside the drawing says it. */}
          <text
            display={small ? "none" : undefined}
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

/**
 * What sits on Chaparral's cut besides the plate: the swarm's label under its events, the towns on the
 * cut's line, and a note that Pereira is not on it. Pereira is ~100 km to the north, and drawing it on
 * this cut would put the swarm under it, which is false (plan decision: two cuts, not one).
 */
function TolimaSectionBase({
  data,
  model,
  sec,
  small,
  lang,
}: {
  data: Insights;
  model: StoryModel;
  sec: Section;
  small: boolean;
  lang: Lang;
}) {
  const c = storyCopy[lang].graphic;
  const fs = small ? 10 : 12;
  const at = model.centres.tolima;
  const depth = data.distances.tolima?.depthKm;
  const towns = TOWNS.filter((t) => t.kind === "cut" && onCut(t, sec.cut) && t.lon > sec.lon0 && t.lon < sec.lon1);
  return (
    <g>
      {towns.map((t) => {
        const x = sec.x(t.lon);
        const y = sec.y(-Math.max(0, groundAt(sec.cut, t.lon) ?? 0) / 1000);
        return <TownMark key={t.id} x={x} y={y} name={t.name} fontSize={fs} above />;
      })}
      {model.tolimaToPereiraKm !== null && (
        <text
          x={sec.x1}
          // On a phone the note is as wide as half the cut and would run into the towns' names, so it
          // sits a line higher, beside the legend, which on this cut holds one short entry.
          y={sec.y(0) - (small ? 26 : 20)}
          textAnchor="end"
          fontSize={fs}
          className="fill-foreground stroke-background"
          paintOrder="stroke"
          strokeWidth={4}
        >
          <Rich text={c.pereiraNorth} parts={{ km: fmtKm(roundSig(model.tolimaToPereiraKm, 2)) }} />
        </text>
      )}
      {at && depth !== undefined && (
        <text
          x={Math.min(sec.x(at.lon) + (small ? 10 : 16), sec.x1)}
          y={sec.y(depth) + (small ? 24 : 36)}
          textAnchor="end"
          fontSize={fs}
          fontWeight={600}
          className="fill-foreground stroke-background"
          paintOrder="stroke"
          strokeWidth={4}
        >
          <Rich text={c.swarmAt} parts={{ km: fmtKm(depth) }} />
        </text>
      )}
    </g>
  );
}
