import { describe, expect, it } from "vitest";
import { dicts } from "@/lib/i18n";
import { ZONE_IDS } from "../core/zones";
import { staticShell } from "./static-shell";

/** The static header, parsed, one copy per language. */
function copies(zone: (typeof ZONE_IDS)[number]) {
  const doc = new DOMParser().parseFromString(`<body>${staticShell(zone)}</body>`, "text/html");
  return {
    all: [...doc.querySelectorAll<HTMLElement>("[data-static-lang]")],
    of: (lang: string) => doc.querySelector<HTMLElement>(`[data-static-lang="${lang}"]`)!,
    doc,
  };
}

describe("staticShell", () => {
  it.each(ZONE_IDS)("draws %s's header once in each language, from the page's own strings", (zone) => {
    const { all, of } = copies(zone);
    expect(all.map((c) => c.dataset.staticLang)).toEqual(["es", "en"]);
    for (const lang of ["es", "en"] as const) {
      const copy = of(lang);
      const t = dicts[lang];
      expect(copy.querySelector("h1")?.textContent).toBe(t.zones[zone].title);
      expect(copy.querySelector("header p")?.textContent).toBe(t.zones[zone].subtitle);
      expect([...copy.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent)).toEqual(
        ZONE_IDS.map((z) => t.zones[z].tab),
      );
      expect(copy.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe(t.zones[zone].tab);
      expect(copy.querySelector('a[href="/insights"]')?.textContent).toBe(t.insightsLink);
    }
  });

  it("gives the two copies different ids", () => {
    const ids = [...copies("choco").doc.querySelectorAll("[id]")].map((el) => el.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // Drawn before anything knows the theme: the button's icon and its name must follow the `dark`
  // class, so a reader already in dark mode is not offered the dark theme.
  it.each(["es", "en"] as const)("draws both halves of the theme button, each shown by the theme class, %s", (lang) => {
    const button = copies("tolima").of(lang).querySelector(".lucide-sun")?.closest("button");
    const half = (cls: string) => [...(button?.children ?? [])].find((el) => el.classList.contains(cls));
    const t = dicts[lang];
    expect(half("not-dark:hidden")?.querySelector("svg")?.classList.contains("lucide-sun")).toBe(true);
    expect(half("not-dark:hidden")?.textContent).toBe(t.themeToLight);
    expect(half("dark:hidden")?.querySelector("svg")?.classList.contains("lucide-moon")).toBe(true);
    expect(half("dark:hidden")?.textContent).toBe(t.themeToDark);
    expect(button?.hasAttribute("aria-label")).toBe(false);
  });
});
