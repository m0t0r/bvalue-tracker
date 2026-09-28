import { LightbulbIcon, MoonIcon, SunIcon } from "lucide-react";
import type { ReactNode } from "react";
import { LanguageButton } from "@/components/language-button";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useI18n } from "@/lib/i18n";
import { ZONE_IDS, isZoneId, type ZoneId } from "../../core/zones";

/**
 * The monitor's frame and header: the zone tabs, the page's three controls, and the zone's title and
 * subtitle. The build also draws it into each zone's HTML (`src/static-shell.tsx`), so a phone paints
 * the header, its largest text, before the bundle has run; React then hydrates that copy rather than
 * drawing its own (`src/lib/hydrate.ts`). So it must render exactly the same markup in the build and
 * in the page: it must not reach for the browser or for state the build does not have, and nothing in
 * it may depend on the theme except through the `dark` class. A mismatch makes React redraw the
 * header, which costs a phone its LCP again (`src/page-root.test.ts` catches one).
 */
export function MonitorShell({
  zone,
  onZone,
  onToggleTheme,
  children,
}: {
  zone: ZoneId;
  onZone: (zone: ZoneId) => void;
  onToggleTheme: () => void;
  children?: ReactNode;
}) {
  const { t } = useI18n();
  const copy = t.zones[zone];
  return (
    <div className="mx-auto flex min-h-svh max-w-7xl flex-col gap-6 px-4 py-8 tabular-nums sm:px-6">
      {/* One tab per zone. Only the chosen zone's panel is mounted, so switching throws away the
          other zone's filters and scroll-linked state and starts this one from its own defaults. */}
      <Tabs value={zone} onValueChange={(v) => isZoneId(v) && onZone(v)} className="gap-6">
        <header className="flex flex-col gap-2">
          {/* The zones and the page's three controls share the top row; the title and the subtitle
              belong to the chosen zone and run the full width underneath. On a narrow phone the
              controls wrap under the tabs rather than squeezing them. */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <TabsList aria-label={t.zoneLabel}>
              {ZONE_IDS.map((z) => (
                <TabsTrigger key={z} value={z}>
                  {t.zones[z].tab}
                </TabsTrigger>
              ))}
            </TabsList>
            <div className="ml-auto flex items-center gap-2">
              {/* The explanations page, for a reader who wants the why rather than the figures. */}
              <Button variant="outline" size="sm-touch" asChild>
                <a href="/insights">
                  <LightbulbIcon />
                  {/* Icon only on a phone, so the tabs and the three controls still share one row at
                      375 px; the words stay the link's name. */}
                  <span className="max-sm:sr-only">{t.insightsLink}</span>
                </a>
              </Button>
              {/* The `-touch` sizes: on touch the controls grow to 40px, and the hit area to 44px, instead of relying on an invisible hit area alone. */}
              <LanguageButton />
              <Button variant="outline" size="icon-sm-touch" onClick={onToggleTheme}>
                {/* Icon and name are chosen by the theme class, not by React: the static header is
                    drawn before anything knows the theme, and must show and say the right one from
                    the first paint. The hidden half is out of the accessibility tree too. */}
                <span className="contents not-dark:hidden">
                  <SunIcon />
                  <span className="sr-only">{t.themeToLight}</span>
                </span>
                <span className="contents dark:hidden">
                  <MoonIcon />
                  <span className="sr-only">{t.themeToDark}</span>
                </span>
              </Button>
            </div>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-balance">{copy.title}</h1>
          <p className="text-muted-foreground text-pretty">{copy.subtitle}</p>
        </header>
        {children}
      </Tabs>
    </div>
  );
}
