import { focusManager, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangleIcon, RefreshCwIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { FlowNumber } from "@/components/flow-number";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { postRefresh, type StatusResponse } from "@/lib/api";
import { fmtDateTime, relativeTime } from "@/lib/format";
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
  const [waitMin, setWaitMin] = useState<number | null>(null);

  // `auto` is a refresh the page started by itself on return to the tab. If the server stands down
  // because SGC was queried recently, that is the expected outcome and is not reported to the reader.
  const refresh = useMutation({
    mutationFn: (_: { auto: boolean }) => postRefresh(),
    onSuccess: (res, { auto }) => {
      setWaitMin(res.refreshed || auto ? null : Math.max(1, Math.ceil((res.retryAfterS ?? 60) / 60)));
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
  const message = refresh.isPending ? t.refreshing : refresh.isError ? t.refreshFailed : waitMin !== null ? t.refreshWait(waitMin) : "";

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          {/* Two columns on a phone. An odd stat left over on the last row spans both, so its date
              hint is not broken across lines beside an empty half. Written as a rule about the
              trailing child, not about the third stat, so adding or removing one keeps it true. */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 [&>*:nth-child(odd):last-child]:col-span-2 sm:flex sm:flex-wrap sm:gap-x-10">
            <Stat label={t.events} value={shown === null ? null : <FlowNumber value={shown} lang={lang} />}
              hint={status ? `/ ${status.totalEvents.toLocaleString(lang)}` : undefined} />
            <Stat label={t.newestEvent}
              value={status ? (status.newestEventTime ? fmtDateTime(status.newestEventTime, lang) : "—") : null}
              hint={status?.newestEventTime ? `${t.tz} · ${relativeTime(status.newestEventTime, lang, now)}` : undefined} />
            <Stat label={t.lastUpdate}
              value={status ? (ok?.finishedAt ? relativeTime(ok.finishedAt, lang, now) : t.never) : null}
              hint={ok?.finishedAt ? `${fmtDateTime(ok.finishedAt, lang)}, ${t.tz}` : undefined} />
          </div>
          {/* Below lg this block wraps onto its own line at the start edge, so it reads from there; beside the stats it hugs the end edge. */}
          <div className="flex flex-col items-start gap-2 lg:items-end">
            {/* One label and one icon: the button keeps its width while it works. */}
            <Button onClick={() => refresh.mutate({ auto: false })} disabled={refresh.isPending || backfill.isPending}>
              <RefreshCwIcon data-icon="inline-start" className={refresh.isPending ? "animate-spin" : undefined} />
              {t.refresh}
            </Button>
            {/* One line is always reserved. The live region announces refresh results; the standing note
                about automatic updates sits outside it, so it is never read out as if it were news. */}
            <span aria-live="polite" className={message === "" ? "sr-only" : "min-h-4 text-start text-xs text-muted-foreground lg:text-end"}>{message}</span>
            {message === "" ? <span className="min-h-4 text-start text-xs text-muted-foreground lg:text-end">{t.autoUpdate}</span> : null}
          </div>
        </CardContent>
      </Card>
      {incomplete ? (
        <Alert role="status">
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
            <details className="text-xs">
              <summary className="cursor-pointer">{t.technicalDetail}</summary>
              {failed.error}
            </details>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
