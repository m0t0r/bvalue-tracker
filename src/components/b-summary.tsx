import { AlertTriangleIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";
import { MIN_RELIABLE_N, type Stats } from "@/lib/use-stats";
import { cn } from "@/lib/utils";

export function BSummary({ stats, incomplete }: { stats: Stats; incomplete: boolean }) {
  const { t, lang } = useI18n();
  const { fit, fitGft, mc, mcGft } = stats;
  const few = fit !== null && fit.n < MIN_RELIABLE_N;
  const dim = few || incomplete;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{t.bTitle}</CardTitle>
        <CardDescription>Gutenberg–Richter · Aki–Utsu</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {fit === null || mc === null ? (
          <p className="text-sm text-pretty text-muted-foreground">{t.bNone}</p>
        ) : (
          <>
            {/* Demoted with the secondary-text token, not opacity: it must stay readable exactly when it is least reliable. */}
            <div className={cn("flex items-baseline gap-2 transition-colors duration-200 ease-out", dim && "text-muted-foreground")}>
              <span className="text-5xl font-semibold tracking-tight">{fit.b.toFixed(2)}</span>
              <span className="text-xl text-muted-foreground">± {fit.sigmaB.toFixed(2)}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">Mc = {mc.toFixed(1)}</Badge>
              <Badge variant="secondary">n = {fit.n.toLocaleString(lang)} {t.eventsAboveMc}</Badge>
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
          </>
        )}
      </CardContent>
    </Card>
  );
}
