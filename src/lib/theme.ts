import { useSyncExternalStore } from "react";
import { DARK_QUERY, THEME_KEY, startTheme, storedTheme } from "@/lib/startup";

/**
 * Theme follows the operating system unless the visitor picks one. Picking the
 * theme the system already uses clears the override, so auto-switching resumes.
 * The theme the page opens in is set before the first paint by the head script
 * (`src/lib/startup.ts`); this module only changes it afterwards.
 */
const system = window.matchMedia(DARK_QUERY);
const listeners = new Set<() => void>();

const isDark = () => startTheme(storedTheme(), system.matches) === "dark";

function apply() {
  // Every control carries colour transitions; firing them all at once on a theme flip smears.
  const off = document.createElement("style");
  off.textContent = "*,*::before,*::after{transition:none !important}";
  document.head.append(off);
  document.documentElement.classList.toggle("dark", isDark());
  void document.body?.offsetHeight;
  requestAnimationFrame(() => requestAnimationFrame(() => off.remove()));
  for (const l of listeners) l();
}

/** Follows a change of the system's theme while the page is open, unless the visitor chose one. */
export function followSystemTheme() {
  system.addEventListener("change", apply);
}

/**
 * Switches away from the theme on screen. Read from the page, not decided again: if the head script
 * never ran, the page is light whatever the system says, and deciding here would make the first press
 * store the theme already showing and change nothing.
 */
export function toggleTheme() {
  const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
  try {
    if (next === (system.matches ? "dark" : "light")) localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, next);
  } catch {
    /* private mode: the choice lasts for this visit only */
  }
  apply();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** True when the dark theme is showing. Re-renders on system changes and on toggle. */
export const useIsDark = () =>
  useSyncExternalStore(subscribe, () => document.documentElement.classList.contains("dark"));
