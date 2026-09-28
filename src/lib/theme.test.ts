import { afterEach, describe, expect, it } from "vitest";
import { THEME_KEY } from "./startup";
import { toggleTheme } from "./theme";

// happy-dom's system theme is light.
describe("toggleTheme", () => {
  const root = document.documentElement;
  afterEach(() => {
    localStorage.clear();
    root.classList.remove("dark");
  });

  it("switches away from the theme on screen, even when that is not what storage and system say", () => {
    // Dark on screen with nothing stored and a light system: what the page shows, not what it
    // would decide, is what a press changes. Deciding again made the first press do nothing.
    root.classList.add("dark");
    toggleTheme();
    expect(root.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
  });

  it("remembers a theme that differs from the system's, and forgets one that matches", () => {
    toggleTheme();
    expect(root.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");
    toggleTheme();
    expect(root.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
  });
});
