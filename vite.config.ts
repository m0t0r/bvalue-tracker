import { readFile } from "node:fs/promises";
import path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { INSIGHTS_LOAD, monitorLoad, preloadTags, swapPreloads } from "./core/page-data.ts";
import { HOME_ZONE, ZONE_PATHS, withZoneMeta, zonePageFile, zonePath } from "./core/zone-pages.ts";
import { ZONE_IDS } from "./core/zones.ts";

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
        for (const zone of ZONE_IDS) {
          if (zone === HOME_ZONE) continue;
          const source = swapPreloads(
            withZoneMeta(String(index.source), zone),
            monitorLoad(HOME_ZONE),
            monitorLoad(zone),
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
  plugins: [react(), tailwindcss(), cloudflare(), preloadLatinFont(), preloadPageData(), zonePages(), insightsPage()],
  worker: { format: "es" },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
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
    choco: { build: { sourcemap: true } },
  },
});
