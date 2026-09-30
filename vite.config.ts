import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { build, defineConfig, normalizePath, runnerImport, type Plugin } from "vite";
import {
  INSIGHTS_LOAD,
  chunkPreloads,
  classAttributes,
  modulePreloadTags,
  monitorLoad,
  preloadTags,
  stylesheetBeforeBundle,
  swapPreloads,
  withAssetUrls,
  withInlineStylesheet,
} from "./core/page-data.ts";
import { HOME_ZONE, ZONE_PATHS, withStaticShell, withZoneMeta, zonePageFile, zonePath } from "./core/zone-pages.ts";
import { ZONE_IDS, type ZoneId } from "./core/zones.ts";

const alias = { "@": path.resolve(import.meta.dirname, "./src") };

/**
 * Preload the one font subset the page actually uses. Everything on screen is text, so the
 * largest paint waits for it; without this the browser only discovers the file once it has
 * parsed the stylesheet, and the swap from the fallback face shifts the layout (0.028 of CLS,
 * measured). The file name carries a content hash, so the tag is written from the bundle
 * rather than hard-coded in index.html. Latin only: the other subsets are for text this page
 * never renders, and preloading them would compete for the same bandwidth.
 */
function preloadLatinFont(): Plugin {
  return {
    name: "sgc-preload-latin-font",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        const file = Object.keys(ctx.bundle ?? {}).find((name) => /geist-latin-wght-normal-[^/]+\.woff2$/.test(name));
        if (file === undefined) return;
        // Straight after <meta charset>, which has to stay the first thing in the head.
        const tag = `<link rel="preload" href="/${file}" as="font" type="font/woff2" crossorigin>`;
        return html.replace(/(<meta charset=[^>]*>)/i, `$1\n    ${tag}`);
      },
    },
  };
}

/**
 * The page's stylesheet out of the first paint's way. On a page with a static header (the zone pages
 * and, since issue #120, the insights page) the CSS that header needs is inlined and the stylesheet
 * moves to the end of the body (`withInlineStylesheet`, issue #97): a phone paints the header once the
 * HTML and the head script are in. A page with nothing to paint before its bundle would keep the
 * stylesheet, ahead of the bundle (`stylesheetBeforeBundle`).
 */
function stylesheetPlacement(): Plugin {
  // Once per build and page: the static headers and the font files are the build's own. Each page
  // inlines only what its own header uses, so the monitor's pages are what they were before
  // /insights had one.
  let css: Partial<Record<"monitor" | "insights", Promise<string>>> = {};
  return {
    name: "sgc-stylesheet-placement",
    apply: "build",
    buildStart() {
      css = {};
    },
    transformIndexHtml: {
      order: "post",
      async handler(html, ctx) {
        const page = shellPage(ctx.filename);
        if (page === null) return stylesheetBeforeBundle(html);
        if (shells === null) throw new Error("sgc-stylesheet-placement: no static header rendered");
        // The monitor's CSS covers every zone's header, since the zone pages are copies of this one.
        css[page] ??= headerCss(
          page === "insights" ? shells.insights : Object.values(shells.zones).join(""),
          Object.keys(ctx.bundle ?? {}),
        );
        return withInlineStylesheet(html, await css[page]);
      },
    },
  };
}

/** The part of `@tailwindcss/node` that `headerCss` uses. */
interface TailwindNode {
  compile(
    css: string,
    options: { base: string; from: string; onDependency: (path: string) => void },
  ): Promise<{
    build(candidates: string[]): string;
  }>;
  optimize(css: string, options: { minify: boolean }): { code: string };
}

/**
 * The CSS a static header needs: `index.css` compiled by Tailwind for exactly the class names in the
 * header's HTML (the monitor's for both zones, or the insights page's; both languages), minified, with its fonts pointed at the built files.
 * Every rule of `index.css` that is not a utility comes along whole: the tokens for both themes, the
 * base styles, the fallback faces and the rules that show the reader's language, so nothing depends on
 * the theme or the language the build happened to see. About 32 kB, 6 kB with brotli; about a third
 * of it is page rules the header does not use (the map's controls, the charts', the entry animations),
 * left in rather than split `index.css` in two (code review).
 *
 * The compiler is the one `@tailwindcss/vite` itself depends on, found from that package, so the
 * inlined CSS and the stylesheet it stands in for always come from the same Tailwind. It is given the
 * header's class names as written (`classAttributes`); anything that is not a class it knows, it drops.
 */
