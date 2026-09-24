/**
 * "La historia": the scrolling story. A drawing is pinned beside the text (above it on a phone)
 * and changes as each step reaches the middle of the window. Every statement about the data is a
 * claim from `../claims.ts` in its sentence from `../copy.ts`, or a figure computed here from the
 * same `Insights`; the story's own copy is in `copy.ts`.
 */
import { scaleLinear, scaleTime } from "d3-scale";
import { useMemo, useState, type ReactNode } from "react";
import { Slider } from "@/components/ui/slider";
import { useI18n, type Lang } from "@/lib/i18n";
import { fmtDay } from "@/lib/format";
import {
  P_WAVE_KMS,
  S_WAVE_KMS,
  arrivalSeconds,
  decay,
  lastStrong,
  recentStrong,
  strongDays,
  type Insights,
} from "../claims";
import { energyRatio } from "@bvalue/seismo";
import { insightsCopy } from "../copy";
import { storyCopy } from "./copy";
import { fmt, fmtKm, fmtMag, fmtPct, roundSig } from "../shared";
import { FILL } from "../tones";
import { Graphic, type SceneId } from "./graphic";
import { useActiveStep, useSize, useWide } from "./hooks";
import { MainName, Note, Num, SourceName } from "./marks";
import { storyModel, type StoryModel } from "./model";
import { Rich } from "./rich";

interface Step {
  id: string;
  scene: SceneId;
  sub: string;
  chapter?: string;
  title: string;
  body: ReactNode;
}

const DAY = 86_400_000;

export function Story({ data }: { data: Insights }) {
  const { lang } = useI18n();
  const model = useMemo(() => storyModel(data), [data]);
  const [threshold, setThreshold] = useState(4);
  const wide = useWide();
  const steps = useSteps(data, model, lang, threshold, setThreshold);
  const { active, register } = useActiveStep(steps.length, wide);
  const [graphicRef, size] = useSize<HTMLDivElement>();
  const current = steps[active] ?? steps[0]!;

  return (
    <div className="flex flex-col">
      <Hero data={data} model={model} lang={lang} />
      <section className="relative md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-10">
        {/* The drawing keeps a fixed box, half the window on a phone and all of it beside the text,
            so nothing moves when it is measured and drawn. */}
        <div className="sticky top-0 z-10 h-[50svh] border-b bg-background py-2 md:order-2 md:h-svh md:self-start md:border-b-0 md:py-6">
          <div ref={graphicRef} className="size-full">
            <Graphic
              data={data}
              model={model}
              state={{ scene: current.scene, sub: current.sub, threshold }}
              width={size.width}
              height={size.height}
              lang={lang}
            />
          </div>
        </div>
        <div className="md:order-1">
          {steps.map((s, i) => (
            <article
              key={s.id}
              ref={register(i)}
              aria-current={i === active ? "step" : undefined}
              data-active={i === active || undefined}
              className="flex min-h-[70svh] flex-col justify-start pt-10 pb-16 text-muted-foreground transition-colors duration-500 data-active:text-foreground md:min-h-[90svh] md:justify-center md:py-24 motion-reduce:transition-none"
            >
              <div className="mx-auto flex w-full max-w-prose flex-col gap-4">
                {s.chapter && (
                  <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">{s.chapter}</p>
                )}
                <h2 className="text-2xl leading-tight font-semibold tracking-tight text-balance md:text-3xl">
                  {s.title}
                </h2>
                <div className="flex flex-col gap-4 text-lg leading-relaxed text-pretty">{s.body}</div>
              </div>
            </article>
          ))}
          <div className="h-[30svh]" />
        </div>
      </section>
    </div>
  );
}

// =============================================================================================

