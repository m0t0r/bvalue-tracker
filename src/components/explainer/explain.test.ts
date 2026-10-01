import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Explain } from "./explain";
import { HOVER_DELAY_MS } from "./interaction";

// `Explain` wired to Radix and to its lazy chunk: the rules alone are `interaction.test.ts`.
afterEach(cleanup);

const link = () =>
  render(createElement(Explain, { id: "sgc-duration", href: "https://example.org/article", children: "SGC article" }));
const term = () => render(createElement(Explain, { id: "swarm", children: "swarm" }));

/** A tap as a phone sends it; true when the click was not cancelled, so a link would be followed. */
const tap = (el: HTMLElement) => {
  let followed = true;
  act(() => {
    fireEvent.pointerDown(el, { pointerType: "touch" });
    fireEvent.pointerUp(el, { pointerType: "touch" });
    followed = fireEvent.click(el, { detail: 1 });
  });
  return followed;
};

// A phone: no pointer that can hover. Every way the card used to open there (a click with no press before
// it, a screen reader's activation, a mouse-type pointer resting on the word) must give the sheet or nothing.
describe("Explain on a device that cannot hover", () => {
  beforeEach(() => {
    vi.spyOn(window, "matchMedia").mockImplementation((query) => ({ matches: false, media: query }) as MediaQueryList);
  });
  afterEach(() => vi.restoreAllMocks());

  const surface = () => ({
    sheet: document.querySelector('[data-slot="sheet-content"][data-state="open"]') !== null,
    card: document.querySelector('[data-slot="popover-content"][data-state="open"]') !== null,
  });

  it("opens the sheet for a click that no pointerdown came before", async () => {
    const view = term();
    act(() => {
      fireEvent.click(view.getByRole("button", { name: "swarm" }), { detail: 1 });
    });
    await view.findByRole("dialog", undefined, { timeout: 5000 });
    expect(surface()).toEqual({ sheet: true, card: false });
  });

  it("opens the sheet for a screen reader's activation, a click with no detail", async () => {
    const view = term();
    act(() => {
      fireEvent.click(view.getByRole("button", { name: "swarm" }), { detail: 0 });
    });
    await view.findByRole("dialog", undefined, { timeout: 5000 });
    expect(surface()).toEqual({ sheet: true, card: false });
  });

  it("opens the sheet for a press that claims to be a mouse's, and does not follow a link", async () => {
    const view = link();
    const a = view.getByRole("link");
    let followed = true;
    act(() => {
      fireEvent.pointerDown(a, { pointerType: "mouse" });
      followed = fireEvent.click(a, { detail: 1 });
    });
    expect(followed).toBe(false);
    await view.findByRole("dialog", undefined, { timeout: 5000 });
    expect(surface()).toEqual({ sheet: true, card: false });
  });

  it("opens the sheet on Enter on a term, not the card", async () => {
    const view = term();
    const word = view.getByRole("button", { name: "swarm" });
    act(() => word.focus());
    act(() => {
      fireEvent.keyDown(word, { key: "Enter" });
    });
    await view.findByRole("dialog", undefined, { timeout: 5000 });
    expect(surface()).toEqual({ sheet: true, card: false });
  });

  it("opens nothing for keyboard focus, which previews only where a pointer can hover", () => {
    const view = term();
    act(() => view.getByRole("button", { name: "swarm" }).focus());
    expect(surface()).toEqual({ sheet: false, card: false });
  });

  // The same resting pointer, where a pointer can hover: the card. Without it the test below passes
  // for any reason at all, such as a pointer-enter handler that never ran.
  it("opens nothing for a mouse-type pointer resting on the word, where the same pointer opens the card on a laptop", async () => {
    const rest = async () => {
      const view = term();
      act(() => {
        fireEvent.pointerEnter(view.getByRole("button", { name: "swarm" }), { pointerType: "mouse" });
      });
      await new Promise((r) => setTimeout(r, HOVER_DELAY_MS + 150));
      return view;
    };
    const phone = await rest();
    expect(phone.queryByRole("dialog")).toBeNull();
    expect(surface()).toEqual({ sheet: false, card: false });
    cleanup();

    vi.spyOn(window, "matchMedia").mockImplementation((query) => ({ matches: true, media: query }) as MediaQueryList);
    const view = await rest();
    await view.findByRole("dialog", undefined, { timeout: 5000 });
    expect(surface()).toEqual({ sheet: false, card: true });
  });
});

describe("Explain on a link", () => {
  it("opens the link's sheet on a tap instead of following it", async () => {
    const view = link();
    expect(tap(view.getByRole("link"))).toBe(false);
    const sheet = await view.findByRole("dialog", undefined, { timeout: 5000 });
    expect(sheet.textContent).toContain("How long did the San José del Palmar earthquake last?");
    // The sheet holds the way out, to the same place the word links to.
    expect(sheet.querySelector("a")?.getAttribute("href")).toBe("https://example.org/article");
  });

  it("follows the link on a mouse click", () => {
    const view = link();
    const a = view.getByRole("link");
    let followed = false;
    act(() => {
      fireEvent.pointerDown(a, { pointerType: "mouse" });
      followed = fireEvent.click(a, { detail: 1 });
    });
    expect(followed).toBe(true);
  });

  it("follows the link on Enter", () => {
    const view = link();
    expect(fireEvent.click(view.getByRole("link"), { detail: 0 })).toBe(true);
  });
});

describe("Explain on a term", () => {
  it("is a button that says it opens a dialog, and whether it is open", async () => {
    const view = term();
    const word = view.getByRole("button", { name: "swarm" });
    expect(word.getAttribute("aria-haspopup")).toBe("dialog");
    expect(word.getAttribute("aria-expanded")).toBe("false");
    tap(word);
    await view.findByRole("dialog", undefined, { timeout: 5000 });
    expect(word.getAttribute("aria-expanded")).toBe("true");
  });

  // Focus moving into the card is Radix's FocusScope, which happy-dom does not run; it was checked in
  // Chrome instead (docs/frontend.md, the explainers' bullet).
  it("opens on Enter, and Escape closes it", async () => {
    const view = term();
    const word = view.getByRole("button", { name: "swarm" });
    act(() => word.focus());
    act(() => {
      fireEvent.keyDown(word, { key: "Enter" });
    });
    await view.findByRole("dialog", undefined, { timeout: 5000 });
    act(() => {
      fireEvent.keyDown(document.activeElement ?? word, { key: "Escape" });
    });
    await waitFor(() => expect(view.queryByRole("dialog")).toBeNull());
    expect(word.getAttribute("aria-expanded")).toBe("false");
  });

  it("opens on Space, on the key's release as a button does", async () => {
    const view = term();
    const word = view.getByRole("button", { name: "swarm" });
    act(() => {
      fireEvent.keyDown(word, { key: " " });
    });
    expect(view.queryByRole("dialog")).toBeNull();
    act(() => {
      fireEvent.keyUp(word, { key: " " });
    });
    await view.findByRole("dialog", undefined, { timeout: 5000 });
  });

  it("closes the sheet on a second tap", async () => {
    const view = term();
    const word = view.getByRole("button", { name: "swarm" });
    tap(word);
    await view.findByRole("dialog", undefined, { timeout: 5000 });
    tap(word);
    await waitFor(() => expect(word.getAttribute("aria-expanded")).toBe("false"));
  });
});
