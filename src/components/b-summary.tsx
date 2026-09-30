import { Explain } from "@/components/explainer/explain";
import { AlertTriangleIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { FlowNumber } from "@/components/flow-number";
import { TechnicalDetail } from "@/components/technical-detail";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtDay } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { otherReadingKey, type MagTabs, type PageView } from "@/lib/scope";
import { MIN_RELIABLE_N, WINDOW_SIZE, readingsDiffer, windowIncomplete, type Stats } from "@/lib/stats";
import { cn } from "@/lib/utils";
import type { Cluster } from "../../core/clusters";

interface Row {
  label: string;
  /** The window's own line ("primeros 150 eventos · 20 sept – 24 sept"); none when there is no window. */
  sub?: string;
  /** The longest `sub` can be, held hidden under it so the row keeps its height with or without one. */
  reserve?: string;
  /** Null for a window there are too few events for: the row keeps its place, with a dash and no mark. */
  value: { b: number; sigma: number } | null;
  /** The same row on the other magnitude tab, drawn as a hollow mark; its figure is in the sentence above. */
  alt?: number | null;
  /** The window may have lost small events (its own Mc is well above the fixed one). */
  incomplete?: boolean;
  main: boolean;
}

// A mark and the figure written beside it are one fact, so they move as one: `--ease-move` and
// `--duration-move` are `FlowNumber`'s curve and duration. On the page's `--ease-out` the mark was
// already parked while the digits were still rolling, and the two read as two separate events.
// Each mark rides a full-width layer moved by a percentage of its own width, so its position is a
// `transform` and the band a `clip-path`: nothing here triggers layout, and the marks keep gliding
// on the compositor through the render pass a filter change spends on the main thread — the same
// pass the digits already glide through. On `left`/`right` they froze there while the digits rolled.
const MOVE = "duration-(--duration-move) ease-(--ease-move) motion-reduce:transition-none";
// The positions are data, so they arrive as custom properties (`--at`, `--from`, `--to`) and the classes
// that read them stay static.
const SLIDE = `translate-x-(--at) transition-transform ${MOVE}`;
const CLIP = `band-clip transition-clip-path ${MOVE}`;

/**
 * The start, the whole and the end of the sequence on one b scale, so the drift is visible without
 * reading the chart beside it. The marks are decoration: every value is also written out as text.
 */
