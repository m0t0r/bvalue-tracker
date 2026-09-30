/**
 * What each explainer says, in both languages: one definition per source, link and term, so two
 * places can never explain the same thing two ways (issue #144 found "USGS" expanded differently on
 * two tabs). It is in the card's own chunk; `ids.ts` has only the names.
 *
 * The rules for what may be said are the page's own (`docs/science.md`): a figure here is one the
 * science notes state, and nothing reads as a forecast. A link's address is not here: the page that
 * draws the link passes it, so the card cannot disagree with where the link goes.
 */
import type { Lang } from "@/lib/startup";
import type { FigureId } from "./figures";
import type { ExplainerId, LinkId, SourceId, TermId } from "./ids";
import sgcLogo from "./logos/sgc.svg";
import type { MarkSpec } from "./mark";

type L = Record<Lang, string>;

export interface SourceEntry {
  kind: "source";
  mark: MarkSpec;
  name: L;
  /** The name the page abbreviates it to, when it does. */
  short?: string;
  about: L;
  /** What this page takes from it. */
  role: L;
  url: string;
}

/** Who publishes a link's destination: one of the sources above, or a journal. */
export type Publisher = SourceId | { name: L; mark: MarkSpec };

export interface LinkEntry {
  kind: "link";
  publisher: Publisher;
  title: L;
  summary: L;
  /** The language the destination is written in, when it is one language only. */
  destLang?: Lang;
}

export interface TermEntry {
  kind: "term";
  term: L;
  definition: L;
  /** A caution under the definition, in smaller type. */
  note?: L;
  figure?: FigureId;
}

export type Entry = SourceEntry | LinkEntry | TermEntry;

const tile = (text: string): MarkSpec => ({ kind: "tile", text });

export const SOURCES: Record<SourceId, SourceEntry> = {
  sgc: {
    kind: "source",
    mark: { kind: "logo", src: sgcLogo, width: 147, height: 59 },
    name: { es: "Servicio Geológico Colombiano", en: "Colombian Geological Survey" },
    short: "SGC",
    about: {
      es: "La entidad del Estado que vigila los sismos y los volcanes de Colombia. Su Red Sismológica Nacional detecta cada sismo, lo ubica y le calcula una magnitud.",
      en: "The Colombian state agency that monitors the country's earthquakes and volcanoes. Its National Seismological Network detects each earthquake, locates it and works out its magnitude.",
    },
    role: {
      es: "Todos los eventos de esta página salen de su catálogo público.",
      en: "Every event on this page comes from its public catalogue.",
    },
    url: "https://www.sgc.gov.co",
  },
  usgs: {
    kind: "source",
    mark: tile("USGS"),
    name: { es: "Servicio Geológico de Estados Unidos", en: "United States Geological Survey" },
    short: "USGS",
    about: {
      es: "La agencia científica del gobierno de Estados Unidos que estudia la tierra. Publica información sobre los sismos grandes de todo el mundo.",
      en: "The United States government's earth-science agency. It publishes information about large earthquakes all over the world.",
    },
    role: {
      es: "De él salen el modelo de la placa (Slab2), el de la ruptura del M7.4, lo que contó la gente que lo sintió, la sacudida calculada y el pronóstico de réplicas.",
      en: "It is the source of the plate model (Slab2), the M7.4's rupture model, what people who felt it reported, the modelled shaking and the aftershock forecast.",
    },
    url: "https://earthquake.usgs.gov",
  },
  "isc-gem": {
    kind: "source",
    mark: tile("ISC-GEM"),
    name: { es: "Catálogo ISC-GEM", en: "ISC-GEM catalogue" },
    short: "ISC-GEM",
    about: {
      es: "Un catálogo mundial de sismos grandes desde 1904, que el Centro Sismológico Internacional (ISC) y la fundación GEM recalcularon con un mismo método. Así, sismos de épocas distintas quedan en la misma escala de magnitud (Mw).",
      en: "A worldwide catalogue of large earthquakes since 1904, recomputed with one method by the International Seismological Centre (ISC) and the GEM Foundation. Earthquakes from different eras end up on the same magnitude scale (Mw).",
    },
    role: {
      es: "Las magnitudes de los sismos del pasado con los que se compara el M7.4 salen de él.",
      en: "The magnitudes of the past earthquakes the M7.4 is compared with come from it.",
    },
    url: "https://www.isc.ac.uk/iscgem/",
  },
  slab2: {
    kind: "source",
    mark: tile("Slab2"),
    name: { es: "Slab2, el modelo de placas del USGS", en: "Slab2, USGS's model of the plates" },
    short: "Slab2",
    about: {
      es: "Un modelo del USGS de las placas que se hunden bajo los continentes: a qué profundidad está su borde superior, cuánto miden de grueso y qué margen de error tiene el propio modelo.",
      en: "A USGS model of the plates that sink beneath the continents: how deep their upper surface lies, how thick they are, and the margin of error the model itself states.",
    },
    role: {
      es: "La placa de Nazca de los cortes y del bloque en 3D está dibujada con él, tal como sale del modelo.",
      en: "The Nazca plate in the cross-sections and in the 3D block is drawn from it, as the model gives it.",
    },
    url: "https://doi.org/10.5066/F7PV6JNV",
  },
  dyfi: {
    kind: "source",
    mark: tile("USGS"),
    name: { es: "«Did You Feel It?», del USGS", en: "USGS's “Did You Feel It?”" },
    short: "Did You Feel It?",
    about: {
      es: "Una encuesta del USGS («¿Lo sentiste?») en la que cualquier persona cuenta cómo sintió un sismo. Con las respuestas, el USGS calcula la intensidad que se percibió en cada lugar.",
      en: "A survey in which anyone can say how they felt an earthquake. From the answers, USGS works out the intensity felt in each place.",
    },
    role: {
      es: "La intensidad «reportada» en Pereira sale de esas respuestas.",
      en: "The “reported” intensity in Pereira comes from those answers.",
    },
    url: "https://earthquake.usgs.gov/data/dyfi/",
  },
  pager: {
    kind: "source",
    mark: tile("USGS"),
    name: { es: "PAGER, del USGS", en: "PAGER, from USGS" },
    short: "PAGER",
    about: {
      es: "Un sistema del USGS que, minutos después de un sismo grande, calcula cuánto se sacudió el suelo en cada lugar y cuánta gente vive ahí. Lo calcula con modelos, no con reportes de personas.",
      en: "A USGS system that, minutes after a large earthquake, works out how hard the ground shook in each place and how many people live there. It uses models, not people's reports.",
    },
    role: {
      es: "La intensidad «calculada» en Pereira sale de él.",
      en: "The “modelled” intensity in Pereira comes from it.",
    },
    url: "https://earthquake.usgs.gov/data/pager/",
  },
};

