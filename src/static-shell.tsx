/**
 * Each page's header as HTML, for the build to write into its page: the monitor's (issue #69) and the
 * insights page's (issue #120). On a phone the monitor's header subtitle is the page's largest text, so
 * drawn by React it could not appear before the whole bundle had downloaded and run; the insights page
 * was blank until then. In the HTML a header paints as soon as the head script (`src/boot.ts`) has
 * loaded, with its CSS inlined.
 *
 * Each is the component React draws (`MonitorShell`, `InsightsShell`), rendered once per language from
 * the same strings, so the two cannot drift, and React hydrates the reader's copy rather than drawing
 * its own (`src/lib/hydrate.ts`, issue #97): a new header, larger once Geist has loaded, was a later
 * LCP entry. So this must render exactly what each page renders first, with the same `useId` prefix.
 * Both languages are in the page and `index.css` shows the one the head script put on `<html lang>`:
 * the CSP allows no inline script to write it in place. The theme needs no copy, since every colour
 * and the theme button's icon and name follow the `dark` class.
 *
 * Its controls do nothing until React has hydrated it (only the links work), for about 1.7 s of a slow
 * phone's load on the monitor; before it the page was blank for that time. Declined in the code
 * review: making it `inert`, which would also hide the header's words from a screen reader.
 *
 * Runs in Node at build time (`vite.config.ts`), never in the page.
 */
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MonitorShell } from "@/components/monitor-shell";
import { insightsCopy } from "@/insights/copy";
import { InsightsMain, InsightsShell, PageSkeleton } from "@/insights/shell";
import { staticIdPrefix } from "@/lib/hydrate";
import { FixedLang, type Lang } from "@/lib/i18n";
import type { ZoneId } from "../core/zones";

const LANGS: readonly Lang[] = ["es", "en"];
const nothing = () => {};

/** `draw` rendered once per language, each copy marked with its language for `index.css` to show or hide. */
function inBothLanguages(draw: (lang: Lang) => ReactNode): string {
  return LANGS.map((lang) => {
    const shell = renderToStaticMarkup(
      <FixedLang lang={lang}>{draw(lang)}</FixedLang>,
      // Radix's ids come from `useId`; without a prefix both copies would carry the same ones. The
      // page hydrates with the same prefix, so React's ids go on from these.
      { identifierPrefix: staticIdPrefix(lang) },
    );
    return `<div data-static-lang="${lang}">${shell}</div>`;
  }).join("");
}

export const staticShell = (zone: ZoneId): string =>
  inBothLanguages(() => <MonitorShell zone={zone} onZone={nothing} onToggleTheme={nothing} />);

/**
 * The insights page's header, and the skeleton under it, as React first renders them before the data
 * has come (issue #120): `InsightsApp`'s first render. No tab is selected, since the HTML is the same
 * for all three and cannot see `?tab=`; the page selects it once it has hydrated.
 */
export const insightsStaticShell = (): string =>
  inBothLanguages((lang) => (
    <InsightsShell tab={null} onTab={nothing} onToggleTheme={nothing}>
      <InsightsMain notice={null}>
        <PageSkeleton label={insightsCopy[lang].loading} />
      </InsightsMain>
    </InsightsShell>
  ));
