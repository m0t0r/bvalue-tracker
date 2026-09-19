import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangleIcon, RefreshCwIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { postRefresh, type StatusResponse } from "@/lib/api";
import { fmtDateTime, relativeTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

function Stat({ label, value, hint }: { label: string; value: string | null; hint?: string }) {
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
  const [waitMin, setWaitMin] = useState<number | null>(null);

  const refresh = useMutation({
    mutationFn: postRefresh,
    onSuccess: (res) => {
      setWaitMin(res.refreshed ? null : Math.max(1, Math.ceil((res.retryAfterS ?? 60) / 60)));
      qc.setQueryData(["status"], res);
      if (res.refreshed) void qc.invalidateQueries({ queryKey: ["events"] });
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
  const failed = status?.lastRun && !status.lastRun.ok ? status.lastRun : null;
  const message = refresh.isPending ? t.refreshing : refresh.isError ? t.refreshFailed : waitMin !== null ? t.refreshWait(waitMin) : "";

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:flex sm:flex-wrap sm:gap-x-10">
            <Stat label={t.events} value={shown === null ? null : shown.toLocaleString(lang)}
              hint={status ? `/ ${status.totalEvents.toLocaleString(lang)}` : undefined} />
            <Stat label={t.newestEvent}
              value={status ? (status.newestEventTime ? fmtDateTime(status.newestEventTime) : "—") : null}
              hint={status?.newestEventTime ? `UTC · ${relativeTime(status.newestEventTime, lang)}` : undefined} />
            <Stat label={t.lastUpdate}
              value={status ? (ok?.finishedAt ? relativeTime(ok.finishedAt, lang) : t.never) : null}
              hint={ok?.finishedAt ? `${fmtDateTime(ok.finishedAt)} UTC` : undefined} />
          </div>
          <div className="flex flex-col items-end gap-2">
            {/* One label and one icon: the button keeps its width while it works. */}
            <Button onClick={() => refresh.mutate()} disabled={refresh.isPending || backfill.isPending}>
              <RefreshCwIcon data-icon="inline-start" className={refresh.isPending ? "animate-spin" : undefined} />
              {t.refresh}
            </Button>
            <span className="min-h-4 text-end text-xs text-muted-foreground" aria-live="polite">{message}</span>
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
