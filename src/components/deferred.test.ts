import { act, cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Deferred } from "./deferred";

/** Every observer the page makes, with the margin it asked for, so a test can say what is in view. */
let observers: { margin: string | undefined; fire: (inView: boolean) => void }[] = [];

class FakeObserver {
  // usehooks-ts counts an entry as in view only past one of the observer's thresholds.
  readonly thresholds = [0];
  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    const self = this as unknown as IntersectionObserver;
    observers.push({
      margin: options?.rootMargin,
      fire: (inView) =>
        callback([{ isIntersecting: inView, intersectionRatio: inView ? 1 : 0 } as IntersectionObserverEntry], self),
    });
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

// Issue #72: on a desktop `/` the map sits just under the fold, inside the 600 px every other card is
// fetched within, so MapLibre and ~1.5 MB of tiles loaded at first paint. The map asks for 0 instead.
describe("Deferred", () => {
  beforeEach(() => {
    observers = [];
    vi.stubGlobal("IntersectionObserver", FakeObserver);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const mount = (margin?: string) =>
    render(
      createElement(Deferred, {
        title: "Map",
        description: "d",
        placeholder: createElement("p", null, "placeholder"),
        margin,
        children: createElement("p", null, "drawing"),
      }),
    );

  it("fetches a card within 600 px of the viewport by default", () => {
    mount();
    expect(observers.map((o) => o.margin)).toContain("600px");
  });

  it("fetches a card only as near as its own margin says", () => {
    mount("0px");
    expect(observers.map((o) => o.margin)).toEqual(["0px"]);
  });

  it("shows the placeholder until the card comes near, then the drawing, for good", () => {
    const view = mount("0px");
    expect(view.queryByText("placeholder")).not.toBeNull();
    expect(view.queryByText("drawing")).toBeNull();
    act(() => observers.at(-1)!.fire(true));
    expect(view.queryByText("drawing")).not.toBeNull();
    act(() => observers.at(-1)!.fire(false));
    expect(view.queryByText("drawing")).not.toBeNull();
  });
});
