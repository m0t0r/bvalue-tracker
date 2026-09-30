/**
 * React Compiler's setup, in one place (issue #130; docs/development.md, "React Compiler"). Three
 * things run the compiler and must agree on what it compiles and how: the build (`vite.config.ts`),
 * the `page` test project (`vitest.config.ts`) and the skipped-list test
 * (`scripts/react-compiler-skips.ts`). An option added for one and not the others would have the
 * tests pass on code the reader does not get, so all three read this file.
 */
import path from "node:path";
import babel from "@rolldown/plugin-babel";
import { reactCompilerPreset } from "@vitejs/plugin-react";
import type { PluginOptions } from "babel-plugin-react-compiler";
import { normalizePath } from "vite";

/** The compiler's own options. Empty: its defaults, which compile every component and hook. */
export const COMPILER_OPTIONS: Partial<PluginOptions> = {};

/** The pages' source, as the glob the skipped-list test walks. */
export const PAGE_SOURCES = "src/**/*.{ts,tsx}";

const SRC = `${normalizePath(path.resolve(import.meta.dirname, "src"))}/`;
const escaped = SRC.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/**
 * The same files as a module id: only `src/` holds components and hooks. `core/` and
 * `packages/seismo` are plain functions the compiler has nothing to do for, and left in they were a
 * Babel parse and print each, in the build and on every dev-server request.
 */
export const PAGE_SOURCE_ID = new RegExp(`^${escaped}.*\\.tsx?(?:$|\\?)`);

/**
 * The Babel plugin that compiles the pages. The preset compiles Vite's client environment only,
 * which is right for the build: the static headers are rendered once and the Worker has no React.
 * The `page` test project is a client environment too, so it takes the plugin as it is.
 */
export function reactCompiler() {
  return babel({ include: PAGE_SOURCE_ID, presets: [reactCompilerPreset(COMPILER_OPTIONS)] });
}
