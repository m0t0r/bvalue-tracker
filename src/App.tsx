import { useQuery } from "@tanstack/react-query";
import { AlertTriangleIcon, InfoIcon, MoonIcon, SunIcon } from "lucide-react";
import { Suspense, lazy, useMemo, useState, type CSSProperties } from "react";
import { BSummary } from "@/components/b-summary";
import { BOverTimeChart } from "@/components/charts/b-over-time";
import { FmdChart } from "@/components/charts/fmd";
import { MagnitudeTimeChart } from "@/components/charts/magnitude-time";
import { EventsTable } from "@/components/events-table";
import { FiltersCard } from "@/components/filters";
import { StatusBar } from "@/components/status-bar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { getEvents, getStatus, type StoredEvent } from "@/lib/api";
import { DEFAULT_FILTERS, applyFilters, type Filters } from "@/lib/filters";
import { useI18n } from "@/lib/i18n";
import { toggleTheme, useIsDark } from "@/lib/theme";
import { useStats } from "@/lib/use-stats";

const EventMap = lazy(() => import("@/components/event-map"));
const NO_EVENTS: StoredEvent[] = [];
const row = (i: number) => ({ "--i": i }) as CSSProperties;

export function App() {
  const { t, lang, setLang } = useI18n();
  const dark = useIsDark();
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  // The Worker's cron updates the database every 15 minutes; an open page picks that up by itself.
  const events = useQuery({ queryKey: ["events"], queryFn: getEvents, refetchInterval: 300_000 });
  const status = useQuery({ queryKey: ["status"], queryFn: getStatus, refetchInterval: 60_000 });

  const shown = useMemo(() => applyFilters(events.data ?? NO_EVENTS, filters), [events.data, filters]);
  const stats = useStats(shown, filters.mc);
  const incomplete = !!status.data && status.data.backfill.done < status.data.backfill.total;
  const other = lang === "es" ? "en" : "es";

  return (
    <div className="mx-auto flex min-h-svh max-w-7xl flex-col gap-6 px-4 py-8 tabular-nums sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-w-3xl flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight text-balance">{t.title}</h1>
          <p className="text-muted-foreground text-pretty">{t.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" lang={other} onClick={() => setLang(other)}>
            {lang === "es" ? "English" : "Español"}
          </Button>
          <Button variant="outline" size="icon-sm" aria-label={dark ? t.themeToLight : t.themeToDark} onClick={toggleTheme}>
            {dark ? <SunIcon /> : <MoonIcon />}
          </Button>
        </div>
      </header>

      <main className="contents">
        <StatusBar status={status.data} shown={events.data ? shown.length : null} />

        {events.isError ? (
          <Alert variant="destructive">
            <AlertTriangleIcon />
            <AlertTitle>{t.loadFailed}</AlertTitle>
            <AlertDescription>
              {t.loadFailedBody}
              <details className="text-xs">
                <summary className="cursor-pointer">{t.technicalDetail}</summary>
                {String(events.error)}
              </details>
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
                <BSummary stats={stats} incomplete={incomplete} />
                <div className="lg:col-span-2"><BOverTimeChart stats={stats} /></div>
              </div>
            ) : null}

            <FiltersCard mcAuto={stats.mcMaxc} onChange={setFilters} />

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
                  <FmdChart stats={stats} />
                  <Suspense fallback={<Skeleton className="h-full min-h-[31rem] w-full" />}><EventMap events={shown} /></Suspense>
                </div>
                <div className="enter" style={row(2)}><MagnitudeTimeChart events={shown} /></div>
                <div className="enter" style={row(3)}><EventsTable events={shown} /></div>
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
      </footer>
    </div>
  );
}