function Hero({ data, model, lang }: { data: Insights; model: StoryModel; lang: Lang }) {
  const c = storyCopy[lang].hero;
  const claims = insightsCopy[lang].claims;
  const mix = recentStrong(data.sources, data.now, 4, 7);
  const [ref, size] = useSize<HTMLDivElement>();
  const h = 96;
  const x = scaleTime()
    .domain([model.start, data.now])
    .range([6, Math.max(7, size.width - 6)]);
  const strong = model.strongSince;
  const maxMag = Math.max(5, ...strong.map((e) => e.mag));
  const y = scaleLinear()
    .domain([3.8, maxMag])
    .range([h - 22, 14]);
  const ticks: number[] = [];
  const every = (size.width < 560 ? 14 : 7) * DAY;
  for (let t = model.start; t < data.now - 3 * DAY; t += every) ticks.push(t);
  const main = model.main;
  const mainWord = storyCopy[lang].main(data.mainshock.choco.state);

  return (
    <header className="flex min-h-[80svh] flex-col justify-center gap-6 py-12">
      <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">{c.kicker}</p>
      <p className="flex flex-col gap-3">
        <span className="text-8xl leading-none font-semibold tracking-tighter tabular-nums md:text-9xl">
          {mix.total}
        </span>
        <span className="max-w-3xl text-2xl leading-tight font-medium tracking-tight text-balance md:text-4xl">
          {c.headline(mix.total)}
        </span>
      </p>
      <p className="max-w-2xl text-lg leading-relaxed text-pretty">{claims.strongMix(mix, 4, 7)}</p>
      <p className="max-w-2xl text-lg leading-relaxed text-pretty text-muted-foreground">
        <Rich text={c.intro} parts={{ date: fmtDay(model.start, lang) }} />
      </p>

      <figure className="flex flex-col gap-2">
        <figcaption className="text-xs text-muted-foreground">
          <Rich
            text={c.strip}
            parts={{
              date: fmtDay(model.start, lang),
              n: fmt(strong.length + (main ? 1 : 0)),
              main: main ? `${mainWord} (${fmtMag(main.mag)})` : "",
            }}
          />
        </figcaption>
        <Legend lang={lang} />
        <div ref={ref} className="h-28 w-full">
          {size.width > 0 && (
            <svg
              width={size.width}
              height={h + 16}
              className="block overflow-visible"
              role="img"
              aria-label={c.stripAria.replace("{date}", fmtDay(model.start, lang))}
            >
              <line x1={0} x2={size.width} y1={h - 10} y2={h - 10} className="stroke-border" />
              {ticks.map((t) => (
                <text key={t} x={x(t)} y={h + 8} fontSize={11} className="fill-muted-foreground tabular-nums">
                  {fmtDay(t, lang)}
                </text>
              ))}
              {strong.map((e) => (
                <line
                  key={e.id}
                  x1={x(e.t)}
                  x2={x(e.t)}
                  y1={h - 10}
                  y2={y(e.mag)}
                  className={
                    e.source === "shallow"
                      ? "stroke-chart-1"
                      : e.source === "deep"
                        ? "stroke-chart-4"
                        : "stroke-chart-5"
                  }
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              ))}
              {main && (
                <g>
                  <line
                    x1={x(main.t)}
                    x2={x(main.t)}
                    y1={h - 10}
                    y2={0}
                    className="stroke-chart-2"
                    strokeWidth={3}
                    strokeLinecap="round"
                  />
                  <text x={x(main.t) + 8} y={11} fontSize={12} fontWeight={600} className="fill-foreground">
                    {fmtMag(main.mag)}
                  </text>
                </g>
              )}
            </svg>
          )}
        </div>
      </figure>
      <p className="text-sm text-muted-foreground">{c.scroll} ↓</p>
    </header>
  );
}

function Legend({ lang }: { lang: Lang }) {
  const l = storyCopy[lang].legend;
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {(["shallow", "deep", "tolima"] as const).map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <svg aria-hidden width={10} height={10}>
            <circle cx={5} cy={5} r={5} className={FILL[s]} />
          </svg>
          {l[s]}
        </span>
      ))}
    </p>
  );
}

// =============================================================================================

