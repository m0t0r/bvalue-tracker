import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  type AllowedSkip,
  compareSkips,
  compilerReport,
  functionName,
  type Skip,
} from "../scripts/react-compiler-skips";

/**
 * React Compiler leaves a function it cannot handle exactly as written, and says nothing: the page
 * still works, only without the optimisation (docs/development.md, "React Compiler"). So this runs
 * the compiler over the pages' source (`src/` and the chart kit, `packages/charts/src/`) as the build does and holds which of our functions it skips to the list
 * below. It fails on a skip that is not listed, and on a listed one that no longer happens, so the
 * list can only shrink on purpose. With Babel 8 the compiler skipped 65 functions, not these,
 * without a word (issue #130): that is the kind of change this catches.
 *
 * An entry is a file and a function of ours, and nothing of the compiler's: not its wording for the
 * skip, which is its own to change, and not a line number, which any edit above would move. Why
 * each is skipped is in the comments; `pnpm tsx scripts/react-compiler.ts skips` prints the current
 * list with the compiler's reason and the line, as a failure here does.
 */
const ALLOWED: AllowedSkip[] = [
  // Issue #131, the monitor. A ref written during render, for the map's long-lived listeners.
  { file: "src/components/event-map.tsx", fn: "EventMap" },
  // A default parameter that is an expression: `of = events.length`, `placeholder = <Skeleton />`.
  // `EventsTable` holds a TanStack Table, which keeps its state inside one stable object: when #131
  // lets it compile, walk sorting and paging in a browser before taking this entry out.
  { file: "src/components/events-table.tsx", fn: "EventsTable" },
  { file: "src/components/deferred.tsx", fn: "Deferred" },
  // Issue #132, the insights page. The 3D block's refs: three written during render, one read.
  { file: "src/insights/block3d/index.tsx", fn: "Block3D" },
  { file: "src/insights/block3d/index.tsx", fn: "Block" },
  { file: "src/insights/block3d/index.tsx", fn: "Viewer" },
  { file: "src/insights/block3d/index.tsx", fn: "Replay" },
  // A method call nested in `Math.round(…)` or `Math.ceil(…)`, which the compiler trips on.
  { file: "src/insights/questions/index.tsx", fn: "Layout" },
  { file: "src/insights/questions/index.tsx", fn: "Far" },
  { file: "src/insights/story/graphic.tsx", fn: "Graphic" },
];

const skip = (file: string, fn: string, line = 1): Skip => ({ file, fn, line, reason: "why the compiler left it" });

describe("compareSkips", () => {
  it("finds nothing when the compiler skips exactly what is listed, in any order", () => {
    const found = [skip("src/b.tsx", "B"), skip("src/a.tsx", "A")];
    const allowed = [
      { file: "src/a.tsx", fn: "A" },
      { file: "src/b.tsx", fn: "B" },
    ];
    expect(compareSkips(found, allowed)).toEqual({ unlisted: [], stale: [] });
  });

  it("reports a skip that is not listed, with its line and reason", () => {
    const added = skip("src/new.tsx", "New", 12);
    expect(compareSkips([skip("src/a.tsx", "A"), added], [{ file: "src/a.tsx", fn: "A" }])).toEqual({
      unlisted: [added],
      stale: [],
    });
  });

  it("reports a listed skip that no longer happens", () => {
    const gone = { file: "src/a.tsx", fn: "A" };
    expect(compareSkips([], [gone])).toEqual({ unlisted: [], stale: [gone] });
  });

  it("tells two functions of one name apart by their file", () => {
    const found = skip("src/b.tsx", "Row");
    const listed = { file: "src/a.tsx", fn: "Row" };
    expect(compareSkips([found], [listed])).toEqual({ unlisted: [found], stale: [listed] });
  });

  it("does not care how the compiler words the skip", () => {
    const reworded = { ...skip("src/a.tsx", "A"), reason: "the same skip, in a later release's words" };
    expect(compareSkips([reworded], [{ file: "src/a.tsx", fn: "A" }])).toEqual({ unlisted: [], stale: [] });
  });

  it("counts two skips in one function as two", () => {
    const twice = [skip("src/a.tsx", "A", 3), skip("src/a.tsx", "A", 9)];
    const { unlisted, stale } = compareSkips(twice, [{ file: "src/a.tsx", fn: "A" }]);
    expect(unlisted).toHaveLength(1);
    expect(stale).toEqual([]);
  });
});

describe("functionName", () => {
  it("reads a declaration's name, exported or not", () => {
    expect(functionName("function Far({ data }: Props) {", 0)).toBe("Far");
    const source = "export default function EventMap({";
    expect(functionName(source, source.indexOf("function"))).toBe("EventMap");
  });

  it("reads a named function expression handed to memo", () => {
    const source = "export const EventsTable = memo(function EventsTable({";
    expect(functionName(source, source.indexOf("function"))).toBe("EventsTable");
  });

  it("reads an arrow function's name from what it is assigned to", () => {
    const source = "const useThing = (a: number) => a;";
    expect(functionName(source, source.indexOf("("))).toBe("useThing");
    const wrapped = "export const Row = memo(({ id }: Props) => null);";
    expect(functionName(wrapped, wrapped.indexOf("({"))).toBe("Row");
  });

  it("says so when there is no name to read", () => {
    const source = "export default () => null;";
    expect(functionName(source, source.indexOf("("))).toBe("(anonymous)");
  });
});

describe("React Compiler over the pages' source", () => {
  it("skips exactly the functions listed, and compiles the rest", { timeout: 120_000 }, async () => {
    const report = await compilerReport(path.resolve(import.meta.dirname, ".."));
    const { unlisted, stale } = compareSkips(report.skips, ALLOWED);

    // Spelled out, so a failure names the function, where, and the compiler's reason for it.
    expect(
      unlisted.map((s) => `${s.file}:${s.line} ${s.fn}: ${s.reason}`),
      "React Compiler skips a function that is not in ALLOWED. Fix what it names (docs/frontend.md, " +
        '"Writing for React Compiler"), or list it here with the issue that will.',
    ).toEqual([]);
    expect(
      stale.map((s) => `${s.file} ${s.fn}`),
      "A function in ALLOWED is compiled now (or gone). Remove its entry.",
    ).toEqual([]);

    // The compiler did run, over both folders: an empty report would pass both checks above.
    expect(report.compiled).toContainEqual({ file: "src/App.tsx", fn: "App" });
    expect(report.compiled).toContainEqual({ file: "packages/charts/src/reading.ts", fn: "useReading" });
  });
});
