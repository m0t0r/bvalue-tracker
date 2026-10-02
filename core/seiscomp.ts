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
  "fecha-hora",
  "lat",
  "long",
  "prof",
  "mag",
  "tipo",
  "fases",
  "rms",
  "gap",
  "error lat",
  "error long",
  "error prof",
  "region",
  "quakeml",
  "fases",
  "mapa",
  "estado",
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

  const parser = new Parser(
    {
      onopentag(name, attrs) {
        if (name === "table" && attrs.id === "example") {
          inTable = true;
          out.found = true;
          return;
        }
        if (!inTable) return;
        if (name === "thead" || name === "tbody") section = name;
        else if (name === "tfoot") section = "other";
        else if (name === "th" && section === "thead") {
          flushHeader();
          header = "";
        } else if (name === "tr" && section === "tbody") {
          out.rows.push([]);
          cell = null;
        } else if (name === "td" && section === "tbody") {
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
        if (name === "thead") {
          flushHeader();
          section = "other";
        } else if (name === "table") inTable = false;
      },
    },
    { decodeEntities: true },
  );
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
      events.push(
        admitEvent({
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
        }),
      );
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
    throw new Error(
      `parsed ${events.length} rows (+${skippedRows.length} skipped) but server reported ${reportedTotal}`,
    );
  }

  // SGC occasionally emits one event twice (seen on large queries). Keep one row
  // per id, preferring the most recently stamped solution if the copies differ.
  const byId = new Map<string, SeismicEvent>();
  for (const e of events) {
    const prev = byId.get(e.id);
    if (!prev || (e.solutionStamp ?? "") > (prev.solutionStamp ?? "")) byId.set(e.id, e);
  }

  return {
    reportedTotal,
    duplicatesDropped: events.length - byId.size,
    skippedRows,
    events: [...byId.values()],
    // Only what this function can honestly know: it was handed a string, so there was no
    // network. fetchCatalog fills the other three in.
    cost: { chars: html.length, bytes: null, fetchMs: null, attempts: null },
  };
}

export interface FetchOptions {
  timeoutMs?: number;
  retries?: number;
  /** Base delay for exponential backoff between retries. */
  backoffMs?: number;
  /**
   * The most of a response body that will be read, in bytes. Past it the read is abandoned and
   * the fetch fails with `SgcResponseTooLarge`. None by default: the CLI is run by a person who
   * may ask for all of Colombia (~10 MB). The Worker sets one (`SGC_MAX_BYTES` in worker/ingest.ts).
   */
  maxBytes?: number;
}

/**
 * A response bigger than `maxBytes`. Not retried: the same request would bring the same page back.
 * The message is what `ingest failed` and the run's `error` say.
 */
export class SgcResponseTooLarge extends Error {
  constructor(
    readonly maxBytes: number,
    /** The Content-Length SGC declared, when that alone was over the cap and nothing was read. */
    readonly declaredBytes: number | null,
  ) {
    super(
      declaredBytes === null
        ? `SGC response passed the ${maxBytes}-byte cap; abandoned unread past it`
        : `SGC response declared ${declaredBytes} bytes, over the ${maxBytes}-byte cap; not read`,
    );
    this.name = "SgcResponseTooLarge";
  }
}

interface BodyRead {
  text: string;
  bytes: number;
  /** The body went past the limit, and the read stopped there; `text` is what came before. */
  overran: boolean;
}

/**
 * Reads a body as UTF-8 text, as `Response.text()` does, but stops once more than `maxBytes` have
 * arrived and cancels the rest, so a response is never held whole before being judged too big.
 * The bytes are counted off the stream's own chunks, which costs nothing: counting them from the
 * decoded string would mean encoding the whole page a second time on a 10 ms CPU budget.
 */
async function readBody(res: Response, maxBytes: number): Promise<BodyRead> {
  if (res.body === null) return { text: "", bytes: 0, overran: false };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const parts: string[] = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    parts.push(decoder.decode(value, { stream: true }));
    if (bytes > maxBytes) {
      // Abandons the rest of the body and the connection, rather than letting it drain. Not awaited:
      // a cancel can wait on the other end, and nothing here needs it to have finished.
      reader.cancel().catch(() => {});
      return { text: parts.join(""), bytes, overran: true };
    }
  }
  parts.push(decoder.decode());
  return { text: parts.join(""), bytes, overran: false };
}

/** The catalogue page, whole, or `SgcResponseTooLarge`. */
async function readCatalogBody(res: Response, maxBytes: number): Promise<{ html: string; bytes: number }> {
  // A declared length over the cap is refused before a byte is read. When the body is compressed
  // the header counts the compressed bytes, which are fewer than the page's, so it never refuses
  // a page the cap would have let through.
  const declared = res.headers.has("content-length") ? Number(res.headers.get("content-length")) : NaN;
  if (declared > maxBytes) {
    res.body?.cancel().catch(() => {});
    throw new SgcResponseTooLarge(maxBytes, declared);
  }
  const { text, bytes, overran } = await readBody(res, maxBytes);
  if (overran) throw new SgcResponseTooLarge(maxBytes, null);
  return { html: text, bytes };
}

