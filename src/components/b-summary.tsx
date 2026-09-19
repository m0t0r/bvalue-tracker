import { AlertTriangleIcon } from "lucide-react";
import { FlowNumber } from "@/components/flow-number";
import { TechnicalDetail } from "@/components/technical-detail";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtDay } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { MagTabs } from "@/lib/scope";
import { MIN_RELIABLE_N, WINDOW_SIZE, type Stats } from "@/lib/stats";
import { cn } from "@/lib/utils";
import type { Cluster } from "../../core/clusters";

interface Row { label: string; sub?: string; b: number; sigma: number; main: boolean }

// A mark and the figure written beside it are one fact, so they move as one: `--ease-move` and
// `--duration-move` are `FlowNumber`'s curve and duration. On the page's `--ease-out` the mark was
// already parked while the digits were still rolling, and the two read as two separate events.
// Each mark rides a full-width layer moved by a percentage of its own width, so its position is a
// `transform` and the band a `clip-path`: nothing here triggers layout, and the marks keep gliding
// on the compositor through the render pass a filter change spends on the main thread — the same
// pass the digits already glide through. On `left`/`right` they froze there while the digits rolled.
const MOVE = "duration-(--duration-move) ease-(--ease-move) motion-reduce:transition-none";
const SLIDE = `transition-transform ${MOVE}`;
const CLIP = `transition-[clip-path] ${MOVE}`;

/**
 * The start, the whole and the end of the sequence on one b scale, so the drift is visible without
 * reading the chart beside it. The marks are decoration: every value is also written out as text.
 */
function BScale({ rows }: { rows: Row[] }) {
  const { t } = useI18n();
  // Wide enough for b = 1 and for every error band, like the chart's axis.
  const lo = Math.min(0.4, ...rows.map((r) => Math.floor((r.b - r.sigma) * 10) / 10));
  const hi = Math.max(1.2, ...rows.map((r) => Math.ceil((r.b + r.sigma) * 10) / 10));
  const pct = (b: number) => ((b - lo) / (hi - lo)) * 100;
  const x = (b: number) => `${pct(b)}%`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3.5">
        {rows.map((r) => (
          <div key={r.label} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-4">
              <span>
                <span className={r.main ? "font-medium" : undefined}>{r.label}</span>
                {r.sub ? <span className="text-xs text-muted-foreground"> {r.sub}</span> : null}
              </span>
              {/* Rolled like the headline: a row's figure and its mark are the one fact, and a figure that
                  snapped while its mark was still travelling read as the mark lagging behind. The scale's
                  end labels below are left to change outright — they are the ruler, not a reading off it. */}
              <span className="font-medium whitespace-nowrap">
                <FlowNumber value={r.b} digits={2} />
                <FlowNumber value={r.sigma} digits={2} prefix=" ± " />
              </span>
            </div>
            <div aria-hidden className="relative h-2 rounded-full bg-muted">
              <div className={cn(SLIDE, "absolute inset-0")} style={{ transform: `translateX(${x(1)})` }}>
                <div className="absolute -inset-y-1 left-0 w-px bg-muted-foreground" />
              </div>
              {/* Clipped rather than sized: `inset(… round)` keeps both ends a true half-circle at any
                  width, where scaling one capsule would flatten them into ellipses. */}
              <div className={cn(CLIP, "absolute inset-0 bg-(--chart-1)/35")}
                style={{ clipPath: `inset(0 ${100 - pct(r.b + r.sigma)}% 0 ${pct(r.b - r.sigma)}% round 9999px)` }} />
              <div className={cn(SLIDE, "absolute inset-0")} style={{ transform: `translateX(${x(r.b)})` }}>
                <div className={cn("absolute top-1/2 left-0 -translate-1/2 rounded-full bg-(--chart-1) ring-2 ring-card", r.main ? "size-3.5" : "size-3")} />
              </div>
            </div>
          </div>
        ))}
        <div aria-hidden className="relative h-4 text-xs text-muted-foreground">
          <span className="absolute left-0">{lo.toFixed(1)}</span>
          <span className={cn(SLIDE, "absolute inset-x-0")} style={{ transform: `translateX(${x(1)})` }}>
            <span className="absolute -translate-x-1/2">b = 1</span>
          </span>
          <span className="absolute right-0">{hi.toFixed(1)}</span>
        </div>
      </div>
      {/* Always visible rather than a tooltip: it has to work on a phone and for a reader who never hovers. */}
      <Separator />
      <ul aria-hidden className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-(--chart-1)" />{t.bLegendValue}</li>
        <li className="flex items-center gap-1.5"><span className="h-2 w-5 rounded-full bg-(--chart-1)/35" />{t.bLegendError}</li>
        <li className="flex items-center gap-1.5"><span className="h-3 w-px bg-muted-foreground" />{t.bLegendOne}</li>
      </ul>
    </div>
  );
}

