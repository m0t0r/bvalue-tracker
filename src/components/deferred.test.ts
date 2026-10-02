import { act, cleanup, render } from "@testing-library/react";
import { createElement, lazy } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Deferred } from "./deferred";

/**
 * Stands in for IntersectionObserver and returns every observer the page then makes, with the margin
 * it asked for, so a test can say what is in view.
 */
const stubObservers = () => {
  const observers: { margin: string | undefined; fire: (inView: boolean) => void }[] = [];
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      // usehooks-ts counts an entry as in view only past one of the observer's thresholds.
      readonly thresholds = [0];
      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        const self = this as unknown as IntersectionObserver;
        observers.push({
          margin: options?.rootMargin,
          fire: (inView) =>
            callback(
              [{ isIntersecting: inView, intersectionRatio: inView ? 1 : 0 } as IntersectionObserverEntry],
              self,
            ),
        });
      }
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    },
  );
  return observers;
};

// Issue #72: on a desktop `/` the map sits just under the fold, inside the 600 px every other card is
// fetched within, so MapLibre and ~1.5 MB of tiles loaded at first paint. The map asks for 0 instead.
describe("Deferred", () => {
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
    const observers = stubObservers();
    mount();
    expect(observers.map((o) => o.margin)).toContain("600px");
  });

  it("fetches a card only as near as its own margin says", () => {
    const observers = stubObservers();
    mount("0px");
    expect(observers.map((o) => o.margin)).toEqual(["0px"]);
  });

  it("shows the placeholder until the card comes near, then the drawing, for good", () => {
    const observers = stubObservers();
    const view = mount("0px");
    expect(view.queryByText("placeholder")).not.toBeNull();
    expect(view.queryByText("drawing")).toBeNull();
    act(() => observers.at(-1)!.fire(true));
    expect(view.queryByText("drawing")).not.toBeNull();
    act(() => observers.at(-1)!.fire(false));
    expect(view.queryByText("drawing")).not.toBeNull();
  });

  // Issue #145: a chart's name opens its explainer, and a reader can press it in the placeholder. The
  // header is drawn once, so the chunk landing does not take an open card, or the focus, with it.
  it("keeps the header's own elements when the drawing lands, chunk or no chunk", async () => {
    const observers = stubObservers();
    let arrive!: () => void;
    const chunk = new Promise<void>((r) => (arrive = r));
    // The chart's chunk, held back until the test lets it arrive.
    const Drawing = lazy(() => chunk.then(() => ({ default: () => createElement("p", null, "drawing") })));
    const view = render(
      createElement(Deferred, {
        title: createElement("button", null, "Title"),
        description: "d",
        action: createElement("button", null, "Action"),
        children: createElement(Drawing),
      }),
    );
    const title = view.getByRole("button", { name: "Title" });
    const action = view.getByRole("button", { name: "Action" });
    act(() => title.focus());
    act(() => observers.at(-1)!.fire(true));
    await act(async () => {
      arrive();
      await chunk;
    });
    expect(view.queryByText("drawing")).not.toBeNull();
    expect(view.getByRole("button", { name: "Title" })).toBe(title);
    expect(view.getByRole("button", { name: "Action" })).toBe(action);
    expect(document.activeElement).toBe(title);
  });
});
