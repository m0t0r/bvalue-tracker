import { AlertTriangleIcon } from "lucide-react";
import { FlowNumber } from "@/components/flow-number";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtDay } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { MIN_RELIABLE_N, WINDOW_SIZE, type Stats } from "@/lib/use-stats";
import { cn } from "@/lib/utils";

interface Row { label: string; sub?: string; b: number; sigma: number; main: boolean }

/**
 * The start, the whole and the end of the sequence on one b scale, so the drift is visible without
 * reading the chart beside it. The marks are decoration: every value is also written out as text.
 */
function BScale({ rows }: { rows: Row[] }) {
  const { t } = useI18n();
  // Wide enough for b = 1 and for every error band, like the chart's axis.
  const lo = Math.min(0.4, ...rows.map((r) => Math.floor((r.b - r.sigma) * 10) / 10));
  const hi = Math.max(1.2, ...rows.map((r) => Math.ceil((r.b + r.sigma) * 10) / 10));
  const x = (b: number) => `${((b - lo) / (hi - lo)) * 100}%`;

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
              <span className="font-medium whitespace-nowrap">{r.b.toFixed(2)} ± {r.sigma.toFixed(2)}</span>
            </div>
            <div aria-hidden className="relative h-2 rounded-full bg-muted">
              <div className="absolute -inset-y-1 w-px bg-muted-foreground" style={{ left: x(1) }} />
              <div className="absolute inset-y-0 rounded-full bg-(--chart-1)/35" style={{ left: x(r.b - r.sigma), right: `calc(100% - ${x(r.b + r.sigma)})` }} />
              <div className={cn("absolute top-1/2 -translate-1/2 rounded-full bg-(--chart-1) ring-2 ring-card", r.main ? "size-3.5" : "size-3")} style={{ left: x(r.b) }} />
            </div>
          </div>
        ))}
        <div aria-hidden className="relative h-4 text-xs text-muted-foreground">
          <span className="absolute left-0">{lo.toFixed(1)}</span>
          <span className="absolute -translate-x-1/2" style={{ left: x(1) }}>b = 1</span>
          <span className="absolute right-0">{hi.toFixed(1)}</span>
        </div>
      </div>
      {/* Always visible rather than a tooltip: it has to work on a phone and for a reader who never hovers. */}
      <ul aria-hidden className="flex flex-wrap gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-(--chart-1)" />{t.bLegendValue}</li>
        <li className="flex items-center gap-1.5"><span className="h-2 w-5 rounded-full bg-(--chart-1)/35" />{t.bLegendError}</li>
        <li className="flex items-center gap-1.5"><span className="h-3 w-px bg-muted-foreground" />{t.bLegendOne}</li>
      </ul>
    </div>
  );
}

export function BSummary({ stats, incomplete }: { stats: Stats; incomplete: boolean }) {
  const { t, lang } = useI18n();
  const { fit, fitGft, mc, mcGft, windows } = stats;
  const few = fit !== null && fit.n < MIN_RELIABLE_N;
  const dim = few || incomplete;
  const first = windows[0], last = windows.at(-1);
  const span = (w: { from: string; to: string }) => `${fmtDay(Date.parse(w.from), lang)} – ${fmtDay(Date.parse(w.to), lang)}`;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{t.bTitle}</CardTitle>
        <CardDescription>Gutenberg–Richter · Aki–Utsu</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-6">
        {fit === null || mc === null ? (
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
              {fitGft && mcGft !== null ? (
                <p className="text-sm text-pretty text-muted-foreground">
                  {t.bGft} ({mcGft.toFixed(1)}):{" "}
                  <span className="whitespace-nowrap">b = {fitGft.b.toFixed(2)} ± {fitGft.sigmaB.toFixed(2)}</span>,{" "}
                  <span className="whitespace-nowrap">n = {fitGft.n.toLocaleString(lang)}</span>
                </p>
              ) : null}
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
        )}
      </CardContent>
    </Card>
  );
}
