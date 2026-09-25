/** Question 1: why earthquakes this far away are felt in Pereira. */
import { energyRatio } from "@bvalue/seismo";
import { geoCircle, geoMercator, geoPath } from "d3-geo";
import { scaleLog } from "d3-scale";
import { PlayIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { P_WAVE_KMS, S_WAVE_KMS, SOURCES, arrivalSeconds, type Insights, type Source } from "../claims";
import { PEREIRA } from "../../../core/places";
import { REGION, TOWNS } from "../region";
import { questionsCopy, type Named } from "./copy";
import { fmtInt, fmtKm } from "../shared";
import { FILL } from "../tones";
import { useReducedMotion } from "../use-reduced-motion";
import { presets, ratioPhrase, relativeAmplitude, toPereira, type Preset } from "./derive";
import { Choice, Figure, RangeField, Swatch, useWidth } from "./ui";

const KM_PER_DEG = 111.195;
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
        <MiniMap data={data} epi={epi} source={active?.event} ringKm={ringKm} refNamed={ref} />
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
            label={c.magnitude}
            value={mag}
            display={`M${mag.toFixed(1)}`}
            min={2}
            max={8}
            step={0.1}
            onChange={custom(setMag)}
          />
          <RangeField
            label={c.distance}
            value={epi}
            display={fmtKm(epi)}
            min={0}
            max={250}
            step={1}
            onChange={custom(setEpi)}
          />
          <RangeField
            label={c.depth}
            value={depth}
            display={fmtKm(depth)}
            min={0}
            max={150}
            step={1}
            onChange={custom(setDepth)}
          />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-4 text-sm">
            <div>
              <dt className="text-muted-foreground">{c.straight}</dt>
              <dd className="text-lg font-semibold tabular-nums">{fmtKm(km)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{c.motion(ref)}</dt>
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

/** Pereira, every event coloured by source, a ring at the sources' distance and the reader's chosen one. */
function MiniMap({
  data,
  epi,
  source,
  ringKm,
  refNamed,
}: {
  data: Insights;
  epi: number;
  source?: { lat: number; lon: number };
  ringKm: number;
  refNamed: Named;
}) {
  const { lang } = useI18n();
  const c = questionsCopy[lang].far;
  const [box, w] = useWidth(MAP);
  const { path, project } = useMemo(() => {
    const box = {
      type: "Feature" as const,
      properties: {},
      geometry: {
        type: "MultiPoint" as const,
        coordinates: [
          [-77.3, 3.3],
          [-74.4, 5.95],
        ],
      },
    };
    const projection = geoMercator().fitExtent(
      [
        [4, 4],
        [MAP - 4, MAP - 4],
      ],
      box,
    );
    return { path: geoPath(projection), project: (lon: number, lat: number) => projection([lon, lat]) ?? [0, 0] };
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
  const towns = TOWNS.filter((t) => t.kind === "city");
  const labels: { s: Source; lat: number; lon: number; text: string }[] = [
    { s: "shallow", lat: 4.3, lon: -76.95, text: c.labelShallow },
    { s: "deep", lat: 5.14, lon: -76.3, text: c.labelDeep(refNamed) },
    { s: "tolima", lat: 3.6, lon: -75.55, text: c.labelTolima },
  ];

  // The drawing scales with its column, so its text is sized in screen pixels: `k` viewBox units per
  // pixel. In viewBox units alone the town names came out at 7 px on a 320 px phone.
  const k = MAP / Math.max(1, w);

  return (
    <div ref={box} className="min-w-0">
      <svg
        viewBox={`0 0 ${MAP} ${MAP}`}
        role="img"
        aria-label={c.mapAria}
        className="aspect-square w-full rounded-lg bg-background"
      >
        <g className="fill-muted stroke-border">
          {REGION.features.map((f) => (
            <path key={f.properties.name} d={path(f) ?? ""} strokeWidth={0.8} />
          ))}
        </g>
        <path d={circle(ringKm)} fill="none" strokeDasharray="4 4" className="stroke-muted-foreground" />
        <path d={circle(Math.max(1, epi))} fill="none" strokeWidth={1.5} className="stroke-chart-2" />
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
        {towns.map((t) => {
          const [x, y] = project(t.lon, t.lat);
          return (
            <g key={t.id} transform={`translate(${x},${y})`} className="fill-muted-foreground">
              <circle r={2} />
              {/* The halo lifts the grey off the grey land: 4.34:1 on it in light mode, 4.73:1 on the page. */}
              <text x={5} y={4} fontSize={11 * k} paintOrder="stroke" strokeWidth={3 * k} className="stroke-background">
                {t.name}
              </text>
            </g>
          );
        })}
        {labels.map((l) => {
          const [x, y] = project(l.lon, l.lat);
          return (
            <text
              key={l.s}
              x={x}
              y={y}
              textAnchor="middle"
              fontSize={12 * k}
              fontWeight={600}
              paintOrder="stroke"
              strokeWidth={3 * k}
              className="fill-foreground stroke-background"
            >
              {/* The words in the text colour and the source's colour on a dot: the blue (4.42:1, light)
                  and the violet (3.87:1, dark) are too faint for 12 px text. */}
              <tspan className={FILL[l.s]}>●</tspan> {l.text}
            </text>
          );
        })}
        <g transform={`translate(${px},${py})`}>
          <circle r={9} className="fill-place/25" />
          <circle r={4.5} strokeWidth={1.5} className="fill-place stroke-background" />
          <text
            x={9}
            y={-8}
            fontSize={14 * k}
            fontWeight={700}
            paintOrder="stroke"
            strokeWidth={3 * k}
            className="fill-foreground stroke-background"
          >
            Pereira
          </text>
        </g>
      </svg>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block w-5 border-t border-dashed border-muted-foreground" />
          {c.ring(ringKm)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block w-5 border-t-2 border-chart-2" />
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

/** P and S waves racing from the source to Pereira, sped up. Reduced motion shows the finish. */
function WaveRace({ km }: { km: number }) {
  const { lang } = useI18n();
  const c = questionsCopy[lang].far;
  const reduced = useReducedMotion();
  const [ref, w] = useWidth();
  const { p, s } = arrivalSeconds(km);
  const [elapsed, setElapsed] = useState(s);
  const frame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  // A new distance shows its finished race; the button runs it.
  useEffect(() => {
    cancelAnimationFrame(frame.current);
    setElapsed(s);
  }, [s]);
  const play = () => {
    cancelAnimationFrame(frame.current);
    if (reduced) return setElapsed(s);
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
          <PlayIcon />
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
      <p className="mt-2 max-w-prose text-sm text-pretty">{c.raceNote(s - p)}</p>
    </div>
  );
}
