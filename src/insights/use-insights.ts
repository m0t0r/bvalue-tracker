import { useQuery, useQueryClient, type Query } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { getContext, getEvents, getStatus } from "@/lib/api";
import type { ContextResponse, StatusResponse } from "@/lib/api";
import { useNow } from "@/lib/use-now";
import { forecastStaleAt, insights, usgsForecast, type Forecast, type Insights } from "./claims";
import { contextRecheckDue, keepFeltFromFirst } from "./context-refresh";

/**
 * Both zones' catalogues from `/api/events`, the same endpoint the monitor reads, and every claim
 * computed over them. Kept current the way the monitor keeps itself current (`ZonePage` in
 * `App.tsx`): status is polled every minute and again when the tab comes back to the front, and a
 * zone's events are refetched when its status reports a newer ingest. So a page left open does not
 * go on counting "the last 7 days" over a catalogue that has stopped growing.
 */
export function useInsights(): {
  data: Insights | null;
  context: ContextResponse | null;
  forecast: Forecast | null;
  isPending: boolean;
  isError: boolean;
  incomplete: boolean;
} {
  const qc = useQueryClient();
  const choco = useQuery({ queryKey: ["events", "choco"], queryFn: () => getEvents("choco") });
  const tolima = useQuery({ queryKey: ["events", "tolima"], queryFn: () => getEvents("tolima") });
  // Status also says whether either zone's history is still loading: a half-filled database gives
  // confident, wrong claims (docs/science.md). Only read — starting the back-fill is the monitor's
  // job, and this page never asks SGC for anything.
  const statusOptions = { refetchInterval: 60_000, refetchOnWindowFocus: "always" as const };
  const chocoStatus = useQuery({ queryKey: ["status", "choco"], queryFn: () => getStatus("choco"), ...statusOptions });
  const tolimaStatus = useQuery({
    queryKey: ["status", "tolima"],
    queryFn: () => getStatus("tolima"),
    ...statusOptions,
  });
  // What USGS publishes about Chocó's mainshock (docs/api.md), asked for with the catalogues. The
  // page waits for it to settle, answered or failed, before drawing a tab: question 2 exists only
  // when it has an answer, so a late answer or a retry would insert a whole question above the
  // reader and renumber the rest. A failure on load hides those questions and is never the load
  // error. It is asked again only on a return to the tab (or the network) once the stored forecast
  // is due (`contextRecheckDue`), so a page left open picks up USGS's next forecast; a later answer
  // changes only the forecast, a box inside question 8, and never question 2 (`keepFeltFromFirst`).
  const recheck = (query: Query<ContextResponse>) =>
    contextRecheckDue(
      query.state.data,
      query.state.dataUpdatedAt,
      Math.max(query.state.dataUpdatedAt, query.state.errorUpdatedAt),
      Date.now(),
    )
      ? ("always" as const)
      : false;
  const context = useQuery({
    queryKey: ["context", "choco"],
    queryFn: () => getContext("choco"),
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: recheck,
    refetchOnReconnect: recheck,
  });
  // The first settled answer, null if it failed: what question 2 is decided from, for good. Set
  // during render (React's "information from previous renders"), so no extra commit, and no second
  // skeleton frame, follows the answer.
  const [firstContext, setFirstContext] = useState<ContextResponse | null | undefined>(undefined);
  if (firstContext === undefined && !context.isPending) setFirstContext(context.data ?? null);
  const shownContext = useMemo(
    () => (firstContext === undefined ? null : keepFeltFromFirst(firstContext, context.data)),
    [firstContext, context.data],
  );
  // The forecast leaves at its due time to the millisecond: the page's clock below is rounded to the
  // minute and would keep a replaced forecast on screen up to a minute and a half longer.
  const dueAt = shownContext?.forecast ? forecastStaleAt(shownContext.forecast.digest) : null;
  const [exactNow, setExactNow] = useState(() => Date.now());
  useEffect(() => {
    if (dueAt === null || dueAt <= Date.now()) return;
    // setTimeout holds at most ~24.8 days; a later due time is left to the rounded clock.
    const id = setTimeout(() => setExactNow(Date.now()), Math.min(dueAt - Date.now(), 2 ** 31 - 1));
    return () => clearTimeout(id);
  }, [dueAt]);
  useRefetchOnIngest(qc, "choco", chocoStatus.data);
  useRefetchOnIngest(qc, "tolima", tolimaStatus.data);
  const incomplete = [chocoStatus.data, tolimaStatus.data].some((s) => !!s && s.backfill.done < s.backfill.total);

  // "The last 7 days" moves with the clock, not only with the data. Rounded to the minute, so the
  // clock's 30 s tick recomputes the claims at most once a minute.
  const now = Math.floor(useNow() / 60_000) * 60_000;
  const data = useMemo(
    () => (choco.data && tolima.data ? insights({ choco: choco.data, tolima: tolima.data }, now) : null),
    [choco.data, tolima.data, now],
  );
  // USGS's forecast, decided once for both tabs: the questions tab shows it, the story points to it.
  const forecast = useMemo(
    () => (data && shownContext ? usgsForecast(shownContext, data, Math.max(data.now, exactNow)) : null),
    [data, shownContext, exactNow],
  );
  return {
    data,
    context: shownContext,
    forecast,
    isPending: choco.isPending || tolima.isPending || firstContext === undefined,
    isError: choco.isError || tolima.isError,
    incomplete,
  };
}

/** Refetch a zone's events when its last successful ingest changes. The monitor's rule. */
function useRefetchOnIngest(
  qc: ReturnType<typeof useQueryClient>,
  zone: "choco" | "tolima",
  status: StatusResponse | undefined,
) {
  const lastIngest = status?.lastSuccessfulRun?.finishedAt ?? null;
  const seen = useRef<string | null>(null);
  useEffect(() => {
    if (lastIngest === null) return;
    if (seen.current !== null && seen.current !== lastIngest) void qc.invalidateQueries({ queryKey: ["events", zone] });
    seen.current = lastIngest;
  }, [lastIngest, qc, zone]);
}
