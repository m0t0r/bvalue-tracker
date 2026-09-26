/**
 * The 3D tab's own copy, in both languages. Every figure is passed in, computed from the data or from
 * the committed models, and formatted with a no-break space before its unit; nothing here states a
 * number of its own.
 */
import type { Lang } from "@/lib/i18n";
import { RAISED_LAND, type Preset } from "./shared";

export interface RuptureFacts {
  /** "10 de agosto" */
  date: string;
  /** "150 km" */
  length: string;
  /** "80" and "145 km": the plane's shallowest and deepest edge. */
  top: string;
  bottom: string;
  /** "4 m" */
  slip: string;
  /** "23 km", the compass word, "22 km" */
  offset: string;
  direction: string;
  /** How much deeper USGS puts it, as a positive distance; `shallower` when it is the other way. */
  deeper: string;
  shallower: boolean;
}

type Pair = [string, string];

const es = {
  title: "Debajo de nuestros pies, en 3D",
  lede: (width: string, depth: string) =>
    `Imagina que cortamos un bloque de tierra de ${width} de ancho y ${depth} de profundidad, desde el océano Pacífico hasta más allá de Pereira. Dentro, cada evento está donde ocurrió, a su profundidad real, junto a la placa que se hunde debajo de nosotros.`,
  explore: "Explorar en 3D",
  /** The preview's turning, which the reader can stop (WCAG 2.2.2). */
  spin: { pause: "Detener el giro", resume: "Reanudar el giro" },
  /** One per input: a phone has no wheel, a mouse cannot pinch. */
  hint: { touch: "Arrastra para girar · pellizca para acercar", pointer: "Arrastra para girar · rueda para acercar" },
  close: "Cerrar",
  dialog: "El bloque en 3D",
  canvas:
    "Bloque en 3D con los eventos a su profundidad, la placa de Nazca y el lugar donde se rompió la roca en el sismo grande. Los cortes de «La historia» muestran lo mismo en dos dimensiones.",
  noWebgl:
    "Este navegador no puede mostrar gráficos en 3D. Los cortes de «La historia» muestran lo mismo en dos dimensiones.",
  views: "Vistas",
  view: {
    oblique: [
      "En diagonal",
      "El bloque visto desde el sureste: el terreno arriba y, debajo, los eventos a su profundidad real.",
    ],
    south: [
      "Desde el sur",
      "De perfil, como los cortes de «La historia»: la placa baja hacia el este, y los dos grupos del Chocó quedan a distinta profundidad.",
    ],
    above: ["Desde arriba", "Como en un mapa: dónde ocurrieron los eventos, sin su profundidad."],
    rupture: [
      "Donde se rompió",
      "De cerca, la zona naranja: la parte de la roca que se rompió en el sismo grande. Cuanto más intenso el naranja, más se deslizó.",
    ],
    chaparral: ["Chaparral", "El enjambre de Chaparral ocurre cerca de la superficie, muy por encima de la placa."],
  } satisfies Record<Preset, [string, string]>,
  freeView: "Estás girando el bloque a tu manera. Para volver a una vista, elígela arriba.",
  panel: "Leyenda y ajustes",
  tabs: { key: "Leyenda", settings: "Ajustes" },
  exaggeration: "Exageración vertical",
  exaggerationHelp: "Estira la altura para separar mejor las profundidades. «A escala real» las deja sin estirar.",
  layersTitle: "Capas",
  exaggerationOption: (n: number) => (n === 1 ? "A escala real" : `×${n}`),
  exaggerationTag: (n: number, raised: boolean) =>
    raised
      ? n === 1
        ? `Montañas realzadas ×${RAISED_LAND}`
        : `Exageración vertical ×${n} · montañas ×${RAISED_LAND}`
      : n === 1
        ? "A escala real"
        : `Exageración vertical ×${n}`,
  relief: "Montañas",
  reliefHelp: `Miden hasta unos 5 km de alto: a escala real, en un bloque de 500 km casi no se ven. Realzadas, su altura se multiplica por ${RAISED_LAND}; el fondo del mar y las profundidades quedan igual.`,
  reliefOption: { raised: `Realzadas ×${RAISED_LAND}`, true: "A escala real" },
  layers: {
    ground: "Terreno",
    plate: "Placa",
    uncertainty: "Margen de error de la placa",
    rupture: "Donde se rompió",
    events: "Eventos",
    labels: "Nombres de lugares",
    snapped: "Resaltar profundidades fijas",
  },
  timeTitle: "Tiempo",
  timeHelp: (seconds: number) =>
    `Los eventos aparecen en el orden en que ocurrieron, en unos ${seconds} segundos. También puedes mover la fecha a mano.`,
  replay: "Reproducir",
  stop: "Detener",
  until: (date: string) => `hasta el ${date}`,
  date: "Fecha",

  keyTitle: "¿Qué estás viendo?",
  key: {
    ground: [
      "La tapa del bloque",
      "Es el terreno, como en un mapa: la costa, los ríos, las cordilleras y los pueblos. Todo lo que está debajo es el interior de la tierra.",
    ] as Pair,
    dots: [
      "Los puntos",
      "Cada punto es un evento del catálogo del SGC, en el lugar y a la profundidad donde ocurrió. Cuanto más grande el punto, mayor la magnitud.",
    ] as Pair,
    plate: (rate: string): [string, string] => [
      "La franja gris",
      `Es la placa de Nazca, una parte del fondo del océano Pacífico. Se mete por debajo de Sudamérica unos ${rate} al año y se hunde hacia el este. La dibuja el modelo Slab2 del USGS, y las franjas más tenues marcan su margen de error.`,
    ],
    rupture: (f: RuptureFacts): [string, string] => [
      "La zona naranja",
      `Es la parte de la roca que se rompió en el sismo del ${f.date}: una grieta de unos ${f.length} de largo, entre ${f.top} y ${f.bottom} de profundidad. Cuanto más intenso el naranja, más se deslizó la roca, hasta unos ${f.slip}. La calculó el USGS con un modelo.`,
    ],
    offset: (f: RuptureFacts) =>
      `El USGS ubica ese sismo unos ${f.offset} más al ${f.direction} y ${f.deeper} ${f.shallower ? "menos" : "más"} profundo de lo que lo ubica el SGC. Por eso la zona naranja no pasa por el punto de ese sismo.`,
    pins: (list: string): [string, string] => [
      "Los marcadores",
      `Pereira, en rojo, y otros lugares que sirven de referencia. En «Explorar en 3D», pasa el cursor por un marcador, o tócalo, para ver a cuánto está de Pereira en línea recta: ${list}.`,
    ],
    depth: (w: string, l: string, d: string): [string, string] => [
      "Las medidas",
      `El bloque mide unos ${w} de oeste a este, ${l} de sur a norte y ${d} de alto. Los números del costado marcan cuántos kilómetros hay bajo la superficie. Para que se vea mejor, la altura se puede estirar y las montañas se pueden realzar ×${RAISED_LAND}, porque a escala real casi no se notan. Las dos opciones están en «Ajustes».`,
    ],
    snapped: (list: string) =>
      `El catálogo pone a muchos eventos pequeños exactamente a la misma profundidad: ${list}. Por eso ahí se ven «capas», que no son reales.`,
  },
  groups: {
    shallow: "grupo superficial (Istmina–Sipí)",
    deep: "grupo profundo",
    mainshock: (date: string, mag: string) => `sismo del ${date}, ${mag}`,
    tolima: "enjambre de Chaparral",
  },
  snappedItem: (count: number, depth: string) => `${count} a ${depth}`,
  and: " y ",

  scene: {
    pinDistance: (name: string, km: string) => `${name}: a unos ${km} de Pereira en línea recta`,
    distance: (km: string) => `~${km}`,
    width: (km: string) => `~${km}, oeste–este`,
    length: (km: string) => `~${km}, sur–norte`,
    trench: "fosa del Pacífico",
    plate: "placa de Nazca · modelo Slab2 del USGS",
    rupture: (date: string) => `donde se rompió la roca el ${date} · modelo del USGS`,
    /** On a narrow block, the same without what the key says already (the model, the date, the directions). */
    plateShort: "placa de Nazca",
    ruptureShort: "donde se rompió la roca",
    widthShort: (km: string) => `~${km}`,
  },
  compass: {
    N: "norte",
    NE: "noreste",
    E: "este",
    SE: "sureste",
    S: "sur",
    SW: "suroeste",
    W: "oeste",
    NW: "noroeste",
  },
  credit: "Mapa:",
};

