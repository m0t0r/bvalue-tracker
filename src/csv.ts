import type { SeismicEvent } from "./types.ts";

const COLUMNS = [
  "id", "time", "lat", "lon", "depthKm", "mag", "magType", "phases", "rmsS", "gapDeg",
  "errLatKm", "errLonKm", "errDepthKm", "region", "status", "solutionStamp",
] as const satisfies readonly (keyof SeismicEvent)[];

const NUMERIC = new Set<string>([
  "lat", "lon", "depthKm", "mag", "phases", "rmsS", "gapDeg", "errLatKm", "errLonKm", "errDepthKm",
]);

function quote(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(events: readonly SeismicEvent[]): string {
  const lines = [COLUMNS.join(",")];
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

/** Reads back what toCsv wrote (fields never contain newlines). */
export function fromCsv(csv: string): SeismicEvent[] {
  const [header, ...rows] = csv.split(/\r?\n/).filter((l) => l !== "");
  if (!header) return [];
  const cols = splitLine(header);
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
