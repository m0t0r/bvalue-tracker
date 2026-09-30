import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Explain } from "./explain";

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
