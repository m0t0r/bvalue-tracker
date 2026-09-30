import { act, cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { textWidth, useTextWidth } from "./measure";

/**
 * A width measured before the web font has loaded is in the stand-in face, and is not kept. For a
 * drawing to measure again once the font is there, something has to tell React: compiled by React
 * Compiler, a component keeps what it computed until one of its inputs changes, and a module-level
 * function is never one (code review of issue #130). `useTextWidth` is that input.
 */
let loaded: boolean;
const fonts = Object.assign(new EventTarget(), { check: () => loaded });

beforeEach(() => {
  loaded = false;
  vi.stubGlobal("document", Object.assign(document, { fonts }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useTextWidth", () => {
  it("hands out a new function when the web font arrives, so a memoised layout measures again", () => {
    const seen: unknown[] = [];
    let layouts = 0;
    function Drawing() {
      const measure = useTextWidth();
      seen.push(measure);
      // What a scene does: a layout from measured widths, which the compiler memoises.
      const width = [measure("Chocó", 12), ++layouts][0];
      return createElement("svg", { width });
    }
    render(createElement(Drawing));
    expect(layouts).toBe(1);

    act(() => {
      loaded = true;
      fonts.dispatchEvent(new Event("loadingdone"));
    });
    expect(layouts).toBe(2);
    expect(seen.at(-1)).not.toBe(seen[0]);
    expect(seen.at(-1)).toBe(textWidth);
  });

  it("does not render again for a font event that changes nothing", () => {
    loaded = true;
    let renders = 0;
    function Drawing() {
      useTextWidth();
      renders++;
      return null;
    }
    render(createElement(Drawing));
    act(() => void fonts.dispatchEvent(new Event("loadingdone")));
    expect(renders).toBe(1);
  });

  it("measures the same either way: only the function's identity says the font changed", () => {
    function Drawing() {
      const measure = useTextWidth();
      return createElement("i", null, String(measure("abc", 10) === textWidth("abc", 10)));
    }
    expect(render(createElement(Drawing)).container.textContent).toBe("true");
  });
});
