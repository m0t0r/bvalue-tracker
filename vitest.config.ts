import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      { test: { name: "core", include: ["test/**/*.test.ts"] } },
      // The seismology library, on synthetic catalogues only: it knows nothing about SGC or a zone.
      { test: { name: "seismo", include: ["packages/seismo/test/**/*.test.ts"] } },
      {
        // The page's own pure logic. It lives beside the module it tests, because `src` is the only
        // tsconfig project with the DOM lib, JSX and the "@" alias, and a test under `test/` would
        // be typechecked by the Node one, which has none of them. vitest.config.ts replaces
        // vite.config.ts rather than extending it, so the alias has to be repeated here too.
        resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
        // `happy-dom` is here for the one seam that cannot be reached without a renderer: that the
        // page's scope hook hands the map, the table and the charts the *same* array when only Mc
        // moves. Everything else in this project is a pure function and does not touch the DOM.
        test: { name: "page", include: ["src/**/*.test.ts"], environment: "happy-dom" },
      },
      {
        plugins: [
          cloudflareTest(async () => ({
            wrangler: { configPath: "./wrangler.test.jsonc" },
            miniflare: {
              bindings: { TEST_MIGRATIONS: await readD1Migrations(path.join(import.meta.dirname, "migrations")) },
            },
          })),
        ],
        test: { name: "worker", include: ["worker/test/**/*.test.ts"], setupFiles: ["./worker/test/setup.ts"] },
      },
    ],
  },
});
