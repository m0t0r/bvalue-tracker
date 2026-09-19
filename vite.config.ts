import path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

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

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare(), preloadLatinFont()],
  worker: { format: "es" },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
});
