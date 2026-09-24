import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/** Said the same way about both zones. */
const esCommon = {
  notForecast:
    "Un valor b menor que 1 describe la secuencia: los eventos grandes pesan más de lo habitual. No es un pronóstico ni una alerta.",
  floor: "El SGC no publica eventos por debajo de M2.0 en este catálogo, así que el rango M0–M2 no existe aquí.",
  magTypes:
    "Las magnitudes mezclan tipos (MLr, MLv, Mw, M), y eso mueve b más que su margen de error. La tarjeta del valor b permite comparar el cálculo con todos los tipos y con uno solo.",
  revisions:
    "Los eventos recientes pueden ser automáticos y cambiar tras la revisión de un analista. La página vuelve a consultar todo el historial a lo largo del día para recoger esos cambios.",
  /** The rule `core/mainshock.ts` applies, in one sentence a reader can check against the table. */
  mainshockRule:
    "La página llama sismo principal al evento más grande solo si un analista del SGC lo ha revisado y supera en al menos 1 unidad de magnitud a todos los demás, comparando las magnitudes tal como las publica el SGC. Es una etiqueta a posteriori: si después llegara un evento mayor, el anterior pasaría a ser un sismo premonitor.",
  /** Short-term aftershock incompleteness, for any zone with a mainshock. */
  afterMainshock:
    "Justo después del sismo principal se pierden eventos pequeños; las primeras ventanas son las menos fiables.",
};

/**
 * What the page knows about the zone's mainshock when it writes the caveats. Detected from the
 * catalogue (`core/mainshock.ts`), so the caveats follow it: a swarm's "no dominant event" is only
 * said while nothing stands clear, and the note on missed small events only once something does.
 */
export type CaveatState = "found" | "awaiting-review" | "none";

