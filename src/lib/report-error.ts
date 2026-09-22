/**
 * What broke in the reader's browser, told to the Worker.
 *
 * The page was the one part of this system with no record of its own failures. A MapLibre
 * worker that never loads, a Recharts crash, a hashed chunk that 404s after a deploy — all
 * of those leave the reader looking at a broken page and leave us with nothing to read.
 * Nobody is watching this page's console: it is one researcher's tab.
 *
 * Deliberately small, and deliberately not a third-party SDK. It posts to our own Worker,
 * same-origin, which is the only kind of request `/api/*` accepts at all; there is no
 * script from anyone else, nothing to add to the CSP, and no cookie or identifier. The
 * Worker writes a log line and stores nothing.
 */

/** A broken page tends to break repeatedly. One report per distinct message, and a hard cap. */
const MAX_REPORTS = 5;

const seen = new Set<string>();
/**
 * Set only while a report is being *sent*, which is the one window in which reporting can
 * re-enter itself: anything thrown on the way out reaches the same listener that called us.
 * It is cleared as soon as the request is away, not when it comes back — holding it for the
 * round trip would silently drop a second, different error that happened in the same tick,
 * and two errors at once is what a broken render looks like.
 */
let sending = false;

export interface ErrorReport {
  message: string;
  stack?: string;
  /** Which hook caught it, so a rejection is not mistaken for a render crash. */
  source: "error" | "unhandledrejection";
}

export function reportError(report: ErrorReport): void {
  if (sending || seen.size >= MAX_REPORTS || seen.has(report.message)) return;
  seen.add(report.message);
  sending = true;
  try {
    void fetch("/api/client-error", {
      method: "POST",
      headers: { "content-type": "application/json" },
      // The Worker caps the body it will read at 4 KB, so every field is cut here rather
      // than have the whole report refused for the sake of one long one. The URL needs it
      // as much as the stack does: the page keeps no state there, so anything in the query
      // string arrived from outside — a link carrying campaign parameters is enough — and
      // uncapped it would 413 every report from that tab, for a reader whose page is
      // already broken.
      body: JSON.stringify({
        message: report.message.slice(0, 500),
        stack: report.stack?.slice(0, 2000),
        source: report.source,
        path: (location.pathname + location.search).slice(0, 200),
      }),
      // The page may be unloading — a failed chunk load often ends in a reload.
      keepalive: true,
    })
      // Nothing to do about a failed report, and an unhandled rejection here would be
      // caught by the very listener below — which is the loop this whole guard exists for.
      .catch(() => {});
  } finally {
    sending = false;
  }
}

const message = (v: unknown): string => (v instanceof Error ? `${v.name}: ${v.message}` : String(v));

/**
 * React 19 rethrows an uncaught render error so that it reaches `window`'s error event,
 * so these two listeners cover render crashes as well as ordinary ones. An error boundary
 * would additionally let us draw something for the reader, which is a separate question
 * from recording it and is not what this file is for.
 */
export function installErrorReporting(): void {
  window.addEventListener("error", (e) => {
    reportError({
      message: e.message || message(e.error),
      stack: e.error instanceof Error ? e.error.stack : undefined,
      source: "error",
    });
  });
  window.addEventListener("unhandledrejection", (e) => {
    reportError({
      message: message(e.reason),
      stack: e.reason instanceof Error ? e.reason.stack : undefined,
      source: "unhandledrejection",
    });
  });
}
