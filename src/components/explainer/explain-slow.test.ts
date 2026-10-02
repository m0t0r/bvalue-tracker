import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, expect, it, vi } from "vitest";

/**
 * A fresh `Explain` whose card's chunk is on a slow connection: it arrives only when the test calls
 * `arrive`. Fresh because `explain.tsx` keeps the loaded chunk for the page's life.
 */
const slowExplain = async () => {
  let arrive!: () => void;
  const arrived = new Promise<void>((r) => (arrive = r));
  vi.resetModules();
  vi.doMock("./card", async (original) => {
    await arrived;
    return original();
  });
  const { Explain } = await import("./explain");
  return { Explain, arrive };
};

afterEach(() => {
  cleanup();
  vi.doUnmock("./card");
});

it("follows a link's click or Enter while its card is on its way, which only a second tap waits for", async () => {
  const { Explain } = await slowExplain();
  const view = render(
    createElement(Explain, { id: "sgc-duration", href: "https://example.org/a", children: "article" }),
  );
  const a = view.getByRole("link");
  act(() => {
    fireEvent.pointerDown(a, { pointerType: "touch" });
    fireEvent.click(a, { detail: 1 });
  });
  expect(a.getAttribute("aria-busy")).toBe("true");
  let followed = false;
  act(() => {
    followed = fireEvent.click(a, { detail: 0 });
  });
  expect(followed).toBe(true);
  act(() => {
    fireEvent.pointerDown(a, { pointerType: "mouse" });
    followed = fireEvent.click(a, { detail: 1 });
  });
  expect(followed).toBe(true);
});

it("shows a tap registered while the card is on its way, and a second tap does not cancel it", async () => {
  const { Explain, arrive } = await slowExplain();
  const view = render(createElement(Explain, { id: "swarm", children: "swarm" }));
  const word = view.getByRole("button", { name: "swarm" });
  const tap = () =>
    act(() => {
      fireEvent.pointerDown(word, { pointerType: "touch" });
      fireEvent.click(word, { detail: 1 });
    });
  tap();
  expect(word.getAttribute("aria-busy")).toBe("true");
  tap();
  expect(word.getAttribute("aria-expanded")).toBe("true");
  await act(async () => arrive());
  await view.findByRole("dialog", undefined, { timeout: 5000 });
  expect(word.getAttribute("aria-busy")).toBeNull();
});
