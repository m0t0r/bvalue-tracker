import { Parser } from "htmlparser2";
import { admitEvent } from "./admit.ts";
import type { BBox, CatalogPage, CatalogQuery, SeismicEvent } from "./types.ts";

export const SEISCOMP_ENDPOINT =
  "https://bdrsnc.sgc.gov.co/paginas1/catalogo/Consulta_Experta_Seiscomp/consulta_sismo.php";

/** Sipí – Istmina – Medio San Juan – Litoral del San Juan, plus San José del Palmar. */
export const CHOCO_SWARM_BBOX: BBox = { lonMin: -77.4, lonMax: -76.1, latMin: 4.1, latMax: 5.6 };

export const MAINSHOCK_DATE = new Date(Date.UTC(2026, 7, 10));
export const MAINSHOCK_ID = "SGC2026pqqmro";

const EXPECTED_HEADERS = [
  "fecha-hora", "lat", "long", "prof", "mag", "tipo", "fases", "rms", "gap",
  "error lat", "error long", "error prof", "region", "quakeml", "fases", "mapa", "estado",
];

/** The form only accepts dd/mm/yyyy; any other shape silently yields zero rows. */
export function formatFormDate(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

export function buildFormBody(q: CatalogQuery): URLSearchParams {
  return new URLSearchParams({
    inicial: formatFormDate(q.start),
    final: formatFormDate(q.end),
    ubi: "cuadrante",
    longitudStart: String(q.bbox.lonMin),
    longitudEnd: String(q.bbox.lonMax),
    latitudStart: String(q.bbox.latMin),
    latitudEnd: String(q.bbox.latMax),
    magnitudStart: String(q.magMin ?? 0),
    magnitudEnd: String(q.magMax ?? 10),
    depthStart: "0",
    depthEnd: "700",
    rmsStart: "0",
    rmsEnd: "10",
    gapStart: "0",
    gapEnd: "360",
    eprofmin: "0",
    eprofmax: "999",
    elongmin: "0",
    elongmax: "999",
    elatmin: "0",
    elatmax: "999",
    Submit: "Consultar",
  });
}

/** A link's unrounded coordinate, or null when the href does not carry a readable one. */
function num(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** "2026-08-10 12:34:27" or "2026-08-10_12:34:27" (UTC) → ISO 8601. SGC's wire form. */
function toIso(s: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})[ _](\d{2}:\d{2}:\d{2})$/.exec(s.trim());
  if (!m) throw new Error(`unrecognised timestamp ${JSON.stringify(s)}`);
  return `${m[1]}T${m[2]}Z`;
}

interface RawCell {
  text: string;
  hrefs: string[];
}

interface RawTable {
  found: boolean;
  headers: string[];
  rows: RawCell[][];
}

/**
 * Streams table#example into headers and body rows. A streaming parser is
 * required: the page never closes its <center> tags, so a DOM builder ends up
 * with a tree ~1,500 levels deep (node-html-parser does not finish on it).
 */
function readResultTable(html: string): RawTable {
  const out: RawTable = { found: false, headers: [], rows: [] };
  let inTable = false;
  let section: "thead" | "tbody" | "other" = "other";
  let cell: RawCell | null = null;
  let header: string | null = null;

  const flushHeader = () => {
    if (header !== null) out.headers.push(header.replace(/\s+/g, " ").trim().toLowerCase());
    header = null;
  };

  const parser = new Parser({
    onopentag(name, attrs) {
      if (name === "table" && attrs.id === "example") { inTable = true; out.found = true; return; }
      if (!inTable) return;
      if (name === "thead" || name === "tbody") section = name;
      else if (name === "tfoot") section = "other";
      else if (name === "th" && section === "thead") { flushHeader(); header = ""; }
      else if (name === "tr" && section === "tbody") { out.rows.push([]); cell = null; }
      else if (name === "td" && section === "tbody") {
        cell = { text: "", hrefs: [] };
        out.rows[out.rows.length - 1]?.push(cell);
      } else if (name === "a" && cell && attrs.href) cell.hrefs.push(attrs.href);
    },
    ontext(text) {
      if (!inTable) return;
      if (section === "thead" && header !== null) header += text;
      else if (cell) cell.text += text;
    },
    onclosetag(name) {
      if (!inTable) return;
      if (name === "thead") { flushHeader(); section = "other"; }
      else if (name === "table") inTable = false;
    },
  }, { decodeEntities: true });
  parser.write(html);
  parser.end();
  return out;
}

