/**
 * What React Compiler does with `src/`: which functions it compiles and which it leaves as written.
 *
 * The compiler fails silently by design: a component it cannot handle is skipped and the build says
 * nothing. Its `logger` option is the only place a skip shows, so this runs the same Babel plugin the
 * build runs (`react-compiler.config.ts`) over every source file with a logger and collects the events.
 * `test/react-compiler.test.ts` holds the result to a committed list; `scripts/react-compiler.ts`
 * prints it, and one file's compiled output.
 */
import { glob, readFile } from "node:fs/promises";
import path from "node:path";
import { transformAsync } from "@babel/core";
import type { LoggerEvent, PluginOptions } from "babel-plugin-react-compiler";
import { COMPILER_OPTIONS, PAGE_SOURCES } from "../react-compiler.config";

/** A function the compiler left as written. */
export interface Skip {
  /** From the repo's root, with forward slashes. */
  file: string;
  /** The component or hook, `(anonymous)` when it has no name. */
  fn: string;
  /** The line of the code the compiler names, or of the function when it names none. */
  line: number;
  /** The compiler's own first line for it: for a person to read, never compared. */
  reason: string;
}

/**
 * A skip that is expected, named by what is ours: the file and the function. Not the line, which an
 * edit above the function moves, and not the reason, which is the compiler's wording to change.
 */
export type AllowedSkip = Pick<Skip, "file" | "fn">;

export interface CompilerReport {
  compiled: { file: string; fn: string }[];
  skips: Skip[];
}

/** Never in a client bundle: the tests, and the static headers' render, which runs once in the build. */
const NOT_SOURCE = /\.test\.tsx?$|\.d\.ts$|^src\/static-shell\.tsx$/;

/**
 * The name of the function that starts at `index`: a declaration's or a named function expression's
 * own, or what an arrow function is assigned to. The compiler's error events carry the function's
 * place and not its name.
 */
export function functionName(source: string, index: number): string {
  const own = /^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/.exec(source.slice(index));
  if (own?.[1]) return own[1];
  // `const Name = (`, `const Name = memo((`, `const Name: Type = (`, on the function's own line.
  const before = source.slice(source.lastIndexOf("\n", index - 1) + 1, index);
  const assigned = /([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:[\w$.]+\(\s*)*(?:async\s+)?$/.exec(before);
  return assigned?.[1] ?? "(anonymous)";
}

const key = (s: AllowedSkip) => `${s.file}\n${s.fn}`;
const byKey = (a: AllowedSkip, b: AllowedSkip) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);

/**
 * What the compiler skips against what it is expected to skip: `unlisted` is skipped and not
 * expected, `stale` expected and not skipped. Each expected entry answers for one skip.
 */
export function compareSkips(found: Skip[], allowed: AllowedSkip[]): { unlisted: Skip[]; stale: AllowedSkip[] } {
  const left = [...allowed];
  const unlisted: Skip[] = [];
  for (const skip of found) {
    const at = left.findIndex((a) => key(a) === key(skip));
    if (at === -1) unlisted.push(skip);
    else left.splice(at, 1);
  }
  return { unlisted: unlisted.sort(byKey), stale: left.sort(byKey) };
}

type SkipEvent = Extract<LoggerEvent, { kind: "CompileError" | "CompileSkip" | "PipelineError" }>;

/** The compiler's reason for a skip, and the line it points at. */
function reasonOf(event: SkipEvent): { reason: string; line: number | undefined } {
  switch (event.kind) {
    case "CompileError": {
      // A symbol stands for code the compiler generated itself, which has no line.
      const loc = event.detail.primaryLocation();
      return { reason: event.detail.reason, line: typeof loc === "object" ? loc?.start.line : undefined };
    }
    // Opted out in the source, with "use no memo".
    case "CompileSkip":
      return { reason: event.reason, line: event.loc?.start.line };
    // The compiler itself threw.
    case "PipelineError":
      return { reason: event.data, line: undefined };
  }
}

/** The plugin as the build runs it (the same options), plus a logger. */
function compilerPlugin(logEvent: (event: LoggerEvent) => void) {
  const options: Partial<PluginOptions> = {
    ...COMPILER_OPTIONS,
    logger: { logEvent: (_file, event) => logEvent(event) },
  };
  return ["babel-plugin-react-compiler", options] as const;
}

/** Babel reads types in both, and JSX only where it cannot be a type assertion. */
const parserPlugins = (file: string) =>
  file.endsWith(".tsx") ? (["typescript", "jsx"] as const) : (["typescript"] as const);

/** Runs the compiler over every source file under `root` (the repo) and reports what it did. */
export async function compilerReport(root: string): Promise<CompilerReport> {
  const report: CompilerReport = { compiled: [], skips: [] };
  const files: string[] = [];
  for await (const file of glob(PAGE_SOURCES, { cwd: root })) {
    if (!NOT_SOURCE.test(file)) files.push(file.split(path.sep).join("/"));
  }
  for (const file of files.sort()) {
    const source = await readFile(path.join(root, file), "utf8");
    const nameAt = (loc: { start: { index: number } } | null) =>
      loc ? functionName(source, loc.start.index) : "(anonymous)";
    await transformAsync(source, {
      filename: path.join(root, file),
      babelrc: false,
      configFile: false,
      code: false,
      parserOpts: { plugins: [...parserPlugins(file)] },
      plugins: [
        compilerPlugin((event) => {
          if (event.kind === "CompileSuccess") {
            report.compiled.push({ file, fn: event.fnName ?? nameAt(event.fnLoc) });
          } else if (event.kind === "CompileError" || event.kind === "CompileSkip" || event.kind === "PipelineError") {
            const { reason, line } = reasonOf(event);
            report.skips.push({ file, fn: nameAt(event.fnLoc), reason, line: line ?? event.fnLoc?.start.line ?? 0 });
          }
        }),
      ],
    });
  }
  return report;
}

/** One file as the compiler leaves it: JSX and types kept, so it reads beside the source. */
export async function compiledOutput(root: string, file: string): Promise<string> {
  const source = await readFile(path.resolve(root, file), "utf8");
  const result = await transformAsync(source, {
    filename: path.resolve(root, file),
    babelrc: false,
    configFile: false,
    parserOpts: { plugins: [...parserPlugins(file)] },
    plugins: [compilerPlugin(() => {})],
  });
  return result?.code ?? "";
}
