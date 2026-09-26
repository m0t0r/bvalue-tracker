/**
 * The API requests each page makes as soon as it runs, and the `<link rel="preload">` tags that
 * start them before it does. Without them a page could not ask for its data until its script had
 * downloaded and run, so every figure waited on the bundle and then on the API, one after the
 * other; preloaded, the two downloads overlap (docs/performance.md). `src/lib/api.ts` builds its
 * URLs from the same functions, which is what makes the browser hand the page the preloaded
 * response: it is matched by URL, and a URL that drifted by one character would be fetched twice.
 *
 * Plain TypeScript with no DOM, because vite.config.ts runs it in Node at build time.
 */
import type { ZoneId } from "./zones.ts";

export const eventsPath = (zone: ZoneId): string => `/api/events?zone=${zone}`;
export const statusPath = (zone: ZoneId): string => `/api/status?zone=${zone}`;
export const contextPath = (zone: ZoneId): string => `/api/context?zone=${zone}`;

/** The monitor's first requests for one zone: its catalogue and its status (`ZonePage` in `App.tsx`). */
export const monitorLoad = (zone: ZoneId): string[] => [eventsPath(zone), statusPath(zone)];

/**
 * `/insights` reads both catalogues, both statuses and Chocó's USGS context on load
 * (`src/insights/use-insights.ts`). A request added there without its path here still works, it
 * just is not preloaded; one removed there must go from here too, or the browser downloads it for
 * nothing and warns in the console that a preload went unused.
 */
export const INSIGHTS_LOAD: string[] = [
  eventsPath("choco"),
  eventsPath("tolima"),
  statusPath("choco"),
  statusPath("tolima"),
  contextPath("choco"),
];

/**
 * One tag per path. `as="fetch"` with `crossorigin` is what `fetch()` sends by default for a
 * same-origin URL (CORS mode, same-origin credentials); a preload that differs in either is kept
 * apart from the page's request and downloaded twice. It carries `Sec-Fetch-Site: same-origin`
 * like any request the page makes, so the Worker's same-origin check answers it (docs/api.md).
 */
export const preloadTags = (paths: readonly string[]): string =>
  paths.map((p) => `<link rel="preload" href="${p}" as="fetch" crossorigin media="${PRELOAD_MEDIA}">`).join("\n    ");

/**
 * Wide screens only, where there is bandwidth to spare and the largest paint waits on the data. On a
 * phone the monitor's largest paint is the header, which waits on the scripts alone, and a catalogue
 * preloaded beside them took the connection those scripts needed: with real throttling on a slow
 * phone the first paint came 1.0 s later on both zones and 2.2 s later on /insights, and
 * `fetchpriority="low"` did not help (docs/performance.md). `lg`, where "Valor b en el tiempo" moves
 * up beside the b-value and is on screen at load.
 */
export const PRELOAD_MEDIA = "(min-width: 1024px)";

/**
 * `html` with the preloads for `from` replaced by those for `to`: how the build turns the home zone's
 * finished page into another zone's (`zonePages` in vite.config.ts). The tags must be found exactly
 * once, so a page that would have preloaded the wrong zone's catalogue fails the build instead.
 */
export function swapPreloads(html: string, from: readonly string[], to: readonly string[]): string {
  const tags = preloadTags(from);
  const found = html.split(tags).length - 1;
  if (found !== 1) throw new Error(`expected the page's data preloads once, found ${found}`);
  return html.replace(tags, preloadTags(to));
}
