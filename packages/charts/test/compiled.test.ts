import { cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { useReading, type ReadingHandlers, type ReadingOptions } from "../src";

/**
 * The kit ships compiled by React Compiler, as the pages do, and vitest does not read
 * `vite.config.ts`: the `charts` project is given the compiler in `vitest.config.ts`, or these tests
 * would pass against code no reader runs. The compiler says nothing when it is not applied, so this
 * checks what compiling does to the kit's own hook: rendered again with nothing changed, it hands the
 * drawing the same handlers, which an uncompiled hook makes anew on every render.
 */
afterEach(cleanup);

const read: ReadingOptions["read"] = () => null;
const seen: ReadingHandlers["frame"][] = [];
function Chart() {
  seen.push(useReading({ n: 3, read }).frame);
  return null;
}

describe("the charts project", () => {
  it("runs the kit compiled: a render with nothing changed hands back the same handlers", () => {
    const view = render(createElement(Chart));
    view.rerender(createElement(Chart));
    expect(seen).toHaveLength(2);
    expect(seen[1]).toBe(seen[0]);
  });
});
