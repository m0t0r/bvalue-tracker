import { readFile } from "node:fs/promises";
import path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { build, defineConfig, runnerImport, type Plugin } from "vite";
import { INSIGHTS_LOAD, monitorLoad, preloadTags, stylesheetBeforeBundle, swapPreloads } from "./core/page-data.ts";
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

/** The stylesheet ahead of the bundle in the head (`stylesheetBeforeBundle`, which says why), on every page. */
function stylesheetBeforeBundlePlugin(): Plugin {
  return {
    name: "sgc-stylesheet-before-bundle",
    apply: "build",
    transformIndexHtml: { order: "post", handler: (html) => stylesheetBeforeBundle(html) },
  };
}

/**
 * On a wide screen, start each page's API requests from the HTML, beside its scripts, instead of once
 * the scripts have run (`core/page-data.ts`, which says why not on a phone). The monitor's figures and
 * the insights page's drawings all wait on the data, and without this the data waited on the bundle.
 * At the end of the head, after the
 * stylesheet, the font and the scripts, which the first paint needs more. In dev the zone comes from
 * the path; the build writes the home zone's page and `zonePages` swaps in each other zone's.
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
        const paths = /^\/insights$|\/insights\.html$/.test(route)
          ? INSIGHTS_LOAD
          : monitor
            ? monitorLoad(ctx.server ? zonePath(route) : HOME_ZONE)
            : null;
        return paths === null ? html : html.replace("</head>", `  ${preloadTags(paths)}\n  </head>`);
      },
    },
  };
}

/**
 * The head script and the static header (issue #69; `docs/performance.md`). On a phone the header's
 * subtitle is the largest paint, and drawn by React it waited for the whole bundle. The build writes
 * the header into each zone's HTML instead (`src/static-shell.tsx`), in both languages, and a small
 * classic script at the top of every page's head (`src/boot.ts`) sets `<html lang>` and the theme
 * before the first paint, so the right language shows and nothing flashes. The CSP allows no inline
 * script, so the script is a file: bundled on its own, into `/assets/` under a content hash, where
 * `public/_headers` caches it for good. In dev it is served at `DEV_BOOT_PATH`, and the header is
 * left out, since the stylesheet only arrives with the scripts there and the header would show
 * unstyled, in both languages.
 */
const BOOT_ENTRY = path.resolve(import.meta.dirname, "src/boot.ts");
const DEV_BOOT_PATH = "/__boot.js";
/** Each zone's static header, rendered when the client build starts, for `zonePages` to write. */
let shells: Record<ZoneId, string> | null = null;

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
async function renderShells(): Promise<Record<ZoneId, string>> {
  const { module } = await runnerImport<{ staticShell: (zone: ZoneId) => string }>(
    path.resolve(import.meta.dirname, "src/static-shell.tsx"),
    { configFile: false, logLevel: "warn", resolve: { alias } },
  );
  return Object.fromEntries(ZONE_IDS.map((zone) => [zone, module.staticShell(zone)])) as Record<ZoneId, string>;
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
          // The monitor's page has the header's slot; the insights page takes only the script.
          return page.includes("<!--static-shell-->") ? withStaticShell(page, shells[HOME_ZONE]) : page;
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
            shells[zone],
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

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    cloudflare(),
    startup(),
    preloadLatinFont(),
    stylesheetBeforeBundlePlugin(),
    preloadPageData(),
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
        rollupOptions: {
          input: {
            index: path.resolve(import.meta.dirname, "index.html"),
            insights: path.resolve(import.meta.dirname, "insights.html"),
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
