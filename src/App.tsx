import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangleIcon, InfoIcon, MoonIcon, SunIcon } from "lucide-react";
import { lazy, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { BSummary, type BScope } from "@/components/b-summary";
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
import { getEvents, getStatus, type StoredEvent } from "@/lib/api";
import { DEFAULT_FILTERS, activeFilterChips, applyFilters, type ClusterChoice, type Filters } from "@/lib/filters";
import { useI18n } from "@/lib/i18n";
import { toggleTheme, useIsDark } from "@/lib/theme";
import { useNow } from "@/lib/use-now";
import { dominantMagType, useStats } from "@/lib/use-stats";
import { clusterOf, computeClusterStats } from "../core/clusters";

// The three Recharts cards and the map are the page's heavy chunks; `Deferred` says why they
// are only fetched once the reader is near them. Everything above the b-value — the number
// itself, the status bar, the groups card and the filters — stays in the first chunk.
const BOverTimeChart = lazy(() => import("@/components/charts/b-over-time").then((m) => ({ default: m.BOverTimeChart })));
const FmdChart = lazy(() => import("@/components/charts/fmd").then((m) => ({ default: m.FmdChart })));
const MagnitudeTimeChart = lazy(() => import("@/components/charts/magnitude-time").then((m) => ({ default: m.MagnitudeTimeChart })));
const EventMap = lazy(() => import("@/components/event-map"));
const NO_EVENTS: StoredEvent[] = [];
const row = (i: number) => ({ "--i": i }) as CSSProperties;

export function App() {
  const { t, lang, setLang } = useI18n();
  const dark = useIsDark();
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  // The Worker's cron updates the database every 5 minutes; an open page picks that up by itself.
  // Status is the cheap heartbeat: polled every minute, and again whenever the tab comes back to the
  // front, because interval polling pauses while a tab is hidden. Events are refetched when status
  // reports a newer ingest, so the figures never lag the "last update" shown above them, and when
  // the reader returns after more than the one-minute stale time.
  const qc = useQueryClient();
  const events = useQuery({ queryKey: ["events"], queryFn: getEvents });
  const status = useQuery({ queryKey: ["status"], queryFn: getStatus, refetchInterval: 60_000, refetchOnWindowFocus: "always" });
  const lastIngest = status.data?.lastSuccessfulRun?.finishedAt ?? null;
  const seenIngest = useRef<string | null>(null);
  useEffect(() => {
    if (lastIngest === null) return;
    if (seenIngest.current !== null && seenIngest.current !== lastIngest) void qc.invalidateQueries({ queryKey: ["events"] });
    seenIngest.current = lastIngest;
  }, [lastIngest, qc]);

  // Keyed on the fields that select events, not on `filters`: moving Mc must not hand the map,
  // the table and the magnitude chart a new array to redraw.
  const { from, to, minMag, manualOnly, excludeMainshock } = filters;
  const base = useMemo(
    () => applyFilters(events.data ?? NO_EVENTS, { from, to, minMag, manualOnly, excludeMainshock, mc: null }),
    [events.data, from, to, minMag, manualOnly, excludeMainshock],
  );
  // The two depth clusters. Both are fitted above the Mc of every event that passes the filters, so
  // narrowing the page to one cluster changes which events are counted and nothing else.
  const [cluster, setCluster] = useState<ClusterChoice>("all");
  const selection = useMemo(() => ({ cluster, onChange: setCluster }), [cluster]);
  // "The last 7 days" is measured from the clock, not from the data, so it needs one: without it the
  // count would freeze for as long as the events themselves did not change. An hour is fine enough.
  const hour = Math.floor(useNow() / 3_600_000) * 3_600_000;
  const clusterStats = useMemo(() => computeClusterStats(base, filters.mc, hour + 3_600_000), [base, filters.mc, hour]);
  const shown = useMemo(() => (cluster === "all" ? base : base.filter((e) => clusterOf(e) === cluster)), [base, cluster]);
  const allStats = cluster === "all" ? clusterStats.all : clusterStats[cluster].stats;
  // The b card's tabs: every magnitude type, or only the commonest one. Both use the Mc of the
  // all-types fit, so the two values differ only in which magnitudes they count. The b charts
  // follow the tab; the map, the table and the magnitude chart always show every event.
  const [bScope, setBScope] = useState<BScope>("all");
  const magType = useMemo(() => dominantMagType(shown), [shown]);
  const ofType = useMemo(() => (magType === null ? shown : shown.filter((e) => e.magType === magType)), [shown, magType]);
  const typeStats = useStats(ofType, clusterStats.all.mc);
  const oneType = bScope === "type" && magType !== null;
  const stats = oneType ? typeStats : allStats;
  const heavyMagType = useDeferredValue(oneType ? magType : null);
  // The numbers update at once; the charts, map and table follow in an interruptible render. Drawn
  // together they hold the main thread for ~300ms per slider step, which starves the rolling
  // digits of frames so they appear to jump.
  const heavyCluster = useDeferredValue(cluster === "all" ? null : cluster);
  const heavyShown = useDeferredValue(shown);
  const heavyBase = useDeferredValue(base);
  const heavyStats = useDeferredValue(stats);
  const incomplete = !!status.data && status.data.backfill.done < status.data.backfill.total;
  const other = lang === "es" ? "en" : "es";

  // Everything the page is narrowed by, in one place, so the scope bar can name it and clear it.
  // The filters form keeps its own values, so clearing them is a request, not an assignment.
  const [resetSignal, setResetSignal] = useState(0);
  const chips = useMemo(() => activeFilterChips(filters, cluster, t, lang), [filters, cluster, t, lang]);
  const clearScope = useCallback(() => { setCluster("all"); setResetSignal((n) => n + 1); }, []);

  return (
    <div className="mx-auto flex min-h-svh max-w-7xl flex-col gap-6 px-4 py-8 tabular-nums sm:px-6">
      <header className="flex flex-col gap-2">
        {/* Title and controls share the top row; the subtitle runs the full width underneath. */}
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-3xl font-semibold tracking-tight text-balance">{t.title}</h1>
          <div className="ml-auto flex items-center gap-2">
            {/* On touch the controls grow to 40px, and the hit area to 44px, instead of relying on an invisible hit area alone. */}
            <Button variant="outline" size="sm" lang={other} onClick={() => setLang(other)}
              className="pointer-coarse:h-10 pointer-coarse:px-4 pointer-coarse:text-sm pointer-coarse:after:-inset-x-0 pointer-coarse:after:-inset-y-0.5">
              {lang === "es" ? "English" : "Español"}
            </Button>
            <Button variant="outline" size="icon-sm" aria-label={dark ? t.themeToLight : t.themeToDark} onClick={toggleTheme}
              className="pointer-coarse:size-10 pointer-coarse:after:-inset-0.5">
              {dark ? <SunIcon className="size-4 pointer-coarse:size-5" /> : <MoonIcon className="size-4 pointer-coarse:size-5" />}
            </Button>
          </div>
        </div>
        <p className="text-muted-foreground text-pretty">{t.subtitle}</p>
      </header>

      <main className="contents">
        <StatusBar status={status.data} shown={events.data ? shown.length : null} />
        {events.data ? (
          <FilterScope chips={chips} cluster={cluster} shown={shown.length} total={events.data.length} onClear={clearScope} />
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
            {shown.length > 0 ? (
              <div className="enter grid gap-6 lg:grid-cols-3">
                <BSummary stats={stats} incomplete={incomplete}
                  cluster={cluster === "all" ? null : cluster}
                  scope={{ value: bScope, onChange: setBScope, magType, typeCount: ofType.length, total: shown.length }} />
                <div className="lg:col-span-2">
                  <Deferred title={t.bTimeTitle}>
                    <BOverTimeChart stats={heavyStats} magType={heavyMagType} cluster={heavyCluster} />
                  </Deferred>
                </div>
              </div>
            ) : null}

            {base.length > 0 ? <ClustersCard events={heavyBase} stats={clusterStats} selection={selection} /> : null}
            <FiltersCard mcAuto={clusterStats.all.mcMaxc} onChange={setFilters} resetSignal={resetSignal} />

            {shown.length === 0 ? (
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
                <div className="enter grid gap-6 lg:grid-cols-2" style={row(1)}>
                  <Deferred title={t.fmdTitle}>
                    <FmdChart stats={heavyStats} magType={heavyMagType} cluster={heavyCluster} />
                  </Deferred>
                  {/* h-96 canvas plus the depth/magnitude legend under it. */}
                  <Deferred title={t.mapTitle} height="h-[26rem]">
                    <EventMap events={heavyShown} />
                  </Deferred>
                </div>
                <div className="enter" style={row(2)}>
                  <Deferred title={t.magTimeTitle}>
                    <MagnitudeTimeChart events={heavyShown} />
                  </Deferred>
                </div>
                <div className="enter" style={row(3)}><EventsTable events={heavyShown} /></div>
              </>
            )}
          </>
        ) : events.isPending ? (
          // At least a viewport tall, so nothing below is on screen to be pushed away when content arrives.
          <Skeleton className="min-h-svh w-full" />
        ) : null}

        <Alert role="note">
          <InfoIcon />
          <AlertTitle>{t.caveatsTitle}</AlertTitle>
          <AlertDescription>
            <ul className="flex max-w-[75ch] list-disc flex-col gap-1 ps-4">
              {t.caveats.map((c) => <li key={c}>{c}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      </main>

      <footer className="pb-8 text-sm text-muted-foreground">
        {t.source}{" "}
        <a className="underline underline-offset-4" target="_blank" rel="noreferrer"
          href="https://bdrsnc.sgc.gov.co/paginas1/catalogo/Consulta_Experta_Seiscomp/consultaexperta.php">
          bdrsnc.sgc.gov.co
        </a>
        <p className="mt-1 max-w-[75ch] text-pretty">{t.autoUpdateLong}</p>
        <p className="mt-1 max-w-[75ch] text-pretty">{t.timeNote}</p>
      </footer>
    </div>
  );
}
