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
 * `media` null preloads at every width: the insights page's (issue #108).
 */
export const preloadTags = (paths: readonly string[], media: string | null = PRELOAD_MEDIA): string =>
  paths
    .map((p) => `<link rel="preload" href="${p}" as="fetch" crossorigin${media === null ? "" : ` media="${media}"`}>`)
    .join("\n    ");

/**
 * The monitor preloads its data on wide screens only, where there is bandwidth to spare and the
 * largest paint waits on the data. On a phone its largest paint is the header, which is in the HTML
 * and waits on nothing, and a catalogue preloaded beside the scripts took the connection they
 * needed: with real throttling on a slow phone the first paint came 1.0 s later on both zones, and
 * `fetchpriority="low"` did not help (docs/performance.md). `lg`, where "Valor b en el tiempo" moves
 * up beside the b-value and is on screen at load. The insights page preloads at every width: its
 * largest paint is the story's hero, which waits on the data everywhere.
 */
export const PRELOAD_MEDIA = "(min-width: 1024px)";

/** The part of a Rollup output chunk (or asset) that `chunkPreloads` reads. */
export interface BundleFile {
  type: "chunk" | "asset";
  fileName: string;
  imports?: readonly string[];
  facadeModuleId?: string | null;
}

/**
 * The chunk built from `module` and every chunk it imports statically, at any depth, less those the
 * page's own entry (the chunk built from `entry`) imports: Vite already preloads those. Dynamic imports
 * are not followed: they are other tabs' code, loaded when opened. The module's own chunk comes first.
 * How the insights page fetches the story tab's code beside its bundle rather than once the bundle has
 * run (issue #108, docs/performance.md). Throws when either module is no chunk's own, or when the
 * entry already loads all of it, so a change that moves the code fails the build instead of shipping a
 * page that preloads nothing.
 */
export function chunkPreloads(bundle: Record<string, BundleFile>, module: string, entry: string): string[] {
  const files = Object.values(bundle);
  const own = (id: string) => {
    const found = files.find((f) => f.type === "chunk" && f.facadeModuleId === id);
    if (!found) throw new Error(`chunkPreloads: no chunk is built from ${id}`);
    return found;
  };
  const closure = (from: BundleFile, seen = new Set<string>()): Set<string> => {
    if (seen.has(from.fileName)) return seen;
    seen.add(from.fileName);
    for (const name of from.imports ?? []) {
      const next = bundle[name];
      if (next) closure(next, seen);
    }
    return seen;
  };
  const preloaded = closure(own(entry));
  const needed = [...closure(own(module))].filter((name) => !preloaded.has(name));
  if (needed.length === 0) throw new Error(`chunkPreloads: ${entry} already loads everything ${module} needs`);
  return needed;
}

/** `<link rel="modulepreload">` tags written as Vite writes the ones for the page's entry. */
export const modulePreloadTags = (files: readonly string[]): string =>
  files.map((f) => `<link rel="modulepreload" crossorigin href="/${f}">`).join("\n    ");

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

/**
 * `html` with its stylesheets moved to straight before the bundle: the first module script or module
 * preload. Vite writes them last in the head, after the entry script and a dozen module preloads, and
 * on a slow connection the one file the first paint waits for then shared the line with all of them
 * (docs/performance.md has the A/B). Not before the head script: a classic script after a stylesheet
 * waits for it (`withBootScript` in vite.config.ts). A page with no stylesheet or no module script
 * throws, so a change in what Vite writes fails the build instead of shipping the old order.
 */
export function stylesheetBeforeBundle(html: string): string {
  const { sheets, rest } = takeStylesheets(html, "stylesheetBeforeBundle");
  // A function, so nothing in a tag is read as a replacement pattern (`$&`).
  return rest.replace(BUNDLE, (_, indent: string, tag: string) =>
    [...sheets.map((s) => indent + s.trim()), indent + tag].join("\n"),
  );
}

/** The bundle's first tag in a page's head: its entry script, or a module preload before it. */
const BUNDLE = /([ \t]*)(<script type="module"|<link rel="modulepreload")/;

