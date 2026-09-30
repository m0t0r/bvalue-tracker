import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { Profiler, createElement, useState, type KeyboardEvent, type MouseEvent } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Drawing, useReading, useScrollView, type ReadingOptions, type ReadingScroll } from "../src";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// A stand-in chart: points 100 px apart from x 50, in a plot 100 px tall. A pointer within 20 px of a
// point reads it. happy-dom lays nothing out, so a drawing's box is at (0, 0) and a pointer's place in
// the window is its place in the drawing.
const xOf = (i: number) => 50 + i * 100;
const near =
  (n: number, reach = 20): ReadingOptions["read"] =>
  (px, py) => {
    const i = Math.round((px - 50) / 100);
    return i >= 0 && i < n && Math.abs(xOf(i) - px) <= reach && py >= 0 && py <= 100 ? { i, y: py } : null;
  };

function Chart({
  points,
  keyed = false,
  enter,
  drawn = true,
  reach,
}: {
  points: readonly string[];
  keyed?: boolean;
  enter?: (i: number, e: KeyboardEvent) => void;
  /** Whether there is a drawing yet: a chart draws none until it has its size. */
  drawn?: boolean;
  /** How near a point the pointer must be, in px. */
  reach?: number;
}) {
  const reading = useReading({
    n: points.length,
    read: near(points.length, reach),
    ...(keyed ? { id: (i: number) => points[i]! } : {}),
    keyY: () => 50,
    enter,
  });
  const { active } = reading;
  return createElement(
    "div",
    { "data-frame": "", ...reading.frame },
    drawn
      ? createElement(Drawing, {
          width: 600,
          height: 100,
          title: "Title",
          desc: "What it shows",
          reading,
          children: null,
        })
      : null,
    active
      ? createElement("output", null, `${points[active.i]}${active.key ? " (keyboard)" : ""} at ${active.y}`)
      : null,
  );
}

const FIVE = ["a", "b", "c", "d", "e"];

function draw(props: Partial<Parameters<typeof Chart>[0]> = {}) {
  const element = (points: readonly string[], drawn = true, reach?: number) =>
    createElement(Chart, { ...props, points, drawn, reach });
  const view = render(element(props.points ?? FIVE));
  const svg = view.container.querySelector("svg") as SVGSVGElement;
  const frame = view.container.querySelector("[data-frame]") as HTMLElement;
  return {
    svg,
    frame,
    shown: () => view.container.querySelector("output")?.textContent ?? null,
    rerender: (points: readonly string[], drawn = true, reach?: number) => view.rerender(element(points, drawn, reach)),
    arrow: (key: "ArrowRight" | "ArrowLeft") => fireEvent.keyDown(svg, { key }),
    pointer: (x: number, y = 30) => fireEvent.mouseMove(frame, { clientX: x, clientY: y }),
  };
}

describe("a drawing", () => {
  it("is a tab stop with a keyboard layer, named by its title and description", () => {
    const { svg } = draw();
    expect(svg.getAttribute("role")).toBe("application");
    expect(svg.getAttribute("tabindex")).toBe("0");
    expect(svg.querySelector("title")?.textContent).toBe("Title");
    expect(svg.querySelector("desc")?.textContent).toBe("What it shows");
  });
});

