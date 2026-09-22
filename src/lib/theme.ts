import { useSyncExternalStore } from "react";

/**
 * Theme follows the operating system unless the visitor picks one. Picking the
 * theme the system already uses clears the override, so auto-switching resumes.
 */
const STORAGE_KEY = "sgc-swarm:theme";
const system = window.matchMedia("(prefers-color-scheme: dark)");
const listeners = new Set<() => void>();

function stored(): "light" | "dark" | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

const isDark = () => (stored() ?? (system.matches ? "dark" : "light")) === "dark";

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

export function initTheme() {
  document.documentElement.classList.toggle("dark", isDark());
  system.addEventListener("change", apply);
}

export function toggleTheme() {
  const next = isDark() ? "light" : "dark";
  try {
    if (next === (system.matches ? "dark" : "light")) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, next);
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
