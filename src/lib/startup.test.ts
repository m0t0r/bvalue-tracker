import { render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider, useI18n } from "./i18n";
import { LANG_KEY, THEME_KEY, applyStartup, startLang, startTheme } from "./startup";

describe("the language and theme the page opens in", () => {
  it("is the reader's remembered choice", () => {
    expect(startLang("en", ["es-CO"])).toBe("en");
    expect(startTheme("light", true)).toBe("light");
  });

  it("is otherwise the browser's language and the system's theme", () => {
    expect(startLang(null, ["es-CO", "en"])).toBe("es");
    expect(startLang(null, ["fr"])).toBe("en");
    expect(startTheme(null, true)).toBe("dark");
    expect(startTheme(null, false)).toBe("light");
  });
});

// The head script's whole job: `<html lang>` and the `dark` class, before anything is drawn.
describe("applyStartup", () => {
  const root = document.documentElement;
  const systemDark = (dark: boolean) =>
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: dark && query === "(prefers-color-scheme: dark)" }));
  const browser = (languages: string[]) => vi.spyOn(navigator, "languages", "get").mockReturnValue(languages);

  beforeEach(() => {
    localStorage.clear();
    root.lang = "es";
    root.classList.remove("dark");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([
    ["es", "light"],
    ["es", "dark"],
    ["en", "light"],
    ["en", "dark"],
  ] as const)("opens in the remembered %s and %s, whatever the browser and system say", (lang, theme) => {
    localStorage.setItem(LANG_KEY, lang);
    localStorage.setItem(THEME_KEY, theme);
    browser([lang === "es" ? "en-US" : "es-CO"]);
    systemDark(theme === "light");
    applyStartup();
    expect(root.lang).toBe(lang);
    expect(root.classList.contains("dark")).toBe(theme === "dark");
  });

  it("follows the browser and the system on a first visit", () => {
    browser(["es-CO", "en"]);
    systemDark(true);
    applyStartup();
    expect(root.lang).toBe("es");
    expect(root.classList.contains("dark")).toBe(true);
  });

  it("ignores a stored value it does not know", () => {
    localStorage.setItem(LANG_KEY, "pt");
    localStorage.setItem(THEME_KEY, "sepia");
    browser(["en-GB"]);
    systemDark(false);
    applyStartup();
    expect(root.lang).toBe("en");
    expect(root.classList.contains("dark")).toBe(false);
  });

  it("still decides when storage is refused, as in some private windows", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    browser(["en"]);
    systemDark(false);
    applyStartup();
    expect(root.lang).toBe("en");
  });
});

// React must draw the page in the language the static header already showed, not decide again: a
// second decision that disagreed would swap the header's language as the bundle landed.
describe("I18nProvider", () => {
  const Probe = () => createElement("span", null, useI18n().lang);

  it.each(["es", "en"] as const)("opens in the language on <html>, %s, whatever is stored", (lang) => {
    document.documentElement.lang = lang;
    localStorage.setItem(LANG_KEY, lang === "es" ? "en" : "es");
    const view = render(createElement(I18nProvider, null, createElement(Probe)));
    expect(view.container.textContent).toBe(lang);
    view.unmount();
    localStorage.clear();
  });
});
