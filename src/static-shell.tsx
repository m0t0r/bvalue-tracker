/**
 * The monitor's header as HTML, for the build to write into each zone's page (issue #69). On a phone
 * the header's subtitle is the page's largest text, so drawn by React it could not appear before the
 * whole bundle had downloaded and run. In the HTML it paints as soon as the stylesheet and the head
 * script (`src/boot.ts`) have loaded.
 *
 * It is `MonitorShell`, the component React draws, rendered once per language from the same strings,
 * so the two cannot drift, and React hydrates the reader's copy rather than drawing its own
 * (`src/lib/hydrate.ts`, issue #97): a new header, larger once Geist has loaded, was a later LCP
 * entry. So this must render exactly what `App` renders before the page under the header, with the
 * same `useId` prefix. Both languages are in the page and `index.css` shows the one the head script
 * put on `<html lang>`: the CSP allows no inline script to write it in place. The theme needs no
 * copy, since every colour and the theme button's icon and name follow the `dark` class.
 *
 * Its controls do nothing until React has hydrated it (only the link to /insights works), for about
 * 1.7 s of a slow phone's load; before it the page was blank for that time. Declined in the code
 * review: making it `inert`, which would also hide the header's words from a screen reader.
 *
 * Runs in Node at build time (`vite.config.ts`), never in the page.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { MonitorShell } from "@/components/monitor-shell";
import { staticIdPrefix } from "@/lib/hydrate";
import { FixedLang, type Lang } from "@/lib/i18n";
import type { ZoneId } from "../core/zones";

const LANGS: readonly Lang[] = ["es", "en"];
const nothing = () => {};

export function staticShell(zone: ZoneId): string {
  return LANGS.map((lang) => {
    const shell = renderToStaticMarkup(
      <FixedLang lang={lang}>
        <MonitorShell zone={zone} onZone={nothing} onToggleTheme={nothing} />
      </FixedLang>,
      // Radix's ids come from `useId`; without a prefix both copies would carry the same ones. The
      // page hydrates with the same prefix, so React's ids go on from these.
      { identifierPrefix: staticIdPrefix(lang) },
    );
    return `<div data-static-lang="${lang}">${shell}</div>`;
  }).join("");
}
