import { QueryClient } from "@tanstack/react-query";
import { act, createElement } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { takeStaticShell } from "@/lib/hydrate";
import { PageRoot } from "@/page-root";
import { insightsStaticShell } from "@/static-shell";
import captured from "../../test/fixtures/api-events-2026-09-24.json";
import { InsightsApp } from "./app";
import { insightsCopy } from "./copy";
import { TABS, type Tab } from "./shell";

/**
 * /insights's header and skeleton are in its HTML, and React adopts them rather than replacing them
 * (issue #120), as the monitor's header (`src/page-root.test.ts`). So React's first render must be
 * the static copy exactly, on every tab: the HTML cannot see `?tab=`, so it selects none, and the page
 * selects the query string's tab only once it has hydrated.
 */

// The tabs' drawings are beside the point, and each is a large chunk: a stand-in names its tab.
vi.mock("./story", () => ({ Story: () => createElement("p", null, "story") }));
vi.mock("./questions", () => ({ Questions: () => createElement("p", null, "questions") }));
vi.mock("./block3d", () => ({ Block3D: () => createElement("p", null, "3d") }));

/** /insights as the build writes it: both languages' copies in `#root`, `lang` set by the head script. */
function load(lang: "es" | "en", tab: Tab) {
  document.documentElement.lang = lang;
  document.body.innerHTML = `<div id="root"><!--static-shell-->${insightsStaticShell()}<!--/static-shell--></div>`;
  history.replaceState(null, "", tab === "story" ? "/insights" : `/insights?tab=${tab}`);
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
const recoverable = vi.fn();
const consoleError = vi.spyOn(console, "error");

/** The API as the page reads it, from the captured catalogues, with complete histories. */
function answer(path: string): unknown {
  const url = new URL(path, "http://localhost");
  const zone = url.searchParams.get("zone") as "choco" | "tolima";
  if (url.pathname === "/api/events") return captured[zone];
  if (url.pathname === "/api/status")
    return {
      totalEvents: 1,
      newestEvent: null,
      lastRun: null,
      lastSuccessfulRun: null,
      backfill: { done: 1, total: 1 },
    };
  if (url.pathname === "/api/context") return { dyfi: null, pager: null, forecast: null };
  throw new Error(`unexpected request ${path}`);
}

beforeEach(() => {
  recoverable.mockClear();
  consoleError.mockClear();
  // Nothing answers unless a test says so: the first render is drawn before any data.
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
  if (shell === null) throw new Error("no static copy to hydrate");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root = hydrateRoot(shell.container, createElement(PageRoot, { client, children: createElement(InsightsApp) }), {
      identifierPrefix: shell.identifierPrefix,
      onRecoverableError: recoverable,
    });
  });
  return shell.container;
}

const selected = (el: ParentNode) => el.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');

describe("/insights's first render", () => {
  it.each((["es", "en"] as const).flatMap((lang) => TABS.map((tab) => [lang, tab] as const)))(
    "keeps the static copy in %s on the %s tab, node for node, and then selects that tab",
    async (lang, tab) => {
      load(lang, tab);
      const copy = document.querySelector<HTMLElement>(`[data-static-lang="${lang}"]`)!;
      const nodes = [...copy.querySelectorAll("*")];
      const [h1, subtitle] = [copy.querySelector("h1")!, copy.querySelector("header p")!];
      // The HTML cannot know the query string, so it shows no tab as chosen rather than a wrong one.
      expect(selected(copy)).toBeNull();

      const container = await hydrate();

      expect(recoverable).not.toHaveBeenCalled();
      expect(consoleError).not.toHaveBeenCalled();
      expect(container).toBe(copy);
      for (const node of nodes) expect(node.isConnected).toBe(true);
      expect(document.querySelector("h1")).toBe(h1);
      expect(subtitle.textContent).toBe(insightsCopy[lang].subtitle);
      expect(selected(container)?.textContent).toBe(insightsCopy[lang].tabs[tab]);
      // Still the skeleton: no data has come.
      expect([...container.querySelectorAll('[role="status"]')].map((s) => s.textContent)).toEqual([
        "",
        insightsCopy[lang].loading,
      ]);
    },
  );

  it("leaves only the reader's language, marked live", async () => {
    load("en", "story");
    const container = await hydrate();
    expect(document.querySelectorAll('[data-static-lang="es"]')).toHaveLength(0);
    expect(container.hasAttribute("data-static-lang")).toBe(false);
    expect(container.hasAttribute("data-static-live")).toBe(true);
  });

  it("links the selected tab to its panel once the data is in: React's ids continue the static copy's", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string) => Response.json(answer(path))),
    );
    load("es", "questions");
    const container = await hydrate();
    await vi.waitFor(() => expect(container.querySelector('[role="tabpanel"]')).not.toBeNull());
    const tab = selected(container)!;
    const panel = document.getElementById(tab.getAttribute("aria-controls")!);
    expect(panel?.getAttribute("role")).toBe("tabpanel");
    expect(panel?.getAttribute("aria-labelledby")).toBe(tab.id);
    expect(panel?.textContent).toBe("questions");
    expect(recoverable).not.toHaveBeenCalled();
  });
});
