import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { Explain } from "./explain";

// A chunk that never arrives: a stale deploy, a dropped connection.
vi.mock("./card", () => {
  throw new Error("chunk failed to load");
});

afterEach(cleanup);

it("leaves a link a plain link, and a term a plain word, when the card cannot load", async () => {
  const view = render(
    createElement("p", null, [
      createElement(Explain, { key: "a", id: "sgc-duration", href: "https://example.org/a", children: "article" }),
      createElement(Explain, { key: "t", id: "swarm", children: "swarm" }),
    ]),
  );
  const a = view.getByRole("link");
  const word = view.getByRole("button", { name: "swarm" });
  // The first hover asks for the chunk, and the failure comes back.
  act(() => {
    fireEvent.pointerEnter(a, { pointerType: "mouse" });
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  let followed = false;
  act(() => {
    fireEvent.pointerDown(a, { pointerType: "touch" });
    followed = fireEvent.click(a, { detail: 1 });
  });
  expect(followed).toBe(true);
  act(() => {
    fireEvent.pointerDown(word, { pointerType: "touch" });
    fireEvent.click(word, { detail: 1 });
  });
  await waitFor(() => expect(word.getAttribute("aria-expanded")).toBe("false"));
  expect(word.getAttribute("aria-busy")).toBeNull();
  expect(view.queryByRole("dialog")).toBeNull();
  // A hover after the failure previews nothing: no pulse, no card that never comes.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  act(() => {
    fireEvent.pointerEnter(word, { pointerType: "mouse" });
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 400));
  });
  expect(word.getAttribute("aria-expanded")).toBe("false");
  expect(word.getAttribute("aria-busy")).toBeNull();
  // The first hover began before the failure was known: its pause ended with nothing to open.
  expect(a.getAttribute("aria-busy")).toBeNull();
});