async function headerCss(markup: string, assets: string[]): Promise<string> {
  // A compiler per call, not one per build: `build` keeps every candidate it has been given, so a
  // second page's CSS would carry the first page's classes too (checked, Tailwind 4.3).
  const fromPlugin = createRequire(createRequire(import.meta.url).resolve("@tailwindcss/vite"));
  const { compile, optimize } = fromPlugin("@tailwindcss/node") as TailwindNode;
  const from = path.resolve(import.meta.dirname, "src/index.css");
  const compiler = await compile(await readFile(from, "utf8"), {
    base: path.dirname(from),
    from,
    onDependency: () => {},
  });
  const candidates = [...new Set(classAttributes(markup).split(/\s+/).filter(Boolean))];
  return withAssetUrls(optimize(compiler.build(candidates), { minify: true }).code.trim(), assets);
}

/**
 * Start each page's API requests from the HTML, beside its scripts, instead of once the scripts have
 * run: the monitor's on a wide screen only, the insights page's at every width (`core/page-data.ts`
 * says why). The monitor's figures and the insights page's drawings all wait on the data, and without
 * this the data waited on the bundle. At the end of the head, after the stylesheet, the font and the
 * scripts, which the first paint needs more. In dev the zone comes from the path; the build writes the
 * home zone's page and `zonePages` swaps in each other zone's.
 */
function preloadPageData(): Plugin {
  return {
    name: "sgc-preload-page-data",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        // A zone's or the insights page's URL when a dev middleware serves it; otherwise the file's
        // path, which Vite gives in dev as an absolute one ("…/index.html").
        const route = (ctx.originalUrl ?? ctx.path).split("?")[0]?.replace(/(.)\/+$/, "$1") ?? "/";
        // Only the pages that make these requests: in dev any other HTML file (the 3D block's
        // `bake-basemap.html`) would otherwise preload a catalogue it never reads.
        const monitor = route.endsWith("/index.html") || Object.values(ZONE_PATHS).includes(route);
        const tags = /^\/insights$|\/insights\.html$/.test(route)
          ? preloadTags(INSIGHTS_LOAD, null)
          : monitor
            ? preloadTags(monitorLoad(ctx.server ? zonePath(route) : HOME_ZONE))
            : null;
        return tags === null ? html : html.replace("</head>", `  ${tags}\n  </head>`);
      },
    },
  };
}

/**
 * The story tab's code, fetched from the insights page's HTML beside its bundle (issue #108). The page
 * opens on the story (the bare URL, which the monitor links to), and its hero, the largest paint at
 * every width, needs the story's chunk as well as the data. Imported by the entry, that chunk was only
 * asked for once the bundle had run: on a slow phone at ~3.4 s of a 4.8 s LCP. Vite preloads only what
 * the entry imports statically, so this adds the story's chunk and what it imports beyond that. Every
 * tab gains from it: the questions tab shares most of those chunks (docs/performance.md has the A/B).
 */
// Forward slashes on every system, as Rollup writes a chunk's `facadeModuleId` and Vite an HTML page's
// `filename`.
const STORY_TAB = normalizePath(path.resolve(import.meta.dirname, "src/insights/story/index.tsx"));
const INSIGHTS_ENTRY = normalizePath(path.resolve(import.meta.dirname, "insights.html"));
const MONITOR_ENTRY = normalizePath(path.resolve(import.meta.dirname, "index.html"));
/** Whether the page Vite is writing is the insights page, from `transformIndexHtml`'s `ctx.filename`. */
const isInsights = (filename: string) => normalizePath(filename) === INSIGHTS_ENTRY;
/**
 * Which static header the page Vite is writing gets, or null for a page without one. The one place
 * that decides it, for the header (`startup`) and for the CSS inlined for it (`stylesheetPlacement`).
 */
