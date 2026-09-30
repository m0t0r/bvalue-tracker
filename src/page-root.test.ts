import { QueryClient } from "@tanstack/react-query";
import { act, createElement } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { takeStaticShell } from "@/lib/hydrate";
import { dicts } from "@/lib/i18n";
import { App } from "@/App";
import { PageRoot } from "@/page-root";
import { ZONE_IDS, type ZoneId } from "../core/zones";
import { staticShell } from "./static-shell";

/**
 * React adopts the static header instead of replacing it (issue #97): a replaced header is a new
 * element, and in Geist it is larger than the static one painted in the fallback face, so it became
 * a phone's LCP again, after the whole bundle. So hydration must keep every node of the static copy
 * and must not fall back to a client render, which is what a mismatch does.
 */

/** A zone's page as the build writes it: both languages' headers in `#root`, `lang` set by the head script. */
function load(zone: ZoneId, lang: "es" | "en") {
  document.documentElement.lang = lang;
  document.body.innerHTML = `<div id="root"><!--static-shell-->${staticShell(zone)}<!--/static-shell--></div>`;
  history.replaceState(null, "", zone === "tolima" ? "/" : `/${zone}`);
}

// `hydrateRoot` directly, not testing-library's `render`, which would set this itself.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
const recoverable = vi.fn();
const consoleError = vi.spyOn(console, "error");

beforeEach(() => {
  recoverable.mockClear();
  consoleError.mockClear();
  // The page's API requests never answer: this is about the header, and nothing may reach a server.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>(() => {})),
  );
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
});

async function hydrate() {
  const shell = takeStaticShell(document);
  if (shell === null) throw new Error("no static header to hydrate");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root = hydrateRoot(shell.container, createElement(PageRoot, { client, children: createElement(App) }), {
      identifierPrefix: shell.identifierPrefix,
      onRecoverableError: recoverable,
    });
  });
  return shell.container;
}

describe("the page's first render", () => {
  it.each(ZONE_IDS.flatMap((zone) => (["es", "en"] as const).map((lang) => [zone, lang] as const)))(
    "keeps %s's static header in %s, node for node, and draws the page under it",
    async (zone, lang) => {
      load(zone, lang);
      const copy = document.querySelector<HTMLElement>(`[data-static-lang="${lang}"]`)!;
      const nodes = [...copy.querySelectorAll("*")];
      const [h1, subtitle] = [copy.querySelector("h1")!, copy.querySelector("header p")!];

      const container = await hydrate();

      expect(recoverable).not.toHaveBeenCalled();
      expect(consoleError).not.toHaveBeenCalled();
      expect(container).toBe(copy);
      // Every static node is still in the page, the same object, and the header reads as before.
      for (const node of nodes) expect(node.isConnected).toBe(true);
      expect(document.querySelector("h1")).toBe(h1);
      expect(document.querySelector("header p")).toBe(subtitle);
      expect(subtitle.textContent).toBe(dicts[lang].zones[zone].subtitle);
      // The page under the header is React's own, drawn once the header is adopted.
      expect(container.querySelectorAll('[role="tabpanel"]').length).toBeGreaterThan(0);
    },
  );

  it("leaves only the reader's language, and nothing that CSS could hide when the language changes", async () => {
    load("choco", "en");
    const container = await hydrate();
    expect(document.querySelectorAll('[data-static-lang="es"]')).toHaveLength(0);
    // `index.css` hides a `[data-static-lang]` copy whose language is not on <html>; the live page
    // must not be one, or switching to Spanish would hide it.
    expect(container.hasAttribute("data-static-lang")).toBe(false);
    expect(container.hasAttribute("data-static-live")).toBe(true);
  });

  it("links each zone tab to its panel: React's ids continue the static copy's", async () => {
    load("tolima", "es");
    const container = await hydrate();
    const selected = container.querySelector('[role="tab"][aria-selected="true"]')!;
    const panel = document.getElementById(selected.getAttribute("aria-controls")!);
    expect(panel?.getAttribute("role")).toBe("tabpanel");
    expect(panel?.getAttribute("aria-labelledby")).toBe(selected.id);
  });

  it("finds nothing to hydrate on a page without the static header (the dev server's)", () => {
    document.body.innerHTML = '<div id="root"></div>';
    expect(takeStaticShell(document)).toBeNull();
  });
});
