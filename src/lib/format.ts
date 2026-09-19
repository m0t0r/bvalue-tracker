const DAY = 86_400_000;

export const fmtDateTime = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
export const fmtDay = (ms: number) => new Date(ms).toISOString().slice(5, 10);
export const dayStart = (iso: string) => Math.floor(Date.parse(iso) / DAY) * DAY;

export function relativeTime(iso: string, lang: "es" | "en", now = Date.now()): string {
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  const s = Math.round((Date.parse(iso) - now) / 1000);
  if (Math.abs(s) < 90) return rtf.format(Math.round(s), "second");
  if (Math.abs(s) < 5400) return rtf.format(Math.round(s / 60), "minute");
  if (Math.abs(s) < 129_600) return rtf.format(Math.round(s / 3600), "hour");
  return rtf.format(Math.round(s / 86_400), "day");
}

/** Fixed decimals with a true minus sign (U+2212), which aligns with the digits. */
export const fmtNum = (v: number, d: number) => v.toFixed(d).replace("-", "−");
