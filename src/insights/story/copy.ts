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
      similar ? "Tres lugares, a una distancia parecida de ti" : "Tres lugares, a distintas distancias de ti",
    p1: "Los eventos que sigue esta página vienen de tres lugares. Dos están en el Chocó, al occidente: un {shallow} cerca de Istmina y Sipí, y un {deep} alrededor del {main} del {date}. El tercero es un {tolima}, en el sur del Tolima.",
    p2: "Cada punto del mapa es un evento del catálogo del Servicio Geológico Colombiano (SGC): {n} desde el {date}.",
    p3: "Un sismo empieza en un punto bajo tierra. Contando esa profundidad, en línea recta el grupo superficial está a unos {shallowKm} de Pereira, el grupo profundo a {deepKm} y Chaparral a {tolimaKm}.",
    note: "Distancias: la mediana de cada lugar, en línea recta desde Pereira hasta el punto bajo tierra donde empezó cada evento.",
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
        ? "En el dibujo, el área de cada cuadrado es la energía. Todos esos eventos juntos caben en el cuadrito pequeño; el {magLabel}, por sí solo, tiene el {share} del total."
        : "En el dibujo, el área de cada cuadrado es la energía. El {magLabel} tiene el {share} del total; todos los demás juntos, el resto.",
    ladderTitle: "Cada punto de magnitud, unas 32 veces más energía",
    ladder1:
      "La escala de magnitud engaña: subir un punto no es «un poco más fuerte». Es unas {x1} veces más energía, y en un sismógrafo, 10 veces más movimiento. Dos puntos: {x2} veces más energía.",
    ladder2:
      "Para igualar el {magLabel} harían falta unos {nAfter} eventos como el mayor que vino después ({after}, el {afterDate}), o unos {nM4} de magnitud 4.",
    /** Only while the page's rule finds a mainshock: it then stands at least 1.0 above every other event. */
    ladder3:
      "Por eso, aunque se sigan sintiendo temblores, cada evento que vino después liberó al menos 30 veces menos energía que el de aquel día.",
    note: "Las magnitudes mezclan tipos (MLr, MLv, Mw…) tal como las publica el SGC, así que estas comparaciones son aproximadas.",
  },

  section: {
    chapter: "3 · Bajo tierra",
    title: "Dos grupos, a dos profundidades",
    p1: "Ahora mira los mismos eventos del Chocó de lado, como si cortáramos la tierra de oeste a este, sin exagerar la escala. Pereira queda en la superficie, a la derecha.",
    p2: "Bajo el Pacífico, la placa de Nazca —un enorme trozo del fondo del mar— se hunde despacio por debajo de Sudamérica. Por eso en esta parte de Colombia hay sismos tan profundos.",
    /** Keyed on the deep group's centre lying within 40 km of the largest event's epicentre. */
    p2Main: (near: boolean): string =>
      near
        ? "El {main} empezó a {depth} bajo tierra, y el {deep} ({n} eventos) está a su alrededor."
        : "El {main} empezó a {depth} bajo tierra; el {deep} ({n} eventos) está a unos {km} de él.",
    p3: "Por eso estaba a solo {epi} de Pereira en el mapa, pero a {hypo} en línea recta.",
    /** Keyed on the shallow group's centre lying west of the deep group's. */
    p4: (west: boolean): string =>
      west
        ? "El {shallow} está más al oeste y mucho menos profundo, a unos {depth}. Con este catálogo no se puede saber en qué estructura exacta está cada grupo."
        : "El {shallow} está mucho menos profundo, a unos {depth}. Con este catálogo no se puede saber en qué estructura exacta está cada grupo.",
    eastDeeper: "En el dibujo, la actividad es más profunda hacia el este.",
    caveatTitle: "Lo que este dibujo no puede decir",
    caveat1:
      "Cada ubicación tiene un margen de error. En la mitad de los casos es de unos {h} en horizontal (latitud y longitud juntas) y {depth} en profundidad: las cruces lo muestran.",
    /** Only while the three commonest depths hold at least a fifth of the shallow group's events. */
    caveat2:
      "Además, muchas profundidades caen en los mismos valores exactos ({depths}): el cálculo las fija en pasos. Por eso aquí no se ve una falla, solo nubes de puntos.",
  },

  clocks: {
    chapter: "4 · Dos relojes",
    deepTitle: (d: Decay["case"]): string =>
      d === "decayed"
        ? "Las réplicas se apagan como se espera"
        : d === "not-decayed"
          ? "Las réplicas no se apagan como se espera"
          : "Las primeras réplicas",
    deep1:
      "Después de un sismo grande vienen réplicas: eventos más pequeños en la misma zona, cada vez más espaciados. Una regla de 1894, la ley de Omori, dice que su ritmo baja más o menos como uno dividido por el tiempo transcurrido.",
    deep2: "Mira el {deep} en el dibujo. {claim}",
    deepNote:
      "Se cuentan solo eventos de {mc} o más, que el catálogo registra completos. La línea discontinua es esa curva típica, anclada al primer día del grupo profundo: una ilustración, no un ajuste.",
    shallowTitle: (d: Decay["case"]): string =>
      d === "not-decayed"
        ? "El grupo superficial no siguió esa regla"
        : d === "decayed"
          ? "El grupo superficial también se apagó"
          : "El grupo superficial",
    shallow1: "Ahora el {shallow}. {claim}",
    /** Only when the shallow group did not fade: this is then the answer to "why is it still shaking?". */
    shallowAnswer:
      "Esta es la respuesta a «¿por qué siguió temblando tanto tiempo?»: en el Chocó, lo que continuó no fueron las réplicas del {main} apagándose despacio. Desde la segunda semana, {pct} de los eventos del Chocó vinieron del grupo superficial.",
    shallowWeeks: (partial: boolean): string =>
      partial
        ? "Sus eventos de M4 o más, semana a semana desde el {date}: {weeks} (la última semana aún no ha terminado)."
        : "Sus eventos de M4 o más, semana a semana desde el {date}: {weeks}.",
    /** Only while the shallow group has not faded: it is the "why" of a group that kept going. */
    why: "¿Por qué? No se sabe. Los sismólogos consideran varias posibilidades: que el {main} cambió los esfuerzos en la roca vecina, que haya fluidos moviéndose por las fracturas o que una falla se deslice lentamente. Este catálogo no permite decidir entre ellas.",
    paceTitle: (p: Pace["case"]): string =>
      p === "quieter"
        ? "En los últimos días, más tranquilo"
        : p === "busier"
          ? "En los últimos días, más activo"
          : "En los últimos días, a su ritmo",
    pace: "Mira el final de la línea del {shallow}. {claim}",
    paceNote: "El SGC todavía puede revisar y añadir eventos recientes.",
    /** Only when the pace claim found a lull to shade. */
    lullNote: "Las franjas grises del dibujo son los tramos en que se calmó.",
  },

  tolima: {
    chapter: "5 · Tolima",
    title: (m: MainshockState): string =>
      m === "found"
        ? "Chaparral: ahora un evento destaca"
        : m === "awaiting-review"
          ? "Chaparral: un evento destaca, pendiente de revisión"
          : "Chaparral: muchos eventos, ninguno manda",
    p1: (m: MainshockState): string =>
      m === "found"
        ? "El {date} empezó otra serie de eventos, a unos {km} del {main}, cerca de Chaparral. El SGC la llama {tolima}: muchos sismos de tamaño parecido. Ahora uno de ellos destaca sobre todos los demás."
        : m === "awaiting-review"
          ? "El {date} empezó otra serie de eventos, a unos {km} del {main}, cerca de Chaparral. El SGC la llama {tolima}: muchos sismos de tamaño parecido. Ahora uno destaca, aunque su magnitud todavía es automática y puede cambiar."
          : "El {date} empezó otra serie de eventos, a unos {km} del {main}, cerca de Chaparral. El SGC la llama {tolima}: muchos sismos de tamaño parecido, sin uno grande que domine.",
    stillSwarm: "Mientras el SGC no la describa de otra forma, esta página la sigue llamando enjambre.",
    p2: "Compara las dos franjas: en el Chocó, el evento mayor tiene {chocoShare} de la energía; en Chaparral, el mayor ({mag}) tiene {tolimaShare}.",
    /** Keyed on the swarm's median depth being under 30 km, where it is certainly in the crust. */
    p3: (crustal: boolean): string =>
      crustal
        ? "Van unos {perDay} eventos al día de media, a unos {depth} de profundidad, dentro de la corteza."
        : "Van unos {perDay} eventos al día de media, a unos {depth} de profundidad.",
    driftTitle: (d: Drift["case"]): string =>
      d === "moved" ? "Parece moverse, despacio" : d === "none" ? "No se ve que se mueva" : "¿Se mueve?",
    /** The line is drawn only when the drift claim says the centre moved. */
    driftHow: (moved: boolean): string =>
      moved
        ? "En el dibujo, cada punto es un evento, más intenso cuanto más reciente, y la línea une el centro de los eventos de cada medio día."
        : "En el dibujo, cada punto es un evento, más intenso cuanto más reciente.",
    driftElsewhere:
      "En otros enjambres del mundo, desplazamientos así se han asociado con fluidos o con fallas que se deslizan lentamente. Aquí no se sabe.",
    hypothesis:
      "El SGC ha planteado como hipótesis preliminar que el sismo del {date} pudo cambiar los esfuerzos en la corteza y ayudar a reactivar fallas cerca de Chaparral. Es eso, una hipótesis: que dos cosas pasen cerca en el tiempo no demuestra que una causó la otra.",
    note: "Los enjambres terminan de maneras distintas y no se puede saber de antemano cómo. Según el SGC, que haya muchos sismos no significa por sí mismo que venga uno grande.",
  },

  felt: {
    chapter: "6 · Pereira",
    title: "Por qué los sientes",
    p1: (similar: boolean): string =>
      similar
        ? "Los tres lugares están a una distancia parecida de Pereira, así que, entre sus eventos, lo que más cambia es la magnitud. Ajusta la magnitud desde la que tú los notas:"
        : "Los tres lugares están a distancias distintas de Pereira, así que cuentan la magnitud y también la distancia. Ajusta la magnitud desde la que tú los notas:",
    slider: "Los noto desde",
    sliderAria: "Magnitud desde la que notas un temblor",
    days: "Con {mag} o más, {k} de {n} días desde el {date} tuvieron al menos un evento.",
    note: "Que lo notes depende también de dónde estés: el piso, el tipo de suelo, si estás quieto. Esta página no calcula cuánto tembló en tu casa; para eso hacen falta modelos que aquí no se usan.",
    wavesTitle: "Unos segundos de viaje",
    waves1:
      "Un sismo manda dos tipos de ondas por la roca. Las P, más rápidas (unos {vp} por segundo), llegan primero, como un golpe seco. Las S, más lentas (unos {vs} por segundo), llegan después y suelen mover más.",
    waves2:
      "Desde el {magLabel}, a {km}, las P tardaron unos {p} en llegar a Pereira y las S unos {s}. Por eso a veces se nota un primer sacudón y, segundos después, el vaivén.",
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
      "Si vendrá un sismo más grande. Nadie sabe predecir sismos: ni el día, ni el lugar exacto, ni el tamaño.",
      "Qué pasa por debajo de M2.0: el catálogo público del SGC empieza ahí.",
    ],
    closing:
      "Lo que sí sirve no es adivinar, sino estar preparado y seguir la información oficial del Servicio Geológico Colombiano.",
  },

  /** Labels drawn inside the pinned graphic, and its text alternative for each scene. */
  graphic: {
    mapTitle: "Eventos del catálogo del SGC, {from} – {to}",
    mapAria:
      "Mapa con los eventos de los tres lugares y Pereira. Las líneas dan la distancia en línea recta desde Pereira hasta cada lugar.",
    mapNote: "Distancia en línea recta hasta el punto bajo tierra · círculo: 120 km en el mapa",
    ocean: "Océano Pacífico",
    unknownAria: "Mapa de los tres lugares con un signo de interrogación en cada uno.",
    sectionTitle: "Corte de oeste a este · sin exagerar la escala",
    sectionAria:
      "Corte de la tierra de oeste a este con la profundidad de cada evento del Chocó: el grupo superficial a unos {shallow}, el profundo a unos {deep}.",
    west: "← oeste · costa del Pacífico",
    east: "este →",
    eastDeeper: "más profundo hacia el este",
    groupAt: { shallow: "superficial · ~{km}", deep: "profundo · ~{km}" },
    errorLegend: "＋ error típico: {h} en horizontal, {depth} en profundidad",
    energyTitle: "Energía liberada · área proporcional",
    energyShareAria:
      "Dos cuadrados cuya área es la energía: el evento mayor tiene el {share}; todos los demás eventos juntos, el resto.",
    energyOthers: "{n} eventos más, todos juntos",
    energyMain: "{date} · {share} de la energía",
    ladderAria: "Tres cuadrados para M4, M5 y M6; cada uno tiene unas 32 veces el área del anterior.",
    ladderNote: "Cada punto de magnitud: unas 32 veces más energía",
    clocksTitle: "Eventos por día ({mc} o más) · Chocó",
    clocksAria:
      "Eventos por día desde el primer evento, en escala logarítmica, para el grupo profundo y el superficial, con la curva típica de réplicas como referencia.",
    clocksAxis: "días desde el {date} (el eje se estira al principio)",
    omori: ["curva típica", "de réplicas"],
    lines: { shallow: "superficial", deep: "profundo" },
    strongRow: "◆ cada evento de M4 o más",
    lull: "calma",
    tolimaTitle: "Cuánta energía tiene el evento mayor",
    tolimaAria:
      "Dos franjas con la parte de la energía de cada evento, del mayor al menor: en el Chocó el evento mayor tiene el {choco}; en Chaparral, el {tolima}. Debajo, un mapa de cerca de Chaparral.",
    stripChoco: "Chocó · el mayor ({mag}): {share}",
    stripTolima: "Chaparral · el mayor ({mag}): {share}",
    stripNote: "cada franja es un evento, del mayor al menor",
    closeUp: "Chaparral de cerca · más intenso = más reciente",
    track: "centro de cada medio día",
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
        ? "The {shallow} lies further west and much shallower, at about {depth}. This catalogue cannot tell which structure exactly each group sits in."
        : "The {shallow} lies much shallower, at about {depth}. This catalogue cannot tell which structure exactly each group sits in.",
    eastDeeper: "In the drawing, the activity is deeper towards the east.",
    caveatTitle: "What this drawing cannot say",
    caveat1:
      "Every location has a margin of error. For half of them it is about {h} horizontally (latitude and longitude together) and {depth} in depth: the crosses show it.",
    caveat2:
      "Also, many depths land on exactly the same values ({depths}): the calculation sets them in steps. So no fault can be seen here, only clouds of dots.",
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
      "Cut through the earth from west to east with the depth of each Chocó event: the shallow group about {shallow} down, the deep one about {deep}.",
    west: "← west · Pacific coast",
    east: "east →",
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
