import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { getContext, getEvents, getStatus } from "@/lib/api";
import type { ContextResponse, StatusResponse } from "@/lib/api";
import { SYNC_NOTICE_AFTER_MS, asOf } from "@/lib/as-of";
import { loadError, loadFailed, retrying, staleSince } from "@/lib/load-failed";
import { useNow } from "@/lib/use-now";
import { forecastStaleAt, insights, usgsForecast, type Forecast, type Insights } from "./claims";
import type { StoredEvent } from "../../worker/api-types.ts";

/**
 * Both zones' catalogues from `/api/events`, the same endpoint the monitor reads, and every claim
 * computed over them. Kept current the way the monitor keeps itself current (`ZonePage` in
 * `App.tsx`): status is polled every minute, and a zone's events are refetched when its status
 * reports a newer sync. The catalogue grows only when someone syncs, so every claim is made as of the
 * older zone's last sync (`asOf`), never as of a clock that has run on past the data.
 */
export function useInsights(): {
  data: Insights | null;
  context: ContextResponse | null;
  forecast: Forecast | null;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  retrying: boolean;
  retry: () => void;
  incomplete: boolean;
  /** The last sync every claim is made as of, once it is more than a day old; else null. */
  syncedAt: number | null;
  /** The clock, to the minute: what a time on the page is dated against ("hoy", "ayer"). */
  clock: number;
  /**
   * When the oldest data on screen was fetched, while a refetch over it has failed or waits offline;
   * else null. The page says so rather than go on counting "the last 7 days" in silence.
   */
  staleSince: number | null;
  /** Both zones' events, one array per pair of answers, for the page's pixel background (`src/backdrop`). */
  catalogues: StoredEvent[] | undefined;
} {
  const qc = useQueryClient();
  const choco = useQuery({ queryKey: ["events", "choco"], queryFn: () => getEvents("choco") });
  const tolima = useQuery({ queryKey: ["events", "tolima"], queryFn: () => getEvents("tolima") });
  // Status says when each zone was last synced, which every claim is made as of, and whether either
  // zone's history has a gap: a half-filled database gives confident, wrong claims (docs/science.md).
  // Only read: syncing is the monitor's button, and this page never asks SGC for anything.
  const statusOptions = { refetchInterval: 60_000 };
  const chocoStatus = useQuery({ queryKey: ["status", "choco"], queryFn: () => getStatus("choco"), ...statusOptions });
  const tolimaStatus = useQuery({
    queryKey: ["status", "tolima"],
    queryFn: () => getStatus("tolima"),
    ...statusOptions,
  });
  // What USGS publishes about Chocó's mainshock (docs/api.md), asked for with the catalogues, once. The
  // page waits for it to settle, answered or failed, before drawing a tab: question 2 exists only
  // when it has an answer, so a late answer or a retry would insert a whole question above the
  // reader and renumber the rest. A failure on load hides those questions and is never the load
  // error. It is not asked again while the page is open: it changes only when someone syncs, and
  // until 2026-10-11 the page rechecked it on returning to the tab, after the daily job it no longer has.
  const context = useQuery({
    queryKey: ["context", "choco"],
    queryFn: () => getContext("choco"),
    retry: false,
    staleTime: Infinity,
    refetchOnReconnect: false,
  });
  // The first settled answer, null if it failed: what question 2 is decided from, for good. Set
  // during render (React's "information from previous renders"), so no extra commit, and no second
  // skeleton frame, follows the answer.
  const [firstContext, setFirstContext] = useState<ContextResponse | null | undefined>(undefined);
  if (firstContext === undefined && !context.isPending) setFirstContext(context.data ?? null);
  const shownContext = firstContext ?? null;
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
  const incomplete = [chocoStatus.data, tolimaStatus.data].some((s) => !!s && s.backfill.gaps > 0);

  // "The last 7 days" ends where the older zone's synced data stops, or at the clock while that is
  // unknown (a status that failed) or later. The clock is rounded to the minute, so its 30 s tick recomputes the
  // claims at most once a minute. It is where the synced data stops (`syncedThrough`), not the last run,
  // which a catch-up of old chunks moves to now while recent days are still missing. A status still on
  // its first attempt is waited for (`isPending` below), so claims drawn on the clock are not redrawn
  // on the sync under the reader; one that has failed is not waited for through its retries, as on the
  // monitor, and the claims then move once if a retry answers.
  const clock = Math.floor(useNow() / 60_000) * 60_000;
  const statuses = [chocoStatus, tolimaStatus];
  const statusSettled = statuses.every((s) => !s.isPending || s.failureCount > 0);
  const now = asOf(
    statuses.map((s) => s.data?.syncedThrough),
    clock,
  );
  const syncedAt = now < clock - SYNC_NOTICE_AFTER_MS ? now : null;
  const data = useMemo(
    () => (choco.data && tolima.data ? insights({ choco: choco.data, tolima: tolima.data }, now) : null),
    [choco.data, tolima.data, now],
  );
  // USGS's forecast, decided once for both tabs: the questions tab shows it, the story points to it.
  const forecast = useMemo(
    () => (data && shownContext ? usgsForecast(shownContext, data, Math.max(data.now, exactNow)) : null),
    [data, shownContext, exactNow],
  );
  const failed = [choco, tolima].filter(loadFailed);
  // A new array only when a catalogue is new: the background redraws itself on each one.
  const catalogues = useMemo(
    () => (choco.data && tolima.data ? [...choco.data, ...tolima.data] : undefined),
    [choco.data, tolima.data],
  );
  return {
    catalogues,
    data,
    context: shownContext,
    forecast,
    isPending: choco.isPending || tolima.isPending || firstContext === undefined || !statusSettled,
    // Only a catalogue the page never got is an error. A refetch that fails keeps the claims it
    // already drew, as the monitor keeps its data (docs/frontend.md). Error, "Reintentando…" and
    // the retry all follow the catalogue that failed, not the other one's download.
    isError: failed.length > 0,
    error: failed[0] ? loadError(failed[0]) : null,
    retrying: failed.some(retrying),
    retry: () => {
      for (const q of failed) void q.refetch();
    },
    incomplete,
    syncedAt,
    clock,
    staleSince: staleSince([choco, tolima, chocoStatus, tolimaStatus]),
  };
}

/** Refetch a zone's events when its last successful sync changes. The monitor's rule. */
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