const LINKS: Record<LinkId, LinkEntry> = {
  "sgc-catalogue": {
    kind: "link",
    publisher: "sgc",
    title: { es: "Consulta experta del catálogo del SGC", en: "SGC's expert catalogue query" },
    summary: {
      es: "El formulario público con el que esta página consulta los eventos: la fecha, el lugar, la profundidad, la magnitud y si un analista ya revisó cada uno.",
      en: "The public form this page reads the events from: the date, place, depth and magnitude of each one, and whether an analyst has reviewed it yet.",
    },
    destLang: "es",
  },
  "sgc-duration": {
    kind: "link",
    publisher: "sgc",
    title: {
      es: "¿Cuánto duró el sismo de San José del Palmar?",
      en: "How long did the San José del Palmar earthquake last?",
    },
    summary: {
      es: "El SGC explica por qué no hay una sola duración: la que sintieron las personas, la que registraron los instrumentos y la de la ruptura de la falla.",
      en: "SGC explains why there is no single duration: how long people felt it, how long instruments recorded it, and how long the fault kept breaking.",
    },
    destLang: "es",
  },
  "sgc-felt-report": {
    kind: "link",
    publisher: "sgc",
    title: { es: "Reportar un sismo sentido al SGC", en: "Report a felt earthquake to SGC" },
    summary: {
      es: "El formulario del SGC para contar cómo sentiste un sismo. Con esas respuestas, el SGC calcula cuánto se sintió en cada lugar.",
      en: "SGC's form for telling them how you felt an earthquake. From the answers, SGC works out how strongly it was felt in each place.",
    },
    destLang: "es",
  },
  "usgs-event": {
    kind: "link",
    publisher: "usgs",
    title: { es: "El sismo en el sitio del USGS", en: "The earthquake on USGS's site" },
    summary: {
      es: "La página del USGS sobre este sismo: su magnitud, lo que reportó la gente que lo sintió y la sacudida calculada en cada lugar.",
      en: "USGS's page for this earthquake: its magnitude, what people who felt it reported, and the modelled shaking in each place.",
    },
    destLang: "en",
  },
  "usgs-finite-fault": {
    kind: "link",
    publisher: "usgs",
    title: { es: "Modelo de falla finita del M7.4", en: "Finite-fault model of the M7.4" },
    summary: {
      es: "Cómo se deslizó la falla durante el sismo, calculado con registros de estaciones de todo el mundo. De ahí sale cuánto duró la ruptura.",
      en: "How the fault slipped during the earthquake, worked out from station records worldwide. It is where the rupture's duration comes from.",
    },
    destLang: "en",
  },
  "usgs-summary": {
    kind: "link",
    publisher: "usgs",
    title: { es: "Resumen del M7.4 en el sitio del USGS", en: "USGS's summary of the M7.4" },
    summary: {
      es: "La página del USGS sobre el sismo, con su resumen tectónico: en qué parte de la zona de subducción ocurrió y a qué profundidad.",
      en: "USGS's page for the earthquake, with its tectonic summary: where in the subduction zone it happened, and how deep.",
    },
    destLang: "en",
  },
  "usgs-forecast": {
    kind: "link",
    publisher: "usgs",
    title: { es: "Pronóstico de réplicas del USGS", en: "USGS aftershock forecast" },
    summary: {
      es: "La probabilidad de sismos de cada tamaño en los próximos días, semanas y meses, que el USGS calcula y actualiza. Es un pronóstico de probabilidades, no una predicción.",
      en: "The chance of earthquakes of each size in the coming days, weeks and months, which USGS works out and updates. It is a forecast of probabilities, not a prediction.",
    },
    destLang: "en",
  },
  "iscgem-catalogue": {
    kind: "link",
    publisher: "isc-gem",
    title: { es: "El catálogo ISC-GEM", en: "The ISC-GEM catalogue" },
    summary: {
      es: "El catálogo mundial de sismos grandes desde 1904 del que salen las magnitudes de los sismos del pasado.",
      en: "The worldwide catalogue of large earthquakes since 1904 that the past earthquakes' magnitudes come from.",
    },
    destLang: "en",
  },
  "gps-velocities": {
    kind: "link",
    publisher: {
      name: { es: "Journal of South American Earth Sciences", en: "Journal of South American Earth Sciences" },
      mark: tile("JSAES"),
    },
    title: {
      es: "Mora-Páez y otros (2019), velocidades GPS del norte de los Andes",
      en: "Mora-Páez et al. (2019), GPS velocities of the northern Andes",
    },
    summary: {
      es: "Un artículo científico con la velocidad de las estaciones GPS de Colombia. La de la isla de Malpelo, sobre la placa de Nazca, avanza unos 5 cm al año hacia el este.",
      en: "A scientific paper with the velocities of Colombia's GPS stations. The one on Malpelo Island, on the Nazca plate, moves about 5 cm a year eastward.",
    },
    destLang: "en",
  },
};

