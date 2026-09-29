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
import { CADENCE } from "../../worker/plan.ts";
import {
  fmtClock,
  fmtDateTime,
  fmtDay,
  fmtPlace,
  fmtUtc,
  relativeTime,
  relativeTimeShort,
  sgcEventUrl,
} from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { pageAlert } from "@/lib/page-alert";
import { recordFailure, retryAt } from "@/lib/refresh-backoff";
import { useNow } from "@/lib/use-now";
import { useZone } from "@/lib/zone";
import type { ZoneMainshock } from "../../core/mainshock";

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

function Stat({
  label,
  value,
  hint,
  wide = false,
}: {
  label: ReactNode;
  value: ReactNode | null;
  hint?: ReactNode;
  /** Both columns of the phone's grid, for a value too long for half a phone. */
  wide?: boolean;
}) {
  return (
    // `min-w-0` lets a hint wrap inside its grid column on a phone; in the row from `sm` up a stat is
    // as wide as its longest line, and wraps whole onto the next line rather than folding its text.
    <div
      className={
        wide
          ? "col-span-2 flex min-w-0 flex-col gap-1 sm:max-w-xs sm:min-w-auto lg:max-w-none lg:min-w-40"
          : "flex min-w-0 flex-col gap-1 sm:min-w-auto lg:shrink-0"
      }
    >
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
  statusFailed = false,
  staleSince = null,
}: {
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
   * `/api/status` has failed and never answered. The newest event reads "—" rather than a placeholder
   * that never fills, and the last SGC query is unknown, not "nunca".
   */
  statusFailed?: boolean;
  /**
   * When the data on screen was fetched, if a refetch over it has since failed or waits offline
   * (`staleSince` in load-failed.ts); null while the page is current. The line under the button then
   * dates the data instead of promising updates that are not arriving.
   */
  staleSince?: number | null;
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
  // The server stands down whenever SGC was queried in the last five minutes, which with a
  // five-minute cron is most of the time. That is good news, not a countdown, so the message
  // says the reader already has the newest data rather than asking them to wait.
  const [stoodDown, setStoodDown] = useState(false);
  // When the reader's presses failed. After each, the button rests for a wait that doubles with every
  // failure in a row (`refresh-backoff.ts`): pressing on through an outage only adds to it. Only a
  // refresh that works clears them; a status answer does not, since status can answer while the
  // refresh route fails (code review, 2026-09-29).
  const [failures, setFailures] = useState<number[]>([]);
  const until = retryAt(failures);
  // The countdown's own clock, a second at a time and only while the button rests; `useNow` ticks every
  // 30 s. Set with the failure itself, so the first frame counts from the full wait.
  const [clockMs, setClockMs] = useState(() => Date.now());
  useEffect(() => {
    if (until === null) return;
    const tick = () => setClockMs(Date.now());
    const id = setInterval(tick, 1000);
    const end = setTimeout(
      () => {
        clearInterval(id);
        tick();
      },
      Math.max(0, until - Date.now()),
    );
    return () => {
      clearInterval(id);
      clearTimeout(end);
    };
  }, [until]);
  const restS = until === null ? 0 : Math.max(0, Math.ceil((until - clockMs) / 1000));
  const resting = restS > 0;

  // `auto` is a refresh the page started by itself on return to the tab. If the server stands down
  // because SGC was queried recently, that is the expected outcome and is not reported to the reader.
  const refresh = useMutation({
    mutationFn: (_vars: { auto: boolean }) => postRefresh(zone),
    // Only a press rests the button: the reader should not wait out a request they did not make.
    onError: (_err, { auto }) => {
      if (auto) return;
      const at = Date.now();
      setFailures((f) => recordFailure(f, at));
      setClockMs(at);
    },
    onSuccess: (res, { auto }) => {
      setFailures([]);
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
  // the server enforces the same limit for everyone, which is what protects SGC. Not while the button
  // rests after a failed press: the page would send what it has just asked the reader to wait for.
  const lastQueryMs = ok?.finishedAt ? Date.parse(ok.finishedAt) : null;
  const busy = refresh.isPending || backfill.isPending || incomplete || resting;
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
  // The countdown is drawn only: inside the live region it would be read out every second. A screen
  // reader hears the whole wait once, and the button's own state says when it is back.
  const lastFailure = failures.at(-1);
  const cooldown =
    until === null || lastFailure === undefined ? null : (
      <>
        <span aria-hidden="true">{t.refreshCooldown(restS)}</span>
        <span className="sr-only">{t.refreshCooldownSr(Math.round((until - lastFailure) / 1000))}</span>
      </>
    );
  const message: ReactNode = refresh.isPending
    ? t.refreshing
    : resting && cooldown
      ? cooldown
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
  // for as long as the connection is down. A button resting after a failed press outranks it too: the
  // line is then what says why the button is off, and for how long.
  const stale = staleSince === null ? null : fmtClock(staleSince, lang, now);
  const staleNote = stale !== null && !resting && !(refresh.isPending && !refresh.isPaused);
  const live = staleNote ? t.staleSince(stale.time, stale.day) : message;
  const pending = refresh.isPending || backfill.isPending;

  // The newest event is where and how strong, "Chaparral, Tolima (M 2.5)", all one link to SGC's own
  // page for it (readers asked for the place and the size, not the time). When it happened is
  // the line under it, how long ago first. On a phone that is "hace ~2 h · 17:08", with the day only
  // when it was not today; from `sm` up, the full date.
  const clock = (iso: string) => {
    const c = fmtClock(Date.parse(iso), lang, now);
    return c.day === null ? c.time : `${c.day}, ${c.time}`;
  };
  const newest = status?.newestEvent ?? null;
  // No type (owner's call): how strong, not which scale. SGC's region is stored as it comes, with no
  // length limit, so the place is one line with an ellipsis at the character where it runs out, at every
  // width, and "(M 2.5)" sits outside the cut, always shown. One line keeps the card's height whatever
  // the next event's place is. The whole place is still the link's name, its tooltip and SGC's page.
  const newestEvent = !newest ? null : (
    <a
      className="flex underline underline-offset-4"
      href={sgcEventUrl(newest.id)}
      target="_blank"
      rel="noreferrer"
      title={fmtPlace(newest.region)}
    >
      <span className="min-w-0 truncate">{fmtPlace(newest.region)}</span>
      <span className="shrink-0">{`\u00A0(M\u00A0${newest.mag.toFixed(1)})`}</span>
    </a>
  );
  // The UTC form is one hover away, as on every other time that identifies an event.
  const newestWhen = !newest ? undefined : (
    <span title={fmtUtc(newest.time)}>
      <ByWidth
        phone={
          <>
            <Ago iso={newest.time} now={now} />
            {" · "}
            {clock(newest.time)}
          </>
        }
        wide={`${relativeTime(newest.time, lang, now)} · ${fmtDateTime(newest.time, lang)}`}
      />
    </span>
  );
  // The last query to SGC is the note under the button: when the figures were last checked is what
  // the button is about. The footer says how often that happens. It is the last query that
  // succeeded, and says so while a run has failed, or it would contradict "La última consulta al SGC
  // falló" beside it. From `sm` up it adds the clock time, which an outage makes worth having; beside
  // the button on a phone there is room for how long ago only.
  const lastQuery = (
    <>
      <ByWidth phone={failed ? t.lastUpdateOkShort : t.lastUpdateShort} wide={failed ? t.lastUpdateOk : t.lastUpdate} />
      {": "}
      {ok?.finishedAt ? (
        <ByWidth
          phone={<Ago iso={ok.finishedAt} now={now} />}
          wide={`${relativeTime(ok.finishedAt, lang, now)} · ${clock(ok.finishedAt)}`}
        />
      ) : status ? (
        t.never
      ) : (
        t.lastUpdateUnknown
      )}
    </>
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
        <CardContent className="flex flex-wrap items-end justify-between gap-x-6 gap-y-5 sm:gap-y-4 lg:flex-nowrap">
          {/* The newest event first, across both columns on a phone, where a place such as "El Litoral
              del San Juan (Docordo), Choco" needs the width; the events and the mainshock share the
              row under it, each short enough for half a phone ("809", "Ninguno claro"), and a hint that
              is not wraps inside its own column. From sm up one wrapping row: a stat that no longer
              fits beside its neighbour takes the next line whole, and the newest event is capped
              (`Stat`'s `wide`). From lg the card is one row that does not wrap: every stat and the
              button block keep their width, and the newest event's place shrinks into what is left. */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:flex sm:flex-wrap sm:gap-x-10 lg:min-w-0 lg:flex-nowrap">
            <Stat
              wide
              label={t.newestEvent}
              value={status ? (newestEvent ?? "—") : statusFailed ? "—" : null}
              hint={newestWhen}
            />
            <Stat
              label={t.events}
              value={shown === null ? catalogueFailed ? "—" : null : <FlowNumber value={shown} lang={lang} />}
              hint={status ? `/ ${status.totalEvents.toLocaleString(lang)}` : undefined}
            />
            <MainshockStat mainshock={mainshock} catalogueFailed={catalogueFailed} />
          </div>
          {/* On a phone the note sits beside the button. From sm the note goes under it: below lg the
              block wraps onto its own line at the start edge, so it reads from there, and beside the
              stats at lg it hugs the end edge. */}
          <div className="flex items-center gap-3 sm:flex-col sm:items-start sm:gap-2 lg:shrink-0 lg:items-end">
            {/* One label and one icon: the button keeps its width while it works. `aria-disabled`, not
                `disabled`: a disabled button drops the keyboard focus it holds to the page. Busy, it
                keeps its colour and spins; off after failed presses, it dims (`aria-busy` in `Button`). */}
            <Button
              size="default-touch"
              aria-disabled={pending || resting}
              aria-busy={pending}
              onClick={() => {
                if (!pending && !resting) refresh.mutate({ auto: false });
              }}
            >
              <RefreshCwIcon data-icon="inline-start" className={refresh.isPending ? "animate-spin" : undefined} />
              {t.refresh}
            </Button>
            {/* One line is always reserved. The live region announces refresh results, and figures
                that could not be updated: a caution, so neutral with a warning icon, not red (nothing
                the reader did failed, and the figures stay).
                The standing note, the last SGC query, sits outside it: it changes every minute, and
                would be read out each time as if it were news. The line stays, so nothing moves. */}
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
              <span className="min-h-4 text-start text-xs text-muted-foreground lg:text-end">{lastQuery}</span>
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
    </div>
  );
}