describe("what the keyboard reads", () => {
  it("shows the first point on focus, steps with the arrows, stops at the ends and keeps the arrows to itself", () => {
    const { svg, shown, arrow } = draw();
    expect(shown()).toBeNull();
    act(() => svg.focus());
    expect(shown()).toBe("a (keyboard) at 50");
    expect(arrow("ArrowLeft")).toBe(false);
    expect(shown()).toBe("a (keyboard) at 50");
    arrow("ArrowRight");
    expect(shown()).toBe("b (keyboard) at 50");
    for (let i = 0; i < 9; i++) arrow("ArrowRight");
    expect(shown()).toBe("e (keyboard) at 50");
    // Any other key is the page's.
    expect(fireEvent.keyDown(svg, { key: "Tab" })).toBe(true);
    expect(fireEvent.keyDown(svg, { key: "ArrowDown" })).toBe(true);
  });

  it("renders nothing for arrows held against either end", () => {
    // React may call a component once to find that its state did not change (its documented bail-out),
    // so the count is taken after one press at the end; before the fix, every press rendered.
    const commit = vi.fn();
    const view = render(
      createElement(Profiler, { id: "chart", onRender: commit }, createElement(Chart, { points: FIVE })),
    );
    const svg = view.container.querySelector("svg")!;
    const commits = () => commit.mock.calls.length;
    const press = (key: "ArrowLeft" | "ArrowRight", times: number) => {
      for (let i = 0; i < times; i++) fireEvent.keyDown(svg, { key });
    };
    act(() => svg.focus());
    press("ArrowLeft", 1);
    const atFirst = commits();
    press("ArrowLeft", 5);
    expect(commits()).toBe(atFirst);
    press("ArrowRight", 5);
    const atLast = commits();
    press("ArrowRight", 5);
    expect(commits()).toBe(atLast);
    expect(view.container.querySelector("output")?.textContent).toBe("e (keyboard) at 50");
  });

  it("starts from the last point on an arrow to the left", () => {
    const { svg, shown, arrow } = draw();
    fireEvent.mouseDown(svg);
    act(() => svg.focus());
    arrow("ArrowLeft");
    expect(shown()).toBe("e (keyboard) at 50");
  });

  it("hides and shows on Enter, lets go on blur, and comes back where it was on the next focus", () => {
    const { svg, shown, arrow } = draw();
    act(() => svg.focus());
    arrow("ArrowRight");
    fireEvent.keyDown(svg, { key: "Enter" });
    expect(shown()).toBeNull();
    fireEvent.keyDown(svg, { key: "Enter" });
    expect(shown()).toBe("b (keyboard) at 50");
    act(() => svg.blur());
    expect(shown()).toBeNull();
    act(() => svg.focus());
    expect(shown()).toBe("b (keyboard) at 50");
  });

  it("shows a hidden tooltip where it was on an arrow, without a step from a point nobody sees", () => {
    const { svg, shown, arrow } = draw();
    act(() => svg.focus());
    arrow("ArrowRight");
    fireEvent.keyDown(svg, { key: "Enter" });
    arrow("ArrowRight");
    expect(shown()).toBe("b (keyboard) at 50");
    arrow("ArrowRight");
    expect(shown()).toBe("c (keyboard) at 50");
  });

  it("shows nothing for a focus that a press made", () => {
    const { svg, shown, arrow } = draw();
    fireEvent.mouseDown(svg);
    act(() => svg.focus());
    fireEvent.mouseUp(svg);
    expect(shown()).toBeNull();
    arrow("ArrowRight");
    expect(shown()).toBe("a (keyboard) at 50");
  });

  it("still answers the keyboard after a press that took no focus and whose end the page never saw", async () => {
    // A chart's own drag prevents the press's focus, and the button is let go outside the drawing.
    const { svg, shown } = draw();
    fireEvent.mouseDown(svg);
    await new Promise((r) => setTimeout(r));
    act(() => svg.focus());
    expect(shown()).toBe("a (keyboard) at 50");
  });

  it("takes the tooltip from a resting pointer on Enter, as on an arrow", () => {
    const { svg, shown, arrow, pointer, frame } = draw();
    act(() => svg.focus());
    arrow("ArrowRight");
    pointer(350);
    expect(shown()).toBe("d at 30");
    fireEvent.keyDown(svg, { key: "Enter" });
    expect(shown()).toBe("b (keyboard) at 50");
    // Hidden by the next Enter, it stays hidden when the pointer leaves.
    fireEvent.keyDown(svg, { key: "Enter" });
    expect(shown()).toBeNull();
    fireEvent.mouseLeave(frame);
    expect(shown()).toBeNull();
  });
});

