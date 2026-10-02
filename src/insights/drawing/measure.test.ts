import { act, cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";

/**
 * A width measured before the web font has loaded is in the stand-in face. A drawing laid out then has
 * to be laid out again once the font is in, compiled by React Compiler as it is: a component keeps
 * what it computed until one of its inputs changes (code review of issue #130).
 *
 * A fresh `measure` module over a canvas whose text is 5 px a letter in the stand-in face and 7 px in
 * the web font, and a label drawn at the width it measures, as a scene reserves room for one.
 */
async function label() {
  let loaded = false;
  const fonts = Object.assign(new EventTarget(), { check: () => loaded });
  // On the document itself, where the module reads it; taken off again after the test.
  Object.defineProperty(document, "fonts", { value: fonts, configurable: true });
  onTestFinished(() => void delete (document as { fonts?: unknown }).fonts);
  document.documentElement.style.fontFamily = "Geist Variable";
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    font: "",
    measureText: (s: string) => ({ width: s.length * (loaded ? 7 : 5) }),
  } as unknown as CanvasRenderingContext2D);
  vi.resetModules();
  const { useTextWidth } = await import("./measure");

  function Label() {
    const measure = useTextWidth();
    return createElement("svg", { width: measure("Chocó", 12) });
  }
  const view = render(createElement(Label));
  return {
    width: () => Number(view.container.querySelector("svg")!.getAttribute("width")),
    fontArrives: () =>
      act(() => {
        loaded = true;
        fonts.dispatchEvent(new Event("loadingdone"));
      }),
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.documentElement.style.fontFamily = "";
});

describe("a label measured with useTextWidth", () => {
  // Five letters, and 3 % over the canvas's own width for the labels' tabular figures.
  it("is drawn again at the web font's width once the font arrives", async () => {
    const { width, fontArrives } = await label();
    expect(width()).toBeCloseTo(5 * 5 * 1.03, 6);
    fontArrives();
    expect(width()).toBeCloseTo(5 * 7 * 1.03, 6);
  });
});