function BScale({ rows, otherKey }: { rows: Row[]; otherKey: string | null }) {
  const { t } = useI18n();
  const values = rows.flatMap((r) => (r.value ? [r.value] : []));
  const alts = rows.flatMap((r) => (r.alt == null ? [] : [r.alt]));
  // Wide enough for b = 1, for every error band and for the other reading's marks, like the chart's axis.
  const lo = Math.min(
    0.4,
    ...values.map((v) => Math.floor((v.b - v.sigma) * 10) / 10),
    ...alts.map((b) => Math.floor(b * 10) / 10),
  );
  const hi = Math.max(
    1.2,
    ...values.map((v) => Math.ceil((v.b + v.sigma) * 10) / 10),
    ...alts.map((b) => Math.ceil(b * 10) / 10),
  );
  const pct = (b: number) => ((b - lo) / (hi - lo)) * 100;
  const x = (b: number) => `${pct(b)}%`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3.5">
        {rows.map((r) => (
          <div key={r.label} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-4">
              <span className={r.main ? "font-medium" : undefined}>{r.label}</span>
              {/* Rolled like the headline: a row's figure and its mark are the one fact, and a figure that
                  snapped while its mark was still travelling read as the mark lagging behind. The scale's
                  end labels below are left to change outright — they are the ruler, not a reading off it. */}
              {r.value ? (
                // Inline text, as without the ⚠: as a flex row the line's height followed the icon, and each
                // flagged row moved the Mc slider below by 2 px.
                <span className="font-medium whitespace-nowrap">
                  {r.incomplete ? (
                    <>
                      <AlertTriangleIcon
                        aria-hidden
                        className="mr-1.5 inline size-3.5 align-middle text-caution-strong"
                      />
                      <span className="sr-only">{t.bWindowIncomplete}</span>
                    </>
                  ) : null}
                  <FlowNumber value={r.value.b} digits={2} />
                  <FlowNumber value={r.value.sigma} digits={2} prefix=" ± " />
                </span>
              ) : (
                <span aria-hidden className="text-muted-foreground">
                  —
                </span>
              )}
            </div>
            {/* Under the label at full width, over a hidden copy of the longest it can be: beside the
                figure it wrapped with its dates and not without, and the card changed height when the
                windows ran out. It may wrap (a 320 px phone has 256 px for ~250 px of text). */}
            {r.reserve ? (
              <span className="-mt-1 grid text-xs text-pretty text-muted-foreground">
                <span aria-hidden className="invisible col-start-1 row-start-1">
                  {r.reserve}
                </span>
                <span className="col-start-1 row-start-1">{r.sub}</span>
              </span>
            ) : null}
            <div aria-hidden className="relative h-2 rounded-full bg-muted">
              <div className={cn(SLIDE, "absolute inset-0")} style={{ "--at": x(1) } as CSSProperties}>
                <div className="absolute -inset-y-1 left-0 w-px bg-muted-foreground" />
              </div>
              {r.value ? (
                <>
                  {/* Clipped rather than sized: `inset(… round)` keeps both ends a true half-circle at any
                      width, where scaling one capsule would flatten them into ellipses. */}
                  <div
                    className={cn(CLIP, "absolute inset-0 bg-(--chart-1)/35")}
                    style={
                      {
                        "--from": `${pct(r.value.b - r.value.sigma)}%`,
                        "--to": `${100 - pct(r.value.b + r.value.sigma)}%`,
                      } as CSSProperties
                    }
                  />
                  {r.alt == null ? null : (
                    <div className={cn(SLIDE, "absolute inset-0")} style={{ "--at": x(r.alt) } as CSSProperties}>
                      <div className="absolute top-1/2 left-0 size-3 -translate-1/2 rounded-full border-2 border-(--chart-1) bg-card" />
                    </div>
                  )}
                  <div className={cn(SLIDE, "absolute inset-0")} style={{ "--at": x(r.value.b) } as CSSProperties}>
                    <div
                      className={cn(
                        "absolute top-1/2 left-0 -translate-1/2 rounded-full bg-(--chart-1) ring-2 ring-card",
                        r.main ? "size-3.5" : "size-3",
                      )}
                    />
                  </div>
                </>
              ) : null}
            </div>
          </div>
        ))}
        <div aria-hidden className="relative h-4 text-xs text-muted-foreground">
          <span className="absolute left-0">{lo.toFixed(1)}</span>
          <span className={cn(SLIDE, "absolute inset-x-0")} style={{ "--at": x(1) } as CSSProperties}>
            <span className="absolute -translate-x-1/2">b = 1</span>
          </span>
          <span className="absolute right-0">{hi.toFixed(1)}</span>
        </div>
      </div>
      {/* Always visible rather than a tooltip: it has to work on a phone and for a reader who never hovers. */}
      <Separator />
      <ul aria-hidden className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-(--chart-1)" />
          {t.bLegendValue}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-2 w-5 rounded-full bg-(--chart-1)/35" />
          {t.bLegendError}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-px bg-muted-foreground" />
          {t.bLegendOne}
        </li>
        {otherKey === null ? null : (
          <li className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full border-2 border-(--chart-1)" />
            {otherKey}
          </li>
        )}
      </ul>
    </div>
  );
}

