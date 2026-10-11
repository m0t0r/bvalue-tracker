import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangleIcon, RefreshCwIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { FlowNumber } from "@/components/flow-number";
import { SyncCodeDialog } from "@/components/sync-code-dialog";
import { Explain } from "@/components/explainer/explain";
import { TechnicalDetail } from "@/components/technical-detail";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { postRefresh, type StatusResponse, type StoredEvent } from "@/lib/api";
import { REFRESH_MIN_INTERVAL_S } from "../../worker/plan.ts";
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
import { behind, syncZone } from "@/lib/sync";
import { acceptCode, acceptedCode, forgetCode, refusalOf, type Refusal } from "@/lib/sync-code";
import { useNow } from "@/lib/use-now";
import { useZone } from "@/lib/zone";
import type { ZoneMainshock } from "../../core/mainshock";

/** The mutation key of one zone's sync, so the page can tell a sync under way (`useIsMutating`). */
export const syncKey = (zone: string) => ["sync", zone] as const;

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
  const label = <Explain id="mainshock">{t.mainshock.label}</Explain>;
  if (m === null) return <Stat label={label} value={catalogueFailed ? "—" : null} />;
  if (m.largest === null || m.runnerUp === null || m.gap === null) return <Stat label={label} value="—" />;
  const gap = m.gap.toFixed(1);
  if (m.state === "none")
    return (
      <Stat
        label={label}
        value={t.mainshock.none}
        hint={<ByWidth phone={t.mainshock.noneHintShort(gap)} wide={t.mainshock.noneHint(gap)} />}
      />
    );
  const e = m.largest;
  const day = fmtDay(Date.parse(e.time), lang);
  return (
    <Stat
      label={label}
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
  total,
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
  /** How many events the catalogue holds, whatever narrows the page; null until it has loaded. */
  total: number | null;
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
  const copy = t.zones[zone];
  // What the last press came to, beside the button, until the next press. `stoodDown` is the wait the
  // Worker answered with when the press sent nothing; `more` that a catch-up stopped at its cap with
  // history still to load.
  const [stoodDown, setStoodDown] = useState<number | null>(null);
  const [more, setMore] = useState(false);
  // Where a catch-up is: the request under way, out of how many the zone was behind.
  const [step, setStep] = useState<{ i: number; n: number } | null>(null);
  // When the reader's presses failed. After each, the button rests for a wait that doubles with every
  // failure in a row (`refresh-backoff.ts`): pressing on through an outage only adds to it. Only a
  // sync that works clears them; a status answer does not, since status can answer while the
  // sync route fails (code review, 2026-09-29).
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

  // The sync code's dialog (worker/sync-guard.ts): open while a press waits for a code, with why the last
  // one was turned away. A code the Worker accepted is kept for the page's life (`acceptedCode`), so
  // the dialog opens only on the first press, and again after a refusal.
  const [asking, setAsking] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);

  /**
   * "Sincronizar ahora", the one way the page reads SGC (docs/ingest.md, "On demand only"). Nothing
   * starts it but a press: not loading the page, not returning to the tab, not history left to load.
   * `syncZone` catches a zone up one chunk per request and says which chunk it is on; the first request
   * also asks for USGS's products and the sea forecast (`context`), which the Worker fetches when due.
   * Every request carries the code; the first answer means it was accepted, and the dialog closes.
   */
  const sync = useMutation({
    mutationKey: syncKey(zone),
    mutationFn: ({ pendingAtPress, code }: { pendingAtPress: number; code: string }) =>
      syncZone(pendingAtPress, {
        post: (first) => postRefresh(zone, { code, context: first }),
        answer: (res: StatusResponse) => {
          acceptCode(code);
          setAsking(false);
          qc.setQueryData(["status", zone], res);
        },
        step: (i, n) => setStep({ i, n }),
      }),
    onMutate: () => {
      setStoodDown(null);
      setMore(false);
    },
    // Only a press rests the button, and only one whose request failed: SGC failing is a 200 with a
    // failed run, which the alert reports. The code turned away is not a request failing either: the
    // dialog asks again and says why, and the button does not rest.
    onError: (err) => {
      const turnedAway = refusalOf(err);
      if (turnedAway !== null) {
        forgetCode();
        setRefusal(turnedAway);
        setAsking(true);
        return;
      }
      setAsking(false);
      const at = Date.now();
      setFailures((f) => recordFailure(f, at));
      setClockMs(at);
    },
    onSuccess: ({ res, progressed }) => {
      setFailures([]);
      // The last answer decides: a press that loaded chunks and was then turned away for longer than a
      // run in flight (a 429's cooldown) says how long, like one turned away at once. `more` is only the
      // cap: the last answer loaded a chunk and history is still missing.
      setStoodDown(res.refreshed ? null : (res.retryAfterS ?? null));
      setMore(progressed && res.refreshed === true && behind(res) > 0 && res.lastRun?.ok !== false);
    },
    onSettled: () => {
      setStep(null);
      // Status is already the last answer's; events follow it here rather than a poll later.
      void qc.invalidateQueries({ queryKey: ["events", zone] });
    },
  });
  const pending = sync.isPending;
  const runSync = (code: string) => {
    // The pixel background answers the press with a ring of pixels (src/backdrop/pixels.ts).
    window.dispatchEvent(new Event("backdrop:ripple"));
    sync.mutate({ pendingAtPress: status ? behind(status) : 0, code });
  };
  // Where focus goes back to when the dialog closes: the button that was pressed, or "Sincronizar ahora"
  // when that one has gone (the gap notice hides while a press catches up). Radix's Dialog returns focus
  // to its own trigger, and this dialog has none: the press opens it, and so can a refusal later on.
  const opener = useRef<HTMLElement | null>(null);
  const syncButton = useRef<HTMLButtonElement>(null);
  const returnFocus = () => {
    const to = opener.current?.isConnected ? opener.current : syncButton.current;
    to?.focus();
  };
  const startSync = () => {
    if (pending || resting) return;
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const code = acceptedCode();
    if (code !== null) return runSync(code);
    setRefusal(null);
    setAsking(true);
  };
  // The dialog's own press. A sync under way already carries a code; the dialog then only waits.
  const submitCode = (code: string) => {
    if (!pending) runSync(code);
  };

  const ok = status?.lastSuccessfulRun ?? null;
  const failed = status?.lastRun && !status.lastRun.ok ? status.lastRun : null;
  // A hole in what has been synced, not days since the last sync, which only the note dates
  // (`backfill.gaps`, docs/science.md). Not while a press is catching up: its own line says where it is.
  const incomplete = !!status && status.backfill.gaps > 0 && !pending;
  const alert = pageAlert({ catalogueFailed, ingestFailed: failed !== null, incomplete });
  // A press the Worker turned away says why, and the two reasons are different truths. When this zone's
  // own last run succeeded inside the throttle, the zone is up to date: good news, not a countdown.
  // Anything else is a wait the Worker is holding for SGC's sake (a failed sync, a refusal's hour, a
  // 429's cooldown, read across zones), and the line gives it; nothing retries by itself any more.
  // Not inferred from `failed` alone: a refusal of the other zone turns this one away too, and
  // "Ya está al día" would then be false (code review, 2026-10-11).
  const recentRun = status?.lastRun;
  const syncedRecently =
    !!recentRun &&
    recentRun.ok &&
    now - Date.parse(recentRun.startedAt) < REFRESH_MIN_INTERVAL_S * 1000 &&
    !!status &&
    behind(status) === 0;
  // Inside the live region a screen reader always has the long form, and the short one is only drawn:
  // with `ByWidth`, turning a phone past `sm` would add the other span to the region, and it would be
  // read out again as news.
  const waitMin = REFRESH_MIN_INTERVAL_S / 60;
  const wait = (
    <>
      <span aria-hidden="true" className="sm:hidden">
        {t.syncWaitShort(waitMin)}
      </span>
      <span className="sr-only sm:not-sr-only">{t.syncWait(waitMin)}</span>
    </>
  );
  // The countdown is drawn only: inside the live region it would be read out every second. A screen
  // reader hears the whole wait once, and the button's own state says when it is back.
  const lastFailure = failures.at(-1);
  const cooldown =
    until === null || lastFailure === undefined ? null : (
      <>
        <span aria-hidden="true">{t.syncCooldown(restS)}</span>
        <span className="sr-only">{t.syncCooldownSr(Math.round((until - lastFailure) / 1000))}</span>
      </>
    );
  const message: ReactNode = pending
    ? step
      ? copy.syncStep(step.i, step.n)
      : t.syncing
    : resting && cooldown
      ? cooldown
      : // The code turned away is said in the dialog, never as a sync that failed.
        sync.isError && refusalOf(sync.error) === null
        ? t.syncFailed
        : stoodDown !== null && !syncedRecently
          ? t.syncRetryIn(Math.max(1, Math.ceil(stoodDown / 60)))
          : stoodDown !== null
            ? wait
            : more
              ? t.syncMore
              : "";

  // While a refetch over the figures has failed, the line says since when they are, and that outranks
  // every answer to a press but a sync under way: "Ya está al día" would be stale itself, and
  // "No se pudo sincronizar" blames the sync for what is the connection as often as not.
  // A press parked offline (`isPaused`) is not under way, so "Sincronizando…" does not sit there
  // for as long as the connection is down. A button resting after a failed press outranks it too: the
  // line is then what says why the button is off, and for how long.
  const stale = staleSince === null ? null : fmtClock(staleSince, lang, now);
  const staleNote = stale !== null && !resting && !(pending && !sync.isPaused);
  const live = staleNote ? t.staleSince(stale.time, stale.day) : message;

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
  // The last sync is the note under the button: when the figures were last brought in from SGC is
  // what the button is about, and with syncs on demand it is the date every figure on the page is as
  // of. It is the last sync that succeeded, and says so while a run has failed, or it would contradict
  // "La última sincronización con el SGC falló" beside it. From `sm` up it adds the date and time; beside
  // the button on a phone there is room for how long ago only.
  const lastSync = (
    <>
      <ByWidth phone={failed ? t.lastSyncOkShort : t.lastSyncShort} wide={failed ? t.lastSyncOk : t.lastSync} />
      {": "}
      {ok?.finishedAt ? (
        <ByWidth
          phone={<Ago iso={ok.finishedAt} now={now} />}
          wide={`${relativeTime(ok.finishedAt, lang, now)} · ${clock(ok.finishedAt)}`}
        />
      ) : status ? (
        t.never
      ) : (
        t.lastSyncUnknown
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
              hint={
                // Said only while the count is narrowed, and as the scope bar says it ("Mostrando 639 de
                // 786"): the catalogue's own length, not the status poll's total, which can be a refetch
                // ahead of it. Unfiltered, the figure above is the whole catalogue and there is nothing to
                // explain; a worded hint there made the row one line taller at 640 px (Chocó).
                total === null || shown === total ? undefined : (
                  <ByWidth
                    phone={t.eventsOfCatalogueShort(total.toLocaleString(lang))}
                    wide={t.eventsOfCatalogue(total.toLocaleString(lang))}
                  />
                )
              }
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
              ref={syncButton}
              size="default-touch"
              aria-disabled={pending || resting}
              aria-busy={pending}
              onClick={startSync}
            >
              <RefreshCwIcon data-icon="inline-start" className={pending ? "animate-spin" : undefined} />
              {t.sync}
            </Button>
            {/* One line is always reserved. The live region announces what a press came to, a
                catch-up's progress, and figures that could not be updated: a caution, so neutral with a
                warning icon, not red (nothing the reader did failed, and the figures stay).
                The standing note, the last sync, sits outside it: it changes every minute, and
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
              <span className="min-h-4 text-start text-xs text-muted-foreground lg:text-end">{lastSync}</span>
            ) : null}
          </div>
        </CardContent>
      </Card>
      <SyncCodeDialog
        open={asking}
        onOpenChange={setAsking}
        refusal={refusal}
        pending={pending}
        onSubmit={submitCode}
        onClosed={returnFocus}
      />
      {/* Hidden while a press catches up, so it does not come and go under the reader with each chunk;
          the line under the button says where the press is. Its action is the same sync. */}
      {alert === "backfill" && status ? (
        <Alert variant="caution" role="status">
          <AlertTriangleIcon />
          <AlertTitle>{copy.backfillTitle(status.backfill.gaps)}</AlertTitle>
          <AlertDescription>{copy.backfillBody}</AlertDescription>
          <AlertAction>
            <Button variant="outline" size="sm-touch" aria-disabled={resting} onClick={startSync}>
              {t.backfillAction}
            </Button>
          </AlertAction>
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
