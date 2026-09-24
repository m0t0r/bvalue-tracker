/**
 * The story's long-form copy. Sentences carry `{name}` placeholders that `Rich` fills with figures
 * computed from the data at render, so nothing here states a number about the catalogue. Anything
 * that depends on a trend is a claim, and its sentence lives in `../copy.ts`; where a title or a
 * paragraph only fits one outcome of a claim, it is keyed here by that claim's `case`.
 *
 * Words: "evento" for a catalogue entry, "sismo" in plain prose; "enjambre" for Chaparral, SGC's
 * own word (docs/science.md). Decimal point in every number.
 */
import type { Decay, Drift, Pace } from "../claims";
import type { PlateSide } from "../plate";
import type { MainshockState } from "@bvalue/seismo";

const es = {
  hero: {
    kicker: "Lo que se siente en Pereira",
    headline: (n: number): string =>
      n === 1
        ? "evento de magnitud 4 o más en los últimos 7 días."
        : "eventos de magnitud 4 o más en los últimos 7 días.",
    intro:
      "Con los datos del Servicio Geológico Colombiano, esta historia explica de dónde vienen los temblores que se sienten desde el {date}, cómo ha cambiado su ritmo y lo que nadie sabe todavía.",
    strip: "Cada raya es un evento de M4 o más desde el {date} ({n} en total). La más alta es el {main}.",
    stripAria: "Línea de tiempo con una raya por cada evento de magnitud 4 o más desde el {date}, coloreada por lugar.",
    scroll: "Sigue bajando",
  },
  legend: {
    shallow: "Chocó superficial",
    deep: "Chocó profundo",
    tolima: "Chaparral",
    pereira: "Pereira",
  },
  /** The coloured names the prose uses for the three sources. */
  names: {
    shallow: "grupo superficial",
    deep: "grupo profundo",
    tolima: "enjambre de Chaparral",
  },
  /** How the prose names Chocó's largest event: the mainshock only when the page's rule finds one. */
  main: (state: MainshockState): string => (state === "found" ? "sismo principal" : "evento mayor"),

  where: {
    chapter: "1 · Dónde estás",
    /** Keyed on whether the three straight-line distances are within a third of each other. */
    title: (similar: boolean): string =>
      similar
        ? "Tres lugares a distancias similares desde tu ubicación"
        : "Tres lugares a distancias distintas desde tu ubicación",
    p1: "Esta página sigue los eventos de tres lugares. Dos están en el Chocó, al occidente: un {shallow} cerca de Istmina y Sipí, y un {deep} alrededor del {main} del {date}. El tercero es el {tolima}, en el sur del Tolima.",
    p2: "Cada punto del mapa es un evento del catálogo del Servicio Geológico Colombiano (SGC): {n} desde el {date}.",
    p3: "Todo sismo se origina en un punto bajo tierra, el foco. Medida en línea recta hasta ese punto, la distancia desde Pereira es de unos {shallowKm} al grupo superficial, {deepKm} al grupo profundo y {tolimaKm} a Chaparral.",
    note: "Cada distancia es la mediana de los eventos de ese lugar, medida en línea recta desde Pereira hasta el foco de cada evento.",
  },

  energy: {
    chapter: "2 · El más grande",
    /** Keyed on the largest event being the mainshock and holding at least 90 % of the energy. */
    title: (dominant: boolean): string =>
      dominant ? "Un solo sismo liberó casi toda la energía" : "El evento mayor y todos los demás",
    p1: "El {main} del {date} fue de magnitud {mag} (se escribe {magLabel}). Después vinieron {n} eventos más en la misma zona del Chocó.",
    /** Keyed on the largest event holding more than half the energy, so the others' square is the smaller. */
    p2: (larger: boolean): string =>
      larger
        ? "En el dibujo, el área de cada cuadrado representa la energía. Todos esos eventos juntos caben en el cuadrito pequeño; el {magLabel}, por sí solo, liberó {share} del total."
        : "En el dibujo, el área de cada cuadrado representa la energía. El {magLabel} liberó {share} del total; todos los demás juntos, el resto.",
    ladderTitle: "Un punto más de magnitud: unas 32 veces más energía",
    ladder1:
      "La escala de magnitud engaña: subir un punto no significa «un poco más fuerte», sino unas {x1} veces más energía y 10 veces más movimiento en un sismógrafo. Dos puntos significan {x2} veces más energía.",
    ladder2:
      "Para igualar el {magLabel} harían falta unos {nAfter} eventos como el mayor que vino después ({after}, el {afterDate}), o unos {nM4} de magnitud 4.",
    /** Only while the page's rule finds a mainshock: it then stands at least 1.0 above every other event. */
    ladder3:
      "Por eso, aunque se sigan sintiendo temblores, cada evento que vino después liberó al menos 30 veces menos energía que el de aquel día.",
    note: "Las magnitudes mezclan tipos (MLr, MLv, Mw…) tal como las publica el SGC, así que estas comparaciones son aproximadas.",
  },

  section: {
    chapter: "3 · Bajo tierra",
    title: "Dos grupos a distinta profundidad",
    p1: "Ahora mira los mismos eventos del Chocó de perfil, como si cortáramos la tierra de oeste a este, sin exagerar la escala. Pereira queda en la superficie, a la derecha.",
    p2: "Bajo el Pacífico, la placa de Nazca —un enorme trozo del fondo del mar— se hunde despacio por debajo de Sudamérica. Por eso en esta parte de Colombia hay sismos tan profundos.",
    /** Keyed on the deep group's centre lying within 40 km of the largest event's epicentre. */
    p2Main: (near: boolean): string =>
      near
        ? "El {main} se originó a {depth} de profundidad, y el {deep} ({n} eventos) lo rodea."
        : "El {main} se originó a {depth} de profundidad; el {deep} ({n} eventos) está a unos {km} de él.",
    p3: "Así que en el mapa estaba a solo {epi} de Pereira, pero a {hypo} en línea recta.",
    /** Keyed on the shallow group's centre lying west of the deep group's. */
    p4: (west: boolean): string =>
      west
        ? "El {shallow} está más al oeste y a mucha menos profundidad, unos {depth}."
        : "El {shallow} está a mucha menos profundidad, unos {depth}.",
    eastDeeper: "En el dibujo, la actividad es más profunda hacia el este.",
    caveatTitle: "Lo que este dibujo no puede decir",
    caveat1:
      "Cada ubicación tiene un margen de error: en la mitad de los casos, unos {h} en horizontal (latitud y longitud juntas) y {depth} en profundidad. Las cruces del dibujo lo muestran.",
    /** Only while the three commonest depths hold at least a fifth of the shallow group's events. */
    caveat2:
      "Además, muchas profundidades se repiten exactamente ({depths}), porque el cálculo las fija en ciertos valores. Por eso aquí no se distingue una falla, solo nubes de puntos.",
  },

  /** Where each source sits against the plate, from `plateSide` (docs/science.md). */
  plate: {
    title: "¿Dentro de la placa o encima?",
    p1: "La franja gris es la placa de Nazca según Slab2, el modelo del USGS (Servicio Geológico de EE. UU.) de las placas que se hunden bajo los continentes: dónde está su borde superior y cuánto mide de grueso. La franja clara es el margen de error que el propio modelo declara para ese borde, de unos {unc} bajo estos eventos.",
    p2: "Para decir que un grupo está encima de la placa o dentro de ella, la diferencia tiene que superar ese margen más el error de las propias profundidades.",
    /** Keyed on `plateSide`'s answer for the group or the event named by {who}. */
    side: (side: PlateSide): string =>
      side === "above"
        ? "El {who} está encima de la placa, en la roca de Sudamérica: según el modelo, el borde de la placa pasa unos {gap} más abajo, más que el margen ({margin})."
        : side === "inside"
          ? "El {who} está dentro de la placa según el modelo: más de {margin} por debajo de su borde superior."
          : side === "below"
            ? "El {who} está por debajo de la placa según el modelo, más allá del margen ({margin})."
            : "El {who} está justo a la profundidad del borde de la placa, dentro del margen ({margin}): el modelo por sí solo no permite saber si está dentro de la placa o encima.",
    /** Only while the page's mainshock is the event USGS assessed (`USGS_ASSESSED`). */
    usgs: "El {usgs}, que estudió el {main} con sus propios datos, considera que por su profundidad probablemente ocurrió dentro de la placa de Nazca, y que los sismos a esa profundidad suelen deberse a las fuerzas que doblan la placa al hundirse.",
    /** When the mainshock gets the same answer as the deep group around it. */
    same: "Lo mismo ocurre con el {who}.",
    usgsLink: "USGS",
    note: "El dibujo es un corte a {lat} de latitud, entre los dos grupos. Cada grupo se compara con la placa en su propio lugar, no con el dibujo.",
  },

  clocks: {
    chapter: "4 · Dos relojes",
    deepTitle: (d: Decay["case"]): string =>
      d === "decayed"
        ? "Las réplicas se apagan como es habitual"
        : d === "not-decayed"
          ? "Las réplicas no se apagan como es habitual"
          : "Las primeras réplicas",
    deep1:
      "Después de un sismo grande vienen réplicas: eventos más pequeños en la misma zona, cada vez más espaciados. Una regla de 1894, la ley de Omori, dice que su número baja más o menos en proporción inversa al tiempo transcurrido: al doble de tiempo, la mitad de réplicas por día.",
    deep2: "Mira el {deep} en el dibujo. {claim}",
    deepNote:
      "Solo se cuentan eventos de {mc} o más: desde ese tamaño, el catálogo los registra todos. La línea discontinua es esa curva típica, anclada al primer día del grupo profundo: es una ilustración, no un ajuste a los datos.",
    shallowTitle: (d: Decay["case"]): string =>
      d === "not-decayed"
        ? "El grupo superficial no siguió esa regla"
        : d === "decayed"
          ? "El grupo superficial también se apagó"
          : "El grupo superficial",
    shallow1: "Ahora el {shallow}. {claim}",
    /** Only when the shallow group did not fade: this is then the answer to "why is it still shaking?". */
    shallowAnswer:
      "Esto responde a «¿por qué siguió temblando tanto tiempo?»: lo que continuó en el Chocó no fueron las réplicas del {main}, que se iban apagando despacio. Desde la segunda semana, el {pct} de los eventos del Chocó vinieron del grupo superficial.",
    shallowWeeks: (partial: boolean): string =>
      partial
        ? "Sus eventos de M4 o más, semana a semana desde el {date}: {weeks} (la última semana aún no ha terminado)."
        : "Sus eventos de M4 o más, semana a semana desde el {date}: {weeks}.",
    /** Only while the shallow group has not faded: it is the "why" of a group that kept going. */
    why: "¿Por qué? No se sabe. Los sismólogos consideran varias posibilidades: que el {main} haya cambiado los esfuerzos en la roca vecina, que haya fluidos moviéndose por las fracturas o que una falla se esté deslizando lentamente. Este catálogo no permite decidir entre ellas.",
    paceTitle: (p: Pace["case"]): string =>
      p === "quieter"
        ? "En los últimos días, más tranquilo"
        : p === "busier"
          ? "En los últimos días, más activo"
          : "En los últimos días, a su ritmo habitual",
    pace: "Mira el final de la línea del {shallow}. {claim}",
    paceNote: "El SGC todavía puede revisar y añadir eventos recientes.",
    /** Only when the pace claim found a lull to shade. */
    lullNote: "Las franjas grises del dibujo marcan los periodos en que se calmó.",
  },

  tolima: {
    chapter: "5 · Tolima",
    title: (m: MainshockState): string =>
      m === "found"
        ? "Chaparral: ahora un evento destaca"
        : m === "awaiting-review"
          ? "Chaparral: un evento destaca, pendiente de revisión"
          : "Chaparral: muchos eventos, ninguno domina",
    p1: (m: MainshockState): string =>
      m === "found"
        ? "El {date} empezó otra serie de eventos, a unos {km} del {main}, cerca de Chaparral. El SGC la llama {tolima}: muchos sismos de tamaño parecido. Ahora uno de ellos destaca sobre todos los demás."
        : m === "awaiting-review"
          ? "El {date} empezó otra serie de eventos, a unos {km} del {main}, cerca de Chaparral. El SGC la llama {tolima}: muchos sismos de tamaño parecido. Ahora uno destaca, aunque su magnitud todavía es automática y puede cambiar."
          : "El {date} empezó otra serie de eventos, a unos {km} del {main}, cerca de Chaparral. El SGC la llama {tolima}: muchos sismos de tamaño parecido, sin uno grande que domine.",
    stillSwarm: "Mientras el SGC no la describa de otra forma, esta página la sigue llamando enjambre.",
    p2: "Compara las dos franjas: en el Chocó, el evento mayor liberó {chocoShare} de la energía; en Chaparral, el mayor ({mag}) liberó {tolimaShare}.",
    /** Keyed on the swarm's median depth being under 30 km, where it is certainly in the crust. */
    p3: (crustal: boolean): string =>
      crustal
        ? "El enjambre registra en promedio unos {perDay} eventos al día, a unos {depth} de profundidad, dentro de la corteza."
        : "El enjambre registra en promedio unos {perDay} eventos al día, a unos {depth} de profundidad.",
    driftTitle: (d: Drift["case"]): string =>
      d === "moved" ? "Parece desplazarse despacio" : d === "none" ? "No parece desplazarse" : "¿Se desplaza?",
    /** The line is drawn only when the drift claim says the centre moved. */
    driftHow: (moved: boolean): string =>
      moved
        ? "En el dibujo, cada punto es un evento (más intenso cuanto más reciente), y la línea une el centro de los eventos de cada periodo de 12 horas."
        : "En el dibujo, cada punto es un evento (más intenso cuanto más reciente).",
    driftElsewhere:
      "En otros enjambres del mundo, desplazamientos así se han asociado con fluidos o con fallas que se deslizan lentamente. Aquí no se sabe.",
    hypothesis:
      "El SGC ha planteado como hipótesis preliminar que el sismo del {date} pudo cambiar los esfuerzos en la corteza y ayudar a reactivar fallas cerca de Chaparral. Es solo eso, una hipótesis: que dos cosas ocurran casi al mismo tiempo no demuestra que una haya causado la otra.",
    note: "Los enjambres terminan de maneras distintas, y no se puede saber de antemano cómo terminará este. Según el SGC, que haya muchos sismos no significa por sí solo que venga uno grande.",
  },

  /** Chaparral's cut, at the same scale as Chocó's (docs/science.md). */
  tolimaCut: {
    title: "Chaparral visto de perfil",
    p1: "Ahora cortamos la tierra de la misma forma, de oeste a este, pero a la latitud de Chaparral y con la misma escala que en el Chocó. Pereira no aparece en este corte: queda a unos {km} al norte.",
    /** Only while `facts.tolimaFarFromPlate` holds: crustal, above the plate, at least twice as far as any Chocó source. */
    p3: "Compara los dos cortes: el enjambre de Chaparral está mucho más lejos de la placa que los grupos del Chocó. Sus sismos ocurren en fallas de la corteza, muy por encima de la placa que se hunde.",
    note: "El dibujo es un corte a {lat} de latitud, a través del enjambre. El enjambre se compara con la placa en su propio lugar, no con el dibujo. El mapa pequeño de la esquina muestra por dónde pasa el corte.",
  },

  felt: {
    chapter: "6 · Pereira",
    title: "Por qué los sientes",
    p1: (similar: boolean): string =>
      similar
        ? "Los tres lugares están a distancias similares de Pereira, así que lo que más distingue a sus eventos es la magnitud. Elige desde qué magnitud los notas:"
        : "Los tres lugares están a distancias distintas de Pereira, así que importan tanto la magnitud como la distancia. Elige desde qué magnitud los notas:",
    slider: "Los noto desde",
    sliderAria: "Magnitud desde la que notas un temblor",
    days: "Desde el {date}, {k} de {n} días tuvieron al menos un evento de {mag} o más.",
    note: "Que lo notes depende también de dónde estés: en qué piso, sobre qué tipo de suelo, si estás quieto o no. Esta página no calcula cuánto tembló en tu casa; para eso hacen falta modelos que aquí no se usan.",
    wavesTitle: "Unos segundos de viaje",
    waves1:
      "Un sismo envía dos tipos de ondas a través de la roca. Las P, más rápidas (unos {vp} por segundo), llegan primero, como un golpe seco. Las S, más lentas (unos {vs} por segundo), llegan después y suelen sacudir más.",
    waves2:
      "Desde el {magLabel}, que estaba a {km}, las ondas P tardaron unos {p} en llegar a Pereira y las S unos {s}. Por eso a veces se nota un primer sacudón y, segundos después, el vaivén.",
    wavesNote:
      "Las velocidades son típicas y aproximadas; la roca real las cambia. El sismograma del dibujo es esquemático, no un registro real.",
  },

  unknown: {
    chapter: "7 · Lo que nadie sabe",
    title: "Lo que nadie sabe todavía",
    /** Keyed on the shallow group's own decay. */
    shallowWhy: (d: Decay["case"] | null): string =>
      d === "not-decayed"
        ? "Por qué el grupo superficial del Chocó siguió activo tantas semanas."
        : "Qué estructura exacta produce los eventos del grupo superficial del Chocó.",
    /** Keyed on the shallow group's recent pace. */
    shallowNext: (p: Pace["case"] | null): string =>
      p === "quieter"
        ? "Si la calma del grupo superficial es una pausa o el final."
        : "Cuánto tiempo más seguirá activo el grupo superficial.",
    items: [
      "Si el enjambre de Chaparral tiene que ver con el sismo del {date}. El SGC lo plantea como hipótesis.",
      "Cuánto durará el enjambre de Chaparral.",
      "Si vendrá un sismo más grande. Nadie puede predecir un sismo: ni el día, ni el lugar exacto, ni el tamaño.",
      "Qué pasa por debajo de M2.0: el catálogo público del SGC empieza ahí.",
    ],
    closing:
      "Lo útil no es adivinar, sino estar preparado y seguir la información oficial del Servicio Geológico Colombiano.",
  },

  /** Labels drawn inside the pinned graphic, and its text alternative for each scene. */
  graphic: {
    mapTitle: "Eventos del catálogo del SGC, {from} – {to}",
    mapAria:
      "Mapa con los eventos de los tres lugares y Pereira. Las líneas dan la distancia en línea recta desde Pereira hasta cada lugar.",
    mapNote: "Distancia en línea recta hasta el foco · círculo: 120 km en el mapa",
    ocean: "Océano Pacífico",
    unknownAria: "Mapa de los tres lugares con un signo de interrogación en cada uno.",
    sectionTitle: "Corte de oeste a este · sin exagerar la escala",
    sectionAria:
      "Corte de la tierra de oeste a este con la profundidad de cada evento del Chocó: el grupo superficial a unos {shallow}, el profundo a unos {deep}. Un mapa pequeño muestra por dónde pasa el corte.",
    west: "← oeste · océano Pacífico",
    east: "este →",
    trench: "fosa",
    plate: "placa de Nazca",
    plateModel: "modelo Slab2 del USGS",
    plateBand: "franja clara: margen de error",
    tolimaSectionTitle: "Corte por Chaparral · misma escala",
    tolimaSectionAria:
      "Corte de la tierra de oeste a este a la latitud de Chaparral, a la misma escala que el del Chocó: el enjambre a unos {depth} de profundidad y el borde de la placa de Nazca a unos {top}. Un mapa pequeño muestra por dónde pasa el corte.",
    pereiraNorth: "Pereira: ~{km} al norte, fuera del corte",
    swarmAt: "enjambre · ~{km}",
    eastDeeper: "más profundo hacia el este",
    groupAt: { shallow: "superficial · ~{km}", deep: "profundo · ~{km}" },
    errorLegend: "＋ error típico: {h} en horizontal, {depth} en profundidad",
    energyTitle: "Energía liberada · área proporcional",
    energyShareAria:
      "Dos cuadrados cuya área representa la energía: el evento mayor liberó {share}; todos los demás eventos juntos, el resto.",
    energyOthers: "{n} eventos más, todos juntos",
    energyMain: "{date} · {share} de la energía",
    ladderAria: "Tres cuadrados para M4, M5 y M6; cada uno tiene unas 32 veces el área del anterior.",
    ladderNote: "Cada punto de magnitud: unas 32 veces más energía",
    clocksTitle: "Eventos por día ({mc} o más) · Chocó",
    clocksAria:
      "Eventos por día desde el primer evento, en escala logarítmica, para el grupo profundo y el superficial, con la curva típica de réplicas como referencia.",
    clocksAxis: "días desde el {date} (la escala amplía los primeros días)",
    omori: ["curva típica", "de réplicas"],
    lines: { shallow: "superficial", deep: "profundo" },
    strongRow: "◆ cada evento de M4 o más",
    lull: "calma",
    tolimaTitle: "Cuánta energía liberó el evento mayor",
    tolimaAria:
      "Dos franjas con la parte de la energía de cada evento, del mayor al menor: en el Chocó el evento mayor liberó {choco}; en Chaparral, {tolima}. Debajo, un mapa de cerca de Chaparral.",
    stripChoco: "Chocó · el mayor ({mag}): {share}",
    stripTolima: "Chaparral · el mayor ({mag}): {share}",
    stripNote: "cada franja es un evento, del mayor al menor",
    closeUp: "Chaparral de cerca · más intenso = más reciente",
    track: "centro cada 12 horas",
    errorCircle: "error de localización: unos {km}",
    calendarTitle: "Días con al menos un evento de {mag} o más",
    calendarAria:
      "Calendario desde el primer evento: cada casilla es un día, coloreada por el lugar con más eventos de la magnitud elegida o más.",
    calendarCount: "{k} de {n} días",
    weekdays: ["L", "M", "X", "J", "V", "S", "D"],
    wavesTitle: "Cuánto tardan las ondas en llegar a Pereira",
    wavesAria:
      "Barras con el tiempo que tardan las ondas P y S en llegar a Pereira desde el evento mayor, el grupo superficial y Chaparral.",
    seismogram: "cómo se vería en un sismógrafo (dibujo esquemático, no un registro real)",
    wavesNote: "velocidades típicas y aproximadas · animación 4 veces más rápida",
  },
};

