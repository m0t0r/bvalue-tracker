/**
 * The insights page's shared copy: its shell, and the sentences each claim in `claims.ts` can say.
 * A claim sentence is a function of the claim's own result, so the words cannot say more than the
 * rule decided. Both languages are required by the type. Each tab keeps its long-form copy in its
 * own module (`story/copy.ts`, `questions/copy.ts`) and uses these for anything that depends on
 * the data.
 *
 * Decimal point in every number, as on the main page and at SGC ("M4.5", "4.8 al día").
 */
import type { Lang } from "@/lib/i18n";
import { fmtDay } from "@/lib/format";
import { fmtInt, fmtPct } from "./shared";
import {
  SOURCES,
  compassPoint,
  intensityLevel,
  naturalFrequency,
  wholePercent,
  type Decay,
  type Drift,
  type Felt,
  type ForecastRow,
  type Natural,
  type Pace,
  type Percent,
  type Source,
  type StrongMix,
} from "./claims";

const f1 = (v: number) => v.toFixed(1);
const f0 = (v: number) => Math.round(v).toString();

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X+"];
/**
 * USGS's perceived-shaking term for each level of the Modified Mercalli scale, I to X+, as its
 * ShakeMap and PAGER legends print it (checked 2026-09-24). The Spanish is the page's translation,
 * so it is never put in quotes as if USGS had said it.
 */
const SHAKING: Record<Lang, string[]> = {
  en: ["not felt", "weak", "weak", "light", "moderate", "strong", "very strong", "severe", "violent", "extreme"],
  es: ["no sentido", "débil", "débil", "leve", "moderado", "fuerte", "muy fuerte", "severo", "violento", "extremo"],
};

/** A level on the Modified Mercalli scale as USGS writes it, "VIII", with its perceived-shaking term. */
export function intensityName(level: number, lang: Lang): { roman: string; shaking: string } {
  const i = intensityLevel(level) - 1;
  return { roman: ROMAN[i]!, shaking: SHAKING[lang][i]! };
}
/** "VIII (severo)" or 'VIII ("severe")' inside a sentence: USGS's English term quoted, ours not. */
const named = (level: number, lang: Lang) => {
  const n = intensityName(level, lang);
  return lang === "en" ? `${n.roman} ("${n.shaking}")` : `${n.roman} (${n.shaking})`;
};

const COMPASS_ES = {
  N: "norte",
  NE: "noreste",
  E: "este",
  SE: "sureste",
  S: "sur",
  SW: "suroeste",
  W: "oeste",
  NW: "noroeste",
};
const COMPASS_EN = {
  N: "north",
  NE: "northeast",
  E: "east",
  SE: "southeast",
  S: "south",
  SW: "southwest",
  W: "west",
  NW: "northwest",
};

/**
 * Each source as a count's tail: "8 del grupo superficial", "17 de Chaparral". Every source that
 * contributed is named, so a mix of Chocó's two groups is not read as Chocó against Chaparral.
 */
