import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StoredEvent } from "@/lib/api";
import type { DayRange } from "@/lib/daily-counts";
import { ZoneProvider } from "@/lib/zone";
import { ZONES } from "../../../core/zones";
import { MagnitudeTimeChart } from "./magnitude-time";

const DAY = 86_400_000;
// 10 August 2026, 00:00 in Colombia: the first day of every catalogue here.
const AUG_10 = Date.UTC(2026, 7, 10, 5);

let fine = false;
// happy-dom lays nothing out: every box is 400 × 320 at (0, 0), so the chart takes its scrolling form
// (under 768 px), a day 28 px wide less the margins' share.
beforeEach(() => {
  fine = false;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(DOMRect.fromRect({ width: 400, height: 320 }));
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: fine && query.includes("pointer: fine"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.dragDays;
});

const event = (id: string, day: number, hour: number, mag: number, depthKm = 20): StoredEvent =>
  ({
    id,
    time: new Date(AUG_10 + day * DAY + hour * 3_600_000).toISOString(),
    mag,
    depthKm,
    region: "Sipi - Choco, Colombia",
  }) as StoredEvent;

// Twenty days, with events on days 0, 1, 2 and 19; day 0 has the mainshock and one deep event.
const EVENTS = [
  event("main", 0, 7, 7.4, 103),
  event("deep1", 0, 9, 2.8, 90),
  event("a", 0, 8, 2.5),
  event("b", 1, 3, 3.1),
  event("c", 1, 5, 2.2),
  event("d", 2, 12, 2.9),
  event("last", 19, 20, 2.4),
];

function draw(events: StoredEvent[] = EVENTS, days: DayRange | null = null) {
  const onDays = vi.fn();
  const props = (e: StoredEvent[], d: DayRange | null) =>
    createElement(
      ZoneProvider,
      { value: ZONES.choco },
      createElement(MagnitudeTimeChart, {
        events: e,
        mainshockId: "main",
        days: d,
        picked: 0,
        onDays,
        onShowPicked: () => {},
      }),
    );
  const view = render(props(events, days));
  const [dots, bars] = [...view.container.querySelectorAll("svg[role=application]")] as SVGSVGElement[];
  const tips = () => [...view.container.querySelectorAll("[data-chart-tip]")].map((e) => e.textContent ?? "");
  return {
    view,
    dots: dots!,
    bars: bars!,
    tips,
    onDays,
    rerender: (e: StoredEvent[], d: DayRange | null) => view.rerender(props(e, d)),
  };
}

/** Where a day's middle is on the bars, in the mocked layout: the plot is 20 × 28 = 560 px wide. */
const dayX = (day: number) => 30 + ((560 - 30 - 12) / 20) * (day + 0.5);

describe("'Magnitud en el tiempo' drawn without Recharts", () => {
  it("draws a dot per event, a star for the mainshock, and names both drawings", () => {
    const { view, dots, bars } = draw();
    expect(dots.querySelector("title")?.textContent).toBe("Magnitude over time");
    expect(bars.querySelector("title")?.textContent).toBe("Events per day");
    expect(bars.querySelector("desc")?.textContent).toMatch(/^With the keyboard/);
    expect(dots.querySelectorAll("path[id]")).toHaveLength(7);
    // One in the mainshock's colour, drawn last, over the others, and larger than a dot.
    const star = dots.querySelector(".fill-chart-2 path")!;
    expect(star.id).toBe("main");
    expect(star.getAttribute("d")!.length).toBeGreaterThan(dots.querySelector("#a")!.getAttribute("d")!.length);
    expect(dots.querySelectorAll(".fill-chart-4\\/55 path")).toHaveLength(1);
    // The pinned axes repeat what the plots show: out of the accessibility tree and the tab order.
    expect(view.container.querySelectorAll("[aria-hidden=true] svg")).toHaveLength(2);
    expect(view.container.querySelectorAll("svg[tabindex='0']")).toHaveLength(2);
  });

  it("draws a bar for each group on each day that has events, and none for a day without", () => {
    const { bars } = draw();
    // Days 0, 1, 2 and 19 in the shallow group, day 0 in the deep one.
    expect(bars.querySelectorAll("path.fill-chart-1")).toHaveLength(4);
    expect(bars.querySelectorAll("path.fill-chart-4")).toHaveLength(1);
    for (const p of bars.querySelectorAll("path")) expect(p.getAttribute("d")).not.toMatch(/NaN|Infinity|h-?0[vZ]/);
  });

  it("draws a catalogue of a single day, which Recharts left without a bar", () => {
    const { bars, dots } = draw([event("x", 0, 3, 2.5), event("y", 0, 4, 2.7)]);
    const bar = bars.querySelector("path.fill-chart-1")!;
    const width = Number(/h([\d.]+)v/.exec(bar.getAttribute("d")!)![1]);
    expect(width).toBeGreaterThan(100);
    expect(dots.querySelectorAll("path[id]")).toHaveLength(2);
  });

  it("leaves out an event whose time cannot be read, and draws nothing for no events", () => {
    const bad = { ...event("bad", 0, 0, 3), time: "not a time" };
    const { dots } = draw([...EVENTS, bad]);
    expect(dots.querySelectorAll("path[id]")).toHaveLength(7);
    for (const p of dots.querySelectorAll("path[id]")) expect(p.getAttribute("transform")).not.toMatch(/NaN/);
    cleanup();
    const empty = draw([]);
    expect(empty.view.container.querySelectorAll("path[id]")).toHaveLength(0);
  });
});

describe("the dots' tooltip", () => {
  it("walks the events in the order they happened, every group and the mainshock included", () => {
    const { dots, tips } = draw();
    expect(tips()).toEqual([]);
    act(() => dots.focus());
    // Recharts' keyboard walked one depth group and never reached the mainshock.
    expect(tips()[0]).toMatch(/^M7\.4 · 10 Aug 2026, 07:00Deep group · 103 km · Sipi - Choco$/);
    fireEvent.keyDown(dots, { key: "ArrowRight" });
    expect(tips()[0]).toMatch(/^M2\.5 · 10 Aug 2026, 08:00Shallow group/);
    fireEvent.keyDown(dots, { key: "ArrowRight" });
    expect(tips()[0]).toMatch(/^M2\.8 · 10 Aug 2026, 09:00Deep group/);
    fireEvent.keyDown(dots, { key: "ArrowLeft" });
    fireEvent.keyDown(dots, { key: "ArrowLeft" });
    fireEvent.keyDown(dots, { key: "ArrowLeft" });
    expect(tips()[0]).toMatch(/^M7\.4/);
    for (let i = 0; i < 10; i++) fireEvent.keyDown(dots, { key: "ArrowRight" });
    expect(tips()[0]).toMatch(/^M2\.4 · 29 Aug/);
  });

  it("keeps the arrows from scrolling the chart around it, hides on Enter and on blur, and comes back where it was", () => {
    const { dots, tips } = draw();
    act(() => dots.focus());
    expect(fireEvent.keyDown(dots, { key: "ArrowRight" })).toBe(false);
    fireEvent.keyDown(dots, { key: "Enter" });
    expect(tips()).toEqual([]);
    fireEvent.keyDown(dots, { key: "Enter" });
    expect(tips()[0]).toMatch(/^M2\.5/);
    act(() => dots.blur());
    expect(tips()).toEqual([]);
    act(() => dots.focus());
    expect(tips()[0]).toMatch(/^M2\.5/);
  });

  it("is on the dot nearest the pointer, within reach, and lets go when a finger is lifted", () => {
    const { dots, tips } = draw();
    const box = dots.parentElement!;
    const at = (id: string) =>
      /translate\(([\d.]+), ([\d.]+)\)/.exec(dots.querySelector(`#${id}`)!.getAttribute("transform")!)!;
    const [, x, y] = at("last");
    // Ten pixels off the dot: within a finger's reach (14 px), not a mouse's (8 px).
    fireEvent.mouseMove(box, { clientX: Number(x) + 10, clientY: Number(y) });
    expect(tips()[0]).toMatch(/^M2\.4/);
    fireEvent.touchEnd(box);
    expect(tips()).toEqual([]);
    fireEvent.mouseMove(box, { clientX: Number(x) + 40, clientY: Number(y) });
    expect(tips()).toEqual([]);
    cleanup();

    fine = true;
    const mouse = draw();
    fireEvent.mouseMove(mouse.dots.parentElement!, { clientX: Number(x) + 10, clientY: Number(y) });
    expect(mouse.tips()).toEqual([]);
    fireEvent.mouseMove(mouse.dots.parentElement!, { clientX: Number(x) + 5, clientY: Number(y) - 5 });
    expect(mouse.tips()[0]).toMatch(/^M2\.4/);
    fireEvent.mouseLeave(mouse.dots.parentElement!);
    expect(mouse.tips()).toEqual([]);
  });

  /** Gives the scroll container a width, which happy-dom does not: 300 px, so 264 px of plot on screen. */
  const laidOut = (view: ReturnType<typeof draw>["view"]) => {
    const scroller = view.container.querySelector("[role=group]") as HTMLElement;
    Object.defineProperty(scroller, "clientWidth", { configurable: true, value: 300 });
    return scroller;
  };
  const dotAt = (dots: SVGSVGElement, id: string) => {
    const [, x, y] = /translate\(([\d.]+), ([\d.]+)\)/.exec(dots.querySelector(`#${id}`)!.getAttribute("transform")!)!;
    return { x: Number(x), y: Number(y) };
  };

  it("stays with the keyboard when the keyboard scrolls the chart under a resting pointer", () => {
    const { dots, tips, view } = draw();
    const scroller = laidOut(view);
    const box = dots.parentElement!;
    const d = dotAt(dots, "d");
    // The pointer rests on nothing, 300 px to the right of an early dot.
    fireEvent.mouseMove(box, { clientX: d.x + 300, clientY: d.y });
    act(() => dots.focus());
    for (let i = 0; i < 6; i++) fireEvent.keyDown(dots, { key: "ArrowRight" });
    // The last event was off screen, so the chart scrolled to it.
    expect(tips()[0]).toMatch(/^M2\.4/);
    expect(scroller.scrollLeft).toBeGreaterThan(200);
    // That puts the early dot under the pointer, and the browser sends a move from where the pointer is.
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 300, width: 400, height: 320 }),
    );
    fireEvent.mouseMove(box, { clientX: d.x + 300, clientY: d.y });
    expect(tips()[0]).toMatch(/^M2\.4/);
    // A real move, a pixel along, takes the tooltip, and the arrows take it back.
    fireEvent.mouseMove(box, { clientX: d.x + 301, clientY: d.y });
    expect(tips()[0]).toMatch(/^M2\.9/);
    fireEvent.keyDown(dots, { key: "ArrowLeft" });
    expect(tips()[0]).toMatch(/^M2\.4/);
  });

  it("follows what is under a resting pointer when the reader scrolls the chart", () => {
    const { dots, tips, view } = draw();
    laidOut(view);
    const box = dots.parentElement!;
    const d = dotAt(dots, "d");
    fireEvent.mouseMove(box, { clientX: d.x + 300, clientY: d.y });
    expect(tips()).toEqual([]);
    // A wheel or a trackpad moves the chart 300 px; the move that follows has the same coordinates.
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 300, width: 400, height: 320 }),
    );
    fireEvent.mouseMove(box, { clientX: d.x + 300, clientY: d.y });
    expect(tips()[0]).toMatch(/^M2\.9/);
  });

  it("reads the mainshock's star anywhere on it", () => {
    fine = true;
    const { dots, tips } = draw();
    const star = dotAt(dots, "main");
    // Ten pixels from its centre: inside the star, past a dot's reach.
    fireEvent.mouseMove(dots.parentElement!, { clientX: star.x + 10, clientY: star.y });
    expect(tips()[0]).toMatch(/^M7\.4/);
    fireEvent.mouseMove(dots.parentElement!, { clientX: star.x + 20, clientY: star.y });
    expect(tips()).toEqual([]);
  });

  it("forgets an event a filter has taken away", () => {
    const { dots, tips, rerender } = draw();
    act(() => dots.focus());
    fireEvent.keyDown(dots, { key: "ArrowRight" });
    expect(tips()[0]).toMatch(/^M2\.5/);
    rerender(
      EVENTS.filter((e) => e.id !== "a"),
      null,
    );
    expect(tips()).toEqual([]);
    fireEvent.keyDown(dots, { key: "ArrowRight" });
    expect(tips()[0]).toMatch(/^M7\.4/);
  });
});

