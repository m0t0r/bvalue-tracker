/**
 * React adopts the static header in each page's HTML rather than replacing it (issue #97; the
 * insights page's since issue #120).
 *
 * The build draws the header into the page in both languages (`src/static-shell.tsx`), and the head
 * script shows the one on `<html lang>`. On a phone that copy paints before Geist has loaded, in the
 * fallback face. A header React drew in its place was a new element, and once Geist had loaded it
 * was larger than the static one, so Chrome counted it as the page's largest paint, after the whole
 * bundle (docs/performance.md). Hydrated, the static nodes stay, and there is no second paint to
 * count. Both pages depend on this module: `src/page-root.test.ts` and
 * `src/insights/hydration.test.ts` hold each page's static copy to its first render.
 */
import { useLayoutEffect, useState, type ReactNode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { openedIn } from "@/lib/i18n";
import type { Lang } from "@/lib/startup";

/** The prefix of the `useId`s in each language's static copy. Hydration must be given the same one. */
export const staticIdPrefix = (lang: Lang): string => `static-${lang}-`;

/**
 * The static header in the language on `<html>`, ready to hydrate, or null on a page without one
 * (the dev server's). The other language's copy is removed, and the kept one is marked live: a
 * `[data-static-lang]` copy is hidden by `index.css` while its language is not on `<html>`, which a
 * change of language would otherwise do to the whole page.
 */
export function takeStaticShell(doc: Document): { container: HTMLElement; identifierPrefix: string } | null {
  // The language React will draw in (`I18nProvider`), or the header's words would not match.
  const lang = openedIn(doc);
  const copies = [...doc.querySelectorAll<HTMLElement>("[data-static-lang]")];
  const live = copies.find((copy) => copy.dataset.staticLang === lang);
  if (live === undefined) return null;
  for (const copy of copies) if (copy !== live) copy.remove();
  live.setAttribute("data-static-live", "");
  live.removeAttribute("data-static-lang");
  return { container: live, identifierPrefix: staticIdPrefix(lang) };
}

/**
 * Puts `page` on screen: hydrates the built page's static copy, or, on a page without one (the dev
 * server's), draws it into `#root`. On a mismatch React draws its own copy instead, as it did before
 * the static header, and reports the mismatch through `installErrorReporting`.
 */
export function mountPage(page: ReactNode): void {
  const shell = takeStaticShell(document);
  if (shell) hydrateRoot(shell.container, page, { identifierPrefix: shell.identifierPrefix });
  else createRoot(document.getElementById("root")!).render(page);
}

/**
 * False while React hydrates the static header, true from the render after it. Whatever the static
 * copy does not have (the page under the header) waits for true: drawn during hydration it would not
 * match the HTML, and React would throw the header away and draw its own. Set in a layout effect, so
 * that render is synchronous and commits before the browser paints, in the same frame as hydration:
 * a desktop's LCP is drawn by the page, not the header, and should not wait a frame for it.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useLayoutEffect(() => setHydrated(true), []);
  return hydrated;
}
