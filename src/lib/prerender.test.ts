import { focusManager } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { postRefresh } from "./api";
import { useReturnToTab, whenActivated } from "./prerender";

// Chrome prerenders the page a link points to once the reader presses it (`public/speculation-rules.json`),
// and the reader may slide off the link without letting go. Until they open it, the page must not reach SGC.
const prerendering = (value: boolean) => Object.defineProperty(document, "prerendering", { value, configurable: true });
const activate = () => {
  prerendering(false);
  document.dispatchEvent(new Event("prerenderingchange"));
};

afterEach(() => {
  delete (document as { prerendering?: boolean }).prerendering;
  focusManager.setFocused(undefined);
  vi.unstubAllGlobals();
});

describe("whenActivated", () => {
  it("is already settled on an ordinary load, and in a browser that does not prerender", async () => {
    await expect(whenActivated()).resolves.toBeUndefined();
    prerendering(false);
    await expect(whenActivated()).resolves.toBeUndefined();
  });

  it("waits while the page is prerendered, and settles once the reader opens it", async () => {
    prerendering(true);
    let opened = false;
    const done = whenActivated().then(() => (opened = true));
    await Promise.resolve();
    expect(opened).toBe(false);
    activate();
    await done;
    expect(opened).toBe(true);
  });
});

describe("postRefresh", () => {
  it("sends nothing from a prerendered page until the reader opens it", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ refreshed: false }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    prerendering(true);
    const res = postRefresh("tolima");
    await new Promise((r) => setTimeout(r, 0));
    expect(fetch).not.toHaveBeenCalled();
    activate();
    await res;
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith("/api/refresh?zone=tolima", { method: "POST" });
  });
});

describe("useReturnToTab", () => {
  it("fires when the tab is shown again after being hidden", () => {
    const onReturn = vi.fn();
    renderHook(() => useReturnToTab(onReturn));
    act(() => focusManager.setFocused(false));
    expect(onReturn).not.toHaveBeenCalled();
    act(() => focusManager.setFocused(true));
    expect(onReturn).toHaveBeenCalledOnce();
  });

  it("does not take a page showing for the first time for a return", () => {
    // Opening a prerendered page makes it visible, which the library reports as focus, whatever the order
    // in which Chrome sends that and `prerenderingchange`.
    const onReturn = vi.fn();
    prerendering(true);
    renderHook(() => useReturnToTab(onReturn));
    act(() => {
      activate();
      focusManager.setFocused(true);
    });
    expect(onReturn).not.toHaveBeenCalled();
  });

  it("calls the latest callback, and keeps count of a hidden tab across renders", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ cb }) => useReturnToTab(cb), { initialProps: { cb: first } });
    act(() => focusManager.setFocused(false));
    rerender({ cb: second });
    act(() => focusManager.setFocused(true));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });
});