export type StoryCopy = typeof es;

const en: StoryCopy = {
  hero: {
    kicker: "What is felt in Pereira",
    headline: (n) =>
      n === 1
        ? "event of magnitude 4 or more in the last 7 days."
        : "events of magnitude 4 or more in the last 7 days.",
    intro:
      "Using data from the Servicio Geológico Colombiano, this story explains where the tremors felt since {date} come from, how their pace has changed, and what nobody knows yet.",
    strip: "Each line is one event of M4 or more since {date} ({n} in all). The tallest is the {main}.",
    stripAria: "Timeline with one line for each event of magnitude 4 or more since {date}, coloured by place.",
    scroll: "Keep scrolling",
  },
  legend: { shallow: "Chocó shallow", deep: "Chocó deep", tolima: "Chaparral", pereira: "Pereira" },
  names: { shallow: "shallow group", deep: "deep group", tolima: "Chaparral swarm" },
  main: (state) => (state === "found" ? "mainshock" : "largest event"),

  where: {
    chapter: "1 · Where you are",
    title: (similar) =>
      similar ? "Three places, at a similar distance from you" : "Three places, at different distances from you",
    p1: "The events this page follows come from three places. Two are in Chocó, to the west: a {shallow} near Istmina and Sipí, and a {deep} around the {main} of {date}. The third is a {tolima}, in southern Tolima.",
    p2: "Each dot on the map is an event in the catalogue of the Servicio Geológico Colombiano (SGC): {n} since {date}.",
    p3: "An earthquake starts at a point underground. Counting that depth, in a straight line the shallow group is about {shallowKm} from Pereira, the deep group {deepKm} and Chaparral {tolimaKm}.",
    note: "Distances: each place's median, in a straight line from Pereira to the point underground where each event began.",
  },

  energy: {
    chapter: "2 · The largest",
    title: (dominant) =>
      dominant ? "One earthquake released almost all the energy" : "The largest event and all the others",
    p1: "The {main} of {date} was magnitude {mag} (written {magLabel}). After it came {n} more events in the same part of Chocó.",
    p2: (larger) =>
      larger
        ? "In the drawing, each square's area is its energy. All those events together fit in the small square; the {magLabel} alone holds {share} of the total."
        : "In the drawing, each square's area is its energy. The {magLabel} holds {share} of the total; all the others together, the rest.",
    ladderTitle: "Each step of magnitude, about 32 times the energy",
    ladder1:
      "The magnitude scale is deceptive: one step up is not “a bit stronger”. It is about {x1} times the energy, and on a seismograph 10 times the motion. Two steps: {x2} times the energy.",
    ladder2:
      "Matching the {magLabel} would take about {nAfter} events like the largest one that came after it ({after}, on {afterDate}), or about {nM4} of magnitude 4.",
    ladder3:
      "So although tremors are still felt, every event that came after released at least 30 times less energy than the one that day.",
    note: "Magnitudes mix types (MLr, MLv, Mw…) as SGC publishes them, so these comparisons are approximate.",
  },

  section: {
    chapter: "3 · Underground",
    title: "Two groups, at two depths",
    p1: "Now look at the same Chocó events from the side, as if the earth were cut from west to east, true to scale. Pereira sits on the surface, on the right.",
    p2: "Under the Pacific, the Nazca plate — a huge slab of sea floor — sinks slowly beneath South America. That is why this part of Colombia has earthquakes this deep.",
    p2Main: (near) =>
      near
        ? "The {main} began {depth} underground, and the {deep} ({n} events) lies around it."
        : "The {main} began {depth} underground; the {deep} ({n} events) lies about {km} from it.",
    p3: "That is why it was only {epi} from Pereira on the map, but {hypo} in a straight line.",
    p4: (west) =>
      west
        ? "The {shallow} lies further west and much shallower, at about {depth}."
        : "The {shallow} lies much shallower, at about {depth}.",
    eastDeeper: "In the drawing, the activity is deeper towards the east.",
    caveatTitle: "What this drawing cannot say",
    caveat1:
      "Every location has a margin of error. For half of them it is about {h} horizontally (latitude and longitude together) and {depth} in depth: the crosses show it.",
    caveat2:
      "Also, many depths land on exactly the same values ({depths}): the calculation sets them in steps. So no fault can be seen here, only clouds of dots.",
  },

  plate: {
    title: "Inside the plate, or above it?",
    p1: "The grey band is the Nazca plate according to Slab2, the USGS (United States Geological Survey) model of the plates that sink beneath the continents: where its top is and how thick it is. The light band is the margin of error the model itself states for that top, about {unc} under these events.",
    p2: "To say a group is above the plate or inside it, the difference has to exceed that margin plus the error in the depths themselves.",
    side: (side) =>
      side === "above"
        ? "The {who} is above the plate, in South America's rock: according to the model, the plate's top runs about {gap} further down, more than the margin ({margin})."
        : side === "inside"
          ? "The {who} is inside the plate according to the model: more than {margin} below its top."
          : side === "below"
            ? "The {who} is below the plate according to the model, beyond the margin ({margin})."
            : "The {who} sits right at the depth of the plate's top, within the margin ({margin}): the model alone cannot tell whether it is inside the plate or above it.",
    usgs: "The {usgs}, which studied the {main} with its own data, considers that given its depth it likely occurred within the subducting Nazca plate, and that earthquakes at that depth are usually due to the forces that bend the plate as it sinks.",
    same: "The same holds for the {who}.",
    usgsLink: "USGS",
    note: "The drawing is a cut at {lat} latitude, between the two groups. Each group is compared with the plate at its own place, not with the drawing.",
  },

  clocks: {
    chapter: "4 · Two clocks",
    deepTitle: (d) =>
      d === "decayed"
        ? "The aftershocks are dying away as expected"
        : d === "not-decayed"
          ? "The aftershocks are not dying away as expected"
          : "The first aftershocks",
    deep1:
      "After a large earthquake come aftershocks: smaller events in the same area, ever further apart. A rule from 1894, Omori's law, says their rate falls roughly as one over the time elapsed.",
    deep2: "Look at the {deep} in the drawing. {claim}",
    deepNote:
      "Only events of {mc} and up are counted, which the catalogue records completely. The dashed line is that typical curve, anchored to the deep group's first day: an illustration, not a fit.",
    shallowTitle: (d) =>
      d === "not-decayed"
        ? "The shallow group did not follow that rule"
        : d === "decayed"
          ? "The shallow group faded too"
          : "The shallow group",
    shallow1: "Now the {shallow}. {claim}",
    shallowAnswer:
      "This is the answer to “why did it keep shaking for so long?”: in Chocó, what continued was not the {main}'s aftershocks slowly dying away. From the second week on, {pct} of Chocó's events came from the shallow group.",
    shallowWeeks: (partial) =>
      partial
        ? "Its events of M4 or more, week by week since {date}: {weeks} (the last week is not over yet)."
        : "Its events of M4 or more, week by week since {date}: {weeks}.",
    why: "Why? Nobody knows. Seismologists consider several possibilities: that the {main} changed the stresses in the nearby rock, that fluids are moving through fractures, or that a fault is slipping slowly. This catalogue cannot decide between them.",
    paceTitle: (p) =>
      p === "quieter"
        ? "In the last few days, quieter"
        : p === "busier"
          ? "In the last few days, busier"
          : "In the last few days, at its usual pace",
    pace: "Look at the end of the {shallow}'s line. {claim}",
    paceNote: "SGC may still review and add recent events.",
    lullNote: "The grey bands in the drawing are the stretches when it quietened.",
  },

  tolima: {
    chapter: "5 · Tolima",
    title: (m) =>
      m === "found"
        ? "Chaparral: one event now stands out"
        : m === "awaiting-review"
          ? "Chaparral: one event stands out, awaiting review"
          : "Chaparral: many events, none in charge",
    p1: (m) =>
      m === "found"
        ? "On {date} another run of events began, about {km} from the {main}, near Chaparral. SGC calls it a {tolima}: many earthquakes of similar size. Now one of them stands out above all the others."
        : m === "awaiting-review"
          ? "On {date} another run of events began, about {km} from the {main}, near Chaparral. SGC calls it a {tolima}: many earthquakes of similar size. Now one stands out, though its magnitude is still automatic and may change."
          : "On {date} another run of events began, about {km} from the {main}, near Chaparral. SGC calls it a {tolima}: many earthquakes of similar size, with no single large one in charge.",
    stillSwarm: "Until SGC describes it otherwise, this page keeps calling it a swarm.",
    p2: "Compare the two strips: in Chocó, the largest event holds {chocoShare} of the energy; at Chaparral, the largest ({mag}) holds {tolimaShare}.",
    p3: (crustal) =>
      crustal
        ? "It has averaged about {perDay} events a day, about {depth} deep, inside the crust."
        : "It has averaged about {perDay} events a day, about {depth} deep.",
    driftTitle: (d) =>
      d === "moved" ? "It seems to be moving, slowly" : d === "none" ? "No visible movement" : "Is it moving?",
    driftHow: (moved) =>
      moved
        ? "In the drawing, each dot is an event, stronger the more recent, and the line joins the centre of each half-day's events."
        : "In the drawing, each dot is an event, stronger the more recent.",
    driftElsewhere:
      "In other swarms around the world, shifts like this have been linked to fluids or to faults slipping slowly. Here, nobody knows.",
    hypothesis:
      "SGC has put forward, as a preliminary hypothesis, that the earthquake of {date} may have changed the stresses in the crust and helped reactivate faults near Chaparral. It is just that, a hypothesis: two things happening close in time does not show that one caused the other.",
    note: "Swarms end in different ways, and there is no knowing in advance which. According to SGC, many earthquakes do not by themselves mean a large one is coming.",
  },

  tolimaCut: {
    title: "Chaparral from the side",
    p1: "Now we cut the earth the same way, west to east, but at Chaparral's latitude and at the same scale as in Chocó. Pereira is not on this cut: it lies about {km} to the north.",
    p3: "Compare the two cuts: the Chaparral swarm is much further from the plate than Chocó's groups. Its earthquakes happen on faults in the crust, far above the sinking plate.",
    note: "The drawing is a cut at {lat} latitude, through the swarm. The swarm is compared with the plate at its own place, not with the drawing. The small map in the corner shows where the cut runs.",
  },

  felt: {
    chapter: "6 · Pereira",
    title: "Why you feel them",
    p1: (similar) =>
      similar
        ? "All three places are at a similar distance from Pereira, so between their events what changes most is the magnitude. Set the magnitude from which you notice them:"
        : "The three places are at different distances from Pereira, so both the magnitude and the distance count. Set the magnitude from which you notice them:",
    slider: "I notice them from",
    sliderAria: "Magnitude from which you notice a tremor",
    days: "At {mag} or more, {k} of {n} days since {date} had at least one event.",
    note: "Whether you notice one also depends on where you are: the floor, the ground, whether you are still. This page does not work out how hard your house shook; that takes models not used here.",
    wavesTitle: "A few seconds' journey",
    waves1:
      "An earthquake sends two kinds of waves through the rock. P waves, faster (about {vp} a second), arrive first, like a sharp jolt. S waves, slower (about {vs} a second), arrive later and usually shake more.",
    waves2:
      "From the {magLabel}, {km} away, the P waves took about {p} to reach Pereira and the S waves about {s}. That is why you sometimes notice a first jolt and, seconds later, the swaying.",
    wavesNote:
      "The speeds are typical and approximate; real rock changes them. The seismogram in the drawing is schematic, not a real record.",
  },

  unknown: {
    chapter: "7 · What nobody knows",
    title: "What nobody knows yet",
    shallowWhy: (d) =>
      d === "not-decayed"
        ? "Why Chocó's shallow group stayed active for so many weeks."
        : "Which structure exactly produces the events of Chocó's shallow group.",
    shallowNext: (p) =>
      p === "quieter"
        ? "Whether the shallow group's quiet is a pause or the end."
        : "How much longer the shallow group will stay active.",
    items: [
      "Whether the Chaparral swarm has to do with the earthquake of {date}. SGC puts it forward as a hypothesis.",
      "How long the Chaparral swarm will last.",
      "Whether a larger earthquake will come. Nobody can predict earthquakes: not the day, the exact place or the size.",
      "What happens below M2.0: SGC's public catalogue starts there.",
    ],
    closing:
      "What helps is not guessing but being prepared, and following the official information of the Servicio Geológico Colombiano.",
  },

  graphic: {
    mapTitle: "Events in SGC's catalogue, {from} – {to}",
    mapAria:
      "Map of the events at the three places and Pereira. The lines give the straight-line distance from Pereira to each place.",
    mapNote: "Straight-line distance to the point underground · circle: 120 km on the map",
    ocean: "Pacific Ocean",
    unknownAria: "Map of the three places with a question mark on each.",
    sectionTitle: "West–east cut · true to scale",
    sectionAria:
      "Cut through the earth from west to east with the depth of each Chocó event: the shallow group about {shallow} down, the deep one about {deep}. A small map shows where the cut runs.",
    west: "← west · Pacific Ocean",
    east: "east →",
    trench: "trench",
    plate: "Nazca plate",
    plateModel: "USGS Slab2 model",
    plateBand: "light band: margin of error",
    tolimaSectionTitle: "Cut through Chaparral · same scale",
    tolimaSectionAria:
      "Cut through the earth from west to east at Chaparral's latitude, at the same scale as Chocó's: the swarm about {depth} down and the top of the Nazca plate about {top} down. A small map shows where the cut runs.",
    pereiraNorth: "Pereira: ~{km} north, off the cut",
    swarmAt: "swarm · ~{km}",
    eastDeeper: "deeper towards the east",
    groupAt: { shallow: "shallow · ~{km}", deep: "deep · ~{km}" },
    errorLegend: "＋ typical error: {h} horizontally, {depth} in depth",
    energyTitle: "Energy released · area to scale",
    energyShareAria:
      "Two squares whose area is energy: the largest event holds {share}; all the other events together, the rest.",
    energyOthers: "{n} more events, all together",
    energyMain: "{date} · {share} of the energy",
    ladderAria: "Three squares for M4, M5 and M6; each has about 32 times the area of the one before.",
    ladderNote: "Each step of magnitude: about 32 times the energy",
    clocksTitle: "Events per day ({mc} and up) · Chocó",
    clocksAria:
      "Events per day since the first event, on a logarithmic scale, for the deep and the shallow group, with the typical aftershock curve for reference.",
    clocksAxis: "days since {date} (the axis is stretched at the start)",
    omori: ["typical curve", "of aftershocks"],
    lines: { shallow: "shallow", deep: "deep" },
    strongRow: "◆ each event of M4 and up",
    lull: "lull",
    tolimaTitle: "How much of the energy the largest event holds",
    tolimaAria:
      "Two strips with each event's share of the energy, largest first: in Chocó the largest event holds {choco}; at Chaparral, {tolima}. Below, a close-up map of Chaparral.",
    stripChoco: "Chocó · the largest ({mag}): {share}",
    stripTolima: "Chaparral · the largest ({mag}): {share}",
    stripNote: "each slice is one event, largest first",
    closeUp: "Chaparral close up · stronger = more recent",
    track: "centre of each half-day",
    errorCircle: "location error: about {km}",
    calendarTitle: "Days with at least one event of {mag} or more",
    calendarAria:
      "Calendar from the first event: each square is a day, coloured by the place with the most events of the chosen magnitude or more.",
    calendarCount: "{k} of {n} days",
    weekdays: ["M", "T", "W", "T", "F", "S", "S"],
    wavesTitle: "How long the waves take to reach Pereira",
    wavesAria:
      "Bars with the time the P and S waves take to reach Pereira from the largest event, the shallow group and Chaparral.",
    seismogram: "what a seismograph would show (schematic drawing, not a real record)",
    wavesNote: "typical, approximate speeds · animation 4 times faster",
  },
};

export const storyCopy = { es, en };
