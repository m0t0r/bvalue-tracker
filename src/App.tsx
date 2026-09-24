import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangleIcon, InfoIcon, MoonIcon, SunIcon } from "lucide-react";
import { lazy, useEffect, useMemo, useRef, type CSSProperties } from "react";
import { BSummary } from "@/components/b-summary";
import { ClustersCard } from "@/components/clusters-card";
import { Deferred } from "@/components/deferred";
import { EventsTable } from "@/components/events-table";
import { FilterScope } from "@/components/filter-scope";
import { FiltersCard } from "@/components/filters";
import { StatusBar } from "@/components/status-bar";
import { TechnicalDetail } from "@/components/technical-detail";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getEvents, getStatus } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { scopeChips, useScope } from "@/lib/scope";
import { toggleTheme, useIsDark } from "@/lib/theme";
import { ZoneProvider, useZoneState } from "@/lib/zone";
import { mainshockId } from "../core/mainshock";
import { ZONES, ZONE_IDS, isZoneId, type ZoneId } from "../core/zones";
import { updateEveryMin } from "../worker/plan.ts";

// The three Recharts cards and the map are the page's heavy chunks; `Deferred` says why they
// are only fetched once the reader is near them. Everything above the b-value — the number
// itself, the status bar, the groups card and the filters — stays in the first chunk.
const BOverTimeChart = lazy(() =>
  import("@/components/charts/b-over-time").then((m) => ({ default: m.BOverTimeChart })),
);
const FmdChart = lazy(() => import("@/components/charts/fmd").then((m) => ({ default: m.FmdChart })));
const MagnitudeTimeChart = lazy(() =>
  import("@/components/charts/magnitude-time").then((m) => ({ default: m.MagnitudeTimeChart })),
);
const EventMap = lazy(() => import("@/components/event-map"));