function useSteps(
  data: Insights,
  model: StoryModel,
  lang: Lang,
  threshold: number,
  setThreshold: (n: number) => void,
): Step[] {
  const c = storyCopy[lang];
  const claims = insightsCopy[lang].claims;
  const main = model.main;
  const mainState = data.mainshock.choco.state;
  const mainWord = c.main(mainState);
  const mainDate = main ? fmtDay(main.t, lang) : fmtDay(model.start, lang);
  const mc = data.mc.choco;
  const d = data.distances;
  const f = model.facts;

  const names = {
    shallow: <SourceName source="shallow">{c.names.shallow}</SourceName>,
    deep: <SourceName source="deep">{c.names.deep}</SourceName>,
    tolima: <SourceName source="tolima">{c.names.tolima}</SourceName>,
  };
  const km = (v: number | undefined | null, digits = 0) => (v == null ? "—" : <Num>{fmtKm(v, digits)}</Num>);

  // The shallow group's own aftershock test, from the same rule the deep group gets.
  const shallowDecay = mc === null ? null : decay(data.sources.shallow, mc, model.start, data.now);
  const pace = data.shallowPace;
  const deepDecay = data.deepDecay;
  const afterWeek1 = model.choco.filter((e) => e.t >= model.start + 7 * DAY && (mc === null || e.mag >= mc));
  const shallowPct = afterWeek1.length
    ? (afterWeek1.filter((e) => e.source === "shallow").length / afterWeek1.length) * 100
    : null;

  // The same days the calendar draws, so the sentence and the drawing cannot disagree.
  const days = useMemo(() => {
    const all = strongDays(data.sources, model.start, data.now, threshold);
    return { k: all.filter((x) => x.bySource.shallow + x.bySource.deep + x.bySource.tolima > 0).length, n: all.length };
  }, [data.sources, model.start, data.now, threshold]);
  const mix = recentStrong(data.sources, data.now, threshold, 7);
  const last = lastStrong(data.sources, threshold);
  const lastChoco = [last.shallow, last.deep]
    .filter((e) => e !== null)
    .sort((a, b) => Date.parse(b.time) - Date.parse(a.time))[0];

  const steps: Step[] = [];

  steps.push({
    id: "where",
    scene: "where",
    sub: "",
    chapter: c.where.chapter,
    title: c.where.title(f.distancesSimilar),
    body: (
      <>
        <p>
          <Rich text={c.where.p1} parts={{ ...names, main: mainWord, date: mainDate }} />
        </p>
        <p>
          <Rich text={c.where.p2} parts={{ n: <Num>{fmt(model.all.length)}</Num>, date: fmtDay(model.start, lang) }} />
        </p>
        <p>
          <Rich
            text={c.where.p3}
            parts={{
              shallowKm: km(d.shallow?.hypocentralKm),
              deepKm: km(d.deep?.hypocentralKm),
              tolimaKm: km(d.tolima?.hypocentralKm),
            }}
          />
        </p>
        <Note>{c.where.note}</Note>
      </>
    ),
  });

  if (main && model.energy.choco[0] !== undefined) {
    const eq = model.equivalents!;
    steps.push({
      id: "energy-share",
      scene: "energy",
      sub: "share",
      chapter: c.energy.chapter,
      title: c.energy.title(f.mainDominant),
      body: (
        <>
          <p>
            <Rich
              text={c.energy.p1}
              parts={{
                main: mainWord,
                date: mainDate,
                mag: <Num>{main.mag.toFixed(1)}</Num>,
                magLabel: fmtMag(main.mag),
                n: <Num>{fmt(model.choco.length - 1)}</Num>,
              }}
            />
          </p>
          <p>
            <Rich
              text={c.energy.p2(f.mainHoldsMost)}
              parts={{
                magLabel: <MainName>{fmtMag(main.mag)}</MainName>,
                share: <Num>{claims.sharePhrase(model.energy.choco[0])}</Num>,
              }}
            />
          </p>
        </>
      ),
    });
    steps.push({
      id: "energy-ladder",
      scene: "energy",
      sub: "ladder",
      title: c.energy.ladderTitle,
      body: (
        <>
          <p>
            <Rich
              text={c.energy.ladder1}
              parts={{ x1: <Num>{fmt(energyRatio(5, 4), 1)}</Num>, x2: <Num>{fmt(energyRatio(6, 4))}</Num> }}
            />
          </p>
          {model.largestAfter && eq.toLargestAfter !== null && (
            <p>
              <Rich
                text={c.energy.ladder2}
                parts={{
                  magLabel: fmtMag(main.mag),
                  nAfter: <Num>{fmt(roundSig(eq.toLargestAfter))}</Num>,
                  after: fmtMag(model.largestAfter.mag),
                  afterDate: fmtDay(model.largestAfter.t, lang),
                  nM4: <Num>{fmt(roundSig(eq.toM4))}</Num>,
                }}
              />
            </p>
          )}
          {mainState === "found" && <p>{c.energy.ladder3}</p>}
          <Note>{c.energy.note}</Note>
        </>
      ),
    });
  }

  steps.push({
    id: "section",
    scene: "section",
    sub: "",
    chapter: c.section.chapter,
    title: c.section.title,
    body: (
      <>
        <p>{c.section.p1}</p>
        {main && (
          <>
            <p>
              {c.section.p2}{" "}
              <Rich
                text={c.section.p2Main(f.deepNearMain)}
                parts={{
                  main: mainWord,
                  depth: km(main.depthKm),
                  deep: names.deep,
                  n: <Num>{fmt(model.bySrc.deep.length)}</Num>,
                  km: km(f.deepFromMainKm),
                }}
              />
            </p>
            {model.mainEpiKm !== null && model.mainHypoKm !== null && (
              <p>
                <Rich text={c.section.p3} parts={{ epi: km(model.mainEpiKm), hypo: km(model.mainHypoKm) }} />
              </p>
            )}
          </>
        )}
        <p>
          <Rich text={c.section.p4(f.shallowWest)} parts={{ shallow: names.shallow, depth: km(d.shallow?.depthKm) }} />
          {f.eastDeeper && ` ${c.section.eastDeeper}`}
        </p>
      </>
    ),
  });

  if (model.errors.choco.h !== null && model.errors.choco.depth !== null) {
    steps.push({
      id: "section-caveat",
      scene: "section",
      sub: "caveat",
      title: c.section.caveatTitle,
      body: (
        <>
          <p>
            <Rich
              text={c.section.caveat1}
              parts={{ h: km(model.errors.choco.h, 1), depth: km(model.errors.choco.depth, 1) }}
            />
          </p>
          {f.depthsSnapped && (
            <p>
              <Rich
                text={c.section.caveat2}
                parts={{ depths: model.snappedDepths.map((x) => fmtKm(x.depthKm, 1)).join(", ") }}
              />
            </p>
          )}
        </>
      ),
    });
  }

  if (deepDecay && mc !== null) {
    steps.push({
      id: "clocks-deep",
      scene: "clocks",
      sub: "deep",
      chapter: c.clocks.chapter,
      title: c.clocks.deepTitle(deepDecay.case),
      body: (
        <>
          <p>{c.clocks.deep1}</p>
          <p>
            <Rich text={c.clocks.deep2} parts={{ deep: names.deep, claim: claims.decay(deepDecay) }} />
          </p>
          <Note>
            <Rich text={c.clocks.deepNote} parts={{ mc: fmtMag(mc) }} />
          </Note>
        </>
      ),
    });
  }

  if (shallowDecay && mc !== null) {
    steps.push({
      id: "clocks-shallow",
      scene: "clocks",
      sub: "shallow",
      title: c.clocks.shallowTitle(shallowDecay.case),
      body: (
        <>
          <p>
            <Rich text={c.clocks.shallow1} parts={{ shallow: names.shallow, claim: claims.decay(shallowDecay) }} />
          </p>
          {shallowDecay.case === "not-decayed" && shallowPct !== null && (
            <p>
              <Rich
                text={c.clocks.shallowAnswer}
                parts={{ main: mainWord, pct: <Num>{fmtPct(shallowPct, lang)}</Num> }}
              />
            </p>
          )}
          <p>
            <Rich
              text={c.clocks.shallowWeeks(f.weekInProgress)}
              parts={{ date: fmtDay(model.start, lang), weeks: <Num>{model.shallowStrongWeeks.join(", ")}</Num> }}
            />
          </p>
          {shallowDecay.case === "not-decayed" && (
            <p>
              <Rich text={c.clocks.why} parts={{ main: mainWord }} />
            </p>
          )}
        </>
      ),
    });
  }

  if (pace && pace.case !== "young") {
    steps.push({
      id: "clocks-pace",
      scene: "clocks",
      sub: "pace",
      title: c.clocks.paceTitle(pace.case),
      body: (
        <>
          <p>
            <Rich text={c.clocks.pace} parts={{ shallow: names.shallow, claim: claims.pace(pace, lang) }} />
          </p>
          <Note>
            {c.clocks.paceNote}
            {(pace.pastLulls.length > 0 || pace.quietSince !== null) && ` ${c.clocks.lullNote}`}
          </Note>
        </>
      ),
    });
  }

  if (model.bySrc.tolima.length > 0 && data.start.tolima !== null) {
    const tState = data.mainshock.tolima.state;
    steps.push({
      id: "tolima-share",
      scene: "tolima",
      sub: "share",
      chapter: c.tolima.chapter,
      title: c.tolima.title(tState),
      body: (
        <>
          <p>
            <Rich
              text={c.tolima.p1(tState)}
              parts={{
                date: fmtDay(data.start.tolima, lang),
                km: km(model.chocoToTolimaKm === null ? null : roundSig(model.chocoToTolimaKm, 2)),
                main: mainWord,
                tolima: names.tolima,
              }}
            />{" "}
            {tState !== "none" && c.tolima.stillSwarm}
          </p>
          {data.largestShare.choco !== null && data.largestShare.tolima !== null && model.tolimaLargest && (
            <p>
              <Rich
                text={c.tolima.p2}
                parts={{
                  chocoShare: <Num>{claims.sharePhrase(data.largestShare.choco)}</Num>,
                  tolimaShare: <Num>{claims.sharePhrase(data.largestShare.tolima)}</Num>,
                  mag: fmtMag(model.tolimaLargest.mag),
                }}
              />
            </p>
          )}
          {model.tolimaPerDay !== null && model.tolimaDepth !== null && (
            <p>
              <Rich
                text={c.tolima.p3(f.tolimaCrustal)}
                parts={{ perDay: <Num>{fmt(model.tolimaPerDay)}</Num>, depth: km(model.tolimaDepth) }}
              />
            </p>
          )}
          <Note>{c.energy.note}</Note>
        </>
      ),
    });
    steps.push({
      id: "tolima-drift",
      scene: "tolima",
      sub: "drift",
      title: c.tolima.driftTitle(data.tolimaDrift.case),
      body: (
        <>
          <p>{claims.drift(data.tolimaDrift)}</p>
          <p>{c.tolima.driftHow(data.tolimaDrift.case === "moved")}</p>
          {data.tolimaDrift.case === "moved" && <p>{c.tolima.driftElsewhere}</p>}
          <p>
            <Rich text={c.tolima.hypothesis} parts={{ date: mainDate }} />
          </p>
          <Note>{c.tolima.note}</Note>
        </>
      ),
    });
  }

  steps.push({
    id: "felt-calendar",
    scene: "felt",
    sub: "calendar",
    chapter: c.felt.chapter,
    title: c.felt.title,
    body: (
      <>
        <p>{c.felt.p1(f.distancesSimilar)}</p>
        <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 text-card-foreground">
          <div className="flex items-baseline justify-between gap-4">
            <span id="story-threshold-label" className="text-sm text-muted-foreground">
              {c.felt.slider}
            </span>
            <span className="text-2xl font-semibold tabular-nums">{fmtMag(threshold)}</span>
          </div>
          <Slider
            aria-labelledby="story-threshold-label"
            aria-valuetext={fmtMag(threshold)}
            min={3}
            max={5}
            step={0.1}
            value={[threshold]}
            onValueChange={([v]) => setThreshold(Math.round((v ?? 4) * 10) / 10)}
          />
        </div>
        <p>
          <Rich
            text={c.felt.days}
            parts={{
              mag: fmtMag(threshold),
              k: <Num>{fmt(days.k)}</Num>,
              n: <Num>{fmt(days.n)}</Num>,
              date: fmtDay(model.start, lang),
            }}
          />
        </p>
        <p>{claims.strongMix(mix, threshold, 7)}</p>
        {lastChoco && <p>{claims.lastChoco(Date.parse(lastChoco.time), threshold, lang)}</p>}
        <Note>{c.felt.note}</Note>
      </>
    ),
  });

  if (main && model.mainHypoKm !== null) {
    const a = arrivalSeconds(model.mainHypoKm);
    steps.push({
      id: "felt-waves",
      scene: "felt",
      sub: "waves",
      title: c.felt.wavesTitle,
      body: (
        <>
          <p>
            <Rich text={c.felt.waves1} parts={{ vp: fmtKm(P_WAVE_KMS, 1), vs: fmtKm(S_WAVE_KMS, 1) }} />
          </p>
          <p>
            <Rich
              text={c.felt.waves2}
              parts={{
                magLabel: fmtMag(main.mag),
                km: km(model.mainHypoKm),
                p: <Num>{`${fmt(a.p)} s`}</Num>,
                s: <Num>{`${fmt(a.s)} s`}</Num>,
              }}
            />
          </p>
          <Note>{c.felt.wavesNote}</Note>
        </>
      ),
    });
  }

  steps.push({
    id: "unknown",
    scene: "unknown",
    sub: "",
    chapter: c.unknown.chapter,
    title: c.unknown.title,
    body: (
      <>
        <ul className="flex flex-col gap-3">
          {[
            c.unknown.shallowWhy(shallowDecay?.case ?? null),
            c.unknown.items[0]!,
            c.unknown.shallowNext(pace?.case ?? null),
            ...c.unknown.items.slice(1),
          ].map((t) => (
            <li key={t} className="flex gap-3">
              <span aria-hidden className="mt-3 inline-block size-1.5 shrink-0 rounded-full bg-muted-foreground" />
              <span>
                <Rich text={t} parts={{ date: mainDate }} />
              </span>
            </li>
          ))}
        </ul>
        <p>{c.unknown.closing}</p>
      </>
    ),
  });

  return steps;
}
