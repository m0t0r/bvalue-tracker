import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { getContext, getEvents, getStatus } from "@/lib/api";
import type { ContextResponse, StatusResponse } from "@/lib/api";
import { useNow } from "@/lib/use-now";
import { insights, type Insights } from "./claims";

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
  // page waits for it to settle, answered or failed, before drawing a tab, and never asks again
  // while it is open: question 2 exists only when it has an answer, so a late answer, a retry or a
  // refetch on focus would insert or remove a whole question above the reader and renumber the rest.
  // It changes once a day at most. A failure hides that question and is never the load error.
  const context = useQuery({
    queryKey: ["context", "choco"],
    queryFn: () => getContext("choco"),
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
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
  return {
    data,
    context: context.data ?? null,
    isPending: choco.isPending || tolima.isPending || context.isPending,
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
