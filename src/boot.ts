/**
 * The head script: a classic, render-blocking script that sets the page's language and theme on
 * `<html>` before anything is drawn, so the static header (`src/static-shell.tsx`) paints in the
 * reader's language and theme. The CSP allows no inline script, so it is a file: the build bundles
 * it on its own into `/assets/`, hashed and cached for good, and puts it at the top of every page's
 * head (`startup` in `vite.config.ts`). Being its own bundle, it carries a copy of whatever it
 * imports, and it holds up the first paint while it loads: keep it to `src/lib/startup.ts`, which
 * imports nothing (about 0.5 kB).
 */
import { applyStartup } from "./lib/startup";

applyStartup();
