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
import { postRefresh, type StatusResponse, type StoredEvent } from "@/lib/api";
import { CADENCE, updateEveryMin } from "../../worker/plan.ts";
import { fmtDateTime, fmtDay, fmtUtc, relativeTime, sgcEventUrl } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useNow } from "@/lib/use-now";
import { useZone } from "@/lib/zone";
import type { ZoneMainshock } from "../../core/mainshock";

/** A wait the reader should not sit through: the cron will do the work instead. */
const LONG_WAIT_S = 60;

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

/**
 * What the mainshock rule (core/mainshock.ts) reads in the zone's catalogue today, on every tab and in
 * every state, so "none clear" is a reading rather than an absence. The magnitude is a link to SGC's
 * page for the event, like every value on the page that identifies one event, with its UTC time on
 * hover. The rule itself is written out under "Cómo leer estas cifras".
 */
function MainshockStat({ mainshock: m }: { mainshock: ZoneMainshock<StoredEvent> | null }) {
  const { t, lang } = useI18n();
  if (m === null) return <Stat label={t.mainshock.label} value={null} />;
  if (m.largest === null || m.runnerUp === null || m.gap === null) return <Stat label={t.mainshock.label} value="—" />;
  const gap = m.gap.toFixed(1);
  if (m.state === "none")
    return <Stat label={t.mainshock.label} value={t.mainshock.none} hint={t.mainshock.noneHint(gap)} />;
  const e = m.largest;
  const day = fmtDay(Date.parse(e.time), lang);
  return (
    <Stat
      label={t.mainshock.label}
      value={
        <a
          className="underline underline-offset-4"
          href={sgcEventUrl(e.id)}
          target="_blank"
          rel="noreferrer"
          title={fmtUtc(e.time)}
        >
          M{e.mag.toFixed(1)} ({e.magType})
        </a>
      }
      hint={m.state === "found" ? t.mainshock.gapHint(day, gap) : t.mainshock.pendingHint(day)}
    />
  );
}