const deSourceShort: Record<Source, string> = {
  shallow: "del grupo superficial del Chocó",
  deep: "del grupo profundo del Chocó",
  tolima: "de Chaparral",
};
const fromSourceShort: Record<Source, string> = {
  shallow: "from Chocó's shallow group",
  deep: "from Chocó's deep group",
  tolima: "from Chaparral",
};
/** "a, b y c": a list joined the way each language joins one. */
const list = (items: string[], and: string) =>
  items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} ${and} ${items.at(-1)}`;

type ForecastCount = Pick<ForecastRow, "median" | "p95Min" | "p95Max">;

/** The frequency "how to read" explains: the first in tenths the box shows, else the first "1 in N". */
const howToRead = (ps: readonly number[]) => {
  const ns = ps.map(naturalFrequency);
  return ns.find((n) => n.case === "tenths") ?? ns.find((n) => n.case === "one-in");
};

/**
 * A natural frequency in words: "unas 4 de cada 10", "alrededor de 1 de cada 50". Every count is
 * written as the page writes counts (`fmtInt`: "1000", grouped only from five digits).
 */
const naturalEs = (n: Natural) => {
  switch (n.case) {
    case "almost-certain":
      return "es casi seguro";
    case "tenths":
      return `unas ${n.tenths} de cada 10`;
    case "one-in":
      return `alrededor de 1 de cada ${fmtInt(n.n)}`;
    case "under-one-in-1000":
      return `menos de 1 de cada ${fmtInt(1000)}`;
  }
};
const naturalEn = (n: Natural) => {
  switch (n.case) {
    case "almost-certain":
      return "almost certain";
    case "tenths":
      return `about ${n.tenths} in 10`;
    case "one-in":
      return `about 1 in ${fmtInt(n.n)}`;
    case "under-one-in-1000":
      return `less than 1 in ${fmtInt(1000)}`;
  }
};
/** A percentage, the whole ones through the page's `fmtPct`: "43 %", "más del 99 %", "menos del 1 %". */
const pctEs = (p: Percent) =>
  p.case === "whole"
    ? fmtPct(p.value, "es")
    : `${p.case === "over-99" ? "más del" : "menos del"} ${fmtPct(p.case === "over-99" ? 99 : 1, "es")}`;
/** The same after "es", with the article Spanish wants: "del 43 %", "de más del 99 %". */
const percentEs = (p: Percent) => `${p.case === "whole" ? "del" : "de"} ${pctEs(p)}`;
const percentEn = (p: Percent) =>
  p.case === "whole"
    ? fmtPct(p.value, "en")
    : p.case === "over-99"
      ? `over ${fmtPct(99, "en")}`
      : `less than ${fmtPct(1, "en")}`;

/** "de" + the source's name, contracted where Spanish contracts it: "del grupo…", "del enjambre…". */
const deSource = (s: Source) => `de ${es.source[s]}`.replace(/^de el /, "del ");

const es = {
  docTitle: "¿Qué está pasando? · sismos del Chocó y Tolima",
  title: "¿Qué está pasando?",
  subtitle:
    "Los sismos que se sienten en el Eje Cafetero desde el 10 de agosto, explicados en palabras sencillas con los datos del Servicio Geológico Colombiano.",
  back: "Volver al inicio",
  tabsLabel: "Forma de verlo",
  tabs: { story: "La historia", questions: "Preguntas", "3d": "En 3D" },
  loading: "Cargando los catálogos…",
  loadFailed: "No se pudieron cargar los datos",
  loadFailedBody: "Revisa tu conexión y recarga la página.",
  incompleteTitle: "Todavía se está cargando el historial",
  incompleteBody:
    "Al catálogo aún le faltan semanas. Hasta que se complete, las cifras y las conclusiones de esta página no son representativas. El monitor se encarga de terminar de cargarlo.",
  dataUpTo: (ms: number, lang: Lang) => `Datos del SGC hasta el ${fmtDay(ms, lang)}`,
  footer:
    "Página independiente, sin relación con el SGC. Las cifras que calcula esta página describen lo que ya ocurrió y no son un pronóstico. Para información oficial, consulta al Servicio Geológico Colombiano.",
  timeNote: "Fechas y horas de Colombia (UTC−5).",
  themeToDark: "Cambiar a tema oscuro",
  themeToLight: "Cambiar a tema claro",
  backToTop: "Volver arriba",

  source: {
    shallow: "el grupo superficial del Chocó (Istmina–Sipí)",
    deep: "el grupo profundo del Chocó, junto al M7.4",
    tolima: "el enjambre de Chaparral (Tolima)",
  } satisfies Record<Source, string>,
  sourceShort: { shallow: "Chocó superficial", deep: "Chocó profundo", tolima: "Chaparral" } satisfies Record<
    Source,
    string
  >,

  claims: {
    /** Where the last week's strong events came from. */
    strongMix: (m: StrongMix, minMag: number, days: number): string => {
      const at = `de M${f1(minMag)} o más`;
      switch (m.case) {
        case "none":
          return `En los últimos ${days} días no hubo ningún evento ${at}.`;
        case "one":
          return `En los últimos ${days} días hubo ${m.total} ${m.total === 1 ? "evento" : "eventos"} ${at}, ${m.total === 1 ? "" : "todos "}${deSource(m.source)}.`;
        case "mostly":
          return `En los últimos ${days} días hubo ${m.total} eventos ${at}; ${m.count} de ellos ${deSource(m.source)}.`;
        case "mixed":
          return `En los últimos ${days} días hubo ${m.total} eventos ${at}: ${list(
            SOURCES.filter((s) => m.bySource[s] > 0).map((s) => `${m.bySource[s]} ${deSourceShort[s]}`),
            "y",
          )}.`;
      }
    },
    /** A source's recent pace against its own usual one. */
    pace: (p: Pace, lang: Lang): string => {
      if (p.case === "young") return "Aún es pronto para saber cuál es su ritmo habitual.";
      const rate = `${f1(p.recentPerDay)} eventos al día en los últimos 5 días, frente a unos ${f0(p.usualPerDay)} en un día típico (contando eventos de M${f1(p.mc)} o más)`;
      if (p.case === "quieter") {
        const since = p.quietSince === null ? "" : ` desde el ${fmtDay(p.quietSince, lang)}`;
        const before = p.pastLulls.find((l) => l.recovered);
        const again = before
          ? ` Algo así ya ocurrió entre el ${fmtDay(before.from, lang)} y el ${fmtDay(before.to, lang)}, y luego volvió a su ritmo; por eso todavía no se sabe si es una pausa o el final.`
          : " Todavía no se sabe si es una pausa o el final.";
        return `Está más tranquilo${since}: ${rate}.${again}`;
      }
      if (p.case === "busier") return `Está más activo de lo habitual: ${rate}.`;
      return `Sigue a su ritmo habitual: ${rate}.`;
    },
    /** The deep group's aftershocks. */
    decay: (d: Decay): string => {
      if (d.case === "young") return "Todavía es pronto para ver cómo se apagan sus réplicas.";
      if (d.case === "decayed")
        return `Se ha apagado como suelen hacerlo las réplicas: de unos ${f0(d.firstWeekPerDay)} eventos al día en la primera semana a ${f1(d.lastWeekPerDay)} en la última.`;
      return `No se ha apagado como suelen hacerlo las réplicas: ${f1(d.firstWeekPerDay)} eventos al día en la primera semana y ${f1(d.lastWeekPerDay)} en la última.`;
    },
    /** The swarm's drift. Always a hint, never a finding. */
    drift: (d: Drift): string => {
      if (d.case === "too-few") return "Aún hay muy pocos eventos para ver si la actividad se desplaza.";
      if (d.case === "none")
        return `Con la precisión del catálogo (unos ${f1(d.errorKm)}\u00A0km) no se ve que el centro de la actividad se haya movido.`;
      return `El centro de la actividad se ha movido unos ${f1(d.km)}\u00A0km hacia el ${COMPASS_ES[compassPoint(d.bearingDeg)]} en ${f0(d.hours / 24)} días, más que el error de localización (unos ${f1(d.errorKm)}\u00A0km). Es un indicio, no una conclusión.`;
    },
    /** The last strong event from Chocó, when the swarm has taken over. */
    lastChoco: (ms: number, minMag: number, lang: Lang) =>
      `El último evento de M${f1(minMag)} o más en el Chocó fue el ${fmtDay(ms, lang)}.`,
    share: (share: number) => `${share >= 0.999 ? "más del 99.9" : f1(share * 100)}\u00A0%`,
    /** `share` inside a sentence, with the article Spanish wants: "liberó el 12.5 %", "liberó más del 99.9 %". */
    sharePhrase: (share: number) => `${share >= 0.999 ? "más del 99.9" : `el ${f1(share * 100)}`}\u00A0%`,
    /** What people reported against what USGS's model estimates. Empty unless both are shown. */
    feltAgreement: (f: Felt): string => {
      if (!f.agreement || !f.reported || !f.modelled) return "";
      const r = intensityName(f.reported.level, "es").roman;
      const m = intensityName(f.modelled.level, "es").roman;
      switch (f.agreement.case) {
        case "same":
          return `Los reportes y el modelo del USGS coinciden: los dos dan intensidad ${named(f.reported.level, "es")}.`;
        case "within-one":
          return `Los reportes y el modelo del USGS casi coinciden: ${r} según la gente y ${m} según el modelo, apenas un grado de diferencia.`;
        case "higher":
        case "lower":
          return `Las dos cifras del USGS difieren en ${f.agreement.levels} grados: la gente reportó ${r}, ${f.agreement.case === "higher" ? "más" : "menos"} de lo que estima el modelo (${m}). Suele pasar: el modelo calcula el movimiento típico a esa distancia, y lo que siente cada persona depende también del suelo, del edificio y del piso en que esté.`;
      }
    },
    /** The question's one sentence. Whose figure it is, always. */
    feltTakeaway: (f: Felt, mag: number): string => {
      const at = `en Pereira el M${f1(mag)}`;
      if (f.reported && f.modelled && f.agreement && f.agreement.levels <= 1)
        return `Según el USGS, ${at} se sintió con intensidad ${named(f.reported.level, "es")}: así lo reportó la gente, y su modelo ${f.agreement.levels === 0 ? "coincide" : "casi coincide"}.`;
      if (f.reported && f.modelled)
        return `Según el USGS, la gente reportó que ${at} se sintió con intensidad ${named(f.reported.level, "es")}, y su modelo estima ${intensityName(f.modelled.level, "es").roman}: las dos cifras no coinciden.`;
      if (f.reported)
        return `Según los reportes que recibió el USGS, ${at} se sintió con intensidad ${named(f.reported.level, "es")}.`;
      return `El modelo del USGS estima que el M${f1(mag)} sacudió Pereira con intensidad ${named(f.modelled!.level, "es")}.`;
    },
    /** USGS's probability of at least one, in whole percent and as a natural frequency. */
    forecastChance: (p: number): string =>
      `La probabilidad de que haya al menos uno es ${percentEs(wholePercent(p))}: ${naturalEs(naturalFrequency(p))}.`,
    /**
     * USGS's most likely number and its range. USGS calls the range 95%; the sentence leaves the 95%
     * out, which a reader would take for a second probability, and the source link states it.
     */
    forecastCount: ({ median: m, p95Min: lo, p95Max: hi }: ForecastCount): string => {
      if (m === 0) {
        if (hi === 0) return "Lo más probable es que no haya ninguno.";
        return `Lo más probable es que no haya ninguno, aunque según el USGS podría haber ${hi === 1 ? "uno" : `hasta ${hi}`}.`;
      }
      const likely = m === 1 ? "Lo más probable es que haya uno" : `Lo más probable es que haya unos ${m}`;
      if (lo === hi) return `${likely}.`;
      return m === 1
        ? `${likely}; según el USGS, podrían ser entre ${lo} y ${hi}.`
        : `${likely}; según el USGS, entre ${lo} y ${hi}.`;
    },
    /** What "4 de cada 10" means, said with a frequency the box shows: tenths first. Empty if none has one. */
    forecastHowToRead: (ps: readonly number[]): string => {
      const n = howToRead(ps);
      if (n?.case === "tenths")
        return `«${n.tenths} de cada 10» quiere decir que, si este mismo periodo se repitiera 10 veces, en unas ${n.tenths} habría al menos uno.`;
      if (n?.case === "one-in")
        return `«1 de cada ${fmtInt(n.n)}» quiere decir que, si este mismo periodo se repitiera ${fmtInt(n.n)} veces, en una de ellas habría al menos uno.`;
      return "";
    },
    /** One as large as the mainshock (USGS's magnitude) or larger, in the window from `start` to `end`. */
    forecastAbove: (a: { magnitude: number; probability: number }, start: string, end: string): string =>
      `La probabilidad de que haya uno igual o mayor que el M${f1(a.magnitude)} entre el ${start} y el ${end} es ${percentEs(wholePercent(a.probability))}: ${naturalEs(naturalFrequency(a.probability))}.`,
  },
};

type Copy = typeof es;

const en: Copy = {
  docTitle: "What is happening? · the Chocó and Tolima earthquakes",
  title: "What is happening?",
  subtitle:
    "The earthquakes felt in Colombia's coffee region since 10 August, explained in plain words with data from the Servicio Geológico Colombiano.",
  back: "Back to the monitor",
  tabsLabel: "How to look at it",
  tabs: { story: "The story", questions: "Questions", "3d": "In 3D" },
  loading: "Loading the catalogues…",
  loadFailed: "Could not load the data",
  loadFailedBody: "Check your connection and reload the page.",
  incompleteTitle: "The history is still loading",
  incompleteBody:
    "The catalogue is still missing weeks. Until it is complete, the figures and what is said about them are not representative. The monitor finishes loading it.",
  dataUpTo: (ms, lang) => `SGC data up to ${fmtDay(ms, lang)}`,
  footer:
    "An independent page, not affiliated with SGC. The figures this page computes describe what has already happened and are not a forecast. For official information, consult the Servicio Geológico Colombiano.",
  timeNote: "Dates and times are Colombia time (UTC−5).",
  themeToDark: "Switch to dark theme",
  themeToLight: "Switch to light theme",
  backToTop: "Back to top",

  source: {
    shallow: "Chocó's shallow group (Istmina–Sipí)",
    deep: "Chocó's deep group, around the M7.4",
    tolima: "the Chaparral swarm (Tolima)",
  },
  sourceShort: { shallow: "Chocó shallow", deep: "Chocó deep", tolima: "Chaparral" },

  claims: {
    strongMix: (m, minMag, days) => {
      const at = `of M${f1(minMag)} or more`;
      switch (m.case) {
        case "none":
          return `In the last ${days} days there was no event ${at}.`;
        case "one":
          return `In the last ${days} days there ${m.total === 1 ? "was 1 event" : `were ${m.total} events`} ${at}, ${m.total === 1 ? "from" : "all from"} ${en.source[m.source]}.`;
        case "mostly":
          return `In the last ${days} days there were ${m.total} events ${at}; ${m.count} of them from ${en.source[m.source]}.`;
        case "mixed":
          return `In the last ${days} days there were ${m.total} events ${at}: ${list(
            SOURCES.filter((s) => m.bySource[s] > 0).map((s) => `${m.bySource[s]} ${fromSourceShort[s]}`),
            "and",
          )}.`;
      }
    },
    pace: (p, lang) => {
      if (p.case === "young") return "It is too recent to know what its usual pace is.";
      const rate = `${f1(p.recentPerDay)} events a day over the last 5 days, against about ${f0(p.usualPerDay)} on a typical day (counting from M${f1(p.mc)})`;
      if (p.case === "quieter") {
        const since = p.quietSince === null ? "" : ` since ${fmtDay(p.quietSince, lang)}`;
        const before = p.pastLulls.find((l) => l.recovered);
        const again = before
          ? ` It did this once before, from ${fmtDay(before.from, lang)} to ${fmtDay(before.to, lang)}, and then picked up again, so it is too early to tell a pause from an end.`
          : " It is too early to tell a pause from an end.";
        return `It has been quieter${since}: ${rate}.${again}`;
      }
      if (p.case === "busier") return `It is busier than usual: ${rate}.`;
      return `It is at its usual pace: ${rate}.`;
    },
    decay: (d) => {
      if (d.case === "young") return "It is still too early to see how its aftershocks fade.";
      if (d.case === "decayed")
        return `It has faded like ordinary aftershocks: about ${f0(d.firstWeekPerDay)} events a day in the first week, ${f1(d.lastWeekPerDay)} a day in the last.`;
      return `It has not faded like ordinary aftershocks: ${f1(d.firstWeekPerDay)} events a day in the first week and ${f1(d.lastWeekPerDay)} in the last.`;
    },
    drift: (d) => {
      if (d.case === "too-few") return "There are still too few events to see whether the activity is moving.";
      if (d.case === "none")
        return `At the catalogue's precision (about ${f1(d.errorKm)}\u00A0km) the centre of the activity has not visibly moved.`;
      return `The centre of the activity has moved about ${f1(d.km)}\u00A0km ${COMPASS_EN[compassPoint(d.bearingDeg)]} in ${f0(d.hours / 24)} days, more than the location error (about ${f1(d.errorKm)}\u00A0km). A hint, not a conclusion.`;
    },
    lastChoco: (ms, minMag, lang) => `Chocó's last event of M${f1(minMag)} or more was on ${fmtDay(ms, lang)}.`,
    share: (share) => `${share >= 0.999 ? "over 99.9" : f1(share * 100)}%`,
    sharePhrase: (share) => `${share >= 0.999 ? "over 99.9" : f1(share * 100)}%`,
    feltAgreement: (f) => {
      if (!f.agreement || !f.reported || !f.modelled) return "";
      const r = intensityName(f.reported.level, "en").roman;
      const m = intensityName(f.modelled.level, "en").roman;
      switch (f.agreement.case) {
        case "same":
          return `USGS's reports and model agree: both give intensity ${named(f.reported.level, "en")}.`;
        case "within-one":
          return `USGS's reports and model nearly agree: ${r} from people and ${m} from the model, just one level apart.`;
        case "higher":
        case "lower":
          return `USGS's two figures differ by ${f.agreement.levels} levels: people reported ${r}, ${f.agreement.case === "higher" ? "more" : "less"} than the model estimates (${m}). That is common: the model works out the typical shaking at that distance, and what each person feels also depends on the ground, the building and the floor they are on.`;
      }
    },
    feltTakeaway: (f, mag) => {
      const m = `M${f1(mag)}`;
      if (f.reported && f.modelled && f.agreement && f.agreement.levels <= 1)
        return `According to USGS, the ${m} was felt in Pereira at intensity ${named(f.reported.level, "en")}: that is what people reported, and its model ${f.agreement.levels === 0 ? "agrees" : "nearly agrees"}.`;
      if (f.reported && f.modelled)
        return `According to USGS, people in Pereira reported the ${m} at intensity ${named(f.reported.level, "en")}, and its model estimates ${intensityName(f.modelled.level, "en").roman}: the two do not agree.`;
      if (f.reported)
        return `According to the reports USGS received, the ${m} was felt in Pereira at intensity ${named(f.reported.level, "en")}.`;
      return `USGS's model estimates the ${m} shook Pereira at intensity ${named(f.modelled!.level, "en")}.`;
    },
    forecastChance: (p) =>
      `The chance of at least one is ${percentEn(wholePercent(p))}: ${naturalEn(naturalFrequency(p))}.`,
    forecastCount: ({ median: m, p95Min: lo, p95Max: hi }) => {
      if (m === 0) {
        if (hi === 0) return "Most likely none.";
        return `Most likely none, though USGS says there could be ${hi === 1 ? "one" : `up to ${hi}`}.`;
      }
      const likely = m === 1 ? "Most likely one" : `Most likely about ${m}`;
      return lo === hi ? `${likely}.` : `${likely}; USGS says between ${lo} and ${hi}.`;
    },
    forecastHowToRead: (ps) => {
      const n = howToRead(ps);
      if (n?.case === "tenths")
        return `"${n.tenths} in 10" means that if this same period were repeated 10 times, about ${n.tenths} of them would have at least one.`;
      if (n?.case === "one-in")
        return `"1 in ${fmtInt(n.n)}" means that if this same period were repeated ${fmtInt(n.n)} times, about one of them would have at least one.`;
      return "";
    },
    forecastAbove: (a, start, end) =>
      `The chance of one as large as the M${f1(a.magnitude)} or larger from ${start} to ${end} is ${percentEn(wholePercent(a.probability))}: ${naturalEn(naturalFrequency(a.probability))}.`,
  },
};

export const insightsCopy: Record<Lang, Copy> = { es, en };
