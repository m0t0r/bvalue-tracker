import { Explain } from "@/components/explainer/explain";
import { Rich } from "@/lib/rich";
import { SGC_QUERY_URL } from "@/lib/format";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { InfoIcon } from "lucide-react";
import { lazy, useCallback, useEffect, useMemo, useRef, type CSSProperties } from "react";
import { useMediaQuery } from "usehooks-ts";
import { Backdrop } from "@/backdrop/backdrop";
import { BSummary } from "@/components/b-summary";
import { BTimeKey } from "@/components/charts/b-over-time-key";
import { BTimeCsvButton } from "@/components/charts/b-over-time-csv";
import { bTimeDescription } from "@/components/charts/b-over-time-description";
import { fmdDescription } from "@/components/charts/fmd-description";
import { MagnitudeTimePlaceholder } from "@/components/charts/magnitude-time-legend";
import { ClustersCard } from "@/components/clusters-card";
import { Deferred } from "@/components/deferred";
import { EventsTable } from "@/components/events-table";
import { FilterScope } from "@/components/filter-scope";
import { FiltersCard } from "@/components/filters";
import { LoadError } from "@/components/load-error";
import { MonitorShell } from "@/components/monitor-shell";
import { MapPlaceholder, mapDescription } from "@/components/map-legend";
import { SiteFooter } from "@/components/site-footer";
import { StatusBar } from "@/components/status-bar";
import { TechnicalDetail } from "@/components/technical-detail";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { TabsContent } from "@/components/ui/tabs";
import { Spinner } from "@/components/ui/spinner";
import { MAX_RETRIES, getEvents, getStatus } from "@/lib/api";
import { useHydrated } from "@/lib/hydrate";
import { useI18n } from "@/lib/i18n";
import { loadError, loadFailed, retryAttempt, retrying, staleSince } from "@/lib/load-failed";
import { useDaySelection } from "@/lib/day-selection";
import { otherReadingKey, scopeChips, useScope } from "@/lib/scope";
import { toggleTheme } from "@/lib/theme";
import { ZoneProvider, useZoneState } from "@/lib/zone";
import { mainshockId } from "../core/mainshock";
import { ZONES, ZONE_IDS, type ZoneId } from "../core/zones";
import { updateEveryMin } from "../worker/plan.ts";

