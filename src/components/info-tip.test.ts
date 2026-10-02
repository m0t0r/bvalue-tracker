import { cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { InfoTip } from "./info-tip";

describe("InfoTip", () => {
  afterEach(cleanup);

  it("keeps focus on the button when its behaviour arrives and replaces it", async () => {
    const view = render(createElement(InfoTip, { label: "Why?", children: "Because." }));
    view.getByRole("button", { name: "Why?" }).focus();
    // The behaviour's chunk lands and the button is drawn again with it: focused, its tip opens.
    expect(await view.findByRole("tooltip")).toHaveProperty("textContent", expect.stringContaining("Because."));
    expect(document.activeElement).toBe(view.getByRole("button", { name: "Why?" }));
  });

  it("describes the button with the text, once, outside the reading order", () => {
    const view = render(createElement(InfoTip, { label: "Why?", children: "Because." }));
    const button = view.getByRole("button", { name: "Why?" });
    const description = document.getElementById(button.getAttribute("aria-describedby") ?? "");
    expect(description?.textContent).toBe("Because.");
    expect(description?.hidden).toBe(true);
  });
});
