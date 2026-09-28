import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ZoneProvider } from "@/lib/zone";
import { ZONES } from "../../core/zones";
import { MapPreview } from "./map-preview";

// The map's hand-over (issue #72): the picture and the spinner stand in for the map until MapLibre has
// drawn a full frame, then fade and leave. A preview that stayed would cover the live map; one that
// left early would show the half-tiled canvas it exists to hide.
describe("MapPreview", () => {
  afterEach(() => {
    cleanup();
    document.documentElement.classList.remove("dark");
  });

  const mount = (ready: boolean, zone: "choco" | "tolima" = "tolima") =>
    render(createElement(ZoneProvider, { value: ZONES[zone] }, createElement(MapPreview, { ready })));
  const layer = (view: ReturnType<typeof mount>) => view.container.firstElementChild as HTMLElement | null;

  it("shows the zone's picture and a named spinner while the map loads", () => {
    const view = mount(false);
    expect(view.getByRole("status", { name: "Loading the map…" })).toBeTruthy();
    expect(view.container.querySelector("img")?.getAttribute("src")).toMatch(/tolima-light/);
    expect(layer(view)?.getAttribute("aria-hidden")).toBeNull();
  });

  it("uses the dark picture of the chosen zone in the dark theme", () => {
    document.documentElement.classList.add("dark");
    const view = mount(false, "choco");
    expect(view.container.querySelector("img")?.getAttribute("src")).toMatch(/choco-dark/);
  });

  it("drops the spinner and hides itself once the map has drawn", () => {
    const view = mount(true);
    // By element, not by role: under `aria-hidden` a role query would miss a spinner still spinning.
    expect(view.container.querySelector("[data-slot=spinner]")).toBeNull();
    expect(layer(view)?.getAttribute("aria-hidden")).toBe("true");
    expect(layer(view)?.dataset.ready).toBe("true");
  });

  it("leaves at once under reduced motion, where no fade will end", () => {
    const real = window.matchMedia;
    window.matchMedia = ((q: string) => ({ ...real(q), matches: q.includes("reduced-motion") })) as typeof matchMedia;
    try {
      expect(layer(mount(true))).toBeNull();
    } finally {
      window.matchMedia = real;
    }
  });

  it("does not leave when a transition inside it ends", () => {
    const view = mount(true);
    act(() => void fireEvent.transitionEnd(view.container.querySelector("img")!));
    expect(layer(view)).not.toBeNull();
  });

  it("leaves the page when its fade ends, and not before", () => {
    const view = mount(false);
    act(() => void fireEvent.transitionEnd(layer(view)!));
    expect(layer(view)).not.toBeNull();
    view.rerender(createElement(ZoneProvider, { value: ZONES.tolima }, createElement(MapPreview, { ready: true })));
    act(() => void fireEvent.transitionEnd(layer(view)!));
    expect(layer(view)).toBeNull();
  });
});
