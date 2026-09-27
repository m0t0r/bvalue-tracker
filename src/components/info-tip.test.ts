import { cleanup, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { InfoTip } from "./info-tip";

describe("InfoTip", () => {
  afterEach(cleanup);

  it("keeps focus on the button when its behaviour arrives and replaces it", async () => {
    const view = render(createElement(InfoTip, { label: "Why?", children: "Because." }));
    const first = view.getByRole("button", { name: "Why?" });
    first.focus();
    // The behaviour's button is Radix's trigger, which carries `data-state`.
    await waitFor(() => expect(view.getByRole("button", { name: "Why?" }).dataset.state).toBeDefined());
    const second = view.getByRole("button", { name: "Why?" });
    expect(second).not.toBe(first);
    expect(document.activeElement).toBe(second);
  });

  it("describes the button with the text, once, outside the reading order", () => {
    const view = render(createElement(InfoTip, { label: "Why?", children: "Because." }));
    const button = view.getByRole("button", { name: "Why?" });
    const description = document.getElementById(button.getAttribute("aria-describedby") ?? "");
    expect(description?.textContent).toBe("Because.");
    expect(description?.hidden).toBe(true);
  });
});
