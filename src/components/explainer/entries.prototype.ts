// PROTOTYPE (issue #144): throwaway. Four sample entries, one per kind, to judge the three card
// variants on the real pages. The real module will hold every authority, link and term.
import type { Lang } from "@/lib/startup";
import sgcLogo from "./sgc-logo.prototype.svg";

type L = Record<Lang, string>;

export type Entry =
  | {
      kind: "authority";
      logo: string;
      /** The logo's own aspect, so its box is sized before it loads. */
      logoRatio: number;
      name: L;
      short: string;
      about: L;
      role: L;
      url: string;
      domain: string;
    }
  | {
      kind: "article";
      publisher: L;
      logo: string;
      logoRatio: number;
      title: string;
      /** The language the destination is written in. */
      titleLang: Lang;
      summary: L;
      url: string;
      domain: string;
    }
  | {
      kind: "term";
      term: L;
      definition: L;
      caveat?: L;
      figure: "b-value" | "swarm";
    };

export const ENTRIES = {
  sgc: {
    kind: "authority",
    logo: sgcLogo,
    logoRatio: 147 / 59,
    name: { es: "Servicio Geológico Colombiano", en: "Colombian Geological Survey" },
    short: "SGC",
    about: {
      es: "La entidad del Estado que vigila los sismos y los volcanes de Colombia. Su red de estaciones detecta cada sismo, lo ubica y le asigna una magnitud.",
      en: "The Colombian state agency that monitors the country's earthquakes and volcanoes. Its network of stations detects each earthquake, locates it and gives it a magnitude.",
    },
    role: {
      es: "Todos los eventos de esta página salen de su catálogo público.",
      en: "Every event on this page comes from its public catalogue.",
    },
    url: "https://www.sgc.gov.co",
    domain: "sgc.gov.co",
  },
  "sgc-duration": {
    kind: "article",
    publisher: { es: "Servicio Geológico Colombiano", en: "Colombian Geological Survey" },
    logo: sgcLogo,
    logoRatio: 147 / 59,
    title: "¿Cuánto duró el sismo de San José del Palmar?",
    titleLang: "es",
    summary: {
      es: "El SGC explica por qué no hay una sola duración: la que sienten las personas, la que registran los instrumentos y la de la ruptura de la falla.",
      en: "SGC explains why there is no single duration: how long people felt it, how long instruments recorded it, and how long the fault kept breaking.",
    },
    url: "https://www2.sgc.gov.co/Noticias/Paginas/Cuanto-duro-el-sismo-de-San-Jose-del-Palmar-Choco.aspx",
    domain: "sgc.gov.co",
  },
  swarm: {
    kind: "term",
    term: { es: "Enjambre sísmico", en: "Earthquake swarm" },
    definition: {
      es: "Muchos sismos de tamaño parecido en un mismo lugar, sin uno grande que domine. En una secuencia de réplicas, en cambio, primero llega un sismo grande y después muchos más pequeños, cada vez más espaciados.",
      en: "Many earthquakes of similar size in one place, with no large one standing out. In an aftershock sequence, by contrast, a large earthquake comes first and many smaller ones follow, further and further apart.",
    },
    figure: "swarm",
  },
  "b-value": {
    kind: "term",
    term: { es: "Valor b", en: "b-value" },
    definition: {
      es: "Cuántos eventos pequeños hay por cada uno grande. Con b = 1, por cada evento de magnitud 4 hay unos 10 de magnitud 3 y unos 100 de magnitud 2. Con un b más bajo, los grandes pesan más en la mezcla.",
      en: "How many small events there are for each large one. With b = 1, for every magnitude 4 event there are about 10 of magnitude 3 and about 100 of magnitude 2. With a lower b, the large ones weigh more in the mix.",
    },
    caveat: {
      es: "Describe la secuencia registrada hasta ahora. No es un pronóstico.",
      en: "It describes the sequence recorded so far. It is not a forecast.",
    },
    figure: "b-value",
  },
} satisfies Record<string, Entry>;

export type EntryId = keyof typeof ENTRIES;

export const CARD_COPY = {
  es: {
    open: "Abrir en {domain}",
    openArticle: "Leer el artículo",
    inSpanish: "",
    close: "Cerrar",
    about: "Qué es",
    onThisPage: "En esta página",
    swarm: "Enjambre",
    aftershocks: "Réplicas",
    time: "tiempo",
    height: "altura = magnitud",
    smaller: "b más bajo",
    counts: "eventos por magnitud",
    replay: "Repetir",
  },
  en: {
    open: "Open {domain}",
    openArticle: "Read the article",
    inSpanish: "In Spanish",
    close: "Close",
    about: "What it is",
    onThisPage: "On this page",
    swarm: "Swarm",
    aftershocks: "Aftershocks",
    time: "time",
    height: "height = magnitude",
    smaller: "lower b",
    counts: "events per magnitude",
    replay: "Replay",
  },
} satisfies Record<Lang, Record<string, string>>;
