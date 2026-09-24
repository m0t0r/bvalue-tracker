/**
 * "Preguntas": the questions a reader in Pereira asks, in their own words, each with a plain answer,
 * one focused drawing and a one-line takeaway. A single column, with an index of the questions that
 * stays beside the text on a wide screen and sits under the header on a phone.
 *
 * Every figure here is computed from `data` at render, and every trend is a claim from `claims.ts`
 * said by its sentence in `../copy.ts`.
 */
import { energyRatio, epicentralKm } from "@bvalue/seismo";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { dayStart, fmtDay } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { SOURCES, decay, lastStrong, recentStrong, type Insights, type QuakeLike } from "../claims";
import { insightsCopy } from "../copy";
import { BothZonesTimeline, DriftMultiples, EnergyShare, FeltCalendar, TwoClocks } from "./charts";
import { questionsCopy, type Named } from "./copy";
import { commonDepths, fmtInt, median, medianHorizontalErrorKm, roundSig } from "../shared";
import { colombianDays, toPereira } from "./derive";
import { EnergyDots, pct } from "./energy-dots";
import { FeelExplorer } from "./feel";
import { P, Takeaway } from "./ui";

const WEEK = 7 * 86_400_000;
const DAY = 86_400_000;

/** Whether Chocó had any event above its Mc in the last 7 days: "sigue temblando" or "siguió". */
const chocoStillActive = (data: Insights) =>
  data.mc.choco !== null &&
  [...data.sources.shallow, ...data.sources.deep].some(
    (e) => e.mag >= data.mc.choco! && Date.parse(e.time) > data.now - 7 * DAY && Date.parse(e.time) <= data.now,
  );

export function Questions({ data }: { data: Insights }) {
  const { lang } = useI18n();
  const q = questionsCopy[lang];
  const ref = data.mainshock.choco.largest;
  const [threshold, setThreshold] = useState(4);
  if (!ref) return null;
  const named: Named = { mag: ref.mag, date: fmtDay(Date.parse(ref.time), lang) };
  const weeks = Math.floor((data.now - Date.parse(ref.time)) / WEEK);
  const still = chocoStillActive(data);

  const sections: { id: string; short: string; q: string; body: ReactNode }[] = [
    { id: "q-far", short: q.far.short, q: q.far.q, body: <Far data={data} reference={ref} named={named} /> },
    // The energy dots only make sense for an event well above the M4.0 each dot stands for.
    ...(ref.mag >= 5
      ? [
          {
            id: "q-big",
            short: q.big.short,
            q: q.big.q(named),
            body: <Big data={data} reference={ref} named={named} />,
          },
        ]
      : []),
    {
      id: "q-stop",
      short: q.stop.short,
      q: weeks >= 2 ? q.stop.q(weeks, still) : q.stop.qSoon(still),
      body: <Stop data={data} reference={ref} />,
    },
    { id: "q-swarm", short: q.swarm.short, q: q.swarm.q, body: <Swarm data={data} /> },
    { id: "q-linked", short: q.linked.short, q: q.linked.q, body: <Linked data={data} reference={ref} /> },
    {
      id: "q-felt",
      short: q.felt.short,
      q: q.felt.q,
      body: <Felt data={data} threshold={threshold} onThreshold={setThreshold} />,
    },
    { id: "q-bigger", short: q.bigger.short, q: q.bigger.q, body: <Bigger /> },
    { id: "q-unknown", short: q.unknown.short, q: q.unknown.q, body: <Unknown data={data} /> },
  ];
  return <Layout data={data} reference={ref} named={named} sections={sections} />;
}