/** `cluster` is set while the page is narrowed to one depth cluster; the card then says whose b it is showing. */
export function BSummary({ stats, incomplete, tabs, cluster }: { stats: Stats; incomplete: boolean; tabs: MagTabs; cluster: Cluster | null }) {
  const { t, lang } = useI18n();
  const { fit, fitGft, mc, mcGft, windows } = stats;
  const { magType } = tabs;
  const few = fit !== null && fit.n < MIN_RELIABLE_N;
  const dim = few || incomplete;
  const first = windows[0], last = windows.at(-1);
  const span = (w: { from: string; to: string }) => `${fmtDay(Date.parse(w.from), lang)} – ${fmtDay(Date.parse(w.to), lang)}`;
  // The fine print under the headline: which magnitudes it used, and what the other Mc estimator says.
  // Collapsed, because open it made this card half again as tall as the chart beside it, which then sat
  // in a card of empty space. Nothing is lost by folding it: "Cómo leer estas cifras" keeps the mixed
  // magnitude types and "no es un pronóstico" in the open, further down the page.
  const gft = fitGft && mcGft !== null ? (
    <p>
      {t.bGft} ({mcGft.toFixed(1)}):{" "}
      <span className="whitespace-nowrap">b = {fitGft.b.toFixed(2)} ± {fitGft.sigmaB.toFixed(2)}</span>,{" "}
      <span className="whitespace-nowrap">n = {fitGft.n.toLocaleString(lang)}</span>
    </p>
  ) : null;
  const detail = magType === null && gft === null ? null : (
    <TechnicalDetail className="text-sm">
      <div className="flex flex-col gap-2 text-pretty text-muted-foreground">
        {magType === null ? null : (
          <>
            <p>{tabs.value === "all" ? t.bScopeAllHelp(magType) : t.bScopeOneHelp(magType, tabs.typeCount.toLocaleString(lang), tabs.total.toLocaleString(lang))}</p>
            <p>{t.bScopeBoth}</p>
          </>
        )}
        {gft}
      </div>
    </TechnicalDetail>
  );
  const body = fit === null || mc === null ? (
    <p className="text-sm text-pretty text-muted-foreground">{t.bNone}</p>
  ) : (
    <>
      <div className="flex flex-col gap-4">
        {/* Demoted with the secondary-text token, not opacity: it must stay readable exactly when it is least reliable. */}
        <div className={cn("flex items-baseline gap-2 transition-colors duration-200 ease-out", dim && "text-muted-foreground")}>
          <FlowNumber value={fit.b} digits={2} className="text-5xl font-semibold tracking-tight" />
          <FlowNumber value={fit.sigmaB} digits={2} prefix="± " className="text-xl text-muted-foreground" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary"><FlowNumber value={mc} digits={1} prefix="Mc = " /></Badge>
          <Badge variant="secondary"><FlowNumber value={fit.n} lang={lang} prefix="n = " suffix={` ${t.eventsAboveMc}`} /></Badge>
          {/* Cautions, not failures: red stays reserved for things that actually broke. */}
          {few ? <Badge variant="outline"><AlertTriangleIcon data-icon="inline-start" />{t.bFew}</Badge> : null}
          {incomplete ? <Badge variant="outline"><AlertTriangleIcon data-icon="inline-start" />{t.backfillShort}</Badge> : null}
        </div>
        {detail}
      </div>
      {/* Needs two separate windows to say anything about change; with fewer, the headline stands alone. */}
      {first && last && first !== last ? (
        <div className="flex flex-col gap-4">
          <p className="text-pretty text-muted-foreground">{t.bDrift(first.b.toFixed(2), last.b.toFixed(2))}</p>
          <BScale rows={[
            { label: t.bRowStart, sub: t.bRowFirst(WINDOW_SIZE, span(first)), b: first.b, sigma: first.sigmaB, main: false },
            { label: t.bRowAll, b: fit.b, sigma: fit.sigmaB, main: true },
            { label: t.bRowEnd, sub: t.bRowLast(WINDOW_SIZE, span(last)), b: last.b, sigma: last.sigmaB, main: false },
          ]} />
        </div>
      ) : null}
    </>
  );
  const BODY = "flex flex-1 flex-col justify-between gap-6";

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{t.bTitle}</CardTitle>
        <CardDescription>{cluster !== null ? `${t.clusterName[cluster]} · ` : ""}Gutenberg–Richter · Aki–Utsu</CardDescription>
      </CardHeader>
      {magType === null ? <CardContent className={BODY}>{body}</CardContent> : (
        <CardContent className="flex flex-1 flex-col">
          <Tabs value={tabs.value} onValueChange={(v) => tabs.onChange(v as MagTabs["value"])} className="flex-1 gap-4">
            <TabsList aria-label={t.bScopeLabel} className="w-full">
              <TabsTrigger value="all">{t.bScopeAll}</TabsTrigger>
              <TabsTrigger value="type">{t.bScopeOne(magType)}</TabsTrigger>
            </TabsList>
            {/* One panel for both tabs: only the numbers differ, so they roll to the new value instead of remounting. */}
            <TabsContent value={tabs.value} className={BODY}>{body}</TabsContent>
          </Tabs>
        </CardContent>
      )}
    </Card>
  );
}