const es = {
  zoneLabel: "Zona",
  /**
   * What differs between the two places the page follows. The tabs are named by department, as
   * SGC's daily bulletin names the pair ("Chocó y Tolima"); the Tolima tab's title names the
   * locality, because its box covers only the swarm near Chaparral. Chocó is a mainshock–aftershock
   * sequence ("secuencia"); Chaparral is a swarm ("enjambre"), which is SGC's own word for it and
   * the technically right one — the reverse of the rule docs/science.md gives for Chocó.
   */
  zones: {
    choco: {
      tab: "Chocó",
      docTitle: "Secuencia sísmica del Chocó · valor b",
      title: "Secuencia sísmica del Chocó",
      subtitle:
        "Secuencia posterior al sismo M7.4 de San José del Palmar (10 de agosto de 2026). Datos del Servicio Geológico Colombiano.",
      backfillTitle: (a: number, b: number) => `Cargando el historial: ${a} de ${b} semanas`,
      backfillBody:
        "Todavía faltan semanas desde el 10 de agosto. El valor b y los gráficos no son representativos hasta que termine.",
      caveats: (m: CaveatState) => [
        esCommon.notForecast,
        esCommon.floor,
        esCommon.magTypes,
        ...(m === "found" ? [esCommon.afterMainshock] : []),
        esCommon.revisions,
        "La secuencia está formada por dos grupos de eventos a distinta profundidad. Al 19 de septiembre de 2026, el grupo profundo, el del sismo principal, tuvo casi toda su actividad en la primera semana; casi todo lo posterior es del grupo superficial, y es ahí donde baja el valor b. El valor b del grupo profundo sale de pocos eventos, así que su margen de error es amplio.",
        esCommon.mainshockRule,
      ],
    },
    tolima: {
      tab: "Tolima",
      docTitle: "Enjambre sísmico de Chaparral (Tolima) · valor b",
      title: "Enjambre sísmico de Chaparral (Tolima)",
      subtitle:
        "Enjambre de eventos en Chaparral, Tolima, desde el 20 de septiembre de 2026. Datos del Servicio Geológico Colombiano.",
      backfillTitle: (a: number, b: number) => `Cargando el historial: ${a} de ${b} días`,
      backfillBody:
        "Todavía faltan días desde el 20 de septiembre. El valor b y los gráficos no son representativos hasta que termine.",
      caveats: (m: CaveatState) => [
        "El valor b describe el enjambre: cuánto pesan los eventos grandes frente a los pequeños. No es un pronóstico ni una alerta.",
        esCommon.floor,
        esCommon.magTypes,
        // SGC's own definition of a swarm. Only while nothing stands clear: beside a notice about a
        // mainshock, or an event awaiting review, it would contradict the page.
        ...(m === "none"
          ? [
              "Es un enjambre: muchos eventos de tamaño parecido y ningún sismo principal claramente dominante. Unos enjambres se apagan sin un evento mayor y otros no, y estas cifras no permiten saber cuál será el caso. La información oficial está en los boletines diarios del SGC.",
            ]
          : []),
        // What reconciles the tab's "enjambre" with a mainshock in the status bar: the name is SGC's to
        // change, and a person changes the copy (docs/science.md). Never renamed automatically.
        ...(m === "none"
          ? []
          : ["Mientras el SGC no la describa de otra forma, esta página la sigue llamando enjambre."]),
        ...(m === "found" ? [esCommon.afterMainshock] : []),
        "El SGC plantea como hipótesis preliminar que el sismo M7.4 del 10 de agosto en el Chocó cambió los esfuerzos en la corteza y favoreció que se reactivaran fallas de la zona de Chaparral. Es una hipótesis, no una conclusión.",
        // Not `esCommon.revisions`: with one-day chunks and one sweep an hour, "todo el historial a lo
        // largo del día" stops being true once the swarm is 24 days old.
        "Los eventos recientes pueden ser automáticos y cambiar tras la revisión de un analista. La página vuelve a consultar el historial por partes, un día de eventos cada hora, para recoger esos cambios.",
        esCommon.mainshockRule,
      ],
    },
  },
  events: "Eventos",
  newestEvent: "Evento más reciente",
  lastUpdate: "Última consulta al SGC",
  never: "nunca",
  refresh: "Actualizar ahora",
  autoUpdate: (min: number) => `Se actualiza sola cada ${min} minutos`,
  refreshing: "Consultando al SGC…",
  refreshWait: (min: number) => `Ya tienes los datos más recientes: el SGC se consultó hace menos de ${min} minutos.`,
  refreshFailed: "No se pudo consultar al SGC. Inténtalo de nuevo en unos minutos.",
  refreshStillFailing: "No se envió: ya hay un reintento en camino.",
  ingestFailed: "La última consulta al SGC falló",
  ingestFailedBody:
    "Se muestran los últimos datos guardados. La consulta se repetirá automáticamente hasta que el SGC vuelva a responder; no hace falta recargar.",
  technicalDetail: "Detalle técnico",
  loadFailed: "No se pudieron cargar los datos",
  loadFailedBody: "Revisa tu conexión y recarga la página.",
  backfillAction: "Cargar ahora",
  backfillShort: "Historial incompleto",
  scopeTitle: (shown: string, total: string) => `Mostrando ${shown} de ${total} eventos`,
  scopeShort: (shown: string, total: string) => `${shown} de ${total}`,
  scopeAria: "Filtros activos",
  scopeClear: "Quitar filtros",
  chipAllDates: "Todas las fechas",
  chipRange: (a: string, b: string) => `${a} – ${b}`,
  chipFrom: (d: string) => `desde ${d}`,
  chipTo: (d: string) => `hasta ${d}`,
  chipMinMag: (m: string) => `M ≥ ${m}`,
  chipManual: "Solo revisados",
  chipNoMainshock: "Sin el sismo principal",
  chipMc: (m: string) => `Mc = ${m}`,
  filters: "Filtros",
  from: "Desde",
  to: "Hasta",
  minMag: "Magnitud mínima",
  manualOnly: "Solo revisados (manual)",
  excludeMainshock: "Excluir sismo principal",
  dateOrder: "La fecha inicial debe ser anterior a la final.",
  mcLabel: "Magnitud de completitud (Mc)",
  mcAuto: "Automática (curvatura máxima)",
  mcManual: "Manual",
  mcHelp:
    "Se usa la curvatura máxima porque el SGC no publica eventos por debajo de M2.0: ese corte engaña al método de bondad de ajuste, que elige Mc = 2.0 y subestima b.",
  mcBackToAuto: "Volver a Mc automática (curvatura máxima)",
  reset: "Restablecer",
  bTitle: "Valor b",
  bNone: "Sin datos suficientes para estimar b. Amplía el rango de fechas o baja la magnitud mínima.",
  bFew: "Menos de 50 eventos: valor poco fiable",
  bGft: "Con Mc por bondad de ajuste",
  eventsAboveMc: "eventos ≥ Mc",
  bDrift: (a: string, b: string) => `El valor b pasó de ${a} al inicio a ${b} al final del periodo.`,
  bRowStart: "Al inicio",
  bRowAll: "Todo el periodo",
  bRowEnd: "Al final",
  bRowFirst: (n: number, span: string) => `primeros ${n} eventos · ${span}`,
  bRowLast: (n: number, span: string) => `últimos ${n} eventos · ${span}`,
  bLegendValue: "valor estimado",
  bLegendError: "margen de error (±1σ)",
  bLegendOne: "b = 1, referencia habitual",
  bScopeLabel: "Magnitudes usadas para calcular b",
  bScopeAll: "Todos los tipos",
  bScopeOne: (type: string) => `Solo ${type}`,
  bScopeAllHelp: (type: string) =>
    `Usa todos los eventos ≥ Mc. El SGC mide casi todos los eventos pequeños con ${type} y la mayoría de los grandes con otras escalas. Si las escalas no coinciden del todo, este valor sale más bajo que el real.`,
  bScopeOneHelp: (type: string, n: string, total: string) =>
    `Usa solo los eventos medidos con ${type}, el tipo más común (${n} de ${total}). Es una sola escala, pero deja fuera la mayoría de los eventos grandes, y eso empuja el valor hacia arriba.`,
  bScopeBoth:
    "El valor real probablemente está entre los dos. Ninguno es un pronóstico: b describe lo que ya ocurrió, no anuncia el próximo evento grande.",
  bScopeNote: (type: string) => `Solo eventos con magnitud ${type}.`,
  clustersTitle: "Dos grupos de eventos",
  clustersDesc: (km: number) =>
    `La secuencia está formada por dos grupos separados por la profundidad: entre 55 y 75 km casi no hay eventos. El corte está en ${km} km.`,
  clusterShort: { shallow: "Superficial", deep: "Profundo" },
  clusterName: { shallow: "Grupo superficial", deep: "Grupo profundo" },
  clusterWhere: {
    shallow: (km: number) => `menos de ${km} km · bajo Istmina y Sipí`,
    deep: (km: number) => `${km} km o más · alrededor del sismo principal`,
  },
  clusterRecentLabel: (days: number) => `eventos en los últimos ${days} días`,
  clusterMax: (mag: string) => `el mayor, M${mag}`,
  clusterDaily: (n: string) => `eventos por día · ${n} en total`,
  clusterOnly: "Ver solo este grupo",
  clusterNotForecast: "Son cifras de lo que ya ocurrió, no un pronóstico.",
  clusterLast: (when: string) => `el último, ${when}`,
  clusterNoFit: "Muy pocos eventos ≥ Mc para calcular b",
  clusterOwnMc: (mc: string) => `Puede estar incompleto por debajo de M${mc}`,
  clusterSame: "Los valores b de los dos grupos no se distinguen: su diferencia es menor que su incertidumbre.",
  clusterDiffer: "La diferencia entre los valores b de los dos grupos es mayor que lo esperable por azar.",
  clusterTest: (p: string) =>
    `Prueba de Utsu (1992): p = ${p}. Los dos grupos usan la misma Mc, la de todo el catálogo.`,
  clusterClear: "Ver todos",
  clusterNote: (name: string) => `${name}.`,
  bTimeEmptyCluster: (have: string, need: number) =>
    `Este grupo tiene ${have} eventos ≥ Mc y cada ventana necesita ${need}, así que su valor b es una sola cifra, sin evolución en el tiempo.`,
  mapTitle: "Mapa",
  mapDesc: "Tamaño por magnitud, color por profundidad.",
  mapRing: "El sismo principal está marcado con un anillo naranja.",
  /**
   * The status bar's "Sismo principal": what the rule in core/mainshock.ts reads in the zone's whole
   * catalogue today. Always shown, on every tab, so a reader sees "none clear" as a reading and not an
   * omission. Neutral in every state: nothing failed, and none of it is a forecast. Magnitudes and the
   * gap arrive preformatted to one decimal; `day` is a Colombian day ("24 sept").
   */
  mainshock: {
    label: "Sismo principal",
    none: "Ninguno claro",
    gapHint: (day: string, gap: string) => `${day} · ${gap} por encima del siguiente`,
    pendingHint: (day: string) => `${day} · automático, en revisión`,
    noneHint: (gap: string) => `el mayor, solo ${gap} por encima del siguiente`,
  },
  depth: "Profundidad (km)",
  magTimeTitle: "Magnitud en el tiempo",
  magTimeDesc: "Cada punto es un evento.",
  dailyTitle: "Eventos por día",
  magTimeRegion: "Magnitud en el tiempo y eventos por día; gráficos desplazables en horizontal",
  fmdTitle: "Distribución frecuencia–magnitud",
  fmdDesc: "Escala logarítmica. La recta es la ley de Gutenberg–Richter ajustada por encima de Mc.",
  fmdIsolated: (mag: string) => `El punto aislado a la derecha es el evento de mayor magnitud (M${mag}).`,
  cumulative: "Acumulado N(≥M)",
  perBin: "Por intervalo de 0.1",
  grFit: "Ajuste G–R",
  bTimeTitle: "Valor b en el tiempo",
  bTimeDesc: (n: number, mc: string) =>
    `Ventanas móviles de ${n} eventos con Mc fija = ${mc}. Banda: ±1σ. Cada punto se ubica en el último evento de su ventana.`,
  bTimeEmpty: (n: number) =>
    `Cada ventana necesita ${n} eventos ≥ Mc y aún no hay suficientes. Amplía el rango de fechas o baja Mc.`,
  bTimeAlt: (a: string, b: string) => `El valor b pasa de ${a} en la primera ventana a ${b} en la más reciente.`,
  band: "±1σ",
  tableTitle: "Catálogo",
  downloadCsv: "Descargar CSV",
  downloadBCsv: "Descargar CSV del valor b en el tiempo",
  colTime: "Fecha y hora",
  colMag: "Mag.",
  colType: "Tipo",
  colDepth: "Prof. (km)",
  colLat: "Lat",
  colLon: "Lon",
  colRms: "RMS (s)",
  colGap: "Gap (°)",
  colErrH: "Err. horiz. (km)",
  colErrZ: "Err. prof. (km)",
  colPhases: "Fases",
  colRegion: "Región",
  colStatus: "Estado",
  page: (a: number, b: number) => `Página ${a} de ${b}`,
  /** The link to /insights, the page that explains the sequences in plain words. */
  insightsLink: "¿Qué está pasando?",
  themeToDark: "Cambiar a tema oscuro",
  themeToLight: "Cambiar a tema claro",
  prevPage: "Página anterior",
  nextPage: "Página siguiente",
  statusManual: "manual",
  statusAutomatic: "automático",
  scrollHint: "Desliza la tabla para ver más columnas",
  zoomIn: "Acercar",
  zoomOut: "Alejar",
  toggleAttribution: "Mostrar u ocultar la atribución",
  gestureMac: "Usa ⌘ + desplazamiento para acercar o alejar el mapa",
  gestureWindows: "Usa Ctrl + desplazamiento para acercar o alejar el mapa",
  gestureMobile: "Usa dos dedos para mover el mapa",
  noEvents: "Ningún evento coincide con los filtros",
  noEventsBody: "Amplía el rango de fechas o baja la magnitud mínima.",
  caveatsTitle: "Cómo leer estas cifras",
  source: "Fuente oficial: Servicio Geológico Colombiano, Consulta Experta SeisComP.",
  autoUpdateLong: (min: number) =>
    `El catálogo se consulta al SGC cada ${min} minutos. Mientras esta página esté abierta, las cifras, los gráficos y el mapa se actualizan solos, sin recargar.`,
  timeNote: "Las fechas y horas son de Colombia (UTC−5). Los CSV descargados usan UTC.",
};