/**
 * A page's stylesheet links, each with its line, and the page without them, for the two functions that
 * place them. Throws, naming `caller`, on a page with no stylesheet or no module script.
 */
function takeStylesheets(html: string, caller: string): { sheets: string[]; rest: string } {
  const sheets = html.match(/[ \t]*<link rel="stylesheet"[^>]*>\n?/g);
  if (!sheets) throw new Error(`${caller}: no <link rel="stylesheet"> in the page`);
  const rest = sheets.reduce((h, s) => h.replace(s, ""), html);
  if (!BUNDLE.test(rest)) throw new Error(`${caller}: no module script in the page`);
  return { sheets, rest };
}

/**
 * A zone page with the CSS its static header needs inlined where the stylesheet was, and the
 * stylesheet itself moved to the end of the body (issue #97, docs/performance.md). The header then
 * paints once the HTML and the head script are in, without waiting for the whole stylesheet. In the
 * body the stylesheet holds up only what comes after it, and the module scripts, which wait for a
 * stylesheet above them: so nothing React draws is ever unstyled. A `<link>` needs no script to
 * load it this way, which the CSP would refuse; an inline `<style>` it allows (`'unsafe-inline'`).
 * Throws on a page it cannot rewrite, and on CSS that would close its `<style>` early.
 */
export function withInlineStylesheet(html: string, css: string): string {
  if (/<\/style/i.test(css)) throw new Error("withInlineStylesheet: the CSS contains </style");
  const { sheets, rest } = takeStylesheets(html, "withInlineStylesheet");
  const end = /([ \t]*)<\/body>/;
  if (!end.test(rest)) throw new Error("withInlineStylesheet: no </body> in the page");
  // Functions, so nothing in the CSS or a tag is read as a replacement pattern (`$&`).
  return rest
    .replace(BUNDLE, (_, indent: string, tag: string) => `${indent}<style>${css}</style>\n${indent}${tag}`)
    .replace(end, (_, indent: string) =>
      [...sheets.map((s) => `${indent}  ${s.trim()}`), `${indent}</body>`].join("\n"),
    );
}

const ENTITIES: Record<string, string> = { "&amp;": "&", "&#x27;": "'", "&quot;": '"', "&lt;": "<", "&gt;": ">" };

/**
 * Every `class` attribute's value in `html`, one per line, with the entities React writes (for `&`,
 * `'`, `"`, `<` and `>`) read back, so a class name is as its source wrote it. This, not the markup,
 * is what Tailwind is given to find the header's classes (`headerCss` in vite.config.ts): read from the
 * markup, `[&amp;_svg]:size-4` matched no class, and the header's icons painted at 24 px instead of 16
 * until the stylesheet arrived.
 */
export function classAttributes(html: string): string {
  return [...html.matchAll(/\sclass="([^"]*)"/g)]
    .map((m) => (m[1] ?? "").replace(/&amp;|&#x27;|&quot;|&lt;|&gt;/g, (e) => ENTITIES[e] ?? e))
    .join("\n");
}

/**
 * `css` with each `url(…)` pointed at the file of the same name the build wrote under `assets/`
 * (`name-<hash>.ext`, Vite's 8-character base64url hash). The header's inlined CSS is compiled from
 * the sources, where a font is a path into its package; the page must ask for the hashed file, which
 * is also the one the font preload fetches, or the browser downloads it twice. Throws on a `url()`
 * with no such file, rather than point it at another whose name merely starts the same.
 */
export function withAssetUrls(css: string, assets: readonly string[]): string {
  return css.replace(/url\((["']?)([^)"']+)\1\)/g, (_, _quote: string, url: string) => {
    const file = url.split("/").pop() ?? "";
    const dot = file.lastIndexOf(".");
    const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const built = new RegExp(`^assets/${escape(file.slice(0, dot))}-[\\w-]{8}${escape(file.slice(dot))}$`);
    const hashed = assets.filter((a) => built.test(a));
    if (dot <= 0 || hashed.length !== 1) throw new Error(`withAssetUrls: no single built file for ${url}`);
    return `url(/${hashed[0]})`;
  });
}