const TERMS: Record<TermId, TermEntry> = {
  "b-value": {
    kind: "term",
    term: { es: "Valor b", en: "b-value" },
    definition: {
      es: "Cuántos eventos pequeños hay por cada uno grande. Con b = 1, por cada evento de magnitud 4 hay unos 10 de magnitud 3 y unos 100 de magnitud 2. Con un b más bajo, los grandes pesan más en la mezcla. Es la pendiente de la ley de Gutenberg–Richter.",
      en: "How many small events there are for each large one. With b = 1, for every magnitude 4 event there are about 10 of magnitude 3 and about 100 of magnitude 2. With a lower b, the large ones weigh more in the mix. It is the slope of the Gutenberg–Richter law.",
    },
    note: {
      es: "Describe la secuencia registrada hasta ahora. No es un pronóstico.",
      en: "It describes the sequence recorded so far. It is not a forecast.",
    },
    figure: "b-value",
  },
  mc: {
    kind: "term",
    term: { es: "Magnitud de completitud (Mc)", en: "Magnitude of completeness (Mc)" },
    definition: {
      es: "La magnitud desde la que el catálogo registra casi todos los eventos. Por debajo, las estaciones no alcanzan a detectar todos los pequeños, sobre todo justo después de un sismo grande. Por eso el valor b se calcula solo con los eventos de Mc o más.",
      en: "The magnitude from which the catalogue records nearly every event. Below it, the stations miss some of the small ones, especially just after a large earthquake. That is why the b-value is worked out only from events of Mc or more.",
    },
    note: {
      es: "Esta página la calcula por curvatura máxima: la magnitud más frecuente del catálogo, más 0.2, la corrección habitual.",
      en: "This page works it out by maximum curvature: the catalogue's most common magnitude, plus 0.2, the usual correction.",
    },
    figure: "mc",
  },
  magnitude: {
    kind: "term",
    term: { es: "Magnitud", en: "Magnitude" },
    definition: {
      es: "El tamaño de un sismo en su origen, no cuánto se sintió en un lugar. Cada unidad más es unas 32 veces más energía: un sismo de magnitud 7 libera unas 1000 veces más energía que uno de magnitud 5.",
      en: "The size of an earthquake at its source, not how strongly it was felt in one place. Each unit up is about 32 times more energy: a magnitude 7 earthquake releases about 1000 times as much as a magnitude 5.",
    },
    figure: "energy",
  },
  "magnitude-types": {
    kind: "term",
    term: { es: "Tipos de magnitud", en: "Magnitude types" },
    definition: {
      es: "El SGC calcula la magnitud de varias formas, según el tamaño del sismo y las estaciones que lo registran. MLr y MLv son magnitudes locales, que salen de la amplitud de las ondas. Mw, la magnitud de momento, sale del tamaño de la ruptura y es la que mejor mide los sismos grandes. M es un promedio de otras.",
      en: "SGC works out magnitude in several ways, depending on the earthquake's size and the stations that record it. MLr and MLv are local magnitudes, from the amplitude of the waves. Mw, the moment magnitude, comes from the size of the rupture and measures large earthquakes best. M is an average of others.",
    },
    note: {
      es: "No son del todo iguales, así que comparar magnitudes de tipos distintos es aproximado.",
      en: "They are not quite the same, so comparing magnitudes of different types is approximate.",
    },
  },
  reviewed: {
    kind: "term",
    term: { es: "Automático y revisado", en: "Automatic and reviewed" },
    definition: {
      es: "Un evento automático es la primera ubicación y magnitud que calcula el sistema del SGC, en minutos. Uno revisado ya lo comprobó un analista, y su lugar o su magnitud pueden haber cambiado. Esta página recoge esas revisiones a lo largo del día.",
      en: "An automatic event is the first location and magnitude SGC's system works out, within minutes. A reviewed one has been checked by an analyst, and its place or magnitude may have changed. This page picks up those revisions through the day.",
    },
  },
  mainshock: {
    kind: "term",
    term: { es: "Sismo principal", en: "Mainshock" },
    definition: {
      es: "El sismo más grande de una secuencia, al que siguen réplicas más pequeñas. Esta página solo lo llama así si un analista del SGC lo revisó y supera en al menos 1 unidad de magnitud a todos los demás.",
      en: "The largest earthquake in a sequence, followed by smaller aftershocks. This page only calls one that if an SGC analyst has reviewed it and it is at least 1 magnitude unit above all the others.",
    },
    note: {
      es: "Es una etiqueta a posteriori: si llegara uno mayor, el anterior pasaría a ser un sismo premonitor.",
      en: "It is a label after the fact: if a larger one came, the earlier one would become a foreshock.",
    },
    figure: "sequence",
  },
  aftershocks: {
    kind: "term",
    term: { es: "Réplicas", en: "Aftershocks" },
    definition: {
      es: "Los sismos más pequeños que siguen a uno grande en la misma zona, mientras la roca se reacomoda. Al principio son muchos y luego cada vez menos, en una caída que describe la ley de Omori.",
      en: "The smaller earthquakes that follow a large one in the same area, while the rock settles. There are many at first and fewer and fewer after, in a decline described by Omori's law.",
    },
    figure: "sequence",
  },
  swarm: {
    kind: "term",
    term: { es: "Enjambre sísmico", en: "Earthquake swarm" },
    definition: {
      es: "Muchos sismos de tamaño parecido en un mismo lugar, sin uno grande que domine. En una secuencia de réplicas, en cambio, primero llega un sismo grande y después muchos más pequeños, cada vez más espaciados.",
      en: "Many earthquakes of similar size in one place, with no large one standing out. In an aftershock sequence, by contrast, a large earthquake comes first and many smaller ones follow, further and further apart.",
    },
    figure: "sequence",
  },
  "depth-groups": {
    kind: "term",
    term: { es: "Los dos grupos por profundidad", en: "The two depth groups" },
    definition: {
      es: "Los eventos del Chocó forman dos grupos separados por la profundidad, con casi ninguno entre ellos: uno superficial, a unos 40 km, y uno profundo, a unos 90 km, cerca del sismo principal. La página los separa a 70 km, el límite habitual entre sismos superficiales e intermedios.",
      en: "Chocó's events form two groups split by depth, with almost none between them: a shallow one, around 40 km down, and a deep one, around 90 km, near the mainshock. The page splits them at 70 km, the usual boundary between shallow and intermediate-depth earthquakes.",
    },
    figure: "depth-groups",
  },
  subduction: {
    kind: "term",
    term: { es: "Subducción", en: "Subduction" },
    definition: {
      es: "Cuando una placa tectónica se mete por debajo de otra. Frente a Colombia, la placa de Nazca, que forma el fondo del Pacífico, se mete bajo Sudamérica a unos 5 cm al año por la fosa, un surco del fondo del mar cerca de la costa. Como se hunde hacia el este, los sismos que ocurren en ella son más profundos cuanto más tierra adentro.",
      en: "When one tectonic plate slides beneath another. Off Colombia, the Nazca plate, which forms the floor of the Pacific, slides under South America at about 5 cm a year along the trench, a furrow in the sea floor near the coast. Because it sinks eastward, earthquakes in it are deeper the further inland they are.",
    },
    figure: "subduction",
  },
  hypocentre: {
    kind: "term",
    term: { es: "Hipocentro y epicentro", en: "Hypocentre and epicentre" },
    definition: {
      es: "El hipocentro es el punto bajo tierra donde empieza a romperse la roca. El epicentro es el punto de la superficie justo encima. La profundidad de un sismo es la distancia entre los dos.",
      en: "The hypocentre is the point underground where the rock starts to break. The epicentre is the point on the surface right above it. An earthquake's depth is the distance between the two.",
    },
    figure: "hypocentre",
  },
  crust: {
    kind: "term",
    term: { es: "Corteza", en: "Crust" },
    definition: {
      es: "La capa exterior y rígida de la Tierra, la que pisamos. Los sismos de la corteza, como los del enjambre de Chaparral, ocurren en fallas a pocas decenas de kilómetros de profundidad, lejos de la placa que se hunde.",
      en: "The Earth's rigid outer layer, the one we stand on. Crustal earthquakes, like those of the Chaparral swarm, happen on faults a few tens of kilometres down, far from the sinking plate.",
    },
  },
};

