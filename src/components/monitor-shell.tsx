import { LightbulbIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Explain } from "@/components/explainer/explain";
import { HeaderControls, PageFrame } from "@/components/page-frame";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useI18n } from "@/lib/i18n";
import { Rich } from "@/lib/rich";
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
    <PageFrame>
      {/* One tab per zone. Only the chosen zone's panel is mounted, so switching throws away the
          other zone's filters and scroll-linked state and starts this one from its own defaults. */}
      <Tabs value={zone} onValueChange={(v) => isZoneId(v) && onZone(v)} className="flex-1 gap-6">
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
            <HeaderControls onToggleTheme={onToggleTheme}>
              {/* The explanations page, for a reader who wants the why rather than the figures. */}
              <Button variant="outline" size="sm-touch" asChild>
                <a href="/insights">
                  <LightbulbIcon />
                  {/* Icon only on a phone, so the tabs and the three controls still share one row at
                      375 px; the words stay the link's name. */}
                  <span className="max-sm:sr-only">{t.insightsLink}</span>
                </a>
              </Button>
            </HeaderControls>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-balance">{copy.title}</h1>
          <p className="text-muted-foreground text-pretty">
            <Rich text={copy.subtitle} parts={{ sgc: <Explain id="sgc">{t.sgcName}</Explain> }} />
          </p>
        </header>
        {children}
      </Tabs>
    </PageFrame>
  );
}
