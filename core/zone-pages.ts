/**
 * Each zone is its own page, at its own path, with its own <head>. A link is shared person to
 * person (WhatsApp, mostly), and the preview a messenger draws is read from the page's meta tags
 * by a crawler that runs no JavaScript — so the title and description a Tolima link shows have to
 * be in the HTML the server sends for that link. With one `index.html` for both zones, every link
 * previewed as Chocó whatever it opened.
 *
 * `index.html` is Chocó's page and the template for the others: the build writes one more file per
 * zone (`tolima.html`, which the asset layer serves at `/tolima`) with the tags below swapped in.
 * Plain TypeScript with no DOM, because vite.config.ts runs it in Node at build time.
 */
import { DEFAULT_ZONE, ZONE_IDS, type ZoneId } from "./zones.ts";

/** Chocó keeps the bare URL, so every link shared before there were two zones still lands where it did. */
export const ZONE_PATHS: Record<ZoneId, string> = { choco: "/", tolima: "/tolima" };

/** The file the build writes for a zone, relative to the client build's root. */
export const zonePageFile = (zone: ZoneId): string =>
  zone === DEFAULT_ZONE ? "index.html" : `${ZONE_PATHS[zone].slice(1)}.html`;

/**
 * The zone a path shows; any path that is not another zone's is Chocó's. A trailing slash is
 * allowed, since the asset layer redirects it away anyway.
 */
export function zonePath(pathname: string): ZoneId {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return ZONE_IDS.find((z) => ZONE_PATHS[z] === path) ?? DEFAULT_ZONE;
}

/**
 * What a shared link says, in Spanish like the page's default. `title` is the tab's `docTitle` in
 * `src/lib/i18n.tsx` (a test holds them equal); `site` is the name the preview gives the site.
 */
export const SHARE_META: Record<ZoneId, { title: string; site: string; description: string }> = {
  choco: {
    title: "Secuencia sísmica del Chocó · valor b",
    site: "Secuencia sísmica del Chocó",
    description:
      "Catálogo del SGC y valor b de Gutenberg–Richter para la secuencia del Chocó tras el sismo M7.4 del 10 de agosto de 2026.",
  },
  tolima: {
    title: "Enjambre sísmico de Chaparral (Tolima) · valor b",
    site: "Enjambre sísmico de Chaparral (Tolima)",
    description:
      "Catálogo del SGC y valor b de Gutenberg–Richter para el enjambre sísmico de Chaparral (Tolima), que comenzó el 20 de septiembre de 2026.",
  },
};

const escapeAttr = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/**
 * `<meta name|property="key" content="…">`, however the attributes are wrapped across lines. The
 * keys are the fixed literals below, none with a regex metacharacter in it.
 */
const metaTag = (attr: "name" | "property", key: string) =>
  new RegExp(`(<meta\\s+${attr}="${key}"\\s+content=")([^"]*)(")`, "g");

/**
 * `html` with the zone's title, description and Open Graph tags. Every tag must be found exactly
 * once: a build that quietly shipped Chocó's preview on another zone's page is the bug this exists
 * to fix, so a template that has drifted fails the build instead.
 */
export function withZoneMeta(html: string, zone: ZoneId): string {
  const meta = SHARE_META[zone];
  let out = html;
  const swap = (pattern: RegExp, what: string, value: (current: string) => string) => {
    const found = [...out.matchAll(pattern)];
    if (found.length !== 1) throw new Error(`index.html: expected one ${what}, found ${found.length}`);
    out = out.replace(pattern, (_m, open: string, current: string, close: string) => open + value(current) + close);
  };
  swap(/(<title>)([^<]*)(<\/title>)/g, "<title>", () => escapeAttr(meta.title));
  swap(metaTag("name", "description"), "description", () => escapeAttr(meta.description));
  swap(metaTag("property", "og:site_name"), "og:site_name", () => escapeAttr(meta.site));
  swap(metaTag("property", "og:title"), "og:title", () => escapeAttr(meta.title));
  swap(metaTag("property", "og:description"), "og:description", () => escapeAttr(meta.description));
  // The origin stays whatever index.html says, so the production host is written in one place.
  swap(metaTag("property", "og:url"), "og:url", (current) => new URL(ZONE_PATHS[zone], current).href);
  return out;
}