export type Dict = typeof es;

const enCommon = {
  notForecast:
    "A b-value below 1 describes the sequence: large events weigh more than usual. It is not a forecast or an alert.",
  floor: "SGC publishes no events below M2.0 in this catalogue, so the M0–M2 range does not exist here.",
  magTypes:
    "Magnitudes mix several types (MLr, MLv, Mw, M), and that moves b by more than its margin of error. The b-value card lets you compare all types against a single one.",
  revisions:
    "Recent events may be automatic and can change after analyst review. The page re-reads the whole history over the course of each day to pick up those changes.",
  mainshockRule:
    "The page calls the largest event the mainshock only if an SGC analyst has reviewed it and it exceeds every other event by at least 1 magnitude unit, comparing magnitudes as SGC publishes them. The label is retrospective: if a larger event came later, the earlier one would become a foreshock.",
  afterMainshock: "Right after the mainshock small events are missed; the earliest windows are the least reliable.",
};

const en: Dict = {
  zoneLabel: "Area",
  zones: {
    choco: {
      tab: "Chocó",
      docTitle: "Chocó earthquake sequence · b-value",
      title: "Chocó earthquake sequence",
      subtitle:
        "Sequence following the M7.4 San José del Palmar earthquake (10 August 2026). Data from the Colombian Geological Survey (SGC).",
      backfillTitle: (a, b) => `Loading history: ${a} of ${b} weeks`,
      backfillBody:
        "Weeks since 10 August are still missing. The b-value and charts are not representative until this finishes.",
      caveats: (m) => [
        enCommon.notForecast,
        enCommon.floor,
        enCommon.magTypes,
        ...(m === "found" ? [enCommon.afterMainshock] : []),
        enCommon.revisions,
        "The sequence is two groups of events at different depths. As of 19 September 2026 the deep group, the mainshock's own, had nearly all of its activity in the first week; almost everything since belongs to the shallow group, and that is where the b-value falls. The deep group's b-value comes from few events, so its margin of error is wide.",
        enCommon.mainshockRule,
      ],
    },
    tolima: {
      tab: "Tolima",
      docTitle: "Chaparral earthquake swarm (Tolima) · b-value",
      title: "Chaparral earthquake swarm (Tolima)",
      subtitle:
        "Swarm of events at Chaparral, Tolima, since 20 September 2026. Data from the Colombian Geological Survey (SGC).",
      backfillTitle: (a, b) => `Loading history: ${a} of ${b} days`,
      backfillBody:
        "Days since 20 September are still missing. The b-value and charts are not representative until this finishes.",
      caveats: (m) => [
        "The b-value describes the swarm: how much the large events weigh against the small ones. It is not a forecast or an alert.",
        enCommon.floor,
        enCommon.magTypes,
        ...(m === "none"
          ? [
              "This is a swarm: many events of similar size and no clearly dominant mainshock. Some swarms die out without a larger event and some do not, and these figures cannot tell which this will be. The official information is in SGC's daily bulletins.",
            ]
          : []),
        ...(m === "none" ? [] : ["Until SGC describes it differently, this page keeps calling it a swarm."]),
        ...(m === "found" ? [enCommon.afterMainshock] : []),
        "SGC's preliminary hypothesis is that the M7.4 of 10 August in Chocó changed the stresses in the crust and helped reactivate faults around Chaparral. It is a hypothesis, not a conclusion.",
        "Recent events may be automatic and can change after analyst review. The page re-reads the history in parts, one day of events each hour, to pick up those changes.",
        enCommon.mainshockRule,
      ],
    },
  },
  events: "Events",
  newestEvent: "Newest event",
  lastUpdate: "Last SGC query",
  never: "never",
  refresh: "Refresh now",
  autoUpdate: (min) => `Updates itself every ${min} minutes`,
  refreshing: "Querying SGC…",
  refreshWait: (min) => `You already have the latest data: SGC was queried less than ${min} minutes ago.`,
  refreshFailed: "Unable to query SGC. Try again in a few minutes.",
  refreshStillFailing: "Not sent: a retry is already on the way.",
  ingestFailed: "The last SGC query failed",
  ingestFailedBody:
    "Showing the most recent stored data. It retries by itself until SGC answers again; there is no need to reload.",
  technicalDetail: "Technical detail",
  loadFailed: "Could not load data",
  loadFailedBody: "Check your connection and reload the page.",
  backfillAction: "Load now",
  backfillShort: "History incomplete",
  scopeTitle: (shown, total) => `Showing ${shown} of ${total} events`,
  scopeShort: (shown, total) => `${shown} of ${total}`,
  scopeAria: "Active filters",
  scopeClear: "Clear filters",
  chipAllDates: "All dates",
  chipRange: (a, b) => `${a} – ${b}`,
  chipFrom: (d) => `from ${d}`,
  chipTo: (d) => `to ${d}`,
  chipMinMag: (m) => `M ≥ ${m}`,
  chipManual: "Reviewed only",
  chipNoMainshock: "Without the mainshock",
  chipMc: (m) => `Mc = ${m}`,
  filters: "Filters",
  from: "From",
  to: "To",
  minMag: "Minimum magnitude",
  manualOnly: "Reviewed only (manual)",
  excludeMainshock: "Exclude mainshock",
  dateOrder: "Start date must be before end date.",
  mcLabel: "Magnitude of completeness (Mc)",
  mcAuto: "Automatic (maximum curvature)",
  mcManual: "Manual",
  mcHelp:
    "Maximum curvature is used because SGC publishes nothing below M2.0: that cut-off fools the goodness-of-fit method, which picks Mc = 2.0 and underestimates b.",
  mcBackToAuto: "Switch back to automatic Mc (maximum curvature)",
  reset: "Reset",
  bTitle: "b-value",
  bNone: "Not enough data to estimate b. Widen the date range or lower the minimum magnitude.",
  bFew: "Fewer than 50 events: unreliable",
  bGft: "With goodness-of-fit Mc",
  eventsAboveMc: "events ≥ Mc",
  bDrift: (a, b) => `The b-value went from ${a} at the start to ${b} at the end of the period.`,
  bRowStart: "At the start",
  bRowAll: "Whole period",
  bRowEnd: "At the end",
  bRowFirst: (n, span) => `first ${n} events · ${span}`,
  bRowLast: (n, span) => `last ${n} events · ${span}`,
  bLegendValue: "estimated value",
  bLegendError: "margin of error (±1σ)",
  bLegendOne: "b = 1, the usual reference",
  bScopeLabel: "Magnitudes used to calculate b",
  bScopeAll: "All types",
  bScopeOne: (type) => `${type} only`,
  bScopeAllHelp: (type) =>
    `Uses every event ≥ Mc. SGC measures nearly all small events with ${type} and most large ones on other scales. If the scales do not line up exactly, this value comes out lower than the true one.`,
  bScopeOneHelp: (type, n, total) =>
    `Uses only events measured with ${type}, the most common type (${n} of ${total}). It is a single scale, but it leaves out most of the large events, which pushes the value up.`,
  bScopeBoth:
    "The true value is probably between the two. Neither is a forecast: b describes what has already happened, it does not announce the next large event.",
  bScopeNote: (type) => `Only events with ${type} magnitude.`,
  clustersTitle: "Two groups of events",
  clustersDesc: (km) =>
    `The sequence is two groups separated by depth: there are almost no events between 55 and 75 km. The cut is at ${km} km.`,
  clusterShort: { shallow: "Shallow", deep: "Deep" },
  clusterName: { shallow: "Shallow group", deep: "Deep group" },
  clusterWhere: {
    shallow: (km) => `less than ${km} km · under Istmina and Sipí`,
    deep: (km) => `${km} km or more · around the mainshock`,
  },
  clusterRecentLabel: (days) => `events in the last ${days} days`,
  clusterMax: (mag) => `the largest, M${mag}`,
  clusterDaily: (n) => `events per day · ${n} in total`,
  clusterOnly: "Show only this group",
  clusterNotForecast: "These figures describe what has already happened; they are not a forecast.",
  clusterLast: (when) => `the latest, ${when}`,
  clusterNoFit: "Too few events ≥ Mc to calculate b",
  clusterOwnMc: (mc) => `May be incomplete below M${mc}`,
  clusterSame: "The two groups' b-values cannot be told apart: they differ by less than their uncertainty.",
  clusterDiffer: "The two groups' b-values differ by more than chance would explain.",
  clusterTest: (p) => `Utsu's test (1992): p = ${p}. Both groups use the same Mc, that of the whole catalogue.`,
  clusterClear: "Show all",
  clusterNote: (name) => `${name}.`,
  bTimeEmptyCluster: (have, need) =>
    `This group has ${have} events ≥ Mc and each window needs ${need}, so its b-value is a single figure with no change over time.`,
  mapTitle: "Map",
  mapDesc: "Size by magnitude, colour by depth.",
  mapRing: "The mainshock has an orange ring.",
  mainshock: {
    label: "Mainshock",
    none: "None clear",
    gapHint: (day, gap) => `${day} · ${gap} above the next`,
    pendingHint: (day) => `${day} · automatic, under review`,
    noneHint: (gap) => `the largest, only ${gap} above the next`,
  },
  depth: "Depth (km)",
  magTimeTitle: "Magnitude over time",
  magTimeDesc: "Each dot is one event.",
  dailyTitle: "Events per day",
  magTimeRegion: "Magnitude over time and events per day; horizontally scrollable charts",
  fmdTitle: "Frequency–magnitude distribution",
  fmdDesc: "Log scale. The line is the Gutenberg–Richter law fitted above Mc.",
  fmdIsolated: (mag: string) => `The isolated point on the right is the largest event (M${mag}).`,
  cumulative: "Cumulative N(≥M)",
  perBin: "Per 0.1 bin",
  grFit: "G–R fit",
  bTimeTitle: "b-value over time",
  bTimeDesc: (n, mc) =>
    `Sliding windows of ${n} events at a fixed Mc = ${mc}. Band: ±1σ. Each point sits at the last event of its window.`,
  bTimeEmpty: (n) =>
    `Each window needs ${n} events ≥ Mc and there are not enough yet. Widen the date range or lower Mc.`,
  bTimeAlt: (a, b) => `b goes from ${a} in the first window to ${b} in the latest.`,
  band: "±1σ",
  tableTitle: "Catalogue",
  downloadCsv: "Download CSV",
  downloadBCsv: "Download CSV of b-value over time",
  colTime: "Date-time",
  colMag: "Mag.",
  colType: "Type",
  colDepth: "Depth (km)",
  colLat: "Lat",
  colLon: "Lon",
  colRms: "RMS (s)",
  colGap: "Gap (°)",
  colErrH: "Horiz. err. (km)",
  colErrZ: "Depth err. (km)",
  colPhases: "Phases",
  colRegion: "Region",
  colStatus: "Status",
  page: (a, b) => `Page ${a} of ${b}`,
  insightsLink: "What is happening?",
  themeToDark: "Switch to dark theme",
  themeToLight: "Switch to light theme",
  prevPage: "Previous page",
  nextPage: "Next page",
  statusManual: "manual",
  statusAutomatic: "automatic",
  scrollHint: "Swipe the table to see more columns",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  toggleAttribution: "Toggle attribution",
  gestureMac: "Use ⌘ + scroll to zoom the map",
  gestureWindows: "Use Ctrl + scroll to zoom the map",
  gestureMobile: "Use two fingers to move the map",
  noEvents: "No events match the filters",
  noEventsBody: "Widen the date range or lower the minimum magnitude.",
  caveatsTitle: "How to read these numbers",
  source: "Authoritative source: Servicio Geológico Colombiano, Consulta Experta SeisComP.",
  autoUpdateLong: (min) =>
    `The catalogue is read from SGC every ${min} minutes. While this page is open, the figures, charts and map update by themselves, with no reload.`,
  timeNote: "Dates and times are Colombia time (UTC−5). Downloaded CSVs use UTC.",
};

export type Lang = "es" | "en";
/** Exported for the tests, which assert on strings without mounting the page. */
export const dicts: Record<Lang, Dict> = { es, en };
const STORAGE_KEY = "sgc-swarm:lang";

const Ctx = createContext<{ lang: Lang; t: Dict; setLang: (l: Lang) => void }>({
  lang: "es",
  t: es,
  setLang: () => {},
});

export function I18nProvider({ children }: { children: ReactNode }) {
  // Spanish unless the visitor has explicitly chosen English before.
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "en" ? "en" : "es";
    } catch {
      return "es";
    }
  });
  // Also on first load, so a restored English choice is announced as English. The document's
  // title names the zone, so the page sets that itself.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const value = useMemo(() => {
    const setLang = (l: Lang) => {
      setLangState(l);
      try {
        localStorage.setItem(STORAGE_KEY, l);
      } catch {
        /* private mode: keep the choice for this visit only */
      }
    };
    return { lang, t: dicts[lang], setLang };
  }, [lang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
