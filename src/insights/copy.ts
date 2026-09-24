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
import { SOURCES, compassPoint, type Decay, type Drift, type Pace, type Source, type StrongMix } from "./claims";

const f1 = (v: number) => v.toFixed(1);
const f0 = (v: number) => Math.round(v).toString();

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

/** "de" + the source's name, contracted where Spanish contracts it: "del grupo…", "del enjambre…". */
const deSource = (s: Source) => `de ${es.source[s]}`.replace(/^de el /, "del ");

const es = {
  docTitle: "Qué está pasando · sismos del Chocó y Tolima",
  title: "Qué está pasando",
  subtitle:
    "Los sismos que se sienten en el Eje Cafetero desde el 10 de agosto, explicados en palabras sencillas con los datos del Servicio Geológico Colombiano.",
  back: "Volver al monitor",
  tabsLabel: "Forma de verlo",
  tabs: { story: "La historia", questions: "Preguntas" },
  loading: "Cargando los catálogos…",
  loadFailed: "No se pudieron cargar los datos",
  loadFailedBody: "Revisa tu conexión y recarga la página.",
  incompleteTitle: "Todavía se está cargando el historial",
  incompleteBody:
    "Al catálogo aún le faltan semanas. Hasta que se complete, las cifras y lo que dicen de ellas no son representativos. El monitor lo termina de cargar.",
  dataUpTo: (ms: number, lang: Lang) => `Datos del SGC hasta el ${fmtDay(ms, lang)}`,
  footer:
    "Página independiente, sin relación con el SGC. Las cifras describen lo que ya ocurrió y no son un pronóstico. Para información oficial, consulta al Servicio Geológico Colombiano.",
  timeNote: "Fechas y horas de Colombia (UTC−5).",
  themeToDark: "Cambiar a tema oscuro",
  themeToLight: "Cambiar a tema claro",

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
      if (p.case === "young") return "Lleva muy poco tiempo para saber cuál es su ritmo habitual.";
      const rate = `${f1(p.recentPerDay)} eventos al día en los últimos 5 días, frente a unos ${f0(p.usualPerDay)} en un día típico (contando desde M${f1(p.mc)})`;
      if (p.case === "quieter") {
        const since = p.quietSince === null ? "" : ` desde el ${fmtDay(p.quietSince, lang)}`;
        const before = p.pastLulls.find((l) => l.recovered);
        const again = before
          ? ` Ya había pasado entre el ${fmtDay(before.from, lang)} y el ${fmtDay(before.to, lang)}, y luego volvió a su ritmo, así que todavía no se sabe si es una pausa o el final.`
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
        return `Se ha apagado como unas réplicas normales: unos ${f0(d.firstWeekPerDay)} eventos al día la primera semana, ${f1(d.lastWeekPerDay)} al día la última.`;
      return `No se ha apagado como unas réplicas normales: ${f1(d.firstWeekPerDay)} eventos al día la primera semana y ${f1(d.lastWeekPerDay)} la última.`;
    },
    /** The swarm's drift. Always a hint, never a finding. */
    drift: (d: Drift): string => {
      if (d.case === "too-few") return "Aún hay muy pocos eventos para ver si la actividad se desplaza.";
      if (d.case === "none")
        return `Con la precisión del catálogo (unos ${f1(d.errorKm)} km) no se ve que el centro de la actividad se haya movido.`;
      return `El centro de la actividad se ha movido unos ${f1(d.km)} km hacia el ${COMPASS_ES[compassPoint(d.bearingDeg)]} en ${f0(d.hours / 24)} días, más que el error de localización (unos ${f1(d.errorKm)} km). Es un indicio, no una conclusión.`;
    },
    /** The last strong event from Chocó, when the swarm has taken over. */
    lastChoco: (ms: number, minMag: number, lang: Lang) =>
      `El último evento de M${f1(minMag)} o más en el Chocó fue el ${fmtDay(ms, lang)}.`,
    share: (share: number) => `${share >= 0.999 ? "más del 99.9" : f1(share * 100)} %`,
  },
};

type Copy = typeof es;

const en: Copy = {
  docTitle: "What is happening · the Chocó and Tolima earthquakes",
  title: "What is happening",
  subtitle:
    "The earthquakes felt in Colombia's coffee region since 10 August, explained in plain words with data from the Servicio Geológico Colombiano.",
  back: "Back to the monitor",
  tabsLabel: "How to look at it",
  tabs: { story: "The story", questions: "Questions" },
  loading: "Loading the catalogues…",
  loadFailed: "Could not load the data",
  loadFailedBody: "Check your connection and reload the page.",
  incompleteTitle: "The history is still loading",
  incompleteBody:
    "The catalogue is still missing weeks. Until it is complete, the figures and what is said about them are not representative. The monitor finishes loading it.",
  dataUpTo: (ms, lang) => `SGC data up to ${fmtDay(ms, lang)}`,
  footer:
    "An independent page, not affiliated with SGC. The figures describe what has already happened and are not a forecast. For official information, consult the Servicio Geológico Colombiano.",
  timeNote: "Dates and times are Colombia time (UTC−5).",
  themeToDark: "Switch to dark theme",
  themeToLight: "Switch to light theme",

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
        return `At the catalogue's precision (about ${f1(d.errorKm)} km) the centre of the activity has not visibly moved.`;
      return `The centre of the activity has moved about ${f1(d.km)} km ${COMPASS_EN[compassPoint(d.bearingDeg)]} in ${f0(d.hours / 24)} days, more than the location error (about ${f1(d.errorKm)} km). A hint, not a conclusion.`;
    },
    lastChoco: (ms, minMag, lang) => `Chocó's last event of M${f1(minMag)} or more was on ${fmtDay(ms, lang)}.`,
    share: (share) => `${share >= 0.999 ? "over 99.9" : f1(share * 100)}%`,
  },
};

export const insightsCopy: Record<Lang, Copy> = { es, en };
