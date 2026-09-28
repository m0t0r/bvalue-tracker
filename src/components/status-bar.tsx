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
import { fmtClock, fmtDateTime, fmtDay, fmtUtc, relativeTime, relativeTimeShort, sgcEventUrl } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { pageAlert } from "@/lib/page-alert";
import { useNow } from "@/lib/use-now";
import { useZone } from "@/lib/zone";
import type { ZoneMainshock } from "../../core/mainshock";
import { PrototypeStats, PrototypeSwitcher, useVariant } from "@/components/status-bar.prototype";

/** A wait the reader should not sit through: the cron will do the work instead. */
const LONG_WAIT_S = 60;

/**
 * The phone's form below `sm` and the wider one from `sm` up. The two-by-two grid on a phone needs
 * values and copy short enough for half its width; from `sm` up the bar is the one wrapping row it
 * always was, with the full dates and sentences. Pure CSS, like the scope bar's short count, so
 * nothing swaps in after the first paint, and the hidden form is out of the accessibility tree.
 */
function ByWidth({ phone, wide }: { phone: ReactNode; wide: ReactNode }) {
  return (
    <>
      <span className="sm:hidden">{phone}</span>
      <span className="hidden sm:inline">{wide}</span>
    </>
  );
}

function Stat({ label, value, hint }: { label: ReactNode; value: ReactNode | null; hint?: ReactNode }) {
  return (
    // `min-w-0` lets a hint wrap inside its grid column on a phone; in the row from `sm` up a stat is
    // as wide as its longest line, and wraps whole onto the next line rather than folding its text.
    <div className="flex min-w-0 flex-col gap-1 sm:min-w-auto">
      <span className="text-sm text-muted-foreground">{label}</span>
      {value === null ? <Skeleton className="h-7 w-28" /> : <span className="text-xl font-semibold">{value}</span>}
      {/* The line is always reserved, so the cards below do not jump when the hint arrives. */}
      <span className="min-h-4 text-xs text-muted-foreground">{hint ?? ""}</span>
    </div>
  );
}

/** "hace ~2 h" on screen, and "hace 2 horas" to a screen reader, which would read the "~" as a word. */
function Ago({ iso, now }: { iso: string; now: number }) {
  const { lang } = useI18n();
  return (
    <>
      <span aria-hidden="true">{relativeTimeShort(iso, lang, now)}</span>
      <span className="sr-only">{relativeTime(iso, lang, now)}</span>
    </>
  );
}

/**
 * What the mainshock rule (core/mainshock.ts) reads in the zone's catalogue today, on every tab and in
 * every state, so "none clear" is a reading rather than an absence. The magnitude is a link to SGC's
 * page for the event, like every value on the page that identifies one event, with its UTC time on
 * hover. The rule itself is written out under "Cómo leer estas cifras".
 */
function MainshockStat({
  mainshock: m,
  catalogueFailed,
}: {
  mainshock: ZoneMainshock<StoredEvent> | null;
  catalogueFailed: boolean;
}) {
  const { t, lang } = useI18n();
  if (m === null) return <Stat label={t.mainshock.label} value={catalogueFailed ? "—" : null} />;
  if (m.largest === null || m.runnerUp === null || m.gap === null) return <Stat label={t.mainshock.label} value="—" />;
  const gap = m.gap.toFixed(1);
  if (m.state === "none")
    return (
      <Stat
        label={t.mainshock.label}
        value={t.mainshock.none}
        hint={<ByWidth phone={t.mainshock.noneHintShort(gap)} wide={t.mainshock.noneHint(gap)} />}
      />
    );
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
      hint={
        m.state === "found" ? (
          <ByWidth phone={t.mainshock.gapHintShort(day, gap)} wide={t.mainshock.gapHint(day, gap)} />
        ) : (
          t.mainshock.pendingHint(day)
        )
      }
    />
  );
}

