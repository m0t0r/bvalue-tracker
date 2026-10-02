/** Question 1: why earthquakes this far away are felt in Pereira. */
import { energyRatio } from "@bvalue/seismo";
import { geoCircle } from "d3-geo";
import { scaleLog } from "d3-scale";
import { PlayIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { P_WAVE_KMS, S_WAVE_KMS, SOURCES, arrivalSeconds, type Insights } from "../claims";
import { PEREIRA } from "../../../core/places";
import { TOWNS } from "../region";
import { questionsCopy, type Named } from "./copy";
import { fmtInt, fmtKm } from "../shared";
import { FILL } from "../tones";
import { useReducedMotion } from "../use-reduced-motion";
import { presets, ratioPhrase, relativeAmplitude, toPereira, type Preset } from "./derive";
import { Choice, Figure, RangeField, Swatch, useWidth } from "./ui";
import {
  HaloText,
  KM_PER_DEG,
  PereiraMark,
  TownMark,
  firstClear,
  fitRegion,
  textBox,
  useTextWidth,
  type Box,
  type PereiraLook,
} from "../drawing";

const MAP = 400;

type PresetId = Preset["id"] | "custom";

export function FeelExplorer({
  data,
  reference: ref,
  ringKm,
}: {
  data: Insights;
  reference: Named & { km: number };
  ringKm: number;
}) {
  const { lang } = useI18n();
  const c = questionsCopy[lang].far;
  const all = useMemo(() => presets(data), [data]);
  const start = all.find((p) => p.id === "shallow") ?? all[0];
  const [preset, setPreset] = useState<PresetId>(start?.id ?? "custom");
  const [mag, setMag] = useState(start?.event.mag ?? 4);
  const [epi, setEpi] = useState(start ? Math.round(toPereira(start.event).epi) : 100);
  const [depth, setDepth] = useState(start ? Math.round(start.event.depthKm) : 40);

  const pick = (id: PresetId) => {
    setPreset(id);
    const p = all.find((x) => x.id === id);
    if (!p) return;
    setMag(p.event.mag);
    setEpi(Math.round(toPereira(p.event).epi));
    setDepth(Math.round(p.event.depthKm));
  };
  const custom = (set: (v: number) => void) => (v: number) => {
    setPreset("custom");
    set(v);
  };

  // Floored at 1 km: an event right under Pereira at the surface would otherwise divide by zero in
  // the wave race and the amplitude. The sliders may still read 0.
  const km = Math.max(1, Math.hypot(epi, depth));
  const rel = relativeAmplitude(mag, km, ref.mag, ref.km);
  const say = (r: number, same: string, more: (x: string) => string, less: (x: string) => string) => {
    const ph = ratioPhrase(r);
    return ph.kind === "same" ? same : ph.kind === "more" ? more(ph.x) : less(ph.x);
  };
  const energyText = say(energyRatio(mag, ref.mag), c.energySame, c.energyMore, c.energyLess);
  const relText = say(rel, c.motionSame, c.motionMore, c.motionLess);
  const active = all.find((p) => p.id === preset);
  const presetLabel = (p: Preset) =>
    p.id === "reference"
      ? c.presetReference(ref)
      : p.id === "shallow"
        ? c.presetShallow(p.event.mag)
        : c.presetTolima(p.event.mag);

  return (
    <Figure caption={c.caption(P_WAVE_KMS, S_WAVE_KMS)}>
      <div className="grid gap-6 md:grid-cols-2">
        <MiniMap data={data} epi={epi} source={active?.event} ringKm={ringKm} />
        <div className="flex flex-col gap-5">
          <Choice
            label={c.pick}
            value={preset}
            onChange={pick}
            options={[
              ...all.map((p) => ({
                key: p.id as PresetId,
                label: (
                  <>
                    <Swatch source={p.id === "reference" ? "mainshock" : p.source} />
                    {presetLabel(p)}
                  </>
                ),
              })),
              { key: "custom" as PresetId, label: c.custom },
            ]}
          />
          <RangeField
            name="magnitude"
            label={c.magnitude}
            value={mag}
            display={`M${mag.toFixed(1)}`}
            min={2}
            max={8}
            step={0.1}
            onChange={custom(setMag)}
          />
          <RangeField
            name="distance"
            label={c.distance}
            value={epi}
            display={fmtKm(epi)}
            min={0}
            max={250}
            step={1}
            onChange={custom(setEpi)}
          />
          <RangeField
            name="depth"
            label={c.depth}
            value={depth}
            display={fmtKm(depth)}
            min={0}
            max={150}
            step={1}
            onChange={custom(setDepth)}
          />
          {/* Each readout spans the rows of a subgrid, so the two values share a line however many
              lines their labels wrap to, each label sitting on its value. */}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-4 text-sm">
            <div className="row-span-2 grid grid-rows-subgrid gap-y-0">
              <dt className="self-end text-muted-foreground">{c.straight}</dt>
              <dd className="text-lg font-semibold tabular-nums">{fmtKm(km)}</dd>
            </div>
            <div className="row-span-2 grid grid-rows-subgrid gap-y-0">
              <dt className="self-end text-muted-foreground">{c.motion(ref)}</dt>
              <dd className="text-lg font-semibold tabular-nums">{relText}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-muted-foreground">{c.energy(ref)}</dt>
              <dd className="tabular-nums">{energyText}</dd>
            </div>
          </dl>
        </div>
      </div>
      <AmplitudeScale data={data} rel={rel} refNamed={ref} relText={relText} />
      <WaveRace km={km} />
    </Figure>
  );
}

/**
 * Pereira on this map. Not the story's look (`pereiraLook` in `../drawing`): a smaller disc that does
 * not pulse, a thinner outline, a bolder label and a thinner halo. The two drifted apart, and are kept
 * as they were until they are settled as one (issue #168).
 */
const MAP_PEREIRA: PereiraLook = {
  disc: 9,
  beacon: false,
  dot: 4.5,
  outline: 1.5,
  dx: 9,
  fontSize: 14,
  weight: 700,
  halo: 3,
};

/** Pereira, every event coloured by source, a ring at the sources' distance and the reader's chosen one. */
function MiniMap({
  data,
  epi,
  source,
  ringKm,
}: {
  data: Insights;
  epi: number;
  source?: { lat: number; lon: number };
  ringKm: number;
}) {
  const { lang } = useI18n();
  const measure = useTextWidth();
  const c = questionsCopy[lang].far;
  const [box, w] = useWidth(MAP);
  const { path, outlines, project } = useMemo(() => {
    const { proj, path, outlines } = fitRegion(
      [
        [-77.3, 3.3],
        [-74.4, 5.95],
      ],
      [
        [4, 4],
        [MAP - 4, MAP - 4],
      ],
    );
    return { path, outlines, project: (lon: number, lat: number) => proj([lon, lat]) ?? [0, 0] };
  }, []);
  const circle = (km: number) =>
    path(
      geoCircle()
        .center([PEREIRA.lon, PEREIRA.lat])
        .radius(km / KM_PER_DEG)(),
    ) ?? "";
  const dots = useMemo(
    () =>
      SOURCES.flatMap((s) =>
        data.sources[s].map((e) => {
          const [x, y] = project(e.lon, e.lat);
          return { id: e.id, s, x, y, r: Math.max(1.2, (e.mag - 1.5) * 0.9) };
        }),
      ),
    [data, project],
  );
  const [px, py] = project(PEREIRA.lon, PEREIRA.lat);
  const sxy = source ? project(source.lon, source.lat) : null;
  // The drawing scales with its column, so its text is sized in screen pixels: `k` viewBox units per
  // pixel. In viewBox units alone the town names came out at 7 px on a 320 px phone.
  const k = MAP / Math.max(1, w);
  const map: Box = { x0: 0, x1: MAP, y0: 0, y1: MAP };
  const labels = (
    [
      { s: "shallow", lat: 4.3, lon: -76.95, text: c.labelShallow },
      { s: "deep", lat: 5.14, lon: -76.3, text: c.labelDeep },
      { s: "tolima", lat: 3.6, lon: -75.55, text: c.labelTolima },
    ] as const
  ).map((l) => {
    const [x, y] = project(l.lon, l.lat);
    // Kept inside the map: centred on its point, a label began 8 px past the left edge
    // at 320 px. Measured in screen pixels, then scaled to the map's viewBox units.
    const width = measure(`● ${l.text}`, 12, { weight: 600 }) * k;
    const at = Math.min(MAP - 4 - width / 2, Math.max(4 + width / 2, x));
    return { ...l, x: at, y, box: textBox({ x: at, y, width, fontSize: 12 * k, anchor: "middle" }) };
  });
  const look = MAP_PEREIRA;
  const pereira = { x: px + look.dx, y: py - 8 };
  // A town is drawn only where its dot is on the map, and its name only where it stays inside the map
  // and clear of the sources' labels, Pereira's and the towns before it; otherwise the town is left
  // off. Medellín and Bogotá lie off the map at every width, and at 320 px "Manizales" sat under the
  // deep group's label and "Armenia" touched "Ibagué". The boxes may touch: a line's box already
  // reaches about a quarter of an em past the letters above and below, so the words stay apart.
  const avoid: Box[] = [
    ...labels.map((l) => l.box),
    textBox({
      ...pereira,
      width: measure("Pereira", look.fontSize, { weight: look.weight }) * k,
      fontSize: look.fontSize * k,
    }),
  ];
  const towns = TOWNS.filter((t) => t.kind === "city").flatMap((t) => {
    const [x, y] = project(t.lon, t.lat);
    if (x < 2 || x > MAP - 2 || y < 2 || y > MAP - 2) return [];
    const name = textBox({ x: x + 5, y: y + 4, width: measure(t.name, 11) * k, fontSize: 11 * k });
    if (!firstClear([name], map, avoid)) return [];
    avoid.push(name);
    return [{ ...t, x, y }];
  });

  return (
    <div ref={box} className="min-w-0">
      <svg
        viewBox={`0 0 ${MAP} ${MAP}`}
        role="img"
        aria-label={c.mapAria}
        className="aspect-square w-full rounded-lg bg-background"
      >
        <g className="fill-muted stroke-border">
          {outlines.map((o) => (
            <path key={o.name} d={o.d ?? ""} strokeWidth={0.8} />
          ))}
        </g>
        <path d={circle(ringKm)} fill="none" strokeDasharray="4 4" className="stroke-muted-foreground" />
        {/* In the text colour: orange is the mainshock's, and the chosen event is often another. */}
        <path d={circle(Math.max(1, epi))} fill="none" strokeWidth={1.5} className="stroke-foreground" />
        {SOURCES.map((s) => (
          <g key={s} className={cn(FILL[s], "opacity-40")}>
            {dots
              .filter((d) => d.s === s)
              .map((d) => (
                <circle key={d.id} cx={d.x} cy={d.y} r={d.r} />
              ))}
          </g>
        ))}
        {sxy ? (
          <line
            x1={px}
            y1={py}
            x2={sxy[0]}
            y2={sxy[1]}
            strokeWidth={1.25}
            strokeDasharray="3 3"
            className="stroke-foreground"
          />
        ) : null}
        {/* The halo lifts the grey off the grey land: 4.34:1 on it in light mode, 4.73:1 on the page. */}
        {towns.map((t) => (
          <TownMark key={t.id} x={t.x} y={t.y} name={t.name} fontSize={11} k={k} dot={2} />
        ))}
        {labels.map((l) => {
          return (
            <HaloText
              key={l.s}
              x={l.x}
              y={l.y}
              textAnchor="middle"
              fontSize={12 * k}
              fontWeight={600}
              halo={3 * k}
              className="fill-foreground"
            >
              {/* The words in the text colour and the source's colour on a dot: the blue (4.42:1, light)
                  and the violet (3.87:1, dark) are too faint for 12 px text. */}
              <tspan className={FILL[l.s]}>●</tspan> {l.text}
            </HaloText>
          );
        })}
        <PereiraMark x={px} y={py} label="Pereira" look={look} k={k} />
      </svg>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block w-5 border-t border-dashed border-muted-foreground" />
          {c.ring(ringKm)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block w-5 border-t-2 border-foreground" />
          {c.chosen}
        </span>
      </p>
    </div>
  );
}

/** A log scale of relative amplitude from 1/100 000 to 10× the reference, with the reader's choice on it. */
function AmplitudeScale({
  data,
  rel,
  refNamed,
  relText,
}: {
  data: Insights;
  rel: number;
  refNamed: Named & { km: number };
  relText: string;
}) {
  const { lang } = useI18n();
  const c = questionsCopy[lang].far;
  const [ref, w] = useWidth();
  const width = Math.max(240, w);
  const x = scaleLog()
    .domain([1e-5, 10])
    .range([24, width - 16])
    .clamp(true);
  const ticks = width < 480 ? [1e-5, 1e-3, 1e-1, 1, 10] : [1e-5, 1e-4, 1e-3, 1e-2, 1e-1, 1, 10];
  const markers = presets(data).map((p) => ({
    p,
    v: relativeAmplitude(p.event.mag, toPereira(p.event).hypo, refNamed.mag, refNamed.km),
  }));
  return (
    <div ref={ref} className="mt-8 min-w-0">
      <p className="mb-2 text-sm text-muted-foreground">{c.scaleTitle}</p>
      <svg width={width} height={64} role="img" aria-label={c.scaleAria(relText)} className="block">
        <rect x={x(1e-5)} y={14} width={x(10) - x(1e-5)} height={8} rx={4} className="fill-muted" />
        {ticks.map((t) => (
          <g key={t} transform={`translate(${x(t)},0)`}>
            <line y1={24} y2={30} className="stroke-border" />
            <text y={42} textAnchor="middle" fontSize={10} className="fill-muted-foreground">
              {t >= 1 ? `${t}×` : `1/${fmtInt(1 / t)}`}
            </text>
          </g>
        ))}
        {markers.map(({ p, v }) => (
          <circle
            key={p.id}
            cx={x(v)}
            cy={18}
            r={4}
            strokeWidth={1.5}
            className={cn(FILL[p.id === "reference" ? "mainshock" : p.source], "stroke-card")}
          />
        ))}
        <g
          className="translate-x-(--at) transition-transform duration-(--duration-move) ease-(--ease-move) motion-reduce:transition-none"
          style={{ "--at": `${x(rel)}px` } as CSSProperties}
        >
          <path d="M0,12 L-6,2 L6,2 Z" className="fill-foreground" />
        </g>
        <text x={x(1)} y={58} textAnchor="middle" fontSize={10} className="fill-muted-foreground">
          {c.scaleRef(refNamed)}
        </text>
      </svg>
    </div>
  );
}

const RACE_SPEED = 4;
/** Under reduced motion the race goes in steps this far apart: the start, P arrives, S arrives. */
const RACE_STEP_MS = 900;

/** P and S waves racing from the source to Pereira, sped up. Reduced motion steps through it. */
export function WaveRace({ km }: { km: number }) {
  const { lang } = useI18n();
  const c = questionsCopy[lang].far;
  const reduced = useReducedMotion();
  const [ref, w] = useWidth();
  const { p, s } = arrivalSeconds(km);
  // The race's clock, with the distance it runs over. A new distance shows its finished race, in the
  // render that brings it (set from an effect, the old clock was drawn once against the new distance);
  // the button runs it.
  const [race, setRace] = useState({ s, elapsed: s });
  // `Object.is`, as an effect's dependencies are compared: a distance that is not a number settles.
  if (!Object.is(race.s, s)) setRace({ s, elapsed: s });
  const elapsed = race.elapsed;
  // A frame of the old distance's race that lands before that race is stopped changes nothing.
  const setElapsed = (at: number) => setRace((r) => (Object.is(r.s, s) ? { s, elapsed: at } : r));
  const frame = useRef(0);
  const steps = useRef<number[]>([]);
  const stop = () => {
    cancelAnimationFrame(frame.current);
    for (const id of steps.current) clearTimeout(id);
    steps.current = [];
  };
  // A race under way ends with its distance, and with the component.
  useEffect(() => stop, [s]);
  const play = () => {
    stop();
    if (reduced) {
      // No gliding dots: the start, then each wave already at Pereira, one after the other.
      setElapsed(0);
      steps.current = [p, s].map((at, i) => window.setTimeout(() => setElapsed(at), RACE_STEP_MS * (i + 1)));
      return;
    }
    const t0 = performance.now();
    const tick = (now: number) => {
      const e = ((now - t0) / 1000) * RACE_SPEED;
      setElapsed(Math.min(e, s + 1));
      if (e < s + 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  };
  const width = Math.max(240, w);
  const x0 = 16,
    x1 = width - 76;
  const at = (arrive: number) => x0 + (x1 - x0) * Math.min(1, elapsed / arrive);
  return (
    <div ref={ref} className="mt-8 min-w-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {c.raceTitle} <span className="tabular-nums">({c.raceSpeed(RACE_SPEED)})</span>
        </p>
        <Button type="button" variant="outline" size="sm-touch" onClick={play}>
          <PlayIcon data-icon="inline-start" />
          {c.race}
        </Button>
      </div>
      <svg width={width} height={96} role="img" aria-label={c.raceAria(p, s)} className="block">
        <line x1={x0} x2={x1} y1={34} y2={34} strokeWidth={2} className="stroke-border" />
        <line x1={x0} x2={x1} y1={66} y2={66} strokeWidth={2} className="stroke-border" />
        <text x={x0} y={20} fontSize={11} className="fill-muted-foreground">
          {c.quake} · {fmtKm(km)}
        </text>
        <text x={x0} y={50} fontSize={11} className="fill-muted-foreground">
          P
        </text>
        <text x={x0} y={82} fontSize={11} className="fill-muted-foreground">
          S
        </text>
        <circle cx={at(p)} cy={34} r={6} className="fill-muted-foreground" />
        <circle cx={at(s)} cy={66} r={7} className="fill-foreground" />
        <g transform={`translate(${x1 + 10},50)`}>
          <circle r={5} className="fill-place" />
          <text x={9} y={4} fontSize={12} fontWeight={600} className="fill-foreground">
            Pereira
          </text>
        </g>
        <text
          x={x1}
          y={24}
          textAnchor="end"
          fontSize={11}
          className={elapsed >= p ? "fill-foreground" : "fill-muted-foreground"}
        >
          {c.arrives(p)}
        </text>
        <text
          x={x1}
          y={90}
          textAnchor="end"
          fontSize={11}
          className={elapsed >= s ? "fill-foreground" : "fill-muted-foreground"}
        >
          {c.arrives(s)}
        </text>
      </svg>
      <p className="mt-2 max-w-md text-sm text-pretty">{c.raceNote(s - p)}</p>
    </div>
  );
}
