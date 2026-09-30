/**
 * React Compiler from the terminal (docs/development.md, "React Compiler"): what it skips, and what
 * it makes of one file.
 *
 *   pnpm tsx scripts/react-compiler.ts skips                                 every function left as written
 *   pnpm tsx scripts/react-compiler.ts show src/components/theme-button.tsx  that file, compiled
 *
 * `show` prints the file with its JSX and types kept: a compiled function starts with
 * `const $ = _c(n)`, its cache of n slots, and one left as written looks as it does in the source.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { compiledOutput, compilerReport } from "./react-compiler-skips";

const USAGE = `usage: pnpm tsx scripts/react-compiler.ts <skips|show FILE>

  skips       list every function React Compiler leaves as written, with the reason
  show FILE   print FILE as the compiler leaves it
`;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const root = path.resolve(import.meta.dirname, "..");
const [command, file] = process.argv.slice(2);

if (command === "skips") {
  const { compiled, skips } = await compilerReport(root);
  for (const s of skips) console.log(`${s.file}:${s.line}  ${s.fn}\n    ${s.reason}`);
  console.log(`\n${compiled.length} compiled, ${skips.length} skipped.`);
} else if (command === "show" && file) {
  if (!existsSync(path.resolve(root, file)))
    fail(`no such file: ${file} (a path from the repo's root, such as src/App.tsx)`);
  console.log(await compiledOutput(root, file));
} else fail(USAGE);