export function App() {
  const { t, lang, setLang } = useI18n();
  const dark = useIsDark();
  const [zone, setZone] = useZoneState();
  const copy = t.zones[zone];
  useEffect(() => {
    document.title = copy.docTitle;
  }, [copy.docTitle]);
  const other = lang === "es" ? "en" : "es";

  return (
    <div className="mx-auto flex min-h-svh max-w-7xl flex-col gap-6 px-4 py-8 tabular-nums sm:px-6">
      {/* One tab per zone. Only the chosen zone's panel is mounted, so switching throws away the
          other zone's filters and scroll-linked state and starts this one from its own defaults. */}
      <Tabs value={zone} onValueChange={(v) => isZoneId(v) && setZone(v)} className="gap-6">
        <header className="flex flex-col gap-2">
          {/* The zones and the page's two controls share the top row; the title and the subtitle
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
              {/* The `-touch` sizes: on touch the controls grow to 40px, and the hit area to 44px, instead of relying on an invisible hit area alone. */}
              <Button variant="outline" size="sm-touch" lang={other} onClick={() => setLang(other)}>
                {lang === "es" ? "English" : "Español"}
              </Button>
              <Button
                variant="outline"
                size="icon-sm-touch"
                aria-label={dark ? t.themeToLight : t.themeToDark}
                onClick={toggleTheme}
              >
                {dark ? (
                  <SunIcon className="size-4 pointer-coarse:size-5" />
                ) : (
                  <MoonIcon className="size-4 pointer-coarse:size-5" />
                )}
              </Button>
            </div>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-balance">{copy.title}</h1>
          <p className="text-muted-foreground text-pretty">{copy.subtitle}</p>
        </header>

        {ZONE_IDS.map((z) => (
          <TabsContent key={z} value={z} className="flex flex-col gap-6">
            <ZoneProvider value={ZONES[z]}>
              <ZonePage zone={z} />
            </ZoneProvider>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

/** One zone's whole page: its catalogue, its status and everything drawn from them. */
function ZonePage({ zone }: { zone: ZoneId }) {
  const { t, lang } = useI18n();
  // The Worker's cron updates the database on its own schedule; an open page picks that up by itself.
  // Status is the cheap heartbeat: polled every minute, and again whenever the tab comes back to the
  // front, because interval polling pauses while a tab is hidden. Events are refetched when status
  // reports a newer ingest, so the figures never lag the "last update" shown above them, and when
  // the reader returns after more than the one-minute stale time.
  const qc = useQueryClient();
  const events = useQuery({ queryKey: ["events", zone], queryFn: () => getEvents(zone) });
  const status = useQuery({
    queryKey: ["status", zone],
    queryFn: () => getStatus(zone),
    refetchInterval: 60_000,
    refetchOnWindowFocus: "always",
  });
  const lastIngest = status.data?.lastSuccessfulRun?.finishedAt ?? null;
  const seenIngest = useRef<string | null>(null);
  useEffect(() => {
    if (lastIngest === null) return;
    if (seenIngest.current !== null && seenIngest.current !== lastIngest)
      void qc.invalidateQueries({ queryKey: ["events", zone] });
    seenIngest.current = lastIngest;
  }, [lastIngest, qc, zone]);

  // What the page is narrowed to, and every figure read off it. `deferred` is the same view one
  // render behind, for the drawings that must not hold up the rolling digits — `src/lib/scope.ts`
  // says why, and holds the rule that every b-value here shares the catalogue's Mc.
  const { scope, view, deferred, selectCluster, magTabs, setFilters, clear } = useScope(events.data, zone);
  // The mainshock is detected over the whole catalogue, whatever the filters leave (`pageView`).
  const mainshock = mainshockId(view.mainshock);
  const chips = useMemo(() => scopeChips(scope, t, lang, zone, mainshock), [scope, t, lang, zone, mainshock]);
  const incomplete = !!status.data && status.data.backfill.done < status.data.backfill.total;
  // Nothing is drawn under the loading skeleton. Whatever sat there would be pulled up into view
  // when a failed load swaps the viewport-tall skeleton for a short alert: the caveats note did
  // exactly that, 0.12 of CLS on every failed load, and PageSpeed Insights, whose runner the
  // same-origin check refuses, scored the page on that state (docs/performance.md).
  const settled = !events.isPending;

  return (
    <>
      <main className="contents">
        <StatusBar
          status={status.data}
          shown={events.data ? view.shown.length : null}
          mainshock={events.data ? view.mainshock : null}
        />
        {events.data ? (
          <FilterScope
            chips={chips}
            cluster={scope.cluster}
            shown={view.shown.length}
            total={events.data.length}
            onClear={clear}
          />
        ) : null}

        {events.isError ? (
          <Alert variant="destructive">
            <AlertTriangleIcon />
            <AlertTitle>{t.loadFailed}</AlertTitle>
            <AlertDescription>
              {t.loadFailedBody}
              <TechnicalDetail>{String(events.error)}</TechnicalDetail>
            </AlertDescription>
          </Alert>
        ) : null}

        {/* Gate on data, not on "not pending": a failed load must not draw an empty dashboard
            that tells the reader to change their filters. Stale data stays visible if a refetch fails. */}
        {events.data ? (
          <>
            {/* The number the reader came for leads; the controls that shape it follow. */}
            {view.shown.length > 0 ? (
              <div className="enter grid gap-6 lg:grid-cols-3">
                <BSummary
                  stats={view.stats}
                  incomplete={incomplete}
                  cluster={scope.cluster === "all" ? null : scope.cluster}
                  tabs={magTabs}
                />
                <div className="lg:col-span-2">
                  <Deferred title={t.bTimeTitle}>
                    <BOverTimeChart
                      stats={deferred.stats}
                      magType={deferred.magType}
                      cluster={deferred.cluster}
                      mainshockTime={view.mainshock.state === "found" ? view.mainshock.largest.time : null}
                    />
                  </Deferred>
                </div>
              </div>
            ) : null}

            {/* The two depth groups are a finding about the Chocó catalogue (docs/science.md). */}
            {ZONES[zone].depthClusters && view.base.length > 0 ? (
              <ClustersCard events={deferred.base} stats={view.clusters} selection={selectCluster} />
            ) : null}
            <FiltersCard
              mcAuto={view.clusters.all.mcMaxc}
              value={scope.filters}
              onChange={setFilters}
              hasMainshock={mainshock !== null}
            />

            {view.shown.length === 0 ? (
              <Card>
                <CardContent>
                  <Empty>
                    <EmptyHeader>
                      <EmptyTitle>{t.noEvents}</EmptyTitle>
                      <EmptyDescription>{t.noEventsBody}</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="enter grid gap-6 lg:grid-cols-2" style={{ "--i": 1 } as CSSProperties}>
                  <Deferred title={t.fmdTitle}>
                    <FmdChart stats={deferred.stats} magType={deferred.magType} cluster={deferred.cluster} />
                  </Deferred>
                  <Deferred title={t.mapTitle} height="map">
                    <EventMap events={deferred.shown} mainshockId={mainshock} />
                  </Deferred>
                </div>
                <div className="enter" style={{ "--i": 2 } as CSSProperties}>
                  <Deferred title={t.magTimeTitle}>
                    <MagnitudeTimeChart events={deferred.shown} mainshockId={mainshock} />
                  </Deferred>
                </div>
                <div className="enter" style={{ "--i": 3 } as CSSProperties}>
                  <EventsTable events={deferred.shown} />
                </div>
              </>
            )}
          </>
        ) : events.isPending ? (
          // At least a viewport tall, so nothing below is on screen to be pushed away when content arrives.
          <Skeleton className="min-h-svh w-full" />
        ) : null}

        {settled ? (
          <Alert role="note">
            <InfoIcon />
            <AlertTitle>{t.caveatsTitle}</AlertTitle>
            <AlertDescription>
              <ul className="flex max-w-[75ch] list-disc flex-col gap-1 ps-4">
                {t.zones[zone].caveats(view.mainshock.state).map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}
      </main>

      {settled ? (
        <footer className="pb-8 text-sm text-muted-foreground">
          {t.source}{" "}
          <a
            className="underline underline-offset-4"
            target="_blank"
            rel="noreferrer"
            href="https://bdrsnc.sgc.gov.co/paginas1/catalogo/Consulta_Experta_Seiscomp/consultaexperta.php"
          >
            bdrsnc.sgc.gov.co
          </a>
          <p className="mt-1 max-w-[75ch] text-pretty">{t.autoUpdateLong(updateEveryMin(zone))}</p>
          <p className="mt-1 max-w-[75ch] text-pretty">{t.timeNote}</p>
        </footer>
      ) : null}
    </>
  );
}