// The three chart cards and the map are the page's heavy chunks; `Deferred` says why they
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
  const { t } = useI18n();
  const [zone, setZone] = useZoneState();
  const copy = t.zones[zone];
  // The header is the static one in the HTML, adopted as it is; what it does not have waits for
  // the render after (`src/lib/hydrate.ts`).
  const hydrated = useHydrated();
  useEffect(() => {
    document.title = copy.docTitle;
  }, [copy.docTitle]);

  return (
    <MonitorShell zone={zone} onZone={setZone} onToggleTheme={toggleTheme}>
      {/* Out of the tab order: the panel's first content is focusable (the refresh button, or the
          load error's retry), so a stop on the panel itself would be one press that does nothing. */}
      {hydrated
        ? ZONE_IDS.map((z) => (
            <TabsContent key={z} value={z} tabIndex={-1} className="flex flex-col gap-6">
              <ZoneProvider value={ZONES[z]}>
                <ZonePage zone={z} />
              </ZoneProvider>
            </TabsContent>
          ))
        : null}
    </MonitorShell>
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
  // The days the "Eventos por día" bars have chosen. They narrow the catalogue table and nothing else
  // (`src/lib/day-selection.ts` says why), over the same deferred events both of them draw.
  const picked = useDaySelection(deferred.shown);
  // From `lg` the map shares a row just under the fold, inside the 600 px every card is fetched
  // within, so it waits until it is on screen and its picture stands in (issue #72). Below that it is
  // screens down, and keeps the head start while the reader scrolls towards it.
  const mapMargin = useMediaQuery("(min-width: 64rem)") ? "0px" : undefined;
  const catalogue = useRef<HTMLHeadingElement>(null);
  const showPicked = useCallback(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    catalogue.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    catalogue.current?.focus({ preventScroll: true });
  }, []);
  // Stable, so the memoised table skips the page's urgent renders (the rolling digits, the status poll).
  const { setDays } = picked;
  const allDays = useCallback(() => setDays(null), [setDays]);

  // Nothing is drawn under the loading skeleton. Whatever sat there would be pulled up into view
  // when a failed load swaps the viewport-tall skeleton for a short alert: the caveats note did
  // exactly that, 0.12 of CLS on every failed load, and PageSpeed Insights, whose runner the
  // same-origin check refuses, scored the page on that state (docs/performance.md).
  // The status bar and the page under it are drawn in one commit, whichever request answers last,
  // so the stats cannot re-wrap above content that is already on screen (`StatusBar`). A status
  // request that failed once is not waited for through its retries: the page goes ahead without it.
  // Only a catalogue the page never got is a failed load. A background refetch that fails keeps
  // the dashboard as it is, with no alert, and the next refetch tries again; the line under the
  // refresh button says since when the figures are (`staleSince`), instead of promising updates that
  // are not arriving. /insights follows the same rule (`loadFailed`). Beside the load error there are
  // no figures to date.
  const catalogueFailed = loadFailed(events);
  const attempt = retryAttempt(events);
  const stale = catalogueFailed ? null : staleSince([status, events]);
  const settled = (!events.isPending || catalogueFailed) && (!status.isPending || status.failureCount > 0);
  // What the b chart's dashed line is called, read off the same deferred copy as the line itself.
  const bOtherKey = otherReadingKey(t, deferred.commonType, deferred.magType !== null);

  return (
    <>
      {/* The pixel background, behind the page and never under a card (src/backdrop). */}
      <Backdrop events={events.data} />
      <main className="contents">
        <StatusBar
          loading={!settled}
          // Withheld as well, not only hidden: the back-fill notice StatusBar draws below itself, and
          // the back-fill it starts, would otherwise land above the loading skeleton and push it down.
          status={settled ? status.data : undefined}
          shown={events.data ? view.shown.length : null}
          total={events.data ? events.data.length : null}
          mainshock={events.data ? view.mainshock : null}
          catalogueFailed={catalogueFailed}
          statusFailed={loadFailed(status)}
          staleSince={stale}
        />
        {settled && events.data ? (
          <FilterScope
            chips={chips}
            cluster={scope.cluster}
            shown={view.shown.length}
            total={events.data.length}
            onClear={clear}
          />
        ) : null}

        {settled && catalogueFailed ? (
          <LoadError
            title={t.loadFailed}
            body={t.loadFailedBody}
            retry={t.loadRetry}
            retrying={retrying(events)}
            retryingLabel={t.loadRetrying}
            onRetry={() => void events.refetch()}
          >
            <TechnicalDetail>{String(loadError(events))}</TechnicalDetail>
          </LoadError>
        ) : null}

        {/* Gate on data, not on "not pending": a failed load must not draw an empty dashboard
            that tells the reader to change their filters. Stale data stays visible if a refetch fails. */}
        {settled && events.data ? (
          <>
            {/* The number the reader came for leads; the controls that shape it follow. */}
            {view.shown.length > 0 ? (
              <div className="enter grid gap-6 lg:grid-cols-3">
                <BSummary
                  stats={view.stats}
                  other={view.other}
                  otherEnds={view.otherEnds}
                  incomplete={incomplete}
                  cluster={scope.cluster === "all" ? null : scope.cluster}
                  tabs={magTabs}
                />
                <div className="lg:col-span-2">
                  <Deferred
                    title={t.bTimeTitle}
                    placeholder={
                      <>
                        <Skeleton className="h-80 w-full" />
                        <BTimeKey stats={deferred.stats} other={deferred.other} otherKey={bOtherKey} />
                      </>
                    }
                    description={bTimeDescription(t, deferred.stats, deferred.magType, deferred.cluster)}
                    action={
                      <BTimeCsvButton stats={deferred.stats} magType={deferred.magType} cluster={deferred.cluster} />
                    }
                  >
                    <BOverTimeChart
                      stats={deferred.stats}
                      other={deferred.other}
                      otherKey={bOtherKey}
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
                  <Deferred
                    title={t.fmdTitle}
                    description={fmdDescription(t, deferred.stats, deferred.magType, deferred.cluster)}
                  >
                    <FmdChart stats={deferred.stats} magType={deferred.magType} cluster={deferred.cluster} />
                  </Deferred>
                  <Deferred
                    title={t.mapTitle}
                    description={mapDescription(t, mainshock)}
                    placeholder={<MapPlaceholder />}
                    margin={mapMargin}
                  >
                    <EventMap events={deferred.shown} mainshockId={mainshock} />
                  </Deferred>
                </div>
                <div className="enter" style={{ "--i": 2 } as CSSProperties}>
                  <Deferred
                    title={t.magTimeTitle}
                    description={t.magTimeDesc}
                    placeholder={<MagnitudeTimePlaceholder />}
                  >
                    <MagnitudeTimeChart
                      events={deferred.shown}
                      mainshockId={mainshock}
                      days={picked.days}
                      picked={picked.events.length}
                      onDays={picked.setDays}
                      onShowPicked={showPicked}
                    />
                  </Deferred>
                </div>
                <div className="enter" style={{ "--i": 3 } as CSSProperties}>
                  <EventsTable
                    events={picked.events}
                    days={picked.days}
                    of={deferred.shown.length}
                    onAllDays={allDays}
                    titleRef={catalogue}
                  />
                </div>
              </>
            )}
          </>
        ) : !settled ? (
          // At least a viewport tall, so nothing below is on screen to be pushed away when content arrives.
          // The status role says so to a screen reader, which the skeleton alone leaves in silence.
          // From the first failed attempt it says so while the retries run (`retryAttempt`), in the
          // slot the load error takes if they all fail: amber while it is still trying, red once it
          // has stopped. A caution alert, not a line of grey text, which the owner found easy to miss
          // (2026-09-29). The attempt count is drawn only: read out, it would be news at every retry.
          <div role="status" className="flex flex-col gap-4">
            {attempt === null ? (
              <span className="sr-only">{t.loading}</span>
            ) : (
              <Alert variant="caution" role={undefined}>
                <Spinner aria-hidden="true" role={undefined} aria-label={undefined} />
                <AlertTitle>{t.loadStruggling}</AlertTitle>
                <AlertDescription>
                  {t.loadStrugglingBody} <span aria-hidden="true">{t.loadAttempt(attempt, MAX_RETRIES + 1)}</span>
                </AlertDescription>
              </Alert>
            )}
            <Skeleton className="min-h-svh w-full" />
          </div>
        ) : null}

        {/* How to read figures the page has not got: a failed load shows its error only. */}
        {settled && events.data ? (
          <Alert role="note">
            <InfoIcon />
            <AlertTitle>{t.caveatsTitle}</AlertTitle>
            <AlertDescription>
              <ul className="flex max-w-[75ch] list-disc flex-col gap-1 ps-4">
                {t.zones[zone].caveats(view.mainshock.state).map((c) => (
                  <li key={c}>
                    <Rich
                      text={c}
                      parts={{
                        types: <Explain id="magnitude-types">{t.caveatTypes}</Explain>,
                        automatic: <Explain id="reviewed">{t.caveatAutomatic}</Explain>,
                      }}
                    />
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}
      </main>

      {settled ? (
        <SiteFooter csv>
          <p>
            {t.source}{" "}
            <Explain id="sgc-catalogue" href={SGC_QUERY_URL}>
              bdrsnc.sgc.gov.co
            </Explain>
          </p>
          <p>{t.autoUpdateLong(updateEveryMin(zone))}</p>
        </SiteFooter>
      ) : null}
    </>
  );
}