function shellPage(filename: string): "monitor" | "insights" | null {
  if (isInsights(filename)) return "insights";
  return normalizePath(filename) === MONITOR_ENTRY ? "monitor" : null;
}

function preloadStoryTab(): Plugin {
  return {
    name: "sgc-preload-story-tab",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        if (!isInsights(ctx.filename)) return html;
        const files = chunkPreloads(ctx.bundle ?? {}, STORY_TAB, INSIGHTS_ENTRY);
        return html.replace("</head>", `  ${modulePreloadTags(files)}\n  </head>`);
      },
    },
  };
}

/**
 * The head script and the static headers (issues #69 and #120; `docs/performance.md`). On a phone the
 * monitor's header subtitle is the largest paint, and drawn by React it waited for the whole bundle;
 * the insights page was blank until its bundle had run. The build writes each page's header into its
 * HTML instead (`src/static-shell.tsx`), in both languages, and a small
 * classic script at the top of every page's head (`src/boot.ts`) sets `<html lang>` and the theme
 * before the first paint, so the right language shows and nothing flashes. The CSP allows no inline
 * script, so the script is a file: bundled on its own, into `/assets/` under a content hash, where
 * `public/_headers` caches it for good. In dev it is served at `DEV_BOOT_PATH`, and the header is
 * left out, since the stylesheet only arrives with the scripts there and the header would show
 * unstyled, in both languages.
 */
const BOOT_ENTRY = path.resolve(import.meta.dirname, "src/boot.ts");
const DEV_BOOT_PATH = "/__boot.js";
/**
 * Each zone's static header and the insights page's, rendered when the client build starts, for
 * `startup` and `zonePages` to write.
 */
let shells: { zones: Record<ZoneId, string>; insights: string } | null = null;

/** `src/boot.ts` and what it imports, as one classic script: no module loader, no import. */
async function bundleBoot(): Promise<string> {
  const result = await build({
    configFile: false,
    logLevel: "warn",
    publicDir: false,
    build: { write: false, minify: true, lib: { entry: BOOT_ENTRY, formats: ["iife"], name: "sgcBoot" } },
  });
  const output = Array.isArray(result) ? result[0] : result;
  const chunk = output && "output" in output ? output.output[0] : undefined;
  if (chunk?.type !== "chunk") throw new Error("sgc-startup: the head script did not bundle");
  return chunk.code;
}

/** Renders `src/static-shell.tsx` in Node through Vite's module runner, which knows the `@` alias. */
async function renderShells(): Promise<NonNullable<typeof shells>> {
  const { module } = await runnerImport<{
    staticShell: (zone: ZoneId) => string;
    insightsStaticShell: () => string;
  }>(path.resolve(import.meta.dirname, "src/static-shell.tsx"), {
    configFile: false,
    logLevel: "warn",
    resolve: { alias },
  });
  return {
    zones: Object.fromEntries(ZONE_IDS.map((zone) => [zone, module.staticShell(zone)])) as Record<ZoneId, string>,
    insights: module.insightsStaticShell(),
  };
}

/** The head script's tag, after the viewport, before the stylesheet: a script after a stylesheet waits for it. */
const withBootScript = (html: string, src: string) => {
  const viewport = /(<meta name="viewport"[^>]*>)/;
  if (!viewport.test(html)) throw new Error("sgc-startup: no viewport meta to put the head script after");
  return html.replace(viewport, `$1\n    <script src="${src}"></script>`);
};