/**
 * Who wrote a refusal. A status alone cannot say: from 2026-09-20 the Worker got 410 Gone
 * while the same request from GitHub's runners got 200, and for hours nobody could tell a
 * web-server rule from a firewall appliance from a block page, because the response was
 * thrown away. `server`, `via` and the first lines of the body are what tell them apart.
 */
export interface RefusalEvidence {
  headers: Record<string, string>;
  body: string;
}

const EVIDENCE_HEADERS = 24;
const EVIDENCE_HEADER_CHARS = 200;
const EVIDENCE_BODY_CHARS = 600;
/** How much of a refusal's body is read to find those 600 characters, whitespace and all. */
const EVIDENCE_BODY_BYTES = 16 * 1024;

/** Bounded here, not by the logger: its cut is one level deep and this is a nested object. */
async function refusalEvidence(res: Response): Promise<RefusalEvidence> {
  const headers: Record<string, string> = {};
  for (const [k, v] of res.headers) {
    if (Object.keys(headers).length >= EVIDENCE_HEADERS) break;
    // A cookie is theirs to give to a browser, not ours to keep in a log.
    if (k !== "set-cookie") headers[k] = v.slice(0, EVIDENCE_HEADER_CHARS);
  }
  // The body is a courtesy: a refusal whose body cannot be read is still a refusal.
  // Read only as far as the evidence needs: a refusal is not a reason to hold a large body.
  const body = await readBody(res, EVIDENCE_BODY_BYTES).then(
    ({ text }) => text.replace(/\s+/g, " ").trim().slice(0, EVIDENCE_BODY_CHARS),
    () => "",
  );
  return { headers, body };
}

/** A non-OK HTTP response from SGC. `status` is what the ingest back-off reads. */
export class SgcHttpError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfterS: number | null,
    readonly evidence: RefusalEvidence | null = null,
  ) {
    super(`SGC responded HTTP ${status}`);
    this.name = "SgcHttpError";
  }
}

/**
 * Whether asking again can plausibly get a different answer. The retry loop is there for a
 * flaky connection, and a status line is not one — SGC answered.
 *
 * 429 and 503 are SGC asking us to stop, and retrying is the one thing that makes being rate
 * limited worse. Every other 4xx is a deterministic answer about the request itself — 410
 * Gone, which production saw for the first time on 2026-09-20 — so a second identical request
 * can only get the same answer and cost the server another one. A 5xx other than 503 can be a
 * bad moment on their side and keeps the one retry.
 */
export function retryableStatus(status: number): boolean {
  return status >= 500 && status !== 503;
}

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
  const { timeoutMs = 120_000, retries = 3, backoffMs = 1000, maxBytes = Infinity } = opts;
  // Only transport/HTTP failures are retried; a parse failure is deterministic.
  let lastErr: unknown;
  let html: string | undefined;
  let bytes = 0;
  // Every attempt, and the back-off between them, counts: what we want to know from a slow
  // run is how long SGC held us, not how long the last try took. The clock only advances
  // across I/O in workerd, and every await below is I/O, so this span is real there.
  const startedAt = Date.now();
  let attempts = 0;
  for (let attempt = 0; attempt <= retries && html === undefined; attempt++) {
    attempts = attempt + 1;
    if (attempt > 0) await new Promise((r) => setTimeout(r, backoffMs * 2 ** (attempt - 1)));
    try {
      const res = await fetch(SEISCOMP_ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "user-agent": "sgc-swarm-research/0.1 (academic b-value study)",
        },
        body: buildFormBody(q).toString(),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        throw new SgcHttpError(res.status, parseRetryAfter(res.headers.get("retry-after")), await refusalEvidence(res));
      }
      ({ html, bytes } = await readCatalogBody(res, maxBytes));
    } catch (err) {
      // An answer we would only get again is not worth a second request: stop here. A page past
      // the cap is one of those; asking again would only make SGC send it twice.
      if (err instanceof SgcHttpError && !retryableStatus(err.status)) throw err;
      if (err instanceof SgcResponseTooLarge) throw err;
      lastErr = err;
    }
  }
  if (html !== undefined) {
    const page = parseCatalogHtml(html);
    return { ...page, cost: { ...page.cost, bytes, fetchMs: Date.now() - startedAt, attempts } };
  }
  throw new Error(`SGC catalogue fetch failed after ${retries + 1} attempts`, { cause: lastErr });
}