describe("choosing days on the bars", () => {
  it("has the keyboard's choices: the arrows move, Enter chooses, Shift + Enter chooses up to the day", () => {
    const { bars, tips, onDays, rerender } = draw();
    act(() => bars.focus());
    expect(tips()[0]).toBe("3 · 10 Aug 2026Shallow 1 · Deep 2");
    fireEvent.keyDown(bars, { key: "ArrowRight" });
    expect(tips()[0]).toBe("2 · 11 Aug 2026");
    fireEvent.keyDown(bars, { key: "Enter" });
    expect(onDays).toHaveBeenLastCalledWith({ from: AUG_10 + DAY, to: AUG_10 + DAY });
    // The tooltip stays: Recharts hid it on every Enter, and the day the keyboard was on with it.
    expect(tips()[0]).toBe("2 · 11 Aug 2026");
    // A held Enter repeats, and each repeat would undo the choice.
    fireEvent.keyDown(bars, { key: "Enter", repeat: true });
    expect(onDays).toHaveBeenCalledTimes(1);

    rerender(EVENTS, { from: AUG_10 + DAY, to: AUG_10 + DAY });
    fireEvent.keyDown(bars, { key: "ArrowRight" });
    fireEvent.keyDown(bars, { key: "Enter", shiftKey: true });
    expect(onDays).toHaveBeenLastCalledWith({ from: AUG_10 + DAY, to: AUG_10 + 2 * DAY });
    // The chosen day pressed again lets it go.
    fireEvent.keyDown(bars, { key: "ArrowLeft" });
    fireEvent.keyDown(bars, { key: "Enter" });
    expect(onDays).toHaveBeenLastCalledWith(null);
  });

  it("never chooses with Enter a day the tooltip is not on", () => {
    const { bars, tips, onDays } = draw();
    const box = bars.parentElement!;
    // The mouse rests on day 2; the keyboard then moves to day 0 and on to day 1.
    fireEvent.mouseMove(box, { clientX: dayX(2), clientY: 60 });
    expect(tips()[0]).toBe("1 · 12 Aug 2026");
    act(() => bars.focus());
    fireEvent.keyDown(bars, { key: "ArrowRight" });
    expect(tips()[0]).toBe("2 · 11 Aug 2026");
    // The pointer moves to day 19 and takes the tooltip: Enter has no day of its own to choose.
    fireEvent.mouseMove(box, { clientX: dayX(19), clientY: 60 });
    expect(tips()[0]).toBe("1 · 29 Aug 2026");
    fireEvent.keyDown(bars, { key: "Enter" });
    expect(onDays).not.toHaveBeenCalled();
    // An arrow brings the keyboard back to where it was.
    fireEvent.keyDown(bars, { key: "ArrowRight" });
    expect(tips()[0]).toBe("2 · 11 Aug 2026");
    fireEvent.keyDown(bars, { key: "Enter" });
    expect(onDays).toHaveBeenLastCalledWith({ from: AUG_10 + DAY, to: AUG_10 + DAY });
  });

  it("does not choose a day without events, and Escape lets go of the choice", () => {
    const { bars, onDays, rerender, view } = draw();
    act(() => bars.focus());
    for (let i = 0; i < 5; i++) fireEvent.keyDown(bars, { key: "ArrowRight" });
    fireEvent.keyDown(bars, { key: "Enter" });
    expect(onDays).not.toHaveBeenCalled();
    fireEvent.keyDown(bars, { key: "Escape" });
    expect(onDays).not.toHaveBeenCalled();
    rerender(EVENTS, { from: AUG_10, to: AUG_10 });
    fireEvent.keyDown(view.container.querySelector("[role=group]")!, { key: "Escape" });
    expect(onDays).toHaveBeenLastCalledWith(null);
  });

  it("greys the other days and draws a band behind the chosen ones, in the bars and in the dots", () => {
    const { bars, dots } = draw(EVENTS, { from: AUG_10 + DAY, to: AUG_10 + 2 * DAY });
    expect(bars.querySelectorAll("path.fill-border")).toHaveLength(3);
    expect(bars.querySelectorAll("path.fill-chart-1")).toHaveLength(2);
    const step = (560 - 30 - 12) / 20;
    for (const svg of [bars, dots]) {
      const band = svg.querySelector("[data-band]")!;
      expect(Number(band.getAttribute("x"))).toBeCloseTo(30 + step);
      expect(Number(band.getAttribute("width"))).toBeCloseTo(2 * step);
    }
  });

  it("keeps the band over the days still on the axis when a filter has cut into the choice", () => {
    // The choice began two days before the catalogue now does: Recharts discarded the whole band.
    const { dots } = draw(EVENTS, { from: AUG_10 - 2 * DAY, to: AUG_10 + DAY });
    const band = dots.querySelector("[data-band]")!;
    expect(Number(band.getAttribute("x"))).toBeCloseTo(30);
    expect(Number(band.getAttribute("width"))).toBeCloseTo((2 * (560 - 30 - 12)) / 20);
  });

  it("takes a press on touch: the day under it, and nothing for a day without events", () => {
    const { bars, onDays } = draw();
    const box = bars.parentElement!;
    fireEvent.click(box, { clientX: dayX(2) });
    expect(onDays).toHaveBeenLastCalledWith({ from: AUG_10 + 2 * DAY, to: AUG_10 + 2 * DAY });
    fireEvent.click(box, { clientX: dayX(7) });
    expect(onDays).toHaveBeenCalledTimes(1);
    // Off the axis altogether.
    fireEvent.click(box, { clientX: 5 });
    expect(onDays).toHaveBeenCalledTimes(1);
  });

  it("takes a drag with a mouse, followed on the window, and shows it on the bars while it lasts", () => {
    fine = true;
    const { bars, onDays } = draw();
    const box = bars.parentElement!;
    fireEvent.mouseDown(box, { clientX: dayX(0), button: 0 });
    expect(document.documentElement.dataset.dragDays).toBe("");
    fireEvent.mouseMove(window, { clientX: dayX(1), buttons: 1 });
    // Day 2 onwards greys while the drag is over days 0 and 1; nothing is chosen yet.
    expect(bars.querySelectorAll("path.fill-border")).toHaveLength(2);
    expect(onDays).not.toHaveBeenCalled();
    // Past the last day, outside the chart: the drag ends on the last day.
    fireEvent.mouseUp(window, { clientX: 5000 });
    expect(onDays).toHaveBeenLastCalledWith({ from: AUG_10, to: AUG_10 + 19 * DAY });
    expect(document.documentElement.dataset.dragDays).toBeUndefined();
  });

  it("takes a press with a mouse as a drag that went nowhere, and a shift-press from the last day pressed", () => {
    fine = true;
    const { bars, onDays, rerender } = draw();
    const box = bars.parentElement!;
    fireEvent.mouseDown(box, { clientX: dayX(1), button: 0 });
    fireEvent.mouseUp(window, { clientX: dayX(1) });
    expect(onDays).toHaveBeenLastCalledWith({ from: AUG_10 + DAY, to: AUG_10 + DAY });
    rerender(EVENTS, { from: AUG_10 + DAY, to: AUG_10 + DAY });
    fireEvent.mouseDown(box, { clientX: dayX(19), button: 0, shiftKey: true });
    fireEvent.mouseUp(window, { clientX: dayX(19) });
    expect(onDays).toHaveBeenLastCalledWith({ from: AUG_10 + DAY, to: AUG_10 + 19 * DAY });
    // A press on a day without events chooses nothing.
    fireEvent.mouseDown(box, { clientX: dayX(7), button: 0 });
    fireEvent.mouseUp(window, { clientX: dayX(7) });
    expect(onDays).toHaveBeenCalledTimes(2);
  });

  it("drops a drag on Escape, on a lost mouse-up and when the window loses focus, choosing nothing", () => {
    fine = true;
    const { bars, onDays } = draw();
    const box = bars.parentElement!;
    const start = () => {
      fireEvent.mouseDown(box, { clientX: dayX(0), button: 0 });
      fireEvent.mouseMove(window, { clientX: dayX(2), buttons: 1 });
      expect(bars.querySelectorAll("path.fill-border")).toHaveLength(1);
    };
    const dropped = () => {
      expect(bars.querySelectorAll("path.fill-border")).toHaveLength(0);
      // The next release anywhere chooses nothing.
      fireEvent.mouseUp(window, { clientX: dayX(2) });
      expect(onDays).not.toHaveBeenCalled();
      expect(document.documentElement.dataset.dragDays).toBeUndefined();
    };
    start();
    fireEvent.keyDown(window, { key: "Escape" });
    dropped();
    start();
    // A move with the button already up: the mouse-up went to a context menu or another window.
    fireEvent.mouseMove(window, { clientX: dayX(3), buttons: 0 });
    dropped();
    start();
    fireEvent.blur(window);
    dropped();
    // A right click, or Ctrl-press on a Mac, starts none.
    fireEvent.mouseDown(box, { clientX: dayX(0), button: 2 });
    fireEvent.mouseDown(box, { clientX: dayX(0), button: 0, ctrlKey: true });
    expect(document.documentElement.dataset.dragDays).toBeUndefined();
  });

  it("shows the day under the pointer, and lets go when the pointer leaves the plot", () => {
    const { bars, tips } = draw();
    const box = bars.parentElement!;
    fireEvent.mouseMove(box, { clientX: dayX(1), clientY: 60 });
    expect(tips()[0]).toBe("2 · 11 Aug 2026");
    expect(bars.querySelector("[data-cursor]")).not.toBeNull();
    // Over the date labels, under the plot.
    fireEvent.mouseMove(box, { clientX: dayX(1), clientY: 130 });
    expect(tips()).toEqual([]);
    fireEvent.mouseMove(box, { clientX: dayX(0), clientY: 60 });
    fireEvent.mouseLeave(box);
    expect(tips()).toEqual([]);
  });
});
