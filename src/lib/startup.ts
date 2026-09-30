/**
 * What the page opens in: the remembered language and theme, or the browser's and the system's.
 * Decided once, before the first paint, by the head script (`src/boot.ts`), which writes the answer
 * on `<html>` (`lang` and the `dark` class); React reads it back from there rather than deciding
 * again. The static header in each zone's HTML (`src/static-shell.tsx`) is shown in the language
 * this sets, so the two must agree, and one function deciding is how they do.
 *
 * No imports: the head script is bundled from this file alone.
 */

export type Lang = "es" | "en";
export type Theme = "light" | "dark";

export const LANG_KEY = "sgc-swarm:lang";
export const THEME_KEY = "sgc-swarm:theme";
export const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * The browser's first preferred language the page has, by its primary subtag ("es-CO" is Spanish),
 * or English when it has none of them.
 */
export function browserLang(languages: readonly string[]): Lang {
  for (const tag of languages) {
    const primary = tag.toLowerCase().split("-")[0];
    if (primary === "es" || primary === "en") return primary;
  }
  return "en";
}

/** The languages the browser prefers, in order. */
export const navigatorLanguages = (nav: Pick<Navigator, "languages" | "language">): readonly string[] =>
  nav.languages?.length ? nav.languages : [nav.language ?? ""];

/** A stored value, or null where storage is refused (private browsing, blocked site data). */
export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export const storedLang = (): Lang | null => {
  const v = readStored(LANG_KEY);
  return v === "es" || v === "en" ? v : null;
};

export const storedTheme = (): Theme | null => {
  const v = readStored(THEME_KEY);
  return v === "light" || v === "dark" ? v : null;
};

/** The language to open in: the reader's choice, or the browser's. */
export const startLang = (stored: Lang | null, languages: readonly string[]): Lang => stored ?? browserLang(languages);

/** The theme to open in: the reader's choice, or the system's. */
export const startTheme = (stored: Theme | null, systemDark: boolean): Theme =>
  stored ?? (systemDark ? "dark" : "light");

/** PROTOTYPE: research flags, set by `?proto=a,b` (empty clears) and kept in localStorage. */
function applyProto(): void {
  try {
    const asked = new URLSearchParams(location.search).get("proto");
    if (asked !== null) localStorage.setItem("sgc-swarm:proto", asked);
    const flags = (localStorage.getItem("sgc-swarm:proto") ?? "").split(",");
    document.documentElement.dataset.proto = flags.join(" ");
    // The data /insights draws from is in the browser (`local-first.ts` keeps the time it stored it).
    const kept = Number(localStorage.getItem("sgc-swarm:kept"));
    if (flags.includes("noskel") && Date.now() - kept < 7 * 24 * 3600_000) {
      document.documentElement.dataset.local = "";
    }
    if (flags.includes("vt")) {
      const style = document.createElement("style");
      style.textContent = "@view-transition{navigation:auto}";
      document.head.append(style);
    }
  } catch {
    // Storage refused: no flags.
  }
}

/** Writes the startup language and theme on `<html>`. The head script's whole job. */
export function applyStartup(): void {
  applyProto();
  const root = document.documentElement;
  root.lang = startLang(storedLang(), navigatorLanguages(navigator));
  root.classList.toggle("dark", startTheme(storedTheme(), matchMedia(DARK_QUERY).matches) === "dark");
}
