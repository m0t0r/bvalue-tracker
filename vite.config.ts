import { readFile } from "node:fs/promises";
import path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { withZoneMeta, zonePageFile, zonePath } from "./core/zone-pages.ts";
import { DEFAULT_ZONE, ZONE_IDS } from "./core/zones.ts";

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
 * One HTML file per zone, so a shared `/tolima` link previews as Tolima (`core/zone-pages.ts`).
 * The build copies the finished `index.html` — hashed script, stylesheet and font preload already
 * in it — and swaps in each other zone's meta tags; the asset layer serves `tolima.html` at
 * `/tolima`. In dev the same page is served for the zone's path, with the same tags.
 */
function zonePages(): Plugin[] {
  const zoneAt = (url: string | undefined) => {
    const zone = zonePath((url ?? "/").split("?")[0] ?? "/");
    return zone === DEFAULT_ZONE ? undefined : zone;
  };
  return [
    {
      // Dev serves a zone's page itself. Left to the Cloudflare plugin, /tolima goes to the Worker,
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
          if (zone === DEFAULT_ZONE) continue;
          const source = withZoneMeta(String(index.source), zone);
          this.emitFile({ type: "asset", fileName: zonePageFile(zone), source });
        }
      },
    },
  ];
}

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare(), preloadLatinFont(), zonePages()],
  worker: { format: "es" },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
  environments: {
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