describe("what the pointer reads", () => {
  it("reads the point it is on, at its own height, and nothing where there is none", () => {
    const { shown, pointer, frame } = draw();
    pointer(160, 30);
    expect(shown()).toBe("b at 30");
    pointer(200, 30);
    expect(shown()).toBeNull();
    pointer(245, 70);
    expect(shown()).toBe("c at 70");
    fireEvent.mouseLeave(frame);
    expect(shown()).toBeNull();
  });

  it("renders nothing for a pointer moving over nothing", () => {
    const commit = vi.fn();
    const view = render(
      createElement(Profiler, { id: "chart", onRender: commit }, createElement(Chart, { points: FIVE })),
    );
    const frame = view.container.querySelector("[data-frame]")!;
    const move = (x: number, y = 30) => fireEvent.mouseMove(frame, { clientX: x, clientY: y });
    const commits = () => commit.mock.calls.length;
    move(200);
    move(210);
    expect(commits()).toBe(1);
    move(150);
    const shown = commits();
    expect(shown).toBeGreaterThan(1);
    // Off it: the tooltip goes, once; on over nothing, nothing more.
    move(200);
    expect(commits()).toBe(shown + 1);
    move(210);
    move(215);
    expect(commits()).toBe(shown + 1);
  });

  it("keeps the pointer's own place within one point, for what a later render reads", () => {
    const { shown, pointer, rerender } = draw();
    // Onto "b" at its left, then along it to its right, still "b".
    pointer(135);
    pointer(168);
    expect(shown()).toBe("b at 30");
    // The marks shrink under the resting pointer: 168 is now out of reach, where 135 would still read "b".
    rerender(FIVE, true, 17);
    expect(shown()).toBeNull();
  });

  it("reads what is under a resting pointer when the points change", () => {
    const { shown, pointer, rerender } = draw();
    pointer(150);
    expect(shown()).toBe("b at 30");
    rerender(["z", "y", "x"]);
    expect(shown()).toBe("y at 30");
    rerender(["z"]);
    expect(shown()).toBeNull();
  });

  it("forgets the pointer with the drawing, so a plot drawn again opens with no tooltip", () => {
    const { shown, pointer, rerender } = draw();
    pointer(150);
    expect(shown()).toBe("b at 30");
    rerender(FIVE, false);
    expect(shown()).toBeNull();
    rerender(FIVE);
    expect(shown()).toBeNull();
  });

  it("reads nothing for a point the chart does not have", () => {
    function Beyond() {
      const reading = useReading({ n: 2, read: () => ({ i: 2, y: 0 }) });
      return createElement(
        "div",
        { "data-frame": "", ...reading.frame },
        createElement(Drawing, { width: 10, height: 10, title: "", desc: "", reading, children: null }),
        reading.active ? createElement("output", null, String(reading.active.i)) : null,
      );
    }
    const view = render(createElement(Beyond));
    fireEvent.mouseMove(view.container.querySelector("[data-frame]")!, { clientX: 5, clientY: 5 });
    expect(view.container.querySelector("output")).toBeNull();
  });

  it("follows a moving finger and lets go when it lifts", () => {
    const { shown, frame } = draw();
    fireEvent.touchMove(frame, { touches: [{ clientX: 250, clientY: 40 }] });
    expect(shown()).toBe("c at 40");
    fireEvent.touchEnd(frame);
    expect(shown()).toBeNull();
    fireEvent.touchMove(frame, { touches: [{ clientX: 250, clientY: 40 }] });
    fireEvent.touchCancel(frame);
    expect(shown()).toBeNull();
  });

  it("says where a pointer is in the drawing, for a chart's own presses", () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(DOMRect.fromRect({ x: 40, y: 10 }));
    function Pressed({ drawn }: { drawn: boolean }) {
      const reading = useReading({ n: 0, read: () => null });
      const [at, setAt] = useState("not pressed");
      return createElement(
        "div",
        { "data-frame": "", onClick: (e: MouseEvent) => setAt(JSON.stringify(reading.place(e.clientX, e.clientY))) },
        drawn ? createElement(Drawing, { width: 10, height: 10, title: "", desc: "", reading, children: null }) : null,
        createElement("output", null, at),
      );
    }
    const view = render(createElement(Pressed, { drawn: true }));
    const press = () => fireEvent.click(view.container.querySelector("[data-frame]")!, { clientX: 100, clientY: 30 });
    press();
    expect(view.container.querySelector("output")!.textContent).toBe('{"px":60,"py":20}');
    // Nothing drawn: no place to be in.
    view.rerender(createElement(Pressed, { drawn: false }));
    press();
    expect(view.container.querySelector("output")!.textContent).toBe("null");
  });
});