function checkHeaders(got: string[]): void {
  const ok = got.length === EXPECTED_HEADERS.length && EXPECTED_HEADERS.every((h, i) => got[i]!.startsWith(h));
  if (!ok) throw new Error(`result table layout changed; headers are now: ${JSON.stringify(got)}`);
}

/** How many of a page's rows may be unparsable before the whole response is distrusted. */
const MAX_SKIPPED_SHARE = 0.1;

/**
 * Parse the HTML returned by consulta_sismo.php.
 * Throws on anything structural: a missing marker, a missing table, a changed header
 * layout, a row count that disagrees with "Total de registros", or so many unparsable
 * rows that the response cannot be trusted at all.
 *
 * One bad row is NOT structural. It is skipped and reported in `skippedRows`, because
 * throwing for the whole page let a single malformed event block every valid event in
 * the trailing window, on every cron tick, until its date rolled out of that window.
 */
export function parseCatalogHtml(html: string): CatalogPage {
  const totalMatch = /Total de registros:(?:\s|<[^>]+>)*(\d+)/i.exec(html);
  if (!totalMatch) throw new Error('response has no "Total de registros" marker; not a result page');
  const reportedTotal = Number(totalMatch[1]);

  const table = readResultTable(html);
  if (!table.found) throw new Error("result table #example not found");
  checkHeaders(table.headers);

  const events: SeismicEvent[] = [];
  const skippedRows: { row: number; reason: string }[] = [];
  table.rows.forEach((cells, i) => {
    try {
      if (cells.length !== EXPECTED_HEADERS.length) {
        throw new Error(`expected ${EXPECTED_HEADERS.length} cells, got ${cells.length}`);
      }
      const text = cells.map((c) => c.text.replace(/\s+/g, " ").trim());
      const links = [13, 14, 15].flatMap((k) => cells[k]!.hrefs).join(" ");

      const id = /id_sismo=([A-Za-z0-9_-]+)/.exec(links)?.[1] ?? /events\/([A-Za-z0-9_-]+)/.exec(links)?.[1];
      if (!id) throw new Error("no event id in links");

      // The map link carries unrounded coordinates; the table cells are rounded to 3/2 decimals.
      const hiLat = num(/[?&]lat=(-?[\d.]+)/.exec(links)?.[1] ?? "");
      const hiLon = num(/[?&]lon=(-?[\d.]+)/.exec(links)?.[1] ?? "");
      const hiDepth = num(/[?&]pf=(-?[\d.]+)/.exec(links)?.[1] ?? "");
      const stamp = /[?&]date=(\d{4}-\d{2}-\d{2}_\d{2}:\d{2}:\d{2})/.exec(links)?.[1];

      // Whether the values are plausible is not this module's question: admitEvent bounds
      // them, for this door and the CSV one alike. Here we only read the page's shape.
      events.push(admitEvent({
        id,
        time: toIso(text[0]!),
        lat: hiLat ?? text[1],
        lon: hiLon ?? text[2],
        depthKm: hiDepth ?? text[3],
        mag: text[4],
        magType: text[5],
        phases: text[6],
        rmsS: text[7],
        gapDeg: text[8],
        errLatKm: text[9],
        errLonKm: text[10],
        errDepthKm: text[11],
        region: text[12],
        status: text[16],
        solutionStamp: stamp ? toIso(stamp) : null,
      }));
    } catch (err) {
      skippedRows.push({ row: i, reason: `row ${i}: ${(err as Error).message}` });
    }
  });

  // A handful of bad rows is upstream messiness; a majority means we are misreading the page.
  if (skippedRows.length > Math.max(3, table.rows.length * MAX_SKIPPED_SHARE)) {
    throw new Error(
      `${skippedRows.length} of ${table.rows.length} rows unparsable; refusing partial data: ${skippedRows[0]!.reason}`,
    );
  }

  if (events.length + skippedRows.length !== reportedTotal) {
    throw new Error(`parsed ${events.length} rows (+${skippedRows.length} skipped) but server reported ${reportedTotal}`);
  }

  // SGC occasionally emits one event twice (seen on large queries). Keep one row
  // per id, preferring the most recently stamped solution if the copies differ.
  const byId = new Map<string, SeismicEvent>();
  for (const e of events) {
    const prev = byId.get(e.id);
    if (!prev || (e.solutionStamp ?? "") > (prev.solutionStamp ?? "")) byId.set(e.id, e);
  }

  return { reportedTotal, duplicatesDropped: events.length - byId.size, skippedRows, events: [...byId.values()] };
}

