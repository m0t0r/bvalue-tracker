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
const DATE_TIME = formatters({ day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const DATE = formatters({ day: "numeric", month: "short", year: "numeric" });
const DAY_MONTH = formatters({ day: "numeric", month: "short" });

/** "18 sept 2026, 17:43", Colombian time. The caller adds the zone label (`t.tz`). */
export const fmtDateTime = (iso: string, lang: Lang) => DATE_TIME[lang].format(new Date(iso));
/** "18 sept 2026" */
export const fmtDate = (ms: number, lang: Lang) => DATE[lang].format(ms);
/** Axis tick: "18 sept" */
export const fmtDay = (ms: number, lang: Lang) => DAY_MONTH[lang].format(ms);
/** Sortable "2026-09-18 17:43" for the table, in Colombian time. */
export const fmtIsoDateTime = (iso: string) => new Date(Date.parse(iso) + TZ_OFFSET_MS).toISOString().slice(0, 16).replace("T", " ");
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

export function relativeTime(iso: string, lang: Lang, now = Date.now()): string {
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  const s = Math.round((Date.parse(iso) - now) / 1000);
  if (Math.abs(s) < 90) return rtf.format(Math.round(s), "second");
  if (Math.abs(s) < 5400) return rtf.format(Math.round(s / 60), "minute");
  if (Math.abs(s) < 129_600) return rtf.format(Math.round(s / 3600), "hour");
  return rtf.format(Math.round(s / 86_400), "day");
}

/** Fixed decimals with a true minus sign (U+2212), which aligns with the digits. */
export const fmtNum = (v: number, d: number) => v.toFixed(d).replace("-", "−");
