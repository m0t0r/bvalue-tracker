import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { InfoTipTooltip, openAfterClick } from "./info-tip-tooltip";

describe("openAfterClick", () => {
  it("opens on a tap, and closes on the next", () => {
    expect(openAfterClick({ touch: true, wasOpen: false })).toBe(true);
    expect(openAfterClick({ touch: true, wasOpen: true })).toBe(false);
  });

  it("keeps it open on a mouse click, which the hover has already opened", () => {
    expect(openAfterClick({ touch: false, wasOpen: true })).toBe(true);
    expect(openAfterClick({ touch: false, wasOpen: false })).toBe(true);
  });

  it("opens on a keyboard click, which has no press", () => {
    expect(openAfterClick(null)).toBe(true);
  });
});

// The wiring to Radix, which `openAfterClick` alone does not cover: the tip relies on cancelling
// Radix's own close-on-press and close-on-click, an implementation detail an upgrade could change.
describe("InfoTipTooltip on touch", () => {
  afterEach(cleanup);

  const mount = () => {
    const view = render(
      createElement(InfoTipTooltip, { content: "Why", children: createElement("button", { type: "button" }, "i") }),
    );
    return view.getByRole("button");
  };
  const tap = (el: HTMLElement) =>
    act(() => {
      fireEvent.pointerDown(el, { pointerType: "touch" });
      fireEvent.pointerUp(el, { pointerType: "touch" });
      fireEvent.click(el, { detail: 1 });
    });

  it("opens on a tap and closes on the next", () => {
    const button = mount();
    tap(button);
    expect(button.dataset.state).not.toBe("closed");
    tap(button);
    expect(button.dataset.state).toBe("closed");
  });

  it("opens on a tap that focused the button first, as Android does", () => {
    const button = mount();
    act(() => {
      fireEvent.pointerDown(button, { pointerType: "touch" });
      button.focus();
      fireEvent.pointerUp(button, { pointerType: "touch" });
      fireEvent.click(button, { detail: 1 });
    });
    expect(button.dataset.state).not.toBe("closed");
  });

  it("stays open when a mouse clicks what the hover opened", async () => {
    const button = mount();
    // Radix opens on hover after a timeout, even at a delay of 0.
    await act(async () => {
      fireEvent.pointerMove(button, { pointerType: "mouse" });
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(button.dataset.state).not.toBe("closed");
    // Not shut between the press and the click, which read as a blink.
    act(() => {
      fireEvent.pointerDown(button, { pointerType: "mouse" });
    });
    expect(button.dataset.state).not.toBe("closed");
    act(() => {
      fireEvent.pointerUp(button, { pointerType: "mouse" });
      fireEvent.click(button, { detail: 1 });
    });
    expect(button.dataset.state).not.toBe("closed");
  });

  it("lets a keyboard click open it after a press that became a scroll", () => {
    const button = mount();
    tap(button);
    act(() => {
      fireEvent.pointerDown(button, { pointerType: "touch" });
      fireEvent.pointerCancel(button, { pointerType: "touch" });
    });
    act(() => {
      fireEvent.keyDown(button, { key: "Escape" });
    });
    act(() => {
      fireEvent.click(button, { detail: 0 });
    });
    expect(button.dataset.state).not.toBe("closed");
  });
});