/** `cluster` is set while the page is narrowed to one depth cluster; the card then says whose b it is showing. */
export function BSummary({
  stats,
  other,
  otherEnds,
  incomplete,
  tabs,
  cluster,
}: {
  stats: Stats;
  /** The reading on the other magnitude tab, above the same Mc; null when every event shares one type. */
  other: Stats | null;
  /** The other reading over the same spans as this tab's first and last windows (`measure`). */
  otherEnds: PageView["otherEnds"];
  incomplete: boolean;
  tabs: MagTabs;
  cluster: Cluster | null;
}) {
  const { t, lang } = useI18n();
  const { fit, fitGft, mc, mcGft, windows } = stats;
  const { magType } = tabs;
  const few = fit !== null && fit.n < MIN_RELIABLE_N;
  const dim = few || incomplete;
  const first = windows[0],
    last = windows.at(-1);
  const drift = first && last && first !== last ? { first, last } : null;
  // A range wraps whole: "20 sept –" left at a line's end, with "22 sept" under it, read as an open
  // range. A no-break space before the dash, and a word joiner after it, since a line may break after
  // a dash even when a no-break space follows.
  const span = (w: { from: string; to: string }) =>
    `${fmtDay(Date.parse(w.from), lang)}\u00A0–\u2060\u00A0${fmtDay(Date.parse(w.to), lang)}`;
  // The fine print under the headline: which magnitudes it used, and what the other Mc estimator says.
  // Collapsed, because open it made this card half again as tall as the chart beside it, which then sat
  // in a card of empty space. Nothing is lost by folding it: "Cómo leer estas cifras" keeps the mixed
  // magnitude types and "no es un pronóstico" in the open, further down the page.
  const gft =
    fitGft && mcGft !== null ? (
      <p>
        {t.bGft} ({mcGft.toFixed(1)}):{" "}
        <span className="whitespace-nowrap">
          b = {fitGft.b.toFixed(2)} ± {fitGft.sigmaB.toFixed(2)}
        </span>
        , <span className="whitespace-nowrap">n = {fitGft.n.toLocaleString(lang)}</span>
      </p>
    ) : null;
  // Flagged windows keep a ⚠ beside their figure on the scale, which takes no room; what it means is
  // here, folded, because the chart beside the card states it in the open (its shaded stretch and key).
  const startFlagged = drift !== null && windowIncomplete(drift.first),
    endFlagged = drift !== null && windowIncomplete(drift.last);
  const caution =
    startFlagged || endFlagged ? (
      <p className="flex items-start gap-1.5">
        <AlertTriangleIcon aria-hidden className="mt-0.5 size-3.5 shrink-0 text-caution-strong" />
        {t.bDetailIncomplete(startFlagged, endFlagged)}
      </p>
    ) : null;
  const detail =
    magType === null && gft === null && caution === null ? null : (
      <TechnicalDetail size="sm">
        <div className="flex flex-col gap-2 text-pretty text-muted-foreground">
          {caution}
          {magType === null ? null : (
            <>
              <p>
                {tabs.value === "all"
                  ? t.bScopeAllHelp(magType)
                  : t.bScopeOneHelp(magType, tabs.typeCount.toLocaleString(lang), tabs.total.toLocaleString(lang))}
              </p>
              <p>{t.bScopeBoth}</p>
            </>
          )}
          {gft}
        </div>
      </TechnicalDetail>
    );
  // One layout for every state, so the card never changes height as Mc moves: the Mc slider sits under
  // it, and its section coming and going moved the slider under the reader's pointer (329 px at once,
  // owner's report, 2026-09-27). Too few events for two windows leaves the start and the end as
  // dashes; too few for b at all leaves every figure a dash. What is missing is said in one sentence.
  const est = fit !== null && mc !== null ? fit : null;
  const state = est === null ? "none" : drift ? "drift" : "few-windows";
  const sentences = {
    drift: t.bDrift(drift ? drift.first.b.toFixed(2) : "0.00", drift ? drift.last.b.toFixed(2) : "0.00"),
    "few-windows": t.bDriftNone,
    none: t.bNone,
  };
  // Both readings in words, not only behind the tabs: which one is nearer the truth depends on how SGC's
  // magnitude scales compare, which is not published (docs/science.md). Both variants share one cell,
  // so the card keeps its height whichever applies.
  const otherName = magType === null ? null : tabs.value === "all" ? t.bOtherType(magType) : t.bOtherAll;
  const otherKey = otherReadingKey(t, magType, tabs.value === "type");
  const otherFit = other?.fit ?? null;
  // The start and end compare over the very same spans as this tab's windows (`otherEnds`), so a gap
  // between the two readings is one of magnitude type and not of period.
  const otherFirst = drift ? (otherEnds?.first ?? null) : null,
    otherLast = drift ? (otherEnds?.last ?? null) : null;
  const differ =
    est !== null &&
    otherFit !== null &&
    (readingsDiffer(est, otherFit) || (drift !== null && otherLast !== null && readingsDiffer(drift.last, otherLast)));
  const readings =
    otherName === null
      ? null
      : {
          differ: t.bOtherDiffer(
            otherName,
            otherFit ? otherFit.b.toFixed(2) : "0.00",
            // "…and N at the end" only when both readings have an end to compare.
            otherLast ? otherLast.b.toFixed(2) : null,
          ),
          agree: t.bOtherAgree(otherName, otherFit ? otherFit.b.toFixed(2) : "0.00"),
        };
  // Nothing to compare while this tab has no b of its own: every figure on the card is a dash then.
  const readingsState = est === null || otherFit === null ? null : differ ? "differ" : "agree";
  const readingsLongest = otherName === null ? null : t.bOtherDiffer(otherName, "0.00", "0.00");
  // The widest a window's dates get ("28 sept – 28 sept"), to keep its line's room when it has none.
  const widest = span({ from: "2026-09-28T12:00:00Z", to: "2026-09-28T12:00:00Z" });
  const body = (
    <>
      <div className="flex flex-col gap-4">
        {/* Demoted with the secondary-text token, not opacity: it must stay readable exactly when it is least reliable. */}
        <div
          className={cn(
            "flex items-baseline gap-2 transition-colors duration-200 ease-(--ease-out)",
            (dim || !est) && "text-muted-foreground",
          )}
        >
          {est ? (
            <>
              <FlowNumber value={est.b} digits={2} className="text-5xl font-semibold tracking-tight" />
              <FlowNumber value={est.sigmaB} digits={2} prefix="± " className="text-xl text-muted-foreground" />
            </>
          ) : (
            <span aria-hidden className="text-5xl font-semibold tracking-tight">
              —
            </span>
          )}
        </div>
        {/* What the number measures, in words, under it rather than in the card's description above
            it: on a 375×812 phone the figure ends 2 px inside the first screen, and a line above it
            would push it out (docs/frontend.md). */}
        <p className="-mt-2 text-sm text-pretty text-muted-foreground">{t.bDesc}</p>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">
            {/* "Mc" is its own word, outside the rolling figure, so it can open its explainer. */}
            <span>
              <Explain id="mc">Mc</Explain> = {mc !== null ? <FlowNumber value={mc} digits={1} /> : "—"}
            </span>
          </Badge>
          {/* Cautions, not failures: red stays reserved for things that actually broke. Under 50
              events the n badge carries the caution itself rather than a third badge beside it, which
              wrapped at a third of a desktop and on a phone. One badge and one figure in both states,
              so n rolls across 50 like every other figure here. */}
          <Badge variant={few ? "outline" : "secondary"}>
            {few ? <AlertTriangleIcon data-icon="inline-start" /> : null}
            <span aria-hidden={few || undefined}>
              {est ? (
                <FlowNumber
                  value={est.n}
                  lang={lang}
                  prefix="n = "
                  suffix={few ? `: ${t.bFewShort}` : ` ${t.eventsAboveMc}`}
                />
              ) : (
                `n = — ${t.eventsAboveMc}`
              )}
            </span>
            {few && est ? <span className="sr-only">{t.bFewSr(est.n.toLocaleString(lang))}</span> : null}
          </Badge>
          {incomplete ? (
            <Badge variant="outline">
              <AlertTriangleIcon data-icon="inline-start" />
              {t.backfillShort}
            </Badge>
          ) : null}
        </div>
        {detail}
      </div>
      <div className="flex flex-col gap-4">
        {/* Every sentence in one cell, the others hidden, so the cell is as tall as the longest at every
            width and in both languages. The hidden drift sentence is measured with stand-in figures. */}
        <div className="grid">
          {(Object.keys(sentences) as (keyof typeof sentences)[]).map((k) => (
            <p
              key={k}
              aria-hidden={k !== state || undefined}
              className={cn("col-start-1 row-start-1 text-pretty text-muted-foreground", k !== state && "invisible")}
            >
              {sentences[k]}
            </p>
          ))}
        </div>
        {readings === null ? null : (
          <div className="-mt-2 grid">
            {/* The longest the sentence can be, with stand-in figures: without an end window to compare
                it loses a clause, and the card shrank by a line when Mc ran the windows out. */}
            <p aria-hidden className="invisible col-start-1 row-start-1 text-sm text-pretty">
              {readingsLongest}
            </p>
            {(Object.keys(readings) as (keyof typeof readings)[]).map((k) => (
              <p
                key={k}
                aria-hidden={k !== readingsState || undefined}
                className={cn(
                  "col-start-1 row-start-1 text-sm text-pretty text-muted-foreground",
                  k !== readingsState && "invisible",
                )}
              >
                {readings[k]}
              </p>
            ))}
          </div>
        )}
        {/* Needs two windows to say anything about change. */}
        <BScale
          otherKey={otherKey}
          rows={[
            {
              label: t.bRowStart,
              sub: drift ? t.bRowFirst(WINDOW_SIZE, span(drift.first)) : undefined,
              reserve: t.bRowFirst(WINDOW_SIZE, widest),
              value: drift ? { b: drift.first.b, sigma: drift.first.sigmaB } : null,
              alt: otherFirst?.b ?? null,
              incomplete: startFlagged,
              main: false,
            },
            {
              label: t.bRowAll,
              value: est ? { b: est.b, sigma: est.sigmaB } : null,
              alt: est ? (otherFit?.b ?? null) : null,
              main: true,
            },
            {
              label: t.bRowEnd,
              sub: drift ? t.bRowLast(WINDOW_SIZE, span(drift.last)) : undefined,
              reserve: t.bRowLast(WINDOW_SIZE, widest),
              value: drift ? { b: drift.last.b, sigma: drift.last.sigmaB } : null,
              alt: otherLast?.b ?? null,
              incomplete: endFlagged,
              main: false,
            },
          ]}
        />
      </div>
    </>
  );
  const BODY = "flex flex-1 flex-col justify-between gap-6";

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>
          <Explain id="b-value">{t.bTitle}</Explain>
        </CardTitle>
        {cluster !== null ? <CardDescription>{t.clusterNote(t.clusterName[cluster])}</CardDescription> : null}
      </CardHeader>
      {magType === null ? (
        <CardContent className={BODY}>{body}</CardContent>
      ) : (
        <CardContent className="flex flex-1 flex-col">
          <Tabs value={tabs.value} onValueChange={(v) => tabs.onChange(v as MagTabs["value"])} className="flex-1 gap-4">
            <TabsList aria-label={t.bScopeLabel} className="w-full">
              <TabsTrigger value="all">{t.bScopeAll}</TabsTrigger>
              <TabsTrigger value="type">{t.bScopeOne(magType)}</TabsTrigger>
            </TabsList>
            {/* One panel for both tabs: only the numbers differ, so they roll to the new value instead of remounting. */}
            {/* Out of the tab order: its first content is focusable (the technical detail), so a stop on
                the panel itself would be one press that does nothing. */}
            <TabsContent value={tabs.value} tabIndex={-1} className={BODY}>
              {body}
            </TabsContent>
          </Tabs>
        </CardContent>
      )}
    </Card>
  );
}