function startup(): Plugin[] {
  return [
    {
      name: "sgc-startup:dev",
      apply: "serve",
      enforce: "pre",
      configureServer(server) {
        // Bundled once and kept until one of its two files changes: every dev page waits on it.
        let boot: Promise<string> | null = null;
        const sources = [BOOT_ENTRY, path.resolve(import.meta.dirname, "src/lib/startup.ts")];
        server.watcher.on("change", (file) => {
          if (sources.includes(path.resolve(file))) boot = null;
        });
        server.middlewares.use(async (req, res, next) => {
          if (req.url?.split("?")[0] !== DEV_BOOT_PATH) return next();
          try {
            boot ??= bundleBoot();
            const code = await boot;
            res.setHeader("content-type", "text/javascript; charset=utf-8");
            res.end(code);
          } catch (err) {
            boot = null;
            next(err);
          }
        });
      },
      transformIndexHtml: (html) => withBootScript(html, DEV_BOOT_PATH),
    },
    {
      name: "sgc-startup:build",
      apply: "build",
      async buildStart() {
        if (this.environment.name !== "client") return; // the Worker's environment has no page
        this.emitFile({ type: "asset", name: "boot.js", source: await bundleBoot() });
        shells = await renderShells();
      },
      transformIndexHtml: {
        order: "post",
        handler(html, ctx) {
          const boot = Object.keys(ctx.bundle ?? {}).find((name) => /^assets\/boot-[\w-]+\.js$/.test(name));
          if (boot === undefined || shells === null) throw new Error("sgc-startup: no head script in the bundle");
          const page = withBootScript(html, `/${boot}`);
          // `withStaticShell` throws if the page has lost its slot: it would still work, only slower.
          const shell = shellPage(ctx.filename);
          if (shell === null) return page;
          return withStaticShell(page, shell === "insights" ? shells.insights : shells.zones[HOME_ZONE]);
        },
      },
    },
  ];
}

/**
 * One HTML file per zone, so a shared `/choco` link previews as Chocó (`core/zone-pages.ts`).
 * The build copies the finished `index.html` — hashed script, stylesheet and font preload already
 * in it — and swaps in each other zone's meta tags; the asset layer serves `choco.html` at
 * `/choco`. In dev the same page is served for the zone's path, with the same tags.
 */
function zonePages(): Plugin[] {
  const zoneAt = (url: string | undefined) => {
    const zone = zonePath((url ?? "/").split("?")[0] ?? "/");
    return zone === HOME_ZONE ? undefined : zone;
  };
  return [
    {
      // Dev serves a zone's page itself. Left to the Cloudflare plugin, /choco goes to the Worker,
      // which answers 404 for a path with no file (`not_found_handling: "none"`), and rewriting
      // `req.url` does not help: the plugin builds its request from `req.originalUrl`.
      name: "sgc-zone-pages:dev",
      apply: "serve",
      enforce: "pre",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if ((req.method !== "GET" && req.method !== "HEAD") || zoneAt(req.url) === undefined) return next();
          try {
            const template = await readFile(path.join(server.config.root, "index.html"), "utf8");
            const html = await server.transformIndexHtml(req.url!, template, req.originalUrl);
            res.setHeader("content-type", "text/html; charset=utf-8");
            res.end(html);
          } catch (err) {
            next(err);
          }
        });
      },
      transformIndexHtml(html, ctx) {
        const zone = zoneAt(ctx.originalUrl);
        return zone === undefined ? html : withZoneMeta(html, zone);
      },
    },
    {
      // Last, because Vite 8 emits index.html late: a plugin in the normal order finds no page in
      // the bundle yet, and would silently write no zone file at all.
      name: "sgc-zone-pages:build",
      apply: "build",
      enforce: "post",
      generateBundle(_options, bundle) {
        if (this.environment.name !== "client") return; // the Worker's environment has no page
        const index = bundle["index.html"];
        if (index?.type !== "asset") throw new Error("sgc-zone-pages: no index.html in the client bundle");
        if (shells === null) throw new Error("sgc-zone-pages: no static header rendered");
        for (const zone of ZONE_IDS) {
          if (zone === HOME_ZONE) continue;
          const source = withStaticShell(
            swapPreloads(withZoneMeta(String(index.source), zone), monitorLoad(HOME_ZONE), monitorLoad(zone)),
            shells.zones[zone],
          );
          this.emitFile({ type: "asset", fileName: zonePageFile(zone), source });
        }
      },
    },
  ];
}

/**
 * `/insights`, the explanations page, is its own HTML file and its own bundle (`insights.html`,
 * `src/insights/main.tsx`), so D3 never loads with the monitor and Recharts and MapLibre never load
 * with it. The asset layer serves `insights.html` at `/insights` in production; in dev the
 * Cloudflare plugin would hand that path to the Worker, which answers 404 (see `zonePages`), so
 * this serves it first.
 */