export function StatusBar({
  status,
  shown,
  mainshock,
}: {
  status: StatusResponse | undefined;
  shown: number | null;
  /** The zone's mainshock as detected over its whole catalogue; null until the catalogue has loaded. */
  mainshock: ZoneMainshock<StoredEvent> | null;
}) {
  const { t, lang } = useI18n();
  const zone = useZone().id;
  const qc = useQueryClient();
  const now = useNow();
  /**
   * The Worker refuses a refresh sooner than this after the zone's last SGC query, so asking
   * earlier is a request that can only be turned away. Read from the Worker's own constant rather
   * than copied: as a copy it was left at five minutes when the throttle moved to fifteen, which
   * made two thirds of every cron period a refresh the page sent and the Worker refused.
   */
  const autoRefreshAfterMs = CADENCE[zone].refreshMinIntervalS * 1000;
  const everyMin = updateEveryMin(zone);
  // The server stands down whenever SGC was queried in the last five minutes, which with a
  // five-minute cron is most of the time. That is good news, not a countdown, so the message
  // says the reader already has the newest data rather than asking them to wait.
  const [stoodDown, setStoodDown] = useState(false);

  // `auto` is a refresh the page started by itself on return to the tab. If the server stands down
  // because SGC was queried recently, that is the expected outcome and is not reported to the reader.
  const refresh = useMutation({
    mutationFn: (_vars: { auto: boolean }) => postRefresh(zone),
    onSuccess: (res, { auto }) => {
      setStoodDown(!res.refreshed && !auto);
      // Events follow by themselves: App refetches them when status reports a newer successful ingest.
      qc.setQueryData(["status", zone], res);
    },
  });

  // A fresh database fills itself one week per request; keep going until history is whole.
  const backfill = useMutation({
    mutationFn: async () => {
      let res = await postRefresh(zone);
      qc.setQueryData(["status", zone], res);
      for (let i = 0; i < 40 && res.backfill.done < res.backfill.total; i++) {
        // Another run is in flight (cron, or someone else's page): wait for it rather than race it.
        // A wait longer than a tick is not a wait, it is a stand-down: the cron carries the
        // back-fill on from here. Sleeping through it would hold this mutation — and with it
        // `busy`, which disables the focus refresh — for hours.
        if ((res.retryAfterS ?? 0) > LONG_WAIT_S) break;
        if (!res.refreshed) await new Promise((r) => setTimeout(r, (res.retryAfterS ?? 5) * 1000));
        res = await postRefresh(zone);
        qc.setQueryData(["status", zone], res);
        // SGC is failing: stop asking. The cron will resume the back-fill later.
        if (res.refreshed && res.lastRun && !res.lastRun.ok) break;
      }
      return res;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["events", zone] }),
  });
  const incomplete = !!status && status.backfill.done < status.backfill.total;
  const started = useRef(false);
  const startBackfill = backfill.mutate;
  useEffect(() => {
    if (incomplete && !started.current) {
      started.current = true;
      startBackfill();
    }
  }, [incomplete, startBackfill]);

  const ok = status?.lastSuccessfulRun ?? null;

  // Coming back to the tab asks SGC again, through the library's own focus signal. Only when the last
  // query is older than the server's five-minute limit, so a return never costs a pointless request;
  // the server enforces the same limit for everyone, which is what protects SGC.
  const lastQueryMs = ok?.finishedAt ? Date.parse(ok.finishedAt) : null;
  const busy = refresh.isPending || backfill.isPending || incomplete;
  const autoRefresh = refresh.mutate;
  useEffect(
    () =>
      focusManager.subscribe((focused) => {
        if (focused && !busy && lastQueryMs !== null && Date.now() - lastQueryMs > autoRefreshAfterMs)
          autoRefresh({ auto: true });
      }),
    [busy, lastQueryMs, autoRefresh, autoRefreshAfterMs],
  );

  const failed = status?.lastRun && !status.lastRun.ok ? status.lastRun : null;
  // `stoodDown` sticks until the next press, but the claim it makes — SGC was queried in
  // the last five minutes — stops being true the moment a run fails. The alert below says
  // so; this must not contradict it.
  // Standing down means something different in each state, and saying the wrong one is worse
  // than saying nothing: while SGC is failing the press really did reach nothing, and while
  // SGC is being refused outright the Worker's own wait is an hour, so "press again" would be
  // bad advice. refreshWait's claim — SGC answered in the last five minutes — is only true
  // when nothing has failed.
  const message = refresh.isPending
    ? t.refreshing
    : refresh.isError
      ? t.refreshFailed
      : stoodDown && failed
        ? t.refreshStillFailing
        : stoodDown
          ? t.refreshWait(CADENCE[zone].refreshMinIntervalS / 60)
          : "";

  // The newest event's time reaches SGC's own page for it, the same link the table's time column
  // carries, with the same UTC form one hover away. An event with no id cannot happen — the id is
  // the primary key — but the status API types it as nullable, so it falls back to plain text.
  const newestEvent = !status?.newestEventTime ? null : status.newestEventId ? (
    <a
      className="underline underline-offset-4"
      href={sgcEventUrl(status.newestEventId)}
      target="_blank"
      rel="noreferrer"
      title={fmtUtc(status.newestEventTime)}
    >
      {fmtDateTime(status.newestEventTime, lang)}
    </a>
  ) : (
    fmtDateTime(status.newestEventTime, lang)
  );

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          {/* One wrapping row at every width, rather than two columns on a phone: a stat is as wide
              as its own longest line, and one that no longer fits beside its neighbour takes the next
              line whole instead of folding "18 sept 2026, 17:08" in half. Which stats share a line is
              then a consequence of the text, so a longer date or a narrower phone needs nothing here. */}
          <div className="flex flex-wrap gap-x-6 gap-y-4 sm:gap-x-10">
            <Stat
              label={t.events}
              value={shown === null ? null : <FlowNumber value={shown} lang={lang} />}
              hint={status ? `/ ${status.totalEvents.toLocaleString(lang)}` : undefined}
            />
            <Stat
              label={t.newestEvent}
              value={status ? (newestEvent ?? "—") : null}
              hint={status?.newestEventTime ? relativeTime(status.newestEventTime, lang, now) : undefined}
            />
            <Stat
              label={t.lastUpdate}
              value={status ? (ok?.finishedAt ? relativeTime(ok.finishedAt, lang, now) : t.never) : null}
              hint={ok?.finishedAt ? fmtDateTime(ok.finishedAt, lang) : undefined}
            />
            <MainshockStat mainshock={mainshock} />
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
            <span
              aria-live="polite"
              className={message === "" ? "sr-only" : "min-h-4 text-start text-xs text-muted-foreground lg:text-end"}
            >
              {message}
            </span>
            {message === "" ? (
              <span className="min-h-4 text-start text-xs text-muted-foreground lg:text-end">
                {failed ? null : t.autoUpdate(everyMin)}
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>
      {incomplete ? (
        <Alert variant="caution" role="status">
          {backfill.isPending ? <Spinner aria-label={t.backfillShort} /> : <AlertTriangleIcon />}
          <AlertTitle>{t.zones[zone].backfillTitle(status.backfill.done, status.backfill.total)}</AlertTitle>
          <AlertDescription>
            {t.zones[zone].backfillBody}
            {backfill.isPending ? null : (
              <Button variant="outline" size="sm" onClick={() => backfill.mutate()}>
                {t.backfillAction}
              </Button>
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