type Copy = typeof es;

const en: Copy = {
  title: "Beneath our feet, in 3D",
  lede: (width, depth) =>
    `Picture a block of earth cut out, ${width} wide and ${depth} deep, from the Pacific Ocean to beyond Pereira. Inside it, each event sits where it happened, at its true depth, beside the plate sinking beneath us.`,
  explore: "Explore in 3D",
  spin: { pause: "Stop the turning", resume: "Resume the turning" },
  hint: { touch: "Drag to turn · pinch to zoom", pointer: "Drag to turn · scroll to zoom" },
  close: "Close",
  dialog: "The block in 3D",
  canvas:
    "A 3D block with the events at their depths, the Nazca plate and where the rock broke in the large earthquake. The story's cross-sections show the same in two dimensions.",
  noWebgl: "This browser cannot show 3D graphics. The story's cross-sections show the same in two dimensions.",
  views: "Views",
  view: {
    oblique: [
      "Diagonal",
      "The block from the south-east: the ground on top and, below it, the events at their true depths.",
    ],
    south: [
      "From the south",
      "Side on, like the story's cross-sections: the plate sinks towards the east, and Chocó's two groups sit at different depths.",
    ],
    above: ["From above", "As on a map: where the events happened, without their depth."],
    rupture: [
      "Where it broke",
      "Close up on the orange patch: the part of the rock that broke in the large earthquake. The stronger the orange, the further it slid.",
    ],
    chaparral: ["Chaparral", "The Chaparral swarm happens near the surface, far above the plate."],
  },
  freeView: "You are turning the block your own way. To go back to a view, pick it above.",
  panel: "Key and settings",
  tabs: { key: "Key", settings: "Settings" },
  exaggeration: "Vertical exaggeration",
  exaggerationHelp: 'Stretches the height so the depths separate better. "True to scale" leaves them unstretched.',
  layersTitle: "Layers",
  exaggerationOption: (n) => (n === 1 ? "True to scale" : `×${n}`),
  exaggerationTag: (n, raised) =>
    raised
      ? n === 1
        ? `Mountains raised ×${RAISED_LAND}`
        : `Vertical exaggeration ×${n} · mountains ×${RAISED_LAND}`
      : n === 1
        ? "True to scale"
        : `Vertical exaggeration ×${n}`,
  relief: "Mountains",
  reliefHelp: `They are up to about 5 km high: at true scale they barely show on a 500 km block. Raised, their height is multiplied by ${RAISED_LAND}; the sea floor and the depths stay the same.`,
  reliefOption: { raised: `Raised ×${RAISED_LAND}`, true: "True to scale" },
  layers: {
    ground: "Ground",
    plate: "Plate",
    uncertainty: "Plate's margin of error",
    rupture: "Where it broke",
    events: "Events",
    labels: "Place names",
    snapped: "Highlight fixed depths",
  },
  timeTitle: "Time",
  timeHelp: (seconds) =>
    `The events appear in the order they happened, over about ${seconds} seconds. You can also move the date by hand.`,
  replay: "Replay",
  stop: "Stop",
  until: (date) => `up to ${date}`,
  date: "Date",

  keyTitle: "What are you looking at?",
  key: {
    ground: [
      "The top of the block",
      "The ground, as on a map: the coast, the rivers, the mountain ranges and the towns. Everything below it is the inside of the earth.",
    ],
    dots: [
      "The dots",
      "Each dot is an event in SGC's catalogue, where and as deep as it happened. The bigger the dot, the larger the magnitude.",
    ],
    plate: (rate) => [
      "The grey band",
      `The Nazca plate, part of the floor of the Pacific Ocean. It slides under South America about ${rate} a year and sinks towards the east. It is drawn from USGS's Slab2 model, and the fainter bands mark its margin of error.`,
    ],
    rupture: (f) => [
      "The orange patch",
      `The part of the rock that broke in the earthquake of ${f.date}: a crack about ${f.length} long, between ${f.top} and ${f.bottom} deep. The stronger the orange, the further the rock slid, up to about ${f.slip}. USGS worked it out with a model.`,
    ],
    offset: (f) =>
      `USGS places that earthquake about ${f.offset} further ${f.direction} and ${f.deeper} ${f.shallower ? "shallower" : "deeper"} than SGC does. That is why the orange patch does not pass through that earthquake's dot.`,
    pins: (list) => [
      "The markers",
      `Pereira, in red, and other places for reference. In "Explore in 3D", hover over a marker, or tap it, to see how far it is from Pereira in a straight line: ${list}.`,
    ],
    depth: (w, l, d) => [
      "The sizes",
      `The block is about ${w} from west to east, ${l} from south to north and ${d} tall. The numbers on the side mark how many kilometres below the surface. To make it easier to see, the height can be stretched and the mountains raised ×${RAISED_LAND}, because at true scale they barely show. Both options are in "Settings".`,
    ],
    snapped: (list) =>
      `The catalogue puts many small events at exactly the same depth: ${list}. That is why you see "layers" there, and they are not real.`,
  },
  groups: {
    shallow: "shallow group (Istmina–Sipí)",
    deep: "deep group",
    mainshock: (date, mag) => `earthquake of ${date}, ${mag}`,
    tolima: "Chaparral swarm",
  },
  snappedItem: (count, depth) => `${count} at ${depth}`,
  and: " and ",

  scene: {
    pinDistance: (name, km) => `${name}: about ${km} from Pereira in a straight line`,
    distance: (km) => `~${km}`,
    width: (km) => `~${km}, west–east`,
    length: (km) => `~${km}, south–north`,
    trench: "Pacific trench",
    plate: "Nazca plate · USGS Slab2 model",
    rupture: (date) => `where the rock broke on ${date} · USGS model`,
    plateShort: "Nazca plate",
    ruptureShort: "where the rock broke",
    widthShort: (km) => `~${km}`,
  },
  compass: {
    N: "north",
    NE: "north-east",
    E: "east",
    SE: "south-east",
    S: "south",
    SW: "south-west",
    W: "west",
    NW: "north-west",
  },
  credit: "Map:",
};

export const block3dCopy: Record<Lang, Copy> = { es, en };