export const ENTRIES: Record<ExplainerId, Entry> = { ...SOURCES, ...LINKS, ...TERMS };

/** A link's publisher, whichever form it is named in. */
export const publisherOf = (p: Publisher): { name: L; mark: MarkSpec } => (typeof p === "string" ? SOURCES[p] : p);

/** The card's own words, and the drawings'. */
export const WORDS = {
  es: {
    openSite: "Abrir {domain}",
    openLink: "Abrir en {domain}",
    inLang: { es: "en español", en: "en inglés" },
    onThisPage: "En esta página:",
    whatItMeans: "Qué significa",
    close: "Cerrar",
    fig: {
      eventsPerMagnitude: "eventos por magnitud",
      eventsPerMagnitudeLog: "eventos por magnitud, en escala logarítmica",
      bToggle: "Valor b del ejemplo",
      replay: "Repetir la animación",
      missed: "punteadas: los que no se detectan",
      swarm: "Enjambre",
      aftershocks: "Réplicas",
      time: "tiempo",
      heightIsMagnitude: "altura = magnitud",
      times32: "×32",
      times1000: "×1000",
      areaIsEnergy: "el área de cada cuadrado es su energía",
      epicentre: "epicentro",
      hypocentre: "hipocentro",
      depth: "profundidad",
      surfaceAbove: "el epicentro está justo encima del hipocentro",
      nazca: "placa de Nazca",
      pacific: "océano Pacífico",
      southAmerica: "Sudamérica",
      trench: "fosa",
      plateSinks: "la placa se mete bajo el continente",
      shallow: "superficial",
      deep: "profundo",
      depthDown: "más abajo = más profundo",
    },
  },
  en: {
    openSite: "Open {domain}",
    openLink: "Open on {domain}",
    inLang: { es: "in Spanish", en: "in English" },
    onThisPage: "On this page:",
    whatItMeans: "What it means",
    close: "Close",
    fig: {
      eventsPerMagnitude: "events per magnitude",
      eventsPerMagnitudeLog: "events per magnitude, on a log scale",
      bToggle: "The example's b-value",
      replay: "Replay the animation",
      missed: "dashed: the ones missed",
      swarm: "Swarm",
      aftershocks: "Aftershocks",
      time: "time",
      heightIsMagnitude: "height = magnitude",
      times32: "×32",
      times1000: "×1000",
      areaIsEnergy: "each square's area is its energy",
      epicentre: "epicentre",
      hypocentre: "hypocentre",
      depth: "depth",
      surfaceAbove: "the epicentre is right above the hypocentre",
      nazca: "Nazca plate",
      pacific: "Pacific Ocean",
      southAmerica: "South America",
      trench: "trench",
      plateSinks: "the plate slides under the continent",
      shallow: "shallow",
      deep: "deep",
      depthDown: "lower = deeper",
    },
  },
} satisfies Record<Lang, unknown>;