function Layout({
  data,
  reference,
  named,
  sections,
}: {
  data: Insights;
  reference: QuakeLike;
  named: Named;
  sections: { id: string; short: string; q: string; body: ReactNode }[];
}) {
  const { lang } = useI18n();
  const q = questionsCopy[lang];
  const active = useActiveSection(sections.map((s) => s.id));
  const stats = useMemo(() => {
    const kms = SOURCES.flatMap((s) => (data.distances[s] ? [data.distances[s].hypocentralKm] : []));
    const strong = SOURCES.reduce((n, s) => n + data.sources[s].filter((e) => e.mag >= 4 && e !== reference).length, 0);
    return {
      km: Math.round(kms.reduce((a, b) => a + b, 0) / Math.max(1, kms.length) / 5) * 5,
      strong,
      recent: recentStrong(data.sources, data.now, 4).total,
    };
  }, [data, reference]);

  return (
    <div className="lg:flex lg:gap-12">
      <aside className="hidden lg:sticky lg:top-6 lg:block lg:w-56 lg:shrink-0 lg:self-start">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{q.indexTitle}</p>
        <QuestionIndex sections={sections} active={active} />
      </aside>

      <div className="min-w-0 max-w-3xl flex-1">
        <header className="pb-6">
          <p className="text-sm font-medium text-muted-foreground">{q.kicker}</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{q.title}</h2>
          <p className="mt-4 max-w-prose text-lg text-pretty text-muted-foreground">{q.lede}</p>
          <dl className="mt-8 grid grid-cols-3 gap-4 border-y py-5">
            <Stat value={q.stats.km(stats.km)} label={q.stats.kmLabel} />
            <Stat value={fmtInt(stats.strong)} label={q.stats.strongLabel(named)} />
            <Stat value={fmtInt(stats.recent)} label={q.stats.recentLabel} />
          </dl>
        </header>
        <nav aria-label={q.indexTitleMobile} className="lg:hidden">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{q.indexTitleMobile}</p>
          <QuestionIndex sections={sections} active={null} />
        </nav>

        {sections.map((s, i) => (
          <section
            key={s.id}
            id={s.id}
            aria-labelledby={`${s.id}-h`}
            className="scroll-mt-6 border-b py-12 last:border-0"
          >
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{q.question(i + 1)}</p>
            <h3
              id={`${s.id}-h`}
              className="mt-2 max-w-prose text-xl font-semibold tracking-tight text-balance sm:text-2xl"
            >
              <span aria-hidden>“</span>
              {s.q}
              <span aria-hidden>”</span>
            </h3>
            <div className="mt-5">{s.body}</div>
          </section>
        ))}
      </div>
    </div>
  );
}

function QuestionIndex({ sections, active }: { sections: { id: string; short: string }[]; active: string | null }) {
  return (
    <ol className="mt-3 flex flex-col gap-0.5">
      {sections.map((s, i) => {
        const on = active === s.id;
        return (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              aria-current={on ? "location" : undefined}
              className={cn(
                "flex gap-3 rounded-md px-2 py-1.5 text-sm transition-colors pointer-coarse:py-3 outline-none focus-visible:ring-3 focus-visible:ring-ring",
                on ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="w-4 shrink-0 text-right tabular-nums">{i + 1}</span>
              <span>{s.short}</span>
            </a>
          </li>
        );
      })}
    </ol>
  );
}

// The figure is drawn above its label, so the reversed column is packed from its end, the top: the
// three figures then share one line however many lines each label wraps to.
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex min-w-0 flex-col-reverse justify-end gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">{value}</dd>
    </div>
  );
}

/** The question whose section is nearest the top of the reading area, for the index. */
function useActiveSection(ids: string[]) {
  const [active, setActive] = useState(ids[0] ?? null);
  const key = ids.join();
  useEffect(() => {
    const els = key
      .split(",")
      .map((id) => document.getElementById(id))
      .filter((e): e is HTMLElement => e !== null);
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -65% 0px" },
    );
    for (const el of els) io.observe(el);
    return () => io.disconnect();
  }, [key]);
  return active;
}

// ---------------------------------------------------------------------------------------------
// The answers

