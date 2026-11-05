import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";
import { reactCompiler } from "./react-compiler.config.ts";

// happy-dom follows a clicked link by fetching its URL from the internet (the explainer's
// `target="_blank"` links did, to example.org, on every run). Tests run offline, so no frame navigates.
const offlineDom = {
  happyDOM: {
    settings: {
      navigation: {
        disableMainFrameNavigation: true,
        disableChildFrameNavigation: true,
        disableChildPageNavigation: true,
      },
    },
  },
};

// Node 25 and later have a `localStorage` of their own, whose getter answers `undefined` unless
// `--localstorage-file` is given, and Vitest leaves it in place of happy-dom's, so every test that
// touches storage threw "Cannot read properties of undefined (reading 'clear')" on Node 26. Turning
// Node's off lets happy-dom's through, as on Node 24. `core` takes it only to quiet the warning msw 2's
// cookie store sets off by probing Node's storage when it loads.
const noNodeStorage = ["--no-experimental-webstorage"];

export default defineConfig({
  test: {
    projects: [
      { test: { name: "core", include: ["test/**/*.test.ts"], execArgv: noNodeStorage } },
      // The seismology library, on synthetic catalogues only: it knows nothing about SGC or a zone.
      { test: { name: "seismo", include: ["packages/seismo/test/**/*.test.ts"] } },
      {
        // The chart kit, on a stand-in chart of a few points: it knows nothing about a catalogue or the
        // page. `happy-dom` because what it holds is what a pointer, a finger and the keyboard do to a
        // drawing. It ships compiled, like the pages (react-compiler.config.ts), so its tests run it
        // compiled.
        test: {
          name: "charts",
          include: ["packages/charts/test/**/*.test.ts"],
          environment: "happy-dom",
          environmentOptions: offlineDom,
          execArgv: noNodeStorage,
        },
        plugins: [reactCompiler()],
      },
      {
        // The page's own pure logic. It lives beside the module it tests, because `src` is the only
        // tsconfig project with the DOM lib, JSX and the "@" alias, and a test under `test/` would
        // be typechecked by the Node one, which has none of them. vitest.config.ts replaces
        // vite.config.ts rather than extending it, so the alias has to be repeated here too.
        resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
        // `happy-dom` is here for the seams that cannot be reached without a renderer: the events the
        // page's scope hook hands the map, the table and the charts, that the info tip's tap and
        // click handling still overrides Radix's Tooltip, and
        // that a deferred card waits for its own margin and the map's picture leaves only once the
        // map has drawn, or cannot (issue #72, against a stand-in for MapLibre). Everything else
        // in this project is a pure function and does not touch the DOM.
        test: {
          name: "page",
          include: ["src/**/*.test.{ts,tsx}"],
          environment: "happy-dom",
          environmentOptions: offlineDom,
          execArgv: noNodeStorage,
        },
        // The pages ship compiled by React Compiler (vite.config.ts), so that is what these tests
        // run: the build's own plugin.
        plugins: [reactCompiler()],
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