describe("the pointer and the keyboard never both hold the tooltip: the one used last does", () => {
  it("gives the tooltip to an arrow pressed while the pointer rests on a point", () => {
    const { svg, shown, arrow, pointer } = draw();
    pointer(350);
    fireEvent.mouseDown(svg);
    act(() => svg.focus());
    fireEvent.mouseUp(svg);
    expect(shown()).toBe("d at 30");
    arrow("ArrowRight");
    expect(shown()).toBe("a (keyboard) at 50");
    arrow("ArrowRight");
    expect(shown()).toBe("b (keyboard) at 50");
  });

  it("gives it to a focus from the keyboard too", () => {
    const { svg, shown, pointer } = draw();
    pointer(350);
    act(() => svg.focus());
    expect(shown()).toBe("a (keyboard) at 50");
  });

  it("gives it back to a pointer that moves onto a point, and an arrow then returns to where the keyboard was", () => {
    const { svg, shown, arrow, pointer, frame } = draw();
    act(() => svg.focus());
    arrow("ArrowRight");
    pointer(350);
    expect(shown()).toBe("d at 30");
    // The pointer leaves with the tooltip: the keyboard's does not come back by itself.
    fireEvent.mouseLeave(frame);
    expect(shown()).toBeNull();
    arrow("ArrowRight");
    expect(shown()).toBe("b (keyboard) at 50");
    arrow("ArrowRight");
    expect(shown()).toBe("c (keyboard) at 50");
  });

  it("keeps the keyboard's while the pointer moves over nothing", () => {
    const { svg, shown, pointer } = draw();
    act(() => svg.focus());
    pointer(200);
    expect(shown()).toBe("a (keyboard) at 50");
  });

  it("does not take a move from the same place, with nothing moved under it, for the pointer coming back", () => {
    const { svg, shown, arrow, pointer } = draw();
    pointer(350);
    act(() => svg.focus());
    arrow("ArrowRight");
    expect(shown()).toBe("b (keyboard) at 50");
    pointer(350);
    expect(shown()).toBe("b (keyboard) at 50");
    pointer(351);
    expect(shown()).toBe("d at 30");
  });

  it("takes a pointer that left and came back to the same place for a move", () => {
    const { svg, shown, pointer, frame } = draw();
    pointer(350);
    act(() => svg.focus());
    expect(shown()).toBe("a (keyboard) at 50");
    fireEvent.mouseLeave(frame);
    pointer(350);
    expect(shown()).toBe("d at 30");
  });

  it("hands a chart's own Enter only the point the keyboard's tooltip is on", () => {
    const enter = vi.fn();
    const { svg, shown, arrow, pointer, frame } = draw({ enter });
    // Nothing shown: nothing to act on.
    fireEvent.mouseDown(svg);
    act(() => svg.focus());
    fireEvent.mouseUp(svg);
    fireEvent.keyDown(svg, { key: "Enter" });
    expect(enter).not.toHaveBeenCalled();
    arrow("ArrowRight");
    arrow("ArrowRight");
    fireEvent.keyDown(svg, { key: "Enter", shiftKey: true });
    expect(enter).toHaveBeenCalledTimes(1);
    expect(enter.mock.calls[0]![0]).toBe(1);
    expect(enter.mock.calls[0]![1].shiftKey).toBe(true);
    // Enter is the chart's: the tooltip stays.
    expect(shown()).toBe("b (keyboard) at 50");
    // The pointer holds the tooltip, on another point: Enter has no point of its own.
    pointer(350);
    fireEvent.keyDown(svg, { key: "Enter" });
    fireEvent.mouseLeave(frame);
    fireEvent.keyDown(svg, { key: "Enter" });
    expect(enter).toHaveBeenCalledTimes(1);
    arrow("ArrowLeft");
    fireEvent.keyDown(svg, { key: "Enter" });
    expect(enter).toHaveBeenLastCalledWith(1, expect.anything());
  });
});