function Far({ data, reference, named }: { data: Insights; reference: QuakeLike; named: Named }) {
  const { lang } = useI18n();
  const c = questionsCopy[lang].far;
  const kms = SOURCES.flatMap((s) => (data.distances[s] ? [data.distances[s].hypocentralKm] : []));
  const lo = Math.min(...kms),
    hi = Math.max(...kms);
  const ring = Math.round(kms.reduce((a, b) => a + b, 0) / kms.length / 5) * 5;
  const d = toPereira(reference);
  // "Almost the same as the others" only while the reference sits within the sources' own range.
  const similar = d.hypo >= lo * 0.85 && d.hypo <= hi * 1.15;
  return (
    <>
      <P>{c.p1(lo, hi)}</P>
      <P>{c.p2(named, d.epi, reference.depthKm, d.hypo, similar)}</P>
      <FeelExplorer data={data} reference={{ ...named, km: d.hypo }} ringKm={ring} />
      <Takeaway label={questionsCopy[lang].inOneSentence}>{c.takeaway(ring, named, similar)}</Takeaway>
    </>
  );
}

function Big({ data, reference, named }: { data: Insights; reference: QuakeLike; named: Named }) {
  const { lang } = useI18n();
  const c = questionsCopy[lang].big;
  const units = fmtInt(roundSig(energyRatio(reference.mag, 4), 2));
  const s = data.largestShare.choco;
  return (
    <>
      <P>{c.p1(named, units)}</P>
      <EnergyDots data={data} reference={named} refEvent={reference} />
      {s !== null ? (
        <Takeaway label={questionsCopy[lang].inOneSentence}>
          {c.takeaway(pct(1 - s, s), named, (1 - s) / s < 0.1)}
        </Takeaway>
      ) : null}
    </>
  );
}

function Stop({ data, reference }: { data: Insights; reference: QuakeLike }) {
  const { lang } = useI18n();
  const c = questionsCopy[lang].stop;
  const claims = insightsCopy[lang].claims;
  const shallow = data.sources.shallow;
  const fromRef = median(shallow, (e) => epicentralKm(e, reference)) ?? 0;
  const mc = data.mc.choco;
  const t0 = Date.parse(reference.time);
  // The shallow group through the same `decay` rule as the deep one, so "why has it not faded"
  // is only asked when it has not.
  const shallowDecay = mc === null ? null : decay(shallow, mc, t0, data.now);
  const share = useMemo(() => {
    if (mc === null) return null;
    const after = (e: QuakeLike) => e.mag >= mc && Date.parse(e.time) >= t0 + 7 * DAY && Date.parse(e.time) <= data.now;
    const s = shallow.filter(after).length,
      all = s + data.sources.deep.filter(after).length;
    return all === 0 ? null : { pct: fmtInt((100 * s) / all), mc };
  }, [data, shallow, mc, t0]);
  return (
    <>
      <P>{c.p1(data.distances.deep?.depthKm ?? 0)}</P>
      {data.deepDecay ? (
        <P>
          <strong className="font-semibold">{c.deepLabel}</strong> {claims.decay(data.deepDecay)}
        </P>
      ) : null}
      <P>{c.p2(data.distances.shallow?.depthKm ?? 0, fromRef, share)}</P>
      {data.shallowPace ? (
        <P>
          <strong className="font-semibold">{c.shallowLabel}</strong> {claims.pace(data.shallowPace, lang)}
        </P>
      ) : null}
      <TwoClocks data={data} reference={reference} />
      {shallowDecay?.case === "not-decayed" ? <P>{c.why}</P> : null}
      {data.deepDecay ? (
        <Takeaway label={questionsCopy[lang].inOneSentence}>
          {c.takeaway(data.deepDecay.case, shallowDecay?.case ?? "young")}
        </Takeaway>
      ) : null}
    </>
  );
}

function Swarm({ data }: { data: Insights }) {
  const { lang } = useI18n();
  const c = questionsCopy[lang].swarm;
  const claims = insightsCopy[lang].claims;
  const start = data.start.tolima;
  const tolima = data.sources.tolima;
  const assessment = data.mainshock.tolima;
  if (start === null || tolima.length === 0) return null;
  const perDay = tolima.length / Math.max(1, (data.now - start) / DAY);
  return (
    <>
      <P>{c.p1(fmtDay(start, lang), data.distances.tolima?.depthKm ?? 0, perDay, assessment.state)}</P>
      {assessment.largest ? <P>{c.state(assessment.state, assessment.largest.mag, assessment.gap)}</P> : null}
      <EnergyShare data={data} />
      <P>{c.driftIntro}</P>
      <P>{claims.drift(data.tolimaDrift)}</P>
      <DriftMultiples data={data} />
      <Takeaway label={questionsCopy[lang].inOneSentence}>{c.takeaway(assessment.state)}</Takeaway>
    </>
  );
}

