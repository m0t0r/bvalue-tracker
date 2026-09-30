/**
 * What `scripts/fixture-server.ts` answers, apart from the sockets and the files, so a test can hold
 * it: which API requests are captured, what each request gets back, and which file a path is.
 */
import { contextPath, eventsPath, statusPath } from "../core/page-data.ts";
import { ZONE_IDS } from "../core/zones.ts";

/**
 * Every `GET` the two pages make: each zone's catalogue, status and USGS context, and the 3D tab's
 * sea. All are read from the database and none can reach SGC (`POST /api/refresh` is the one route
 * that does, and it is never sent).
 */
export const CAPTURED: readonly string[] = [
  ...ZONE_IDS.flatMap((zone) => [eventsPath(zone), statusPath(zone), contextPath(zone)]),
  "/api/sea",
];

/** Captured answers, by path and query exactly as the page asks (`/api/events?zone=tolima`). */
export type Fixtures = Readonly<Record<string, unknown>>;

export interface Answer {
  status: number;
  /** JSON to send; null with 204 is no body at all. */
  body: unknown;
}

/**
 * How long the stood-down refresh says to wait: a zone's own throttle (15 min). Over the page's
 * `LONG_WAIT_S`, so its back-fill loop stops at the first answer instead of asking 40 times.
 */
const RETRY_AFTER_S = 900;

/**
 * The answer to a request under `/api/`. A captured `GET` gets its body. A refresh gets what the
 * Worker answers when it stands down: the zone's status with `refreshed: false`, since nothing here
 * can query SGC. A request with no fixture is a 404 that names it, never another request's answer.
 */
export function apiAnswer(method: string, url: string, fixtures: Fixtures): Answer {
  const { pathname, searchParams } = new URL(url, "http://localhost");
  if (method === "GET" && Object.hasOwn(fixtures, url)) return { status: 200, body: fixtures[url] };
  if (method === "POST" && pathname === "/api/client-error") return { status: 204, body: null };
  if (method === "POST" && pathname === "/api/refresh") {
    const key = `/api/status?zone=${searchParams.get("zone")}`;
    if (Object.hasOwn(fixtures, key)) {
      return { status: 200, body: { ...(fixtures[key] as object), refreshed: false, retryAfterS: RETRY_AFTER_S } };
    }
  }
  return { status: 404, body: { error: `fixture-server: no fixture for ${method} ${url}` } };
}

/**
 * The file a path is served from, relative to the build's directory, or null. A page answers at its
 * clean path (`/insights` is `insights.html`), as Cloudflare's asset layer serves it; a path with no
 * file is a 404, as in production (`not_found_handling: "none"`). Nothing outside the directory: a
 * path with `..`, a backslash or a NUL in it, encoded or not, is refused.
 */
export function staticFile(pathname: string, has: (file: string) => boolean): string | null {
  let path: string;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (path.includes("\0") || path.includes("\\") || path.split("/").includes("..")) return null;
  const file = path.replace(/^\/+|\/+$/g, "");
  if (file === "") return has("index.html") ? "index.html" : null;
  if (has(file)) return file;
  return !/\.[^/]+$/.test(file) && has(`${file}.html`) ? `${file}.html` : null;
}

/** `public/_headers`' rule for hashed assets; everything else is asked for again each time. */
export const cacheControl = (file: string): string =>
  file.startsWith("assets/") ? "public, max-age=31536000, immutable" : "no-cache";

const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  webp: "image/webp",
  png: "image/png",
  ico: "image/x-icon",
  woff2: "font/woff2",
  txt: "text/plain; charset=utf-8",
  gz: "application/gzip",
};

export const contentType = (file: string): string =>
  file === "speculation-rules.json"
    ? "application/speculationrules+json"
    : (TYPES[file.slice(file.lastIndexOf(".") + 1)] ?? "application/octet-stream");

/** Text compresses; images, fonts and the gzip file already are. */
export const compressible = (file: string): boolean => /\.(html|js|css|json|svg|txt)$/.test(file);
