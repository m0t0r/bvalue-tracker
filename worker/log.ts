/**
 * One module owns what the Worker says about itself.
 *
 * Everything here exists to make Workers Logs able to *answer questions*, not just to
 * print. Two production faults were invisible for hours each (docs/ingest.md, "Concurrency and
 * failure lessons") and neither would have survived one query against a structured log:
 * every tick taking the fast lane for a day, and 112 invocations killed mid-ingest. The
 * fields below are chosen so those two questions are a group-by, not a reading exercise.
 *
 * The rules, each of which is load-bearing:
 *
 * - **One line is one JSON object, passed to console as an object.** Workers Logs extracts
 *   and indexes the fields of a single object argument and nothing else. Two arguments
 *   become an array, and a pre-stringified line becomes one opaque string you can only
 *   grep. Measured here: pino's Node build reaches workerd through a `process.stdout`
 *   shim and arrives as the *string* `stdout: {"level":50,…}`, so none of its fields are
 *   queryable — which is why this file exists instead of a dependency.
 * - **`level` is a word, not pino's number.** The dashboard groups by the literal value,
 *   and `level = "error"` reads as itself where `50` needs a lookup table.
 * - **The console method matches the level**, so the dashboard's own level filter and our
 *   `level` field always agree.
 * - **No `pid` or `hostname`.** There is no process and no host; they are noise from a
 *   Node logger's defaults, and every field costs budget (see below).
 * - **An `Error` anywhere in the fields is flattened here**, not at the call site.
 *   `JSON.stringify(new Error())` is `{}`, so an un-flattened error is a log line that
 *   says nothing at exactly the moment it matters. Doing it in the one place means no
 *   caller can forget — the same reasoning as `admitEvent` in core/admit.ts.
 *
 * **The budget.** Workers Logs on the free plan keeps 3 days and accepts 200,000 events
 * per day, and an invocation log already costs one of those per request. 288 cron ticks a
 * day emit 3–5 lines each; the page's own polling is a few thousand invocations a day with
 * one tab open. That is low thousands against 200,000, and it stays there only because the
 * read routes log *nothing* per request: their status and CPU time are in the invocation
 * log Cloudflare writes for free. Do not add a per-request line to /api/events.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(fields: LogFields, msg: string): void;
  info(fields: LogFields, msg: string): void;
  warn(fields: LogFields, msg: string): void;
  error(fields: LogFields, msg: string): void;
  /** A logger that carries these fields on every line it writes. */
  child(bindings: LogFields): Logger;
}

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/**
 * A single log is capped at 256 KB by Workers Logs, and one over the cap is truncated and
 * flagged rather than dropped — but a truncated line is one you cannot query. SGC's own
 * responses are ~0.8 MB of HTML and an error message can quote them, so every string is
 * cut here rather than trusted to be small. 1 KB is far more than any field we write and
 * far less than anything that could truncate a line.
 */
const MAX_STRING = 1024;

const cut = (s: string) => (s.length <= MAX_STRING ? s : `${s.slice(0, MAX_STRING)}…`);

/**
 * What an Error is worth in a log line. `cause` is followed one level because that is
 * where core/seiscomp.ts puts the HTTP status behind "failed after N attempts", and it is
 * the field that says whether SGC refused us or the connection died.
 */
export function errorFields(err: unknown): LogFields {
  if (!(err instanceof Error)) return { message: cut(String(err)) };
  return {
    name: err.name,
    message: cut(err.message),
    ...(err.stack === undefined ? {} : { stack: cut(err.stack) }),
    ...(err.cause === undefined || err.cause === null ? {} : { cause: cut(String(err.cause)) }),
  };
}

/** One shallow pass: flatten any Error, cut any long string, leave everything else alone. */
function clean(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v instanceof Error) out[k] = errorFields(v);
    else if (typeof v === "string") out[k] = cut(v);
    else out[k] = v;
  }
  return out;
}

const METHOD: Record<LogLevel, "debug" | "info" | "warn" | "error"> = {
  debug: "debug", info: "info", warn: "warn", error: "error",
};

/** Anything that is not a level we know is treated as `info`, never as "log nothing". */
export const asLevel = (v: unknown): LogLevel =>
  v === "debug" || v === "info" || v === "warn" || v === "error" ? v : "info";

function make(bindings: LogFields, min: LogLevel): Logger {
  const at = (level: LogLevel) => (fields: LogFields, msg: string) => {
    if (ORDER[level] < ORDER[min]) return;
    console[METHOD[level]]({
      level,
      // ISO, like every other instant this project stores or sends. A millisecond number
      // would be one more thing to convert by hand while reading an incident back.
      time: new Date().toISOString(),
      msg,
      ...clean(bindings),
      ...clean(fields),
    });
  };
  return {
    debug: at("debug"),
    info: at("info"),
    warn: at("warn"),
    error: at("error"),
    child: (extra) => make({ ...bindings, ...extra }, min),
  };
}

/**
 * The root logger for one invocation. `min` comes from the LOG_LEVEL var in
 * wrangler.jsonc, so turning `debug` on for an investigation is a one-line deploy rather
 * than a code change — and turning it back off cannot be forgotten in a call site.
 */
export const logger = (bindings: LogFields = {}, min: LogLevel = "info"): Logger => make(bindings, min);

/** A logger that writes nothing. For callers that have no invocation to hang a log off. */
export const silentLogger: Logger = {
  debug: () => {}, info: () => {}, warn: () => {}, error: () => {},
  child: () => silentLogger,
};
