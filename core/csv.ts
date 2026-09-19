import type { BWindow } from "./gr.ts";
import type { SeismicEvent } from "./types.ts";

const COLUMNS = [
  "id", "time", "lat", "lon", "depthKm", "mag", "magType", "phases", "rmsS", "gapDeg",
  "errLatKm", "errLonKm", "errDepthKm", "region", "status", "solutionStamp",
] as const satisfies readonly (keyof SeismicEvent)[];

/** Header language. "en" is the stable machine form; "es" is for a reader, never the default. */
export type CsvLang = "en" | "es";

// Short snake_case without accents, so the translated names still work as column names in code.
const COLUMNS_ES: Record<(typeof COLUMNS)[number], string> = {
  id: "id", time: "hora_utc", lat: "lat", lon: "lon", depthKm: "profundidad_km", mag: "magnitud",
  magType: "tipo_magnitud", phases: "fases", rmsS: "rms_s", gapDeg: "gap_grados",
  errLatKm: "err_lat_km", errLonKm: "err_lon_km", errDepthKm: "err_prof_km", region: "region",
  status: "estado", solutionStamp: "sello_solucion",
};
const FROM_ES = new Map<string, string>(Object.entries(COLUMNS_ES).map(([k, v]) => [v, k]));

const WINDOW_COLUMNS: Record<CsvLang, string> = {
  en: "from,to,n,mc,b,sigmaB,a,meanMag",
  es: "desde,hasta,n,mc,b,sigma_b,a,magnitud_media",
};

const NUMERIC = new Set<string>([
  "lat", "lon", "depthKm", "mag", "phases", "rmsS", "gapDeg", "errLatKm", "errLonKm", "errDepthKm",
]);

function quote(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Only the header row depends on `lang`; the values are identical in both. */
export function toCsv(events: readonly SeismicEvent[], lang: CsvLang = "en"): string {
  const lines = [(lang === "es" ? COLUMNS.map((c) => COLUMNS_ES[c]) : COLUMNS).join(",")];
  for (const e of events) lines.push(COLUMNS.map((c) => quote(e[c])).join(","));
  return lines.join("\n") + "\n";
}

function splitLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Reads back what toCsv wrote, in either header language (fields never contain newlines). */
export function fromCsv(csv: string): SeismicEvent[] {
  const [header, ...rows] = csv.split(/\r?\n/).filter((l) => l !== "");
  if (!header) return [];
  const cols = splitLine(header).map((c) => FROM_ES.get(c) ?? c);
  return rows.map((row) => {
    const cells = splitLine(row);
    const rec: Record<string, unknown> = {};
    cols.forEach((c, i) => {
      const v = cells[i] ?? "";
      rec[c] = NUMERIC.has(c) ? (v === "" ? null : Number(v)) : c === "solutionStamp" && v === "" ? null : v;
    });
    return rec as unknown as SeismicEvent;
  });
}

/** b over time, one row per window. `n` is the window size; `from`/`to` are its first and last event. */
export function windowsToCsv(windows: readonly BWindow[], lang: CsvLang = "en"): string {
  const lines = [WINDOW_COLUMNS[lang]];
  for (const w of windows) {
    lines.push([w.from, w.to, w.n, w.mc.toFixed(1), w.b.toFixed(4), w.sigmaB.toFixed(4), w.a.toFixed(4), w.meanMag.toFixed(4)].map(quote).join(","));
  }
  return lines.join("\n") + "\n";
}