export function StatusBar({
  status,
  shown,
  mainshock,
  loading,
  catalogueFailed = false,
  staleSince = null,
  events,
}: {
  /** PROTOTYPE: the zone's whole catalogue, for variant C. */
  events?: StoredEvent[];
  /** The page is still waiting for its status or its catalogue: draw a placeholder, not the stats. */
  loading: boolean;
  status: StatusResponse | undefined;
  shown: number | null;
  /** The zone's mainshock as detected over its whole catalogue; null until the catalogue has loaded. */
  mainshock: ZoneMainshock<StoredEvent> | null;
  /**
   * The catalogue's last load failed. Its two stats read "—" rather than a placeholder that never
   * fills, and the page's load error is the only alert: this bar draws neither of its own.
   */
  catalogueFailed?: boolean;
  /**
   * When the data on screen was fetched, if a refetch over it has since failed or waits offline
   * (`staleSince` in load-failed.ts); null while the page is current. The line under the button then
   * dates the data instead of promising updates that are not arriving.
   */
  staleSince?: number | null;
}) {
  const { t, lang } = useI18n();
  const variant = useVariant();
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
  const alert = pageAlert({ catalogueFailed, ingestFailed: failed !== null, incomplete });
  // `stoodDown` sticks until the next press, but the claim it makes — SGC was queried in
  // the last five minutes — stops being true the moment a run fails. The alert below says
  // so; this must not contradict it.
  // Standing down means something different in each state, and saying the wrong one is worse
  // than saying nothing: while SGC is failing the press really did reach nothing, and while
  // SGC is being refused outright the Worker's own wait is an hour, so "press again" would be
  // bad advice. refreshWait's claim — SGC answered in the last five minutes — is only true
  // when nothing has failed.
  // Inside the live region a screen reader always has the long form, and the short one is only drawn:
  // with `ByWidth`, turning a phone past `sm` would add the other span to the region, and it would be
  // read out again as news.
  const waitMin = CADENCE[zone].refreshMinIntervalS / 60;
  const wait = (
    <>
      <span aria-hidden="true" className="sm:hidden">
        {t.refreshWaitShort(waitMin)}
      </span>
      <span className="sr-only sm:not-sr-only">{t.refreshWait(waitMin)}</span>
    </>
  );
  const message: ReactNode = refresh.isPending
    ? t.refreshing
    : refresh.isError
      ? t.refreshFailed
      : stoodDown && failed
        ? // It explains itself only beside "La última consulta al SGC falló"; with the load error
          // shown instead (`pageAlert`), a retry "already on the way" would have no context.
          alert === "ingest"
          ? t.refreshStillFailing
          : ""
        : stoodDown
          ? wait
          : "";

  // While a refetch over the figures has failed, the line says since when they are, and that outranks
  // every answer to a press but a request under way: "Ya tienes los datos más recientes" would be stale
  // itself, and "No se pudo consultar al SGC" blames SGC for what is the connection as often as not.
  // A press parked offline (`isPaused`) is not under way, so "Consultando al SGC…" does not sit there
  // for as long as the connection is down.
  const stale = staleSince === null ? null : fmtClock(staleSince, lang, now);
  const staleNote = stale !== null && !(refresh.isPending && !refresh.isPaused);
  const live = staleNote ? t.staleSince(stale.time, stale.day) : message;
  const pending = refresh.isPending || backfill.isPending;

  // On a phone both times lead with how long ago ("hace ~2 h", "hace 7 min"), which is what the
  // reader asks of them, and give the clock time under it, with the day only when it was not today:
  // the full "18 sept 2026, 17:08" does not fit half a phone. From `sm` up there is room for it, and
  // the newest event gives its date with how long ago under it, the last query the other way round.
  const clock = (iso: string) => {
    const c = fmtClock(Date.parse(iso), lang, now);
    return c.day === null ? c.time : `${c.day}, ${c.time}`;
  };
  const newest = status?.newestEvent ?? null;
  const newestEvent = !newest ? null : (
    <a
      className="underline underline-offset-4"
      href={sgcEventUrl(newest.id)}
      target="_blank"
      rel="noreferrer"
      title={fmtUtc(newest.time)}
    >
      <ByWidth phone={<Ago iso={newest.time} now={now} />} wide={fmtDateTime(newest.time, lang)} />
    </a>
  );

  // Until the page has its status and its catalogue, one block and no stats. The stats wrap by their
  // own width, and each value changes it as it lands: on a phone "Sismo principal"'s hint took the row
  // from two lines to three and pushed the refresh button down, 0.036 of CLS on every load. Drawn in
  // the same commit as the page underneath, nothing that was already on screen moves.
  if (loading)
    return (
      <Card aria-busy="true">
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-wrap items-end justify-between gap-x-6 gap-y-5 sm:gap-y-4">
          {/* Two columns on a phone, one wrapping row from sm up. On a phone every value is short
              enough for half its width ("hace ~2 h", "Ninguno claro"), and a hint that is not wraps
              inside its own column. From sm up a stat that no longer fits beside its neighbour takes
              the next line whole, so which stats share a line is a consequence of the text. */}
          {variant && status ? (
            <PrototypeStats
              variant={variant}
              status={status}
              shown={shown}
              events={events}
              now={now}
              Stat={Stat}
              mainshock={<MainshockStat mainshock={mainshock} catalogueFailed={catalogueFailed} />}
            />
          ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:flex sm:flex-wrap sm:gap-x-10">
            <Stat
              label={t.events}
              value={shown === null ? catalogueFailed ? "—" : null : <FlowNumber value={shown} lang={lang} />}
              hint={status ? `/ ${status.totalEvents.toLocaleString(lang)}` : undefined}
            />
            <Stat
              label={<ByWidth phone={t.newestEventShort} wide={t.newestEvent} />}
              value={status ? (newestEvent ?? "—") : null}
              hint={
                newest ? (
                  <ByWidth phone={clock(newest.time)} wide={relativeTime(newest.time, lang, now)} />
                ) : undefined
              }
            />
            <Stat
              label={<ByWidth phone={t.lastUpdateShort} wide={t.lastUpdate} />}
              value={
                status ? (
                  ok?.finishedAt ? (
                    <ByWidth
                      phone={<Ago iso={ok.finishedAt} now={now} />}
                      wide={relativeTime(ok.finishedAt, lang, now)}
                    />
                  ) : (
                    t.never
                  )
                ) : null
              }
              hint={
                ok?.finishedAt ? (
                  <ByWidth phone={clock(ok.finishedAt)} wide={fmtDateTime(ok.finishedAt, lang)} />
                ) : undefined
              }
            />
            <MainshockStat mainshock={mainshock} catalogueFailed={catalogueFailed} />
          </div>
          )}
          {/* On a phone the note sits beside the button. From sm the note goes under it: below lg the
              block wraps onto its own line at the start edge, so it reads from there, and beside the
              stats at lg it hugs the end edge. */}
          <div className="flex items-center gap-3 sm:flex-col sm:items-start sm:gap-2 lg:items-end">
            {/* One label and one icon: the button keeps its width while it works. `aria-disabled`, not
                `disabled`: a disabled button drops the keyboard focus it holds to the page. */}
            <Button
              size="default-touch"
              aria-disabled={pending}
              onClick={() => {
                if (!pending) refresh.mutate({ auto: false });
              }}
            >
              <RefreshCwIcon data-icon="inline-start" className={refresh.isPending ? "animate-spin" : undefined} />
              {t.refresh}
            </Button>
            {/* One line is always reserved. The live region announces refresh results, and figures
                that could not be updated: a caution, so neutral with a warning icon, not red (nothing
                the reader did failed, and the figures stay).
                The standing note about automatic updates sits outside it, so it is never read out as if
                it were news. The note goes quiet while a run has failed: it promises a cadence that has
                stopped — the fast lane stands down after a failure — whether or not the failed-query
                alert is the one shown (`pageAlert`). The line stays, so nothing moves. */}
            <span
              aria-live="polite"
              className={
                live === ""
                  ? "sr-only"
                  : "flex min-h-4 items-start gap-1.5 text-start text-xs text-muted-foreground lg:text-end"
              }
            >
              {staleNote ? <AlertTriangleIcon aria-hidden className="mt-px size-3.5 shrink-0" /> : null}
              {live}
            </span>
            {live === "" ? (
              <span className="min-h-4 text-start text-xs text-muted-foreground lg:text-end">
                {variant && ok?.finishedAt ? (
                  lang === "es" ? (
                    <>Última consulta al SGC: {relativeTime(ok.finishedAt, lang, now)}</>
                  ) : (
                    <>Last SGC query: {relativeTime(ok.finishedAt, lang, now)}</>
                  )
                ) : failed ? null : (
                  <ByWidth phone={t.autoUpdateShort(everyMin)} wide={t.autoUpdate(everyMin)} />
                )}
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>
      {alert === "backfill" && status ? (
        <Alert variant="caution" role="status">
          {backfill.isPending ? <Spinner aria-label={t.backfillShort} /> : <AlertTriangleIcon />}
          <AlertTitle>{t.zones[zone].backfillTitle(status.backfill.done, status.backfill.total)}</AlertTitle>
          <AlertDescription>
            {t.zones[zone].backfillBody}
            {backfill.isPending ? null : (
              <Button variant="outline" size="sm-touch" onClick={() => backfill.mutate()}>
                {t.backfillAction}
              </Button>
            )}
          </AlertDescription>
        </Alert>
      ) : null}
      {alert === "ingest" && failed ? (
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertTitle>{t.ingestFailed}</AlertTitle>
          <AlertDescription>
            {t.ingestFailedBody}
            <TechnicalDetail>{failed.error}</TechnicalDetail>
          </AlertDescription>
        </Alert>
      ) : null}
      {variant ? <PrototypeSwitcher current={variant} /> : null}
    </div>
  );
}
