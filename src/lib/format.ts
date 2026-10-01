const DAY = 86_400_000;

type Lang = "es" | "en";

// Every date and time on the page is Colombian time, wherever the reader's device is: the page is
// about an earthquake sequence felt in Colombia. The CSV and the API stay in UTC.
export const TIME_ZONE = "America/Bogota";
/** Colombia is UTC−5 all year (no daylight saving since 1993), so day arithmetic can use a constant. */
export const TZ_OFFSET_MS = -5 * 3_600_000;

// en-GB so English reads day-first ("18 Sept 2026"), the same order as Spanish and as the page's own prose.
const formatters = (opts: Intl.DateTimeFormatOptions): Record<Lang, Intl.DateTimeFormat> => ({
  es: new Intl.DateTimeFormat("es", { timeZone: TIME_ZONE, ...opts }),
  en: new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, ...opts }),
});
const DATE_TIME = formatters({
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const DATE = formatters({ day: "numeric", month: "short", year: "numeric" });
const DAY_MONTH = formatters({ day: "numeric", month: "short" });
const DAY_MONTH_LONG = formatters({ day: "numeric", month: "long" });
const DATE_LONG = formatters({ day: "numeric", month: "long", year: "numeric" });
const DAY_MONTH_TIME = formatters({
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** SGC's own page for one event. Event ids are regex-constrained at the parser, so this cannot become a scheme. */
export const sgcEventUrl = (id: string) => `https://www.sgc.gov.co/detallesismo/${id}/resumen`;

/** SGC's public query form, the page this site reads its catalogue from, as a reader opens it. */
export const SGC_QUERY_URL =
  "https://bdrsnc.sgc.gov.co/paginas1/catalogo/Consulta_Experta_Seiscomp/consultaexperta.php";

/** SGC ends every region with ", Colombia", which is a given on this page. */
export const fmtRegion = (region: string) => region.replace(/,\s*Colombia$/, "");

/**
 * The region as a place in a sentence or a headline: SGC's "Chaparral - Tolima" (municipality -
 * department) as "Chaparral, Tolima". The table and the chart keep `fmtRegion`'s form.
 */
export const fmtPlace = (region: string) => fmtRegion(region).replace(/\s+-\s+/, ", ");

/** "18 sept 2026, 17:43", Colombian time. Unlabelled: the footer says so once for the whole page. */
export const fmtDateTime = (at: string | number, lang: Lang) => DATE_TIME[lang].format(new Date(at));
/** "18 sept 2026" */
export const fmtDate = (ms: number, lang: Lang) => DATE[lang].format(ms);
const YEAR = new Intl.DateTimeFormat("en", { timeZone: TIME_ZONE, year: "numeric" });
/** The Colombian calendar year of an instant, by Colombia's own clock then (it ran on UTC−4 in 1992–93). */
export const fmtYear = (ms: number) => Number(YEAR.format(ms));
/** Axis tick and short label: "18 sept", with a no-break space so the day never parts from its month. */
export const fmtDay = (ms: number, lang: Lang) => DAY_MONTH[lang].format(ms).replace(" ", "\u00A0");
// The Colombian month of an instant, to compare, and the day of the month alone ("12").
const MONTH = new Intl.DateTimeFormat("en", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit" });
const DAY_OF_MONTH = new Intl.DateTimeFormat("en", { timeZone: TIME_ZONE, day: "numeric" });
const sameMonth = (a: number, b: number) => MONTH.format(a) === MONTH.format(b);
/**
 * A range of Colombian days, each given by the instant it begins: "12–18 sept" within a month,
 * "30 ago – 2 sept" across one, the day alone for one day. No line breaks inside either end or after the dash.
 *
 * Built from `fmtDay`, not `formatRange`, whose shape moves with the ICU data: Node 24.11 wrote
 * "12–18 Sept" in en-GB and Node 24.21 "12 – 18 Sept", which read here as two months.
 */
export function fmtDayRange(from: number, to: number, lang: Lang): string {
  if (from === to) return fmtDay(from, lang);
  if (sameMonth(from, to)) return `${DAY_OF_MONTH.format(from)}–${fmtDay(to, lang)}`;
  return `${fmtDay(from, lang)} –\u2060 ${fmtDay(to, lang)}`;
}
/** The Colombian date of an instant as "2026-09-12", for a file name. */
export const fmtIsoDay = (ms: number) => new Date(ms + TZ_OFFSET_MS).toISOString().slice(0, 10);
/** A day inside running prose: "10 de agosto", "10 August". Abbreviations stay in labels and ticks. */
export const fmtDayLong = (ms: number, lang: Lang) => DAY_MONTH_LONG[lang].format(ms);
/**
 * A span of Colombian days, each given by the instant it begins, for running prose: "entre el 4 y el 8 de
 * septiembre" and "from 4 to 8 September" within a month, both months across one, "el 4 de septiembre"
 * for a single day. The month is said once where both ends share it; said twice it read as a repeat.
 */
export function fmtDaysSpan(from: number, to: number, lang: Lang): string {
  if (fmtIsoDay(from) === fmtIsoDay(to))
    return lang === "es" ? `el ${fmtDayLong(from, lang)}` : `on ${fmtDayLong(from, lang)}`;
  const start = sameMonth(from, to) ? DAY_OF_MONTH.format(from) : fmtDayLong(from, lang);
  return lang === "es" ? `entre el ${start} y el ${fmtDayLong(to, lang)}` : `from ${start} to ${fmtDayLong(to, lang)}`;
}
/** The same with its year, for a day in another year: "23 de noviembre de 1979", "23 November 1979". */
export const fmtDateLong = (ms: number, lang: Lang) => DATE_LONG[lang].format(ms);
/** Axis tick on a range of a few days, where a date alone repeats: "18 sept, 14:00" */
export const fmtDayTime = (ms: number, lang: Lang) => DAY_MONTH_TIME[lang].format(ms);
const TIME = formatters({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/**
 * An earlier instant for a sentence ("desde las 12:35"): its time, and its day ("18 sept") only
 * when that was not the same Colombian day as `now`.
 */
export const fmtClock = (ms: number, lang: Lang, now = Date.now()) => ({
  time: TIME[lang].format(ms),
  day: Math.floor((ms + TZ_OFFSET_MS) / DAY) === Math.floor((now + TZ_OFFSET_MS) / DAY) ? null : fmtDay(ms, lang),
});
/** Sortable "2026-09-18 17:43" for the table, in Colombian time. */
export const fmtIsoDateTime = (iso: string) =>
  new Date(Date.parse(iso) + TZ_OFFSET_MS).toISOString().slice(0, 16).replace("T", " ");
/** The same instant as the catalogue and the CSV give it: "2026-09-18 22:43 UTC". */
export const fmtUtc = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
/** The instant (ms) at which the Colombian calendar day containing `iso` begins. */
export const dayStart = (iso: string) => Math.floor((Date.parse(iso) + TZ_OFFSET_MS) / DAY) * DAY - TZ_OFFSET_MS;
/**
 * First and last second of a Colombian calendar day given as "YYYY-MM-DD". Whole seconds with no
 * millisecond part, the same shape as event times, so the strings compare correctly against them.
 */
export const dayBounds = (date: string): [string, string] => {
  const start = Date.parse(`${date}T00:00:00Z`) - TZ_OFFSET_MS;
  const iso = (ms: number) => `${new Date(ms).toISOString().slice(0, 19)}Z`;
  return [iso(start), iso(start + DAY - 1000)];
};

/**
 * The one user-facing string outside `i18n.tsx`. This module is runtime-neutral — the Node test
 * project imports it, and it has neither the "@" alias nor JSX — so it cannot reach the dictionary.
 * `Record<Lang, string>` keeps both languages required, which is what the rule is for.
 */
const UNDER_A_MINUTE: Record<Lang, string> = { es: "hace menos de un minuto", en: "less than a minute ago" };

/**
 * "hace 3 minutos": whole minutes, then whole hours, then whole days.
 *
 * Nothing here is ever shown in seconds, and no unit runs past the next one up. "hace 66 segundos"
 * asks the reader to do arithmetic to learn it means about a minute, and `useNow` only ticks every
 * 30 s, so the seconds were stale as often as not; "hace 86 minutos" was the same mistake an hour
 * later. Inside a minute the page says so in words instead of naming a number it cannot stand
 * behind — which also covers the small negative a device clock running fast produces, where the
 * old ladder read "dentro de 5 segundos".
 *
 * Days are numeric ("hace 1 día", never "ayer"): elapsed hours do not say which calendar day an
 * event fell on, and every one of these sits beside its exact date anyway.
 */
export function relativeTime(iso: string, lang: Lang, now = Date.now()): string {
  const s = (Date.parse(iso) - now) / 1000;
  if (Math.abs(s) < 60) return UNDER_A_MINUTE[lang];
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "always" });
  // Each unit is re-derived from the seconds rather than carried over, so a value that rounds up
  // into the next unit (59.7 minutes) is stated in that unit ("hace 1 hora"), never as its 60.
  const minutes = Math.round(s / 60);
  if (Math.abs(minutes) < 60) return rtf.format(minutes, "minute");
  const hours = Math.round(s / 3600);
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  return rtf.format(Math.round(s / 86_400), "day");
}

const NARROW: Record<Lang, Intl.RelativeTimeFormat> = {
  es: new Intl.RelativeTimeFormat("es", { numeric: "always", style: "narrow" }),
  en: new Intl.RelativeTimeFormat("en", { numeric: "always", style: "narrow" }),
};

/**
 * `relativeTime` for a figure with little room: "hace 7 min", "hace ~2 h", "hace ~3 d" ("7m ago",
 * "~2h ago"). The same ladder, in the units' own short forms from `Intl`, so no new copy lives here.
 * Hours and days carry a "~": rounded to a whole unit they hide up to half an hour or half a day,
 * which minutes do not. Under a minute is "hace <1 min", built from the formatter's own "1 min".
 * No-break spaces throughout: it is a figure in a half-width column, and never breaks.
 */
export function relativeTimeShort(iso: string, lang: Lang, now = Date.now()): string {
  const s = (Date.parse(iso) - now) / 1000;
  const fmt = (value: number, unit: Intl.RelativeTimeFormatUnit, mark: string) =>
    NARROW[lang]
      .formatToParts(value, unit)
      .map((p) => (p.type === "integer" ? `${mark}${p.value}` : p.value))
      .join("")
      .replaceAll(" ", "\u00A0");
  if (Math.abs(s) < 60) return fmt(-1, "minute", "<");
  const minutes = Math.round(s / 60);
  if (Math.abs(minutes) < 60) return fmt(minutes, "minute", "");
  const hours = Math.round(s / 3600);
  if (Math.abs(hours) < 24) return fmt(hours, "hour", "~");
  return fmt(Math.round(s / 86_400), "day", "~");
}

/** Fixed decimals with a true minus sign (U+2212), which aligns with the digits. */
export const fmtNum = (v: number, d: number) => v.toFixed(d).replace("-", "−");