describe("which point the keyboard is on when the points change", () => {
  it("is the point with its id, wherever it is now, and none when it is gone", () => {
    const { svg, shown, arrow, rerender } = draw({ keyed: true });
    act(() => svg.focus());
    arrow("ArrowRight");
    arrow("ArrowRight");
    expect(shown()).toBe("c (keyboard) at 50");
    rerender(["c", "d", "e"]);
    expect(shown()).toBe("c (keyboard) at 50");
    arrow("ArrowRight");
    expect(shown()).toBe("d (keyboard) at 50");
    rerender(["a", "b"]);
    expect(shown()).toBeNull();
    fireEvent.keyDown(svg, { key: "Enter" });
    expect(shown()).toBeNull();
    arrow("ArrowLeft");
    expect(shown()).toBe("b (keyboard) at 50");
  });

  it("is the point at its index for a chart that names none, and none past the end", () => {
    const { svg, shown, arrow, rerender } = draw();
    act(() => svg.focus());
    arrow("ArrowRight");
    arrow("ArrowRight");
    rerender(["c", "d", "e"]);
    expect(shown()).toBe("e (keyboard) at 50");
    rerender(["c", "d"]);
    expect(shown()).toBeNull();
  });
});

describe("a drawing inside a sideways scroller", () => {
  // Ten points over 1000 px, behind a 20 px pinned column, in a scroller that shows 200 px of them.
  function Scrolling({ n, pinned = 20, sized = true }: { n: number; pinned?: number; sized?: boolean }) {
    const scroll = useScrollView({ pinned, content: 1000, container: 220 });
    // A chart may know its plot, and so hand over its scroller, only once it has its size.
    const reading = useReading({
      n,
      read: near(n),
      ...(sized ? { scroll: { view: scroll.view, x: xOf, plot: { left: 10, top: 0, width: 980, height: 100 } } } : {}),
    } as ReadingOptions & { scroll: ReadingScroll });
    const { active, area } = reading;
    return createElement(
      "div",
      { "data-scroller": "", "data-scrolled": scroll.scrolled, ref: scroll.ref, onScroll: scroll.onScroll },
      createElement(
        "div",
        { "data-frame": "", ...reading.frame },
        createElement(Drawing, { width: 1000, height: 100, title: "", desc: "", reading, children: null }),
        active ? createElement("output", null, `${active.i}${active.key ? " (keyboard)" : ""}`) : null,
        createElement("data", null, sized ? `${area.left}+${area.width}` : "no plot yet"),
      ),
    );
  }
  function scrolling(props: { pinned?: number; sized?: boolean } = {}) {
    const view = render(createElement(Scrolling, { n: 10, ...props }));
    const scroller = view.container.querySelector("[data-scroller]") as HTMLElement;
    Object.defineProperty(scroller, "clientWidth", { configurable: true, value: 220 });
    const svg = view.container.querySelector("svg") as SVGSVGElement;
    const frame = view.container.querySelector("[data-frame]") as HTMLElement;
    /** What the browser does when the scroller moves: the drawing's box moves, and a scroll event follows. */
    const scrolled = () => {
      vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(
        DOMRect.fromRect({ x: -scroller.scrollLeft }),
      );
      fireEvent.scroll(scroller);
    };
    return {
      scroller,
      svg,
      frame,
      scrolled,
      rerender: (next: { pinned?: number; sized?: boolean }) =>
        view.rerender(createElement(Scrolling, { n: 10, ...next })),
      shown: () => view.container.querySelector("output")?.textContent ?? null,
      area: () => view.container.querySelector("data")!.textContent,
      arrow: (key: "ArrowRight" | "ArrowLeft") => fireEvent.keyDown(svg, { key }),
      pointer: (x: number) => fireEvent.mouseMove(frame, { clientX: x, clientY: 30 }),
    };
  }

  it("starts the keyboard on the first point on screen, and brings the point it steps to on screen", () => {
    const { scroller, svg, shown, arrow, scrolled } = scrolling();
    scroller.scrollLeft = 300;
    scrolled();
    act(() => svg.focus());
    // 300 to 500 px are on screen: point 3, at 350, is the first clear of the edge.
    expect(shown()).toBe("3 (keyboard)");
    expect(scroller.scrollLeft).toBe(300);
    arrow("ArrowRight");
    expect(scroller.scrollLeft).toBe(300);
    arrow("ArrowRight");
    // Point 5, at 550, was off screen: it is brought to the middle.
    expect(shown()).toBe("5 (keyboard)");
    expect(scroller.scrollLeft).toBe(450);
  });

  it("keeps a tooltip's area to the part of the plot that is on screen, while one is shown", () => {
    const { scroller, svg, area, arrow, scrolled } = scrolling();
    act(() => svg.focus());
    expect(area()).toBe("10+190");
    for (let i = 0; i < 5; i++) arrow("ArrowRight");
    expect(scroller.scrollLeft).toBe(450);
    expect(area()).toBe("450+200");
    // The reader scrolls under the tooltip: its area follows.
    scroller.scrollLeft = 500;
    scrolled();
    expect(area()).toBe("500+200");
  });

  it("has the whole plot for a tooltip until it is measured, when the scroller comes after the first render", () => {
    const { area, rerender } = scrolling({ sized: false });
    expect(area()).toBe("no plot yet");
    rerender({ sized: true });
    expect(area()).toBe("10+980");
  });

  it("counts the pinned column at the width it has now", () => {
    const { svg, area, rerender } = scrolling();
    rerender({ pinned: 120 });
    act(() => svg.focus());
    // 220 px of scroller less 120 px of column: 100 px of the drawing are on screen, from its start.
    expect(area()).toBe("10+90");
  });

  it("stays with the keyboard when the keyboard scrolls the chart under a resting pointer", () => {
    const { scroller, svg, shown, arrow, pointer, scrolled } = scrolling();
    // The pointer rests on nothing, at 100 px of the window.
    pointer(100);
    act(() => svg.focus());
    for (let i = 0; i < 5; i++) arrow("ArrowRight");
    expect(shown()).toBe("5 (keyboard)");
    // The chart is now 450 px along: point 5, at 550, is under the pointer, and the browser says so
    // with a move from where the pointer already is.
    scrolled();
    pointer(100);
    expect(shown()).toBe("5 (keyboard)");
    arrow("ArrowLeft");
    expect(shown()).toBe("4 (keyboard)");
    // A real move takes the tooltip.
    pointer(101);
    expect(shown()).toBe("5");
    // From then on a scroll is the reader's own again: the move that follows it counts.
    scroller.scrollLeft = 350;
    scrolled();
    pointer(101);
    expect(shown()).toBe("4");
  });

  it("follows what is under a resting pointer when the reader scrolls the chart", () => {
    const { scroller, shown, pointer, scrolled } = scrolling();
    pointer(100);
    expect(shown()).toBeNull();
    scroller.scrollLeft = 450;
    scrolled();
    pointer(100);
    expect(shown()).toBe("5");
  });

  it("does not read a moving finger: the move is the scroll", () => {
    const { frame, shown } = scrolling();
    fireEvent.touchMove(frame, { touches: [{ clientX: 50, clientY: 30 }] });
    expect(shown()).toBeNull();
  });

  it("says it is scrolled once it has left its start", () => {
    const { scroller, scrolled } = scrolling();
    expect(scroller.dataset.scrolled).toBe("false");
    scroller.scrollLeft = 40;
    scrolled();
    expect(scroller.dataset.scrolled).toBe("true");
  });
});
