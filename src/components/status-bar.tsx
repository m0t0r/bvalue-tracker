import { focusManager, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangleIcon, RefreshCwIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { FlowNumber } from "@/components/flow-number";
import { TechnicalDetail } from "@/components/technical-detail";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { postRefresh, type StatusResponse } from "@/lib/api";
import { fmtDateTime, fmtUtc, relativeTime, sgcEventUrl } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useNow } from "@/lib/use-now";

/** The Worker refuses a refresh sooner than this after the last SGC query (REFRESH_MIN_INTERVAL_S). */
const AUTO_REFRESH_AFTER_MS = 300_000;

function Stat({ label, value, hint }: { label: string; value: ReactNode | null; hint?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      {value === null ? <Skeleton className="h-7 w-28" /> : <span className="text-xl font-semibold">{value}</span>}
      {/* The line is always reserved, so the cards below do not jump when the hint arrives. */}
      <span className="min-h-4 text-xs text-muted-foreground">{hint ?? ""}</span>
    </div>
  );
}

export function StatusBar({ status, shown }: { status: StatusResponse | undefined; shown: number | null }) {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const now = useNow();
  // The server stands down whenever SGC was queried in the last five minutes, which with a
  // five-minute cron is most of the time. That is good news, not a countdown, so the message
  // says the reader already has the newest data rather than asking them to wait.
  const [stoodDown, setStoodDown] = useState(false);

  // `auto` is a refresh the page started by itself on return to the tab. If the server stands down
  // because SGC was queried recently, that is the expected outcome and is not reported to the reader.
  const refresh = useMutation({
    mutationFn: (_: { auto: boolean }) => postRefresh(),
    onSuccess: (res, { auto }) => {
      setStoodDown(!res.refreshed && !auto);
      // Events follow by themselves: App refetches them when status reports a newer successful ingest.
      qc.setQueryData(["status"], res);
    },
  });

  // A fresh database fills itself one week per request; keep going until history is whole.
  const backfill = useMutation({
    mutationFn: async () => {
      let res = await postRefresh();
      qc.setQueryData(["status"], res);
      for (let i = 0; i < 40 && res.backfill.done < res.backfill.total; i++) {
        // Another run is in flight (cron, or someone else's page): wait for it rather than race it.
        if (!res.refreshed) await new Promise((r) => setTimeout(r, (res.retryAfterS ?? 5) * 1000));
        res = await postRefresh();
        qc.setQueryData(["status"], res);
        // SGC is failing: stop asking. The cron will resume the back-fill later.
        if (res.refreshed && res.lastRun && !res.lastRun.ok) break;
      }
      return res;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["events"] }),
  });
  const incomplete = !!status && status.backfill.done < status.backfill.total;
  const started = useRef(false);
  const startBackfill = backfill.mutate;
  useEffect(() => {
    if (incomplete && !started.current) { started.current = true; startBackfill(); }
  }, [incomplete, startBackfill]);

  const ok = status?.lastSuccessfulRun ?? null;

  // Coming back to the tab asks SGC again, through the library's own focus signal. Only when the last
  // query is older than the server's five-minute limit, so a return never costs a pointless request;
  // the server enforces the same limit for everyone, which is what protects SGC.
  const lastQueryMs = ok?.finishedAt ? Date.parse(ok.finishedAt) : null;
  const busy = refresh.isPending || backfill.isPending || incomplete;
  const autoRefresh = refresh.mutate;
  useEffect(() => focusManager.subscribe((focused) => {
    if (focused && !busy && lastQueryMs !== null && Date.now() - lastQueryMs > AUTO_REFRESH_AFTER_MS) autoRefresh({ auto: true });
  }), [busy, lastQueryMs, autoRefresh]);

  const failed = status?.lastRun && !status.lastRun.ok ? status.lastRun : null;
  // `stoodDown` sticks until the next press, but the claim it makes — SGC was queried in
  // the last five minutes — stops being true the moment a run fails. The alert below says
  // so; this must not contradict it.
  // Standing down means something different in each state, and saying the wrong one is worse
  // than saying nothing: while SGC is failing the press really did reach nothing, and while
  // SGC is being refused outright the Worker's own wait is an hour, so "press again" would be
  // bad advice. refreshWait's claim — SGC answered in the last five minutes — is only true
  // when nothing has failed.
  const message = refresh.isPending ? t.refreshing
    : refresh.isError ? t.refreshFailed
    : stoodDown && failed ? t.refreshStillFailing
    : stoodDown ? t.refreshWait
    : "";

  // The newest event's time reaches SGC's own page for it, the same link the table's time column
  // carries, with the same UTC form one hover away. An event with no id cannot happen — the id is
  // the primary key — but the status API types it as nullable, so it falls back to plain text.
  const newestEvent = !status?.newestEventTime ? null : status.newestEventId ? (
    <a className="underline underline-offset-4" href={sgcEventUrl(status.newestEventId)} target="_blank" rel="noreferrer"
      title={fmtUtc(status.newestEventTime)}>
      {fmtDateTime(status.newestEventTime, lang)}
    </a>
  ) : fmtDateTime(status.newestEventTime, lang);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          {/* One wrapping row at every width, rather than two columns on a phone: a stat is as wide
              as its own longest line, and one that no longer fits beside its neighbour takes the next
              line whole instead of folding "18 sept 2026, 17:08" in half. Which stats share a line is
              then a consequence of the text, so a longer date or a narrower phone needs nothing here. */}
          <div className="flex flex-wrap gap-x-6 gap-y-4 sm:gap-x-10">
            <Stat label={t.events} value={shown === null ? null : <FlowNumber value={shown} lang={lang} />}
              hint={status ? `/ ${status.totalEvents.toLocaleString(lang)}` : undefined} />
            <Stat label={t.newestEvent} value={status ? (newestEvent ?? "—") : null}
              hint={status?.newestEventTime ? relativeTime(status.newestEventTime, lang, now) : undefined} />
            <Stat label={t.lastUpdate}
              value={status ? (ok?.finishedAt ? relativeTime(ok.finishedAt, lang, now) : t.never) : null}
              hint={ok?.finishedAt ? fmtDateTime(ok.finishedAt, lang) : undefined} />
          </div>
          {/* Below lg this block wraps onto its own line at the start edge, so it reads from there; beside the stats it hugs the end edge. */}
          <div className="flex flex-col items-start gap-2 lg:items-end">
            {/* One label and one icon: the button keeps its width while it works. */}
            <Button onClick={() => refresh.mutate({ auto: false })} disabled={refresh.isPending || backfill.isPending}>
              <RefreshCwIcon data-icon="inline-start" className={refresh.isPending ? "animate-spin" : undefined} />
              {t.refresh}
            </Button>
            {/* One line is always reserved. The live region announces refresh results; the standing note
                about automatic updates sits outside it, so it is never read out as if it were news.
                The note goes quiet while a run has failed: it promises a five-minute cadence that
                has stopped — the fast lane stands down after a failure — and the alert below says
                fifteen. Two numbers a few pixels apart read as a contradiction, and the alert is
                the one telling the truth. The line stays, so nothing moves. */}
            <span aria-live="polite" className={message === "" ? "sr-only" : "min-h-4 text-start text-xs text-muted-foreground lg:text-end"}>{message}</span>
            {message === "" ? (
              <span className="min-h-4 text-start text-xs text-muted-foreground lg:text-end">{failed ? null : t.autoUpdate}</span>
            ) : null}
          </div>
        </CardContent>
      </Card>
      {incomplete ? (
        <Alert variant="caution" role="status">
          {backfill.isPending ? <Spinner aria-label={t.backfillShort} /> : <AlertTriangleIcon />}
          <AlertTitle>{t.backfillTitle(status.backfill.done, status.backfill.total)}</AlertTitle>
          <AlertDescription>
            {t.backfillBody}
            {backfill.isPending ? null : (
              <Button variant="outline" size="sm" onClick={() => backfill.mutate()}>{t.backfillAction}</Button>
            )}
          </AlertDescription>
        </Alert>
      ) : null}
      {failed ? (
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertTitle>{t.ingestFailed}</AlertTitle>
          <AlertDescription>
            {t.ingestFailedBody}
            <TechnicalDetail>{failed.error}</TechnicalDetail>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
