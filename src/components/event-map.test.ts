import { act, cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toggleTheme } from "@/lib/theme";

/**
 * A stand-in for MapLibre that draws nothing and fires its events when a test says so: the map's
 * hand-over from its picture depends only on `load`, `idle` and `error`, and on the map being torn
 * down and rebuilt.
 */
const maps: FakeMap[] = [];
class FakeMap {
  handlers = new Map<string, ((e?: unknown) => void)[]>();
  styleLoaded = false;
  removed = false;
  constructor() {
    maps.push(this);
  }
  on(type: string, a: unknown, b?: unknown) {
    if (typeof a === "function") this.handlers.set(type, [...(this.handlers.get(type) ?? []), a as () => void]);
    else if (typeof b !== "function") throw new Error("unexpected on()");
    return this;
  }
  once(type: string, f: () => void) {
    return this.on(type, f);
  }
  fire(type: string, e?: unknown) {
    if (type === "load") this.styleLoaded = true;
    for (const f of this.handlers.get(type) ?? []) f(e);
  }
  isStyleLoaded() {
    return this.styleLoaded;
  }
  setStyle() {}
  addControl() {}
  addSource() {}
  addLayer() {}
  moveLayer() {}
  hasImage() {
    return false;
  }
  addImage() {}
  getSource() {
    return undefined;
  }
  getStyle() {
    return { layers: [{ id: "water", type: "fill" }] };
  }
  getCanvas() {
    return document.createElement("canvas");
  }
  remove() {
    this.removed = true;
  }
}

vi.mock("maplibre-gl", () => ({
  Map: FakeMap,
  NavigationControl: class {},
  Popup: class {},
  setWorkerUrl: () => {},
}));
vi.mock("maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url", () => ({ default: "" }));
vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));

const { default: EventMap } = await import("./event-map");

describe("EventMap's picture", () => {
  beforeEach(() => {
    maps.length = 0;
    document.documentElement.classList.remove("dark");
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  const mount = () => render(createElement(EventMap, { events: [], mainshockId: null }));
  const picture = (view: ReturnType<typeof mount>) => view.container.querySelector("img")?.parentElement ?? null;
  const covered = (view: ReturnType<typeof mount>) =>
    picture(view) !== null && picture(view)!.dataset.ready === undefined;
  const canvasBox = (view: ReturnType<typeof mount>) => picture(view)?.previousElementSibling ?? null;
  const last = () => maps.at(-1)!;

  it("covers the map, which takes no focus or drag, until it has drawn every tile", () => {
    const view = mount();
    expect(covered(view)).toBe(true);
    expect(canvasBox(view)?.hasAttribute("inert")).toBe(true);
    act(() => last().fire("load"));
    expect(covered(view)).toBe(true);
    act(() => last().fire("idle"));
    expect(covered(view)).toBe(false);
    expect(canvasBox(view)?.hasAttribute("inert")).toBe(false);
  });

  it("gives the map back when its style fails to load, rather than spin for good", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const view = mount();
    act(() => last().fire("error", { error: new Error("style 503") }));
    expect(covered(view)).toBe(false);
  });

  it("keeps covering the map through a tile error once the style has loaded", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const view = mount();
    act(() => last().fire("load"));
    act(() => last().fire("error", { error: new Error("tile 404") }));
    expect(covered(view)).toBe(true);
  });

  it("gives the map back after 10 s if a tile never answers", () => {
    vi.useFakeTimers();
    const view = mount();
    act(() => last().fire("load"));
    act(() => void vi.advanceTimersByTime(9_999));
    expect(covered(view)).toBe(true);
    act(() => void vi.advanceTimersByTime(1));
    expect(covered(view)).toBe(false);
  });

  it("covers a map rebuilt for a new theme, even one toggled back before it drew", () => {
    const view = mount();
    act(() => last().fire("load"));
    act(() => last().fire("idle"));
    act(() => toggleTheme());
    expect(maps[0]!.removed).toBe(true);
    expect(covered(view)).toBe(true);
    act(() => toggleTheme());
    expect(maps).toHaveLength(3);
    expect(covered(view)).toBe(true);
    expect(canvasBox(view)?.hasAttribute("inert")).toBe(true);
    act(() => last().fire("load"));
    act(() => last().fire("idle"));
    expect(covered(view)).toBe(false);
  });
});
