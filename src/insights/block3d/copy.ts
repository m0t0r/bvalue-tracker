/**
 * The 3D tab's own copy, in both languages. Every figure is passed in, computed from the data or from
 * the committed models, and formatted with a no-break space before its unit; nothing here states a
 * number of its own.
 */
import type { Lang } from "@/lib/i18n";
import type { Preset } from "./shared";

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
    `Imagina que cortamos un bloque de tierra de ${width} de ancho y ${depth} de profundidad, desde el océano Pacífico hasta más allá de Pereira. Dentro, cada sismo está donde ocurrió, a su profundidad real, junto a la placa que se hunde debajo de nosotros.`,
  explore: "Explorar en 3D",
  hint: "Arrastra para girar · pellizca o usa la rueda para acercar",
  close: "Cerrar",
  dialog: "El bloque en 3D",
  canvas:
    "Bloque en 3D con los sismos a su profundidad, la placa de Nazca y el lugar donde se rompió la roca en el sismo grande. Los cortes de «La historia» muestran lo mismo en dos dimensiones.",
  noWebgl:
    "Este navegador no puede mostrar gráficos en 3D. Los cortes de «La historia» muestran lo mismo en dos dimensiones.",
  views: "Vistas",
  view: {
    oblique: [
      "En diagonal",
      "El bloque visto desde el sureste: el terreno arriba y, debajo, los sismos a su profundidad real.",
    ],
    south: [
      "Desde el sur",
      "De perfil, como los cortes de «La historia»: la placa baja hacia el este, y los dos grupos del Chocó quedan a distinta profundidad.",
    ],
    above: ["Desde arriba", "Como en un mapa: dónde ocurrieron los sismos, sin su profundidad."],
    rupture: [
      "Donde se rompió",
      "De cerca, la zona naranja: la parte de la roca que se rompió en el sismo grande. Cuanto más intenso el naranja, más se deslizó.",
    ],
    chaparral: ["Chaparral", "El enjambre de Chaparral ocurre cerca de la superficie, muy por encima de la placa."],
  } satisfies Record<Preset, [string, string]>,
  freeView: "Estás girando el bloque a tu manera. Para volver a una vista, elígela arriba.",
  more: "Capas, escala y tiempo",
  exaggeration: "Exageración vertical",
  exaggerationOption: (n: number) => (n === 1 ? "×1 (real)" : `×${n}`),
  exaggerationTag: (n: number) => (n === 1 ? "A escala real" : `Exageración vertical ×${n}`),
  layers: {
    ground: "Terreno",
    plate: "Placa",
    uncertainty: "Margen de error de la placa",
    rupture: "Donde se rompió",
    events: "Sismos",
    labels: "Nombres",
    snapped: "Resaltar profundidades fijas",
  },
  replay: "Reproducir las semanas",
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
      "Cada punto es un sismo del catálogo del SGC, en el lugar y a la profundidad donde ocurrió. Cuanto más grande el punto, mayor la magnitud.",
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
    pins: ["Los marcadores", "Pereira, en rojo, y otros lugares que sirven de referencia."] as Pair,
    depth: (w: string, l: string, d: string): [string, string] => [
      "Las medidas",
      `El bloque mide unos ${w} de oeste a este, ${l} de sur a norte y ${d} de alto. Los números del costado marcan cuántos kilómetros hay bajo la superficie. Para que se vea mejor, lo vertical se puede estirar: con «×1», el bloque está a escala real y las montañas casi no se notan.`,
    ],
    snapped: (list: string) =>
      `El catálogo pone a muchos sismos pequeños exactamente a la misma profundidad: ${list}. Por eso ahí se ven «capas», que no son reales.`,
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
    width: (km: string) => `~${km}, oeste–este`,
    length: (km: string) => `~${km}, sur–norte`,
    trench: "fosa del Pacífico",
    plate: "placa de Nazca · modelo Slab2 del USGS",
    rupture: (date: string) => `donde se rompió la roca el ${date} · modelo del USGS`,
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
    `Picture a block of earth cut out, ${width} wide and ${depth} deep, from the Pacific Ocean to beyond Pereira. Inside it, each earthquake sits where it happened, at its true depth, beside the plate sinking beneath us.`,
  explore: "Explore in 3D",
  hint: "Drag to turn · pinch or scroll to zoom",
  close: "Close",
  dialog: "The block in 3D",
  canvas:
    "A 3D block with the earthquakes at their depths, the Nazca plate and where the rock broke in the large earthquake. The story's cross-sections show the same in two dimensions.",
  noWebgl: "This browser cannot show 3D graphics. The story's cross-sections show the same in two dimensions.",
  views: "Views",
  view: {
    oblique: [
      "Diagonal",
      "The block from the south-east: the ground on top and, below it, the earthquakes at their true depths.",
    ],
    south: [
      "From the south",
      "Side on, like the story's cross-sections: the plate sinks towards the east, and Chocó's two groups sit at different depths.",
    ],
    above: ["From above", "As on a map: where the earthquakes happened, without their depth."],
    rupture: [
      "Where it broke",
      "Close up on the orange patch: the part of the rock that broke in the large earthquake. The stronger the orange, the further it slid.",
    ],
    chaparral: ["Chaparral", "The Chaparral swarm happens near the surface, far above the plate."],
  },
  freeView: "You are turning the block your own way. To go back to a view, pick it above.",
  more: "Layers, scale and time",
  exaggeration: "Vertical exaggeration",
  exaggerationOption: (n) => (n === 1 ? "×1 (true)" : `×${n}`),
  exaggerationTag: (n) => (n === 1 ? "True to scale" : `Vertical exaggeration ×${n}`),
  layers: {
    ground: "Ground",
    plate: "Plate",
    uncertainty: "Plate's margin of error",
    rupture: "Where it broke",
    events: "Earthquakes",
    labels: "Names",
    snapped: "Highlight fixed depths",
  },
  replay: "Replay the weeks",
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
      "Each dot is an earthquake in SGC's catalogue, where and as deep as it happened. The bigger the dot, the larger the magnitude.",
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
    pins: ["The markers", "Pereira, in red, and other places for reference."],
    depth: (w, l, d) => [
      "The sizes",
      `The block is about ${w} from west to east, ${l} from south to north and ${d} tall. The numbers on the side mark how many kilometres below the surface. To make it easier to see, the vertical can be stretched: at "×1" the block is true to scale and the mountains barely show.`,
    ],
    snapped: (list) =>
      `The catalogue puts many small earthquakes at exactly the same depth: ${list}. That is why you see "layers" there, and they are not real.`,
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
    width: (km) => `~${km}, west–east`,
    length: (km) => `~${km}, south–north`,
    trench: "Pacific trench",
    plate: "Nazca plate · USGS Slab2 model",
    rupture: (date) => `where the rock broke on ${date} · USGS model`,
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
