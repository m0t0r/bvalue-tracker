import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/lib/i18n";
import { WaveRace } from "./feel";

// The race is the S wave's dot travelling to Pereira, which sits where the track ends.
const mount = (km: number) => {
  const race = (distance: number) => createElement(I18nProvider, null, createElement(WaveRace, { km: distance }));
  const view = render(race(km));
  const dot = () => Number(view.container.querySelector('circle[r="7"]')!.getAttribute("cx"));
  const end = () => Number(view.container.querySelector("line")!.getAttribute("x2"));
  return {
    dot,
    arrived: () => dot() === end(),
    play: () => act(() => void fireEvent.click(view.getByRole("button"))),
    setKm: (distance: number) => view.rerender(race(distance)),
  };
};
const frames = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
const reducedMotion = (reduced: boolean) =>
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduced && query.includes("reduced-motion"),
    addEventListener() {},
    removeEventListener() {},
  }));

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance", "setTimeout", "clearTimeout"],
  });
  reducedMotion(false);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("WaveRace", () => {
  it("opens on the finished race, and the button runs it from the source", () => {
    const race = mount(120);
    expect(race.arrived()).toBe(true);
    race.play();
    frames(16);
    const early = race.dot();
    expect(race.arrived()).toBe(false);
    frames(2000);
    expect(race.dot()).toBeGreaterThan(early);
    expect(race.arrived()).toBe(false);
    // 120 km at 3.5 km/s is ~34 s, sped up ×4.
    frames(10_000);
    expect(race.arrived()).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("shows a new distance's finished race at once, and the old race stops", () => {
    const race = mount(120);
    race.play();
    frames(2000);
    expect(race.arrived()).toBe(false);
    race.setKm(200);
    expect(race.arrived()).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    frames(2000);
    expect(race.arrived()).toBe(true);
    // Back on the first distance: finished too, not where its race was left.
    race.setKm(120);
    expect(race.arrived()).toBe(true);
  });

  it("steps through the race for a reader who asked for less motion", () => {
    reducedMotion(true);
    const race = mount(120);
    race.play();
    const start = race.dot();
    expect(race.arrived()).toBe(false);
    frames(900);
    // The P wave is there; the S wave is part of the way.
    expect(race.dot()).toBeGreaterThan(start);
    expect(race.arrived()).toBe(false);
    frames(900);
    expect(race.arrived()).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops asking for frames when it leaves the page", () => {
    const race = mount(120);
    race.play();
    frames(100);
    cleanup();
    expect(vi.getTimerCount()).toBe(0);
  });
});