function insightsPage(): Plugin {
  return {
    name: "sgc-insights-page:dev",
    apply: "serve",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const route = (req.url ?? "").split("?")[0]?.replace(/\/+$/, "");
        if ((req.method !== "GET" && req.method !== "HEAD") || route !== "/insights") return next();
        try {
          const template = await readFile(path.join(server.config.root, "insights.html"), "utf8");
          const html = await server.transformIndexHtml(req.url!, template, req.originalUrl);
          res.setHeader("content-type", "text/html; charset=utf-8");
          res.end(html);
        } catch (err) {
          next(err);
        }
      });
    },
  };
}

/**
 * `PROFILE=1 pnpm build`: a build React can be profiled in (issue #128; docs/development.md,
 * "Profiling React renders"). The production bundle of `react-dom` records no render times; its
 * `profiling` bundle does, and takes the place of `react-dom/client` in the page's code, which is
 * also left unminified so a profile names components as the source does.
 *
 * It must never be deployed, so it cannot be: it is the pages alone, written to `dist-profile/`. The
 * Cloudflare plugin is left out, so there is no Worker beside them and nothing `wrangler deploy`
 * reads (`dist/` and `.wrangler/deploy/`) is touched; a production build made earlier stays as it was.
 *
 * In the client environment only, and by `resolveId`, not `resolve.alias`: an alias also reaches the
 * render of the static headers, which then dies with `ReferenceError: module is not defined`.
 * `enforce: "pre"`, or Vite's own resolver answers first, this hook is never asked, and the build
 * silently keeps the production bundle (every render time reads 0).
 */
const PROFILE = process.env.PROFILE === "1";
const PROFILE_DIR = "dist-profile";
function reactProfiling(): Plugin {
  return {
    name: "sgc-react-profiling",
    apply: "build",
    enforce: "pre",
    applyToEnvironment: (environment) => environment.name === "client",
    async resolveId(id, importer) {
      if (id !== "react-dom/client") return null;
      return this.resolve("react-dom/profiling", importer, { skipSelf: true });
    },
    closeBundle() {
      this.info(`PROFILE=1: React's profiling bundle, unminified, in ${PROFILE_DIR}/. For measuring only.`);
    },
  };
}

export default defineConfig({
  plugins: [
    PROFILE && reactProfiling(),
    react(),
    tailwindcss(),
    !PROFILE && cloudflare(),
    startup(),
    preloadLatinFont(),
    stylesheetPlacement(),
    preloadPageData(),
    preloadStoryTab(),
    zonePages(),
    insightsPage(),
  ],
  worker: { format: "es" },
  resolve: { alias },
  environments: {
    // Two pages, two entries: the monitor and the explanations. The zone pages are copies of the
    // first, written by `zonePages` after the bundle.
    client: {
      build: {
        ...(PROFILE ? { minify: false, outDir: PROFILE_DIR } : {}),
        rollupOptions: {
          input: {
            index: path.resolve(import.meta.dirname, "index.html"),
            insights: INSIGHTS_ENTRY,
          },
        },
      },
    },
    /**
     * A source map for the Worker, and for the Worker only. `upload_source_maps` in
     * wrangler.jsonc has nothing to upload unless the build emits one, and without it a
     * stack trace in Workers Logs points at a column in a single minified line.
     *
     * Scoped to this environment on purpose: `build.sourcemap` at the top level would also
     * emit maps for the client bundle, and those are static assets — they would be
     * published beside the page, add megabytes to the deploy, and hand the whole source to
     * anyone who asks. Cloudflare fetches the Worker's map itself, out of band, after the
     * invocation has finished; it is never served to a visitor.
     *
     * **The key is the Worker's `name` in wrangler.jsonc, and nothing checks that they
     * agree.** Rename the Worker and this key matches no environment: no map is emitted,
     * `upload_source_maps` has nothing to upload, and the build says nothing about it —
     * the only symptom is a minified stack trace in Workers Logs, weeks later. Change the
     * two together, and let `pnpm build` confirm it: `dist/<name>/index.js.map` must exist
     * and `dist/client` must contain no map at all.
     */
    bvalue_tracker: { build: { sourcemap: true } },
  },
});