function Linked({ data, reference }: { data: Insights; reference: QuakeLike }) {
  const { lang } = useI18n();
  const c = questionsCopy[lang].linked;
  const tolima = data.sources.tolima;
  const start = data.start.tolima;
  const centre = tolima.length ? { lat: median(tolima, (e) => e.lat)!, lon: median(tolima, (e) => e.lon)! } : null;
  return (
    <>
      {centre && start !== null ? (
        <P>{c.p1(epicentralKm(reference, centre), Math.floor((start - Date.parse(reference.time)) / WEEK))}</P>
      ) : null}
      <BothZonesTimeline data={data} reference={reference} />
      <P>{c.p2}</P>
      <Takeaway label={questionsCopy[lang].inOneSentence}>{c.takeaway}</Takeaway>
    </>
  );
}

function Felt({
  data,
  threshold,
  onThreshold,
}: {
  data: Insights;
  threshold: number;
  onThreshold: (m: number) => void;
}) {
  const { lang } = useI18n();
  const c = questionsCopy[lang].felt;
  const claims = insightsCopy[lang].claims;
  const mix = recentStrong(data.sources, data.now, threshold);
  const last = lastStrong(data.sources, threshold);
  const choco = [last.shallow, last.deep]
    .filter((e): e is QuakeLike => e !== null)
    .reduce<QuakeLike | null>((a, b) => (!a || Date.parse(b.time) > Date.parse(a.time) ? b : a), null);
  const start = data.start.choco ?? data.now;
  const days = useMemo(() => {
    const out = new Set<number>();
    for (const s of SOURCES) for (const e of data.sources[s]) if (e.mag >= threshold) out.add(dayStart(e.time));
    return out.size;
  }, [data, threshold]);
  const totalDays = colombianDays(start, data.now).length;
  return (
    <>
      <P>{c.p1}</P>
      <P>
        {claims.strongMix(mix, threshold, 7)}
        {choco ? ` ${claims.lastChoco(Date.parse(choco.time), threshold, lang)}` : ""}
      </P>
      <FeltCalendar data={data} threshold={threshold} onThreshold={onThreshold} />
      <Takeaway label={questionsCopy[lang].inOneSentence}>{c.takeaway(days, totalDays, threshold)}</Takeaway>
    </>
  );
}

function Bigger() {
  const { lang } = useI18n();
  const c = questionsCopy[lang].bigger;
  return (
    <>
      <P>{c.p1}</P>
      <P>{c.p2}</P>
      <div className="mt-6 max-w-prose rounded-xl bg-muted p-5">
        <p className="text-sm font-semibold">{c.helpTitle}</p>
        <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-base/7">
          {c.help.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      </div>
      <Takeaway label={questionsCopy[lang].inOneSentence}>{c.takeaway}</Takeaway>
    </>
  );
}

function Unknown({ data }: { data: Insights }) {
  const { lang } = useI18n();
  const c = questionsCopy[lang].unknown;
  const errChoco = medianHorizontalErrorKm([...data.sources.shallow, ...data.sources.deep]);
  const errTolima = medianHorizontalErrorKm(data.sources.tolima);
  // "Many depths repeat" only while one depth really holds a tenth of the swarm or more.
  const common = commonDepths(data.sources.tolima, 1)[0];
  const snapped = common && common.count >= data.sources.tolima.length / 10 ? common : null;
  const items = [
    c.why,
    c.link,
    ...(errChoco !== undefined && errTolima !== undefined
      ? [c.faults(errChoco.toFixed(1), errTolima.toFixed(1), snapped)]
      : []),
    c.floor,
    c.types,
    c.revisions,
  ];
  return (
    <>
      <P>{c.p1}</P>
      <ul className="mt-5 flex max-w-prose list-disc flex-col gap-3 pl-5 text-base/7">
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <Takeaway label={questionsCopy[lang].inOneSentence}>{c.takeaway}</Takeaway>
    </>
  );
}