export interface FetchOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  retries?: number;
  /** Base delay for exponential backoff between retries. */
  backoffMs?: number;
}

/** A non-OK HTTP response from SGC. `status` is what the ingest back-off reads. */
export class SgcHttpError extends Error {
  constructor(readonly status: number, readonly retryAfterS: number | null) {
    super(`SGC responded HTTP ${status}`);
    this.name = "SgcHttpError";
  }
}

/**
 * 429 and 503 are SGC asking us to stop. They are the one case where the retry loop
 * makes things worse, so they are thrown straight out and left for the caller to sit out.
 */
const NO_RETRY_STATUS = new Set([429, 503]);

/** `Retry-After` is either a seconds count or an HTTP date. Returns seconds, or null. */
export function parseRetryAfter(value: string | null | undefined, now = Date.now()): number | null {
  if (value === undefined || value === null || value.trim() === "") return null;
  const secs = Number(value.trim());
  if (Number.isFinite(secs)) return Math.max(0, Math.round(secs));
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : Math.max(0, Math.round((at - now) / 1000));
}

/**
 * The HTTP error behind a failed fetch, whether it was thrown directly (no-retry) or
 * wrapped as the `cause` of the "failed after N attempts" error.
 */
export function sgcHttpError(err: unknown): SgcHttpError | null {
  if (err instanceof SgcHttpError) return err;
  const cause = (err as { cause?: unknown } | null | undefined)?.cause;
  return cause instanceof SgcHttpError ? cause : null;
}

export async function fetchCatalog(q: CatalogQuery, opts: FetchOptions = {}): Promise<CatalogPage> {
  const { fetchImpl = fetch, timeoutMs = 120_000, retries = 3, backoffMs = 1000 } = opts;
  // Only transport/HTTP failures are retried; a parse failure is deterministic.
  let lastErr: unknown;
  let html: string | undefined;
  for (let attempt = 0; attempt <= retries && html === undefined; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, backoffMs * 2 ** (attempt - 1)));
    try {
      const res = await fetchImpl(SEISCOMP_ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "user-agent": "sgc-swarm-research/0.1 (academic b-value study)",
        },
        body: buildFormBody(q).toString(),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new SgcHttpError(res.status, parseRetryAfter(res.headers.get("retry-after")));
      html = await res.text();
    } catch (err) {
      // Being rate limited is a deterministic answer, not a flaky connection: stop here.
      if (err instanceof SgcHttpError && NO_RETRY_STATUS.has(err.status)) throw err;
      lastErr = err;
    }
  }
  if (html !== undefined) return parseCatalogHtml(html);
  throw new Error(`SGC catalogue fetch failed after ${retries + 1} attempts`, { cause: lastErr });
}
