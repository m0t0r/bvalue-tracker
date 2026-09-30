// First, before React: React looks for the DevTools hook once, as it loads.
import "../../test/browser/react-profile.js";
import { cleanup, render } from "@testing-library/react";
import { createElement, forwardRef, memo } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * `test/browser/react-profile.js` reads React's fibers the way DevTools' Profiler does (issue #128):
 * their tags, their `flags`, `alternate` and `actualDuration`. None of that is public API, so this is
 * where a React upgrade that moves any of it shows, rather than in a profile that quietly reads 0.
 */
interface Summary {
  commits: number;
  dur: number;
  mounts: number;
  updates: number;
  top: [name: string, mounts: number, updates: number, selfMs: number][];
  err?: string;
}
const prof = (window as unknown as { __prof: { on: boolean; reset(): void; summary(): Summary } }).__prof;
const counts = () =>
  Object.fromEntries(prof.summary().top.map(([name, mounts, updates]) => [name, { mounts, updates }]));

// A component under each memoised row: in a row React leaves alone its fiber is not visited, and
// still carries the flag from the last time it rendered.
function Cell({ n }: { n: number }) {
  // Long enough for any clock to see, so the time read below is never a real 0.
  for (const t0 = performance.now(); performance.now() - t0 < 2;);
  return createElement("b", null, n);
}
const Row = memo(function Row({ n }: { n: number }) {
  return createElement("li", null, createElement(Cell, { n }));
});
const Field = forwardRef<HTMLInputElement, { label: string }>(function Field({ label }, ref) {
  return createElement("input", { ref, "aria-label": label });
});
function List({ rows }: { rows: number[] }) {
  return createElement(
    "ul",
    null,
    rows.map((n, i) => createElement(Row, { key: i, n })),
    createElement(Field, { label: "filter" }),
  );
}
const list = (rows: number[]) => render(createElement(List, { rows }));

beforeEach(() => {
  prof.reset();
  prof.on = true;
});
afterEach(() => {
  prof.on = false;
  cleanup();
});

describe("react-profile.js", () => {
  it("counts every component of a first render as a mount, under its own name", () => {
    list([0, 0, 0]);
    expect(prof.summary()).toMatchObject({ commits: 1, mounts: 8, updates: 0, err: undefined });
    expect(counts()).toEqual({
      List: { mounts: 1, updates: 0 },
      Row: { mounts: 3, updates: 0 },
      Cell: { mounts: 3, updates: 0 },
      Field: { mounts: 1, updates: 0 },
    });
  });

  it("counts only what rendered again in an update: a memo left alone is not in it", () => {
    const view = list([0, 0, 0]);
    prof.reset();
    view.rerender(createElement(List, { rows: [0, 1, 0] }));
    expect(prof.summary()).toMatchObject({ commits: 1, mounts: 0, err: undefined });
    // The list, and the one row whose number changed with its cell. The other two rows bailed out,
    // cells and all; `Field` is not memoised, so it rendered with its parent.
    expect(counts()).toEqual({
      List: { mounts: 0, updates: 1 },
      Row: { mounts: 0, updates: 1 },
      Cell: { mounts: 0, updates: 1 },
      Field: { mounts: 0, updates: 1 },
    });
  });

  it("reads React's render time for each commit", () => {
    list([0, 0, 0]);
    const { dur, top } = prof.summary();
    // Three cells of 2 ms each, which are the list's first row: their own time, not their parents'.
    expect(dur).toBeGreaterThanOrEqual(6);
    expect(top[0]?.[0]).toBe("Cell");
    expect(top[0]?.[3]).toBeGreaterThanOrEqual(6);
    // No component's own time is more than the commit's, and the list is in order of it.
    const self = top.map(([, , , ms]) => ms);
    expect(Math.max(...self)).toBeLessThanOrEqual(dur);
    expect(self).toEqual([...self].sort((a, b) => b - a));
  });

  it("records nothing until it is turned on, and forgets on reset", () => {
    prof.on = false;
    const view = list([0, 0, 0]);
    expect(prof.summary()).toMatchObject({ commits: 0, dur: 0, mounts: 0, updates: 0, top: [] });
    prof.on = true;
    view.rerender(createElement(List, { rows: [1, 0, 0] }));
    expect(prof.summary().commits).toBe(1);
    prof.reset();
    expect(prof.summary().commits).toBe(0);
  });
});
