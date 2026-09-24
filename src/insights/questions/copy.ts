/**
 * The "Preguntas" tab's own copy. Anything that states a trend comes from a claim and its sentence
 * in `../copy.ts`; what is here is explanation, labels, and sentences whose figures the tab
 * computes from the data and passes in. Decimal point in every number, as everywhere on the page.
 */
import type { MainshockState } from "@bvalue/seismo";
import type { Decay } from "../claims";
import type { Lang } from "@/lib/i18n";

const f0 = (v: number) => Math.round(v).toString();
const f1 = (v: number) => v.toFixed(1);
const mag = (m: number) => `M${f1(m)}`;
/** Seconds for a wave's arrival, never "0 s": under a second is said as such. */
const secs = (s: number, lt1: string) => (s < 1 ? lt1 : `${f0(s)} s`);

const WORDS_ES = ["cero", "una", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez"];
const WORDS_EN = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/** An event the copy names: its magnitude and its Colombian date, already formatted. */
export interface Named {
  mag: number;
  date: string;
}

const es = {
  kicker: "Desde Pereira",
  title: "Lo que nos preguntamos sobre los sismos",
  lede: "Desde el 10 de agosto, en el Eje Cafetero se siente temblar una y otra vez. Aquí van, una por una, las preguntas que nos hacemos, respondidas en palabras sencillas y con los datos del Servicio Geológico Colombiano.",
  stats: {
    km: (km: number) => `~${f0(km)}\u202Fkm`,
    kmLabel: "de Pereira a las tres fuentes, en línea recta",
    strongLabel: (ref: Named) => `eventos de M4.0 o más desde el ${mag(ref.mag)}`,
    recentLabel: "de ellos en los últimos 7 días",
  },
  indexTitle: "Preguntas",
  indexTitleMobile: "Las preguntas",
  question: (n: number) => `Pregunta ${n}`,
  inOneSentence: "En una frase",
  magTypes:
    "Las magnitudes del catálogo mezclan tipos (MLr, MLv, Mw…) que no son del todo comparables, así que las comparaciones de tamaño y energía son aproximadas.",

  far: {
    short: "¿Por qué lo siento tan lejos?",
    q: "¿Por qué siento en Pereira sismos que ocurren tan lejos?",
    p1: (lo: number, hi: number) =>
      `Porque en sismos «lejos» se mide distinto. Las tres fuentes de estas semanas —el grupo de Istmina–Sipí, el grupo profundo junto al sismo grande y Chaparral— quedan todas a unos ${f0(lo)}–${f0(hi)}\u202Fkm de Pereira en línea recta, contando la profundidad. A esa distancia las ondas de un evento de M4 llegan muy debilitadas, pero todavía pueden notarse.`,
    /** `similar`: its straight-line distance is within the sources' own range, which the tab checks. */
    p2: (ref: Named, epi: number, depth: number, hypo: number, similar: boolean) =>
      `El ${mag(ref.mag)} del ${ref.date} estaba a ${f0(epi)}\u202Fkm en el mapa y a ${f0(depth)}\u202Fkm de profundidad: en línea recta, ${f0(hypo)}\u202Fkm.${similar ? " Casi lo mismo que los otros. Lo que lo hizo tan fuerte no fue la cercanía sino el tamaño." : ""} Juega con los controles: elige un evento, cambia su tamaño o su distancia, y mira cuánta energía y cuánto movimiento llegarían, y cuánto tardarían las ondas.`,
    takeaway: (km: number, ref: Named, similar: boolean): string =>
      similar
        ? `Las tres fuentes están a unos ${f0(km)}\u202Fkm en línea recta: un M4 llega hasta aquí muy atenuado, y el ${mag(ref.mag)} llegó con fuerza por su tamaño, no por estar más cerca.`
        : "Lo que llega a Pereira depende del tamaño del evento y de su distancia en línea recta, contando la profundidad.",
    pick: "Elige un evento",
    presetReference: (ref: Named) => `El ${mag(ref.mag)} del ${ref.date}`,
    presetShallow: (m: number) => `${mag(m)} en Istmina–Sipí`,
    presetTolima: (m: number) => `${mag(m)} en Chaparral`,
    custom: "A tu medida",
    magnitude: "Magnitud",
    distance: "Distancia en el mapa desde Pereira",
    depth: "Profundidad",
    straight: "Distancia en línea recta",
    energy: (ref: Named) => `Energía liberada, frente al ${mag(ref.mag)}`,
    energySame: "más o menos la misma",
    energyMore: (x: string) => `${x} veces más`,
    energyLess: (x: string) => `1/${x} de aquella`,
    motion: (ref: Named) => `Amplitud en Pereira frente al ${mag(ref.mag)}, simplificada`,
    motionSame: "más o menos igual",
    motionMore: (x: string) => `≈ ${x} veces más`,
    motionLess: (x: string) => `≈ 1/${x} de aquella`,
    scaleTitle: "Amplitud del movimiento en Pereira, simplificada (cada marca es 10 veces la anterior)",
    scaleAria: (x: string) =>
      `Escala de amplitud simplificada, frente a la del sismo de referencia. El evento elegido: ${x}.`,
    scaleRef: (ref: Named) => `${mag(ref.mag)}, ${ref.date}`,
    mapAria: "Mapa de Pereira, las tres fuentes y la distancia elegida",
    ring: (km: number) => `${f0(km)}\u202Fkm alrededor de Pereira`,
    chosen: "la distancia que elegiste",
    labelShallow: "Istmina–Sipí",
    labelDeep: (ref: Named) => `${mag(ref.mag)} y réplicas profundas`,
    labelTolima: "Chaparral",
    raceTitle: "La carrera de las ondas hasta Pereira",
    raceSpeed: (x: number) => `acelerada ×${x}`,
    race: "Soltar las ondas",
    raceAria: (p: number, s: number) =>
      `Carrera de ondas: la onda P llega a los ${secs(p, "menos de un segundo")} y la onda S a los ${secs(s, "menos de un segundo")}.`,
    quake: "evento",
    arrives: (s: number): string => (s < 1 ? "llega en menos de 1 s" : `llega a los ${f0(s)} s`),
    raceNote: (gap: number): string =>
      gap < 1
        ? "A tan poca distancia, las ondas P y S llegan casi a la vez."
        : `Primero llega la onda P, que suele sentirse como un empujón o un golpe seco. Unos ${f0(gap)} segundos después llega la onda S, que suele ser el vaivén más fuerte.`,
    caption: (vp: number, vs: number) =>
      `Una simplificación, no un modelo de sacudida: solo usa que la amplitud de las ondas crece 10 veces por cada unidad de magnitud y que se reparte al alejarse (1/distancia). Deja por fuera cuánto absorbe la roca, hacia dónde se rompió la falla y el suelo bajo cada casa, que en la realidad cuentan mucho. Velocidades típicas redondeadas: ondas P ≈ ${vp}\u202Fkm/s, ondas S ≈ ${vs}\u202Fkm/s; los tiempos son aproximados.`,
  },

  big: {
    short: "¿Qué tan grande fue?",
    q: (ref: Named) => `¿Qué tan grande fue el sismo del ${ref.date}?`,
    p1: (ref: Named, units: string) =>
      `Mucho más de lo que sugiere pasar de 4 a ${f1(ref.mag)}. La magnitud es una escala que multiplica: cada unidad es 10 veces más amplitud en los sismógrafos y unas 32 veces más energía. Entre un M4.0 y el ${mag(ref.mag)} hay ${f1(ref.mag - 4)} unidades, o sea unas ${units} veces la energía.`,
    intro: (units: string) =>
      `El rectángulo gris es aquel sismo partido en unos ${units} puntitos: cada uno es la energía de un evento de M4.0. Elige con qué compararlo.`,
    compare: "Comparar con",
    rest: "Todos los demás del Chocó",
    swarm: "Todo el enjambre de Chaparral",
    dots: "puntos",
    ofRef: (pct: string, ref: Named) => `(${pct}\u202F% del ${mag(ref.mag)})`,
    fits: "Cabe entero en la lupa. En el rectángulo grande es apenas el cuadrito de color de la esquina.",
    noFit: "No cabe en la lupa: es el bloque de color en la esquina del rectángulo grande.",
    lens: "lupa: la esquina de arriba",
    aria: (units: string, k: string, what: string) =>
      `El sismo de referencia como ${units} puntos; ${what} ocupa ${k} de ellos.`,
    caption:
      "Energía liberada como ondas, con la relación de Gutenberg–Richter (la energía crece 31.6 veces por unidad de magnitud). Es aproximada y sirve para comparar, no como medida exacta. «Todos los demás» suma cada evento del catálogo del SGC en la zona, desde M2.0.",
    /** `small`: the rest is under a tenth of the reference's energy, which the tab checks. */
    takeaway: (pct: string, ref: Named, small: boolean) =>
      `Todo lo que ha temblado en el Chocó después del ${ref.date}, sumado, es ${small ? "apenas " : ""}el ${pct}\u202F% de la energía de aquel sismo.`,
  },

  stop: {
    short: "¿Por qué no para?",
    /** `still`: Chocó had events above Mc in the last 7 days, which the tab checks. */
    q: (weeks: number, still: boolean) =>
      `¿Por qué ${still ? "sigue" : "siguió"} temblando ${WORDS_ES[weeks] ?? f0(weeks)} semanas después?`,
    qSoon: (still: boolean) => `¿Por qué ${still ? "sigue" : "siguió"} temblando?`,
    p1: (deepKm: number) =>
      `Aquí está lo más interesante. Los eventos del Chocó se separan en dos grupos, y la profundidad basta para separarlos. El grupo profundo, a unos ${f0(deepKm)}\u202Fkm bajo el sismo grande, es el de sus réplicas.`,
    /** `share`: of Chocó's events above Mc since the second week, the percentage from this group. */
    p2: (shallowKm: number, fromRef: number, share: { pct: string; mc: number } | null) =>
      `El grupo superficial está a unos ${f0(shallowKm)}\u202Fkm de profundidad bajo Istmina y Sipí, a unos ${f0(fromRef)}\u202Fkm del epicentro.${share ? ` Desde la segunda semana, el ${share.pct}\u202F% de los eventos del Chocó de M${f1(share.mc)} o más han sido de este grupo.` : ""}`,
    deepLabel: "El grupo profundo:",
    shallowLabel: "El grupo superficial:",
    why: "¿Por qué el grupo superficial no se apagó como unas réplicas? Con este catálogo nadie lo puede decir. Lo que los sismólogos suelen considerar en casos así: que el gran sismo cambió los esfuerzos en la roca y activó una zona que ya estaba cargada; que haya fluidos moviéndose por las fallas; o que un deslizamiento lento, que no se siente, esté empujando a su alrededor. Son posibilidades que se estudian, no conclusiones de esta página.",
    /** Keyed on the `decay` claim for each group; `why` is only shown when the shallow group has not faded. */
    takeaway: (deep: Decay["case"], shallow: Decay["case"]): string =>
      deep === "young"
        ? "Todavía es pronto para ver cómo se apagan las réplicas del sismo grande."
        : deep === "not-decayed"
          ? "Las réplicas del sismo grande todavía no se han apagado como suelen hacerlo unas réplicas normales."
          : shallow === "not-decayed"
            ? "Las réplicas del sismo grande se han ido apagando; el grupo superficial no sigue esa regla, por razones que todavía no se conocen."
            : shallow === "decayed"
              ? "Las réplicas del sismo grande se han ido apagando, y la actividad del grupo superficial también ha bajado."
              : "Las réplicas del sismo grande se han ido apagando.",
    sameScale: "Misma escala para los dos grupos",
    curve: "Mostrar cómo se apagan unas réplicas normales",
    deepRow: (km: number) => `Grupo profundo · junto al sismo grande (~${f0(km)}\u202Fkm)`,
    shallowRow: (km: number) => `Grupo superficial · Istmina–Sipí (~${f0(km)}\u202Fkm)`,
    lull: "más tranquilo",
    rowAria: (label: string, total: number, days: number) => `${label}: ${total} eventos en ${days} días.`,
    caption: (mc: number) =>
      `Eventos por día de Colombia con magnitud M${f1(mc)} o más (por debajo de ese tamaño el catálogo no los registra todos). Los rombos son los eventos de M4.0 o más. La curva punteada es solo la forma típica de unas réplicas, que caen más o menos como 1/tiempo (ley de Omori): parte del primer día de cada grupo y se divide por el número del día, sin ajustarla a los datos. Las franjas marcan los tramos más tranquilos de lo habitual.`,
  },

  swarm: {
    short: "¿Y Chaparral?",
    q: "¿Qué está pasando en Chaparral? ¿Es lo mismo?",
    p1: (start: string, depth: number, perDay: number, state: MainshockState): string =>
      `${state === "none" ? "No. Chaparral es un enjambre, que es también como lo llama el SGC: muchos eventos, sin uno que domine." : "Chaparral es lo que el SGC llama un enjambre."} Empezó el ${start}, a unos ${f0(depth)}\u202Fkm de profundidad, dentro de la corteza, y lleva unos ${f0(perDay)} eventos por día.`,
    state: (s: MainshockState, largest: number, gap: number | null) =>
      s === "none"
        ? `Ninguno sobresale: el mayor, ${mag(largest)}, está solo ${gap === null ? "un poco" : f1(gap)} por encima del siguiente. Por eso no tiene sismo principal.`
        : `Ahora su mayor evento, ${mag(largest)}, sí sobresale ${gap === null ? "" : `${f1(gap)} `}por encima del siguiente${s === "awaiting-review" ? ", aunque el SGC todavía no lo ha revisado" : ""}. Mientras el SGC no la describa de otra forma, esta página la sigue llamando enjambre.`,
    shareTitle: "¿Cuánta energía liberó el evento más grande de cada zona?",
    shareChoco: (m: number) => `Chocó: su mayor, ${mag(m)}`,
    shareTolima: (m: number) => `Chaparral: su mayor, ${mag(m)}`,
    shareCaption:
      "Parte de la energía total de cada zona que liberó su evento más grande (momento sísmico, que crece 31.6 veces por unidad de magnitud). En una secuencia con sismo principal, uno solo lo domina todo. En un enjambre, la energía se reparte entre muchos parecidos.",
    driftIntro:
      "Los enjambres a menudo se desplazan poco a poco, algo que se suele asociar con fluidos que se abren camino o con una falla que se desliza despacio. ¿Se queda quieto este?",
    driftTitle: (km: number) =>
      `${f0(km * 2)}\u202Fkm × ${f0(km * 2)}\u202Fkm alrededor de donde empezó, cada 12 horas. Norte arriba; la barra del primer cuadro mide 1\u202Fkm.`,
    driftPanel: (when: string, n: number) => `${when} · ${n} eventos`,
    driftAria: (when: string, n: number) => `${when}: ${n} eventos`,
    driftCaption: (err: string) =>
      `Cada cuadro son 12 horas del enjambre. La cruz es el centro de sus eventos (la mediana) y la línea, el camino del centro hasta ese momento. Cada epicentro tiene un error típico de ~${err}\u202Fkm, así que un punto suelto no dice nada; cualquier corrimiento del centro es una pista que habría que confirmar relocalizando los eventos, no un hallazgo.`,
    takeaway: (state: MainshockState): string =>
      state === "none"
        ? "Chaparral no tiene un sismo principal: es un enjambre, y los enjambres pueden apagarse o seguir sin que se sepa de antemano cuál de las dos cosas pasará."
        : "Ahora un evento de Chaparral sobresale, pero cómo seguirá no se puede saber de antemano.",
  },

  linked: {
    short: "¿Están conectados?",
    q: "¿Están conectados Chocó y Tolima?",
    p1: (km: number, weeks: number) =>
      `El SGC ha planteado, como hipótesis preliminar, que el sismo grande del Chocó pudo cambiar los esfuerzos en la corteza y ayudar a reactivar fallas cerca de Chaparral, a unos ${f0(Math.round(km / 10) * 10)}\u202Fkm de su epicentro y ${WORDS_ES[weeks] ?? f0(weeks)} semanas después. Es una idea razonable que se estudia, pero no está demostrada, y nada en esta página la pone a prueba.`,
    p2: "Que dos cosas pasen cerca en el tiempo no es evidencia de que estén conectadas. La gráfica muestra qué pasó antes y qué después, nada más.",
    legendShallow: "Chocó, superficial",
    legendDeep: "Chocó, profundo",
    legendTolima: "Chaparral",
    begins: (d: string) => `${d}: empieza Chaparral →`,
    aria: "Eventos de las dos zonas en el tiempo, por magnitud",
    caption:
      "Cada punto es un evento del catálogo del SGC, por fecha y magnitud. Poner dos zonas en un mismo eje muestra cuándo pasó cada cosa, no que una causara la otra.",
    takeaway:
      "Tal vez: el SGC lo plantea como hipótesis, y aquí solo se puede ver qué pasó antes y qué después, que no es lo mismo que una causa.",
  },

  felt: {
    short: "¿Cuántas veces lo he sentido?",
    q: "¿Cuántas veces lo he sentido?",
    p1: "Esta página no sabe qué sentiste tú, pero sí qué días hubo eventos del tamaño desde el que tú los notas. Pon el umbral donde te parezca, y el calendario marca los días con al menos un evento así en estas dos zonas.",
    threshold: "Yo los noto desde",
    daysOf: (n: number) => `de ${n} días`,
    events: (n: number) => `${n} ${n === 1 ? "evento" : "eventos"}`,
    weekdays: ["L", "M", "X", "J", "V", "S", "D"],
    tapHint: "elige un día para ver sus eventos",
    dayAria: (date: string, n: number) => `${date}: ${n === 0 ? "ninguno" : n === 1 ? "1 evento" : `${n} eventos`}`,
    none: (m: number) => `Ningún evento de ${mag(m)} o más ese día en estas zonas.`,
    shallowName: "Istmina–Sipí",
    deepName: "Chocó profundo",
    tolimaName: "Chaparral",
    caption:
      "Solo cuenta los eventos de las dos zonas que sigue esta página. En Colombia tiembla también en otros lugares, y algunos de esos también se sienten en Pereira. Que alguien lo note depende además de dónde estaba y del suelo; el umbral es tuyo.",
    takeaway: (days: number, total: number, m: number) =>
      `Con el umbral en ${mag(m)}, hubo eventos así en ${days} de ${total} días.`,
  },

  bigger: {
    short: "¿Viene uno más grande?",
    q: "¿Viene uno más grande?",
    p1: "La respuesta honesta es que nadie lo sabe. Hoy nadie puede predecir cuándo, dónde y de qué tamaño será un sismo: ni esta página, ni el SGC, ni ningún otro servicio del mundo. Las secuencias como la del Chocó y los enjambres como el de Chaparral a veces se apagan poco a poco y a veces producen un sismo mayor, y no hay forma de saber de antemano qué hará cada uno.",
    p2: "La posición pública del SGC es que muchos sismos no significan, por sí solos, que venga uno grande. Por eso esta página no calcula probabilidades ni muestra alertas.",
    helpTitle: "Lo que sí sirve, siempre",
    help: [
      "Estar preparado vale en cualquier momento, no por esta secuencia en particular: Colombia es un país sísmico.",
      "Tener un plan familiar: dónde protegerse, dónde reunirse y un morral de emergencia.",
      "Informarse en fuentes oficiales: los boletines del Servicio Geológico Colombiano (sgc.gov.co).",
    ],
    takeaway: "Nadie puede anunciar el próximo sismo; lo útil es estar preparado siempre y seguir al SGC.",
  },

  unknown: {
    short: "¿Qué no sabemos?",
    q: "¿Qué no sabemos todavía?",
    p1: "Bastante, y es mejor decirlo claro. Esto es lo que ni estos datos ni esta página pueden responder hoy:",
    why: "Qué mueve la actividad del grupo de Istmina–Sipí y cómo va a evolucionar.",
    link: "Si Chaparral tiene que ver con el sismo grande del Chocó. Es una hipótesis del SGC, no un resultado.",
    faults: (choco: string, tolima: string, snapped: { depthKm: number; count: number } | null) =>
      `La forma fina de las fallas. Las ubicaciones tienen errores típicos de ~${choco}\u202Fkm en el Chocó y ~${tolima}\u202Fkm en Chaparral${snapped ? `, y muchas profundidades se repiten en valores fijos (${snapped.count} eventos de Chaparral a ${f1(snapped.depthKm)}\u202Fkm justos), señal de que no están bien determinadas` : ""}.`,
    floor:
      "Los eventos por debajo de M2.0: el SGC no los publica en este catálogo, y las estaciones cercanas son pocas.",
    types:
      "Las magnitudes mezclan tipos (MLr, MLv, Mw) que no son del todo comparables, así que las cifras de energía son aproximadas.",
    revisions: "El catálogo cambia: el SGC revisa y a veces corrige o retira eventos después de publicarlos.",
    takeaway:
      "Los datos muestran bien qué pasó y cómo se compara con lo típico; el porqué exacto y lo que viene siguen abiertos.",
  },

  words: (n: number, lang: Lang) => (lang === "es" ? WORDS_ES : WORDS_EN)[n] ?? f0(n),
};

type Copy = typeof es;

const en: Copy = {
  kicker: "From Pereira",
  title: "What we keep asking about the earthquakes",
  lede: "Since 10 August, people in the Coffee Region have felt the ground move again and again. Here, one by one, are the questions we keep asking, answered in plain words with data from the Servicio Geológico Colombiano.",
  stats: {
    km: (km) => `~${f0(km)}\u202Fkm`,
    kmLabel: "from Pereira to the three sources, in a straight line",
    strongLabel: (ref) => `events of M4.0 or more since the ${mag(ref.mag)}`,
    recentLabel: "of them in the last 7 days",
  },
  indexTitle: "Questions",
  indexTitleMobile: "The questions",
  question: (n) => `Question ${n}`,
  inOneSentence: "In one sentence",
  magTypes:
    "The catalogue's magnitudes mix types (MLr, MLv, Mw…) that are not fully comparable, so comparisons of size and energy are approximate.",

  far: {
    short: "Why do I feel it so far away?",
    q: "Why do I feel, in Pereira, earthquakes that happen so far away?",
    p1: (lo, hi) =>
      `Because with earthquakes, "far" is measured differently. The three sources of these weeks — the Istmina–Sipí group, the deep group beside the big earthquake, and Chaparral — are all about ${f0(lo)}–${f0(hi)}\u202Fkm from Pereira in a straight line, counting depth. At that distance an M4's waves arrive much weakened, but can still be noticed.`,
    p2: (ref, epi, depth, hypo, similar) =>
      `The ${mag(ref.mag)} of ${ref.date} was ${f0(epi)}\u202Fkm away on the map and ${f0(depth)}\u202Fkm deep: ${f0(hypo)}\u202Fkm in a straight line.${similar ? " Almost the same as the others. What made it so strong was not closeness but size." : ""} Play with the controls: pick an event, change its size or distance, and see how much energy and motion would arrive, and how long the waves would take.`,
    takeaway: (km, ref, similar) =>
      similar
        ? `All three sources are about ${f0(km)}\u202Fkm away in a straight line: an M4 arrives here much weakened, and the ${mag(ref.mag)} arrived with force because of its size, not because it was closer.`
        : "What reaches Pereira depends on the event's size and its straight-line distance, counting depth.",
    pick: "Pick an event",
    presetReference: (ref) => `The ${mag(ref.mag)} of ${ref.date}`,
    presetShallow: (m) => `${mag(m)} at Istmina–Sipí`,
    presetTolima: (m) => `${mag(m)} at Chaparral`,
    custom: "Your own",
    magnitude: "Magnitude",
    distance: "Map distance from Pereira",
    depth: "Depth",
    straight: "Straight-line distance",
    energy: (ref) => `Energy released, against the ${mag(ref.mag)}`,
    energySame: "about the same",
    energyMore: (x) => `${x} times more`,
    energyLess: (x) => `1/${x} of it`,
    motion: (ref) => `Amplitude in Pereira against the ${mag(ref.mag)}, simplified`,
    motionSame: "about the same",
    motionMore: (x) => `≈ ${x} times more`,
    motionLess: (x) => `≈ 1/${x} of it`,
    scaleTitle: "Ground-motion amplitude in Pereira, simplified (each mark is 10 times the previous)",
    scaleAria: (x) => `Simplified amplitude scale, against the reference earthquake's. The chosen event: ${x}.`,
    scaleRef: (ref) => `${mag(ref.mag)}, ${ref.date}`,
    mapAria: "Map of Pereira, the three sources and the chosen distance",
    ring: (km) => `${f0(km)}\u202Fkm around Pereira`,
    chosen: "the distance you chose",
    labelShallow: "Istmina–Sipí",
    labelDeep: (ref) => `${mag(ref.mag)} and deep aftershocks`,
    labelTolima: "Chaparral",
    raceTitle: "The waves' race to Pereira",
    raceSpeed: (x) => `sped up ×${x}`,
    race: "Release the waves",
    raceAria: (p, s) =>
      `Wave race: the P wave arrives after ${secs(p, "less than a second")} and the S wave after ${secs(s, "less than a second")}.`,
    quake: "event",
    arrives: (s) => (s < 1 ? "arrives in under 1 s" : `arrives at ${f0(s)} s`),
    raceNote: (gap) =>
      gap < 1
        ? "At so short a distance, the P and S waves arrive almost together."
        : `The P wave arrives first, often felt as a push or a sharp jolt. About ${f0(gap)} seconds later the S wave arrives, usually the stronger swaying.`,
    caption: (vp, vs) =>
      `A simplification, not a shaking model: it only uses that wave amplitude grows 10 times per magnitude unit and spreads out with distance (1/distance). It leaves out how much the rock absorbs, which way the fault broke and the ground under each house, which matter a lot in reality. Typical wave speeds, rounded: P waves ≈ ${vp}\u202Fkm/s, S waves ≈ ${vs}\u202Fkm/s; the times are approximate.`,
  },

  big: {
    short: "How big was it?",
    q: (ref) => `How big was the earthquake of ${ref.date}?`,
    p1: (ref, units) =>
      `Far bigger than going from 4 to ${f1(ref.mag)} suggests. Magnitude is a multiplying scale: each unit is 10 times the amplitude on seismographs and about 32 times the energy. Between an M4.0 and the ${mag(ref.mag)} there are ${f1(ref.mag - 4)} units, which is about ${units} times the energy.`,
    intro: (units) =>
      `The grey rectangle is that earthquake split into about ${units} tiny dots: each one is the energy of an M4.0 event. Pick something to compare it with.`,
    compare: "Compare with",
    rest: "All the other Chocó events",
    swarm: "The whole Chaparral swarm",
    dots: "dots",
    ofRef: (pct, ref) => `(${pct}% of the ${mag(ref.mag)})`,
    fits: "It fits inside the lens. In the big rectangle it is only the little coloured square in the corner.",
    noFit: "It does not fit the lens: it is the coloured block in the corner of the big rectangle.",
    lens: "lens: the top corner",
    aria: (units, k, what) => `The reference earthquake as ${units} dots; ${what} fills ${k} of them.`,
    caption:
      'Energy radiated as waves, from the Gutenberg–Richter relation (energy grows 31.6 times per magnitude unit). It is approximate and meant for comparing, not an exact measure. "All the others" adds up every event in SGC\'s catalogue for the zone, from M2.0.',
    takeaway: (pct, ref, small) =>
      `Everything that has shaken in Chocó since ${ref.date}, added together, is ${small ? "only " : ""}${pct}% of that earthquake's energy.`,
  },

  stop: {
    short: "Why won't it stop?",
    q: (weeks, still) =>
      still
        ? `Why is it still shaking ${WORDS_EN[weeks] ?? f0(weeks)} weeks later?`
        : `Why did it keep shaking for ${WORDS_EN[weeks] ?? f0(weeks)} weeks?`,
    qSoon: (still) => (still ? "Why is it still shaking?" : "Why did it keep shaking?"),
    p1: (deepKm) =>
      `This is the most interesting part. Chocó's events fall into two groups, and depth alone separates them. The deep group, about ${f0(deepKm)}\u202Fkm down beneath the big earthquake, is its aftershocks.`,
    p2: (shallowKm, fromRef, share) =>
      `The shallow group is about ${f0(shallowKm)}\u202Fkm deep beneath Istmina and Sipí, some ${f0(fromRef)}\u202Fkm from the epicentre.${share ? ` Since the second week, ${share.pct}% of Chocó's events of M${f1(share.mc)} or more have come from this group.` : ""}`,
    deepLabel: "The deep group:",
    shallowLabel: "The shallow group:",
    why: "Why did the shallow group not fade like aftershocks? No one can tell from this catalogue. What seismologists usually consider in cases like this: that the big earthquake changed the stresses in the rock and set off a zone that was already loaded; that fluids are moving along faults; or that slow slip, which cannot be felt, is pushing around it. These are possibilities under study, not conclusions of this page.",
    takeaway: (deep, shallow) =>
      deep === "young"
        ? "It is still too early to see how the big earthquake's aftershocks fade."
        : deep === "not-decayed"
          ? "The big earthquake's aftershocks have not yet faded the way ordinary aftershocks do."
          : shallow === "not-decayed"
            ? "The big earthquake's aftershocks have been fading; the shallow group does not follow that rule, for reasons not yet known."
            : shallow === "decayed"
              ? "The big earthquake's aftershocks have been fading, and the shallow group's activity has fallen too."
              : "The big earthquake's aftershocks have been fading.",
    sameScale: "Same scale for both groups",
    curve: "Show how ordinary aftershocks fade",
    deepRow: (km) => `Deep group · beside the big earthquake (~${f0(km)}\u202Fkm)`,
    shallowRow: (km) => `Shallow group · Istmina–Sipí (~${f0(km)}\u202Fkm)`,
    lull: "quieter",
    rowAria: (label, total, days) => `${label}: ${total} events over ${days} days.`,
    caption: (mc) =>
      `Events per Colombian day of magnitude M${f1(mc)} or more (below that size the catalogue misses some). Diamonds are the M4.0+ events. The dotted curve is only the textbook shape of aftershocks, which fall off roughly as 1/time (Omori's law): it starts from each group's first day and is divided by the day number, not fitted to the data. The bands mark the stretches quieter than usual.`,
  },

  swarm: {
    short: "And Chaparral?",
    q: "What is happening at Chaparral? Is it the same thing?",
    p1: (start, depth, perDay, state) =>
      `${state === "none" ? "No. Chaparral is a swarm, which is also what SGC calls it: many events, none dominant." : "Chaparral is what SGC calls a swarm."} It began on ${start}, about ${f0(depth)}\u202Fkm deep inside the crust, and has been running at about ${f0(perDay)} events a day.`,
    state: (s, largest, gap) =>
      s === "none"
        ? `None stands out: the largest, ${mag(largest)}, is only ${gap === null ? "slightly" : f1(gap)} above the next. That is why it has no mainshock.`
        : `Its largest event, ${mag(largest)}, now does stand ${gap === null ? "" : `${f1(gap)} `}above the next${s === "awaiting-review" ? ", though SGC has not reviewed it yet" : ""}. Until SGC describes it otherwise, this page still calls it a swarm.`,
    shareTitle: "How much of the energy did each zone's largest event release?",
    shareChoco: (m) => `Chocó: its largest, ${mag(m)}`,
    shareTolima: (m) => `Chaparral: its largest, ${mag(m)}`,
    shareCaption:
      "Share of each zone's total energy released by its single largest event (seismic moment, which grows 31.6 times per magnitude unit). In a sequence with a mainshock, one event dominates. In a swarm, the energy is spread over many similar ones.",
    driftIntro:
      "Swarms often creep along, which is usually associated with fluids working their way through rock or a fault slipping slowly. Does this one stay put?",
    driftTitle: (km) =>
      `${f0(km * 2)}\u202Fkm × ${f0(km * 2)}\u202Fkm around where it began, every 12 hours. North is up; the bar in the first square is 1\u202Fkm.`,
    driftPanel: (when, n) => `${when} · ${n} events`,
    driftAria: (when, n) => `${when}: ${n} events`,
    driftCaption: (err) =>
      `Each panel is 12 hours of the swarm. The cross is the centre of its events (the median) and the line is the centre's path so far. Each epicentre carries a typical error of ~${err}\u202Fkm, so a single dot says nothing; any drift of the centre is a hint that would need the events relocated to confirm, not a finding.`,
    takeaway: (state) =>
      state === "none"
        ? "Chaparral has no mainshock: it is a swarm, and swarms can die out or carry on, with no way to know beforehand which."
        : "One of Chaparral's events now stands out, but how it will go on cannot be known beforehand.",
  },

  linked: {
    short: "Are they connected?",
    q: "Are Chocó and Tolima connected?",
    p1: (km, weeks) =>
      `SGC has put forward, as a preliminary hypothesis, that Chocó's big earthquake may have changed the stresses in the crust and helped reactivate faults near Chaparral, about ${f0(Math.round(km / 10) * 10)}\u202Fkm from its epicentre and ${WORDS_EN[weeks] ?? f0(weeks)} weeks later. It is a reasonable idea under study, but it is not proven, and nothing on this page tests it.`,
    p2: "Two things happening close together in time is not evidence that they are connected. The chart shows what came before and what came after, nothing more.",
    legendShallow: "Chocó, shallow",
    legendDeep: "Chocó, deep",
    legendTolima: "Chaparral",
    begins: (d) => `${d}: Chaparral begins →`,
    aria: "Both zones' events over time, by magnitude",
    caption:
      "Each dot is an event in SGC's catalogue, by date and magnitude. Putting two zones on one axis shows when things happened, not that one caused the other.",
    takeaway:
      "Maybe: SGC puts it forward as a hypothesis, and all this page can show is what came first and what came after, which is not the same as a cause.",
  },

  felt: {
    short: "How many times have I felt it?",
    q: "How many times have I felt one?",
    p1: "This page cannot know what you felt, but it does know which days had events of the size you start to notice. Set the threshold where it feels right, and the calendar marks the days with at least one such event in these two zones.",
    threshold: "I notice them from",
    daysOf: (n) => `of ${n} days`,
    events: (n) => `${n} ${n === 1 ? "event" : "events"}`,
    weekdays: ["M", "T", "W", "T", "F", "S", "S"],
    tapHint: "pick a day to see its events",
    dayAria: (date, n) => `${date}: ${n === 0 ? "none" : n === 1 ? "1 event" : `${n} events`}`,
    none: (m) => `No event of ${mag(m)} or more that day in these zones.`,
    shallowName: "Istmina–Sipí",
    deepName: "Chocó deep",
    tolimaName: "Chaparral",
    caption:
      "Only counts events in the two zones this page follows. Colombia also shakes elsewhere, and some of those are felt in Pereira too. Whether someone notices one also depends on where they were and the ground; the threshold is yours.",
    takeaway: (days, total, m) =>
      `With the threshold at ${mag(m)}, there were such events on ${days} of ${total} days.`,
  },

  bigger: {
    short: "Is a bigger one coming?",
    q: "Is a bigger one coming?",
    p1: "The honest answer is that nobody knows. Today no one can predict when, where and how big an earthquake will be: not this page, not SGC, not any service in the world. Sequences like Chocó's and swarms like Chaparral's sometimes die down slowly and sometimes produce a larger earthquake, and there is no way to know beforehand which each will do.",
    p2: "SGC's public position is that many earthquakes do not, by themselves, mean a big one is coming. That is why this page calculates no probabilities and shows no alerts.",
    helpTitle: "What does help, always",
    help: [
      "Being prepared is worth it at any time, not because of this sequence in particular: Colombia is a seismic country.",
      "Have a family plan: where to take cover, where to meet, and an emergency bag.",
      "Get information from official sources: the Servicio Geológico Colombiano's bulletins (sgc.gov.co).",
    ],
    takeaway: "No one can announce the next earthquake; what helps is being prepared at all times and following SGC.",
  },

  unknown: {
    short: "What don't we know?",
    q: "What don't we know yet?",
    p1: "Quite a lot, and it is better to say so plainly. This is what neither this data nor this page can answer today:",
    why: "What drives the Istmina–Sipí group's activity, and how it will evolve.",
    link: "Whether Chaparral has anything to do with Chocó's big earthquake. It is SGC's hypothesis, not a result.",
    faults: (choco, tolima, snapped) =>
      `The fine shape of the faults. Locations carry typical errors of ~${choco}\u202Fkm in Chocó and ~${tolima}\u202Fkm at Chaparral${snapped ? `, and many depths repeat fixed values (${snapped.count} Chaparral events at exactly ${f1(snapped.depthKm)}\u202Fkm), a sign they are not well pinned down` : ""}.`,
    floor: "Events below M2.0: SGC does not publish them in this catalogue, and there are few stations nearby.",
    types: "Magnitudes mix types (MLr, MLv, Mw) that are not fully comparable, so the energy figures are approximate.",
    revisions:
      "The catalogue changes: SGC reviews its events and sometimes corrects or withdraws them after publishing.",
    takeaway:
      "The data shows well what happened and how it compares with the typical; the exact why and what comes next are still open.",
  },

  words: es.words,
};

export const questionsCopy: Record<Lang, Copy> = { es, en };
