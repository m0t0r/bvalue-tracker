import { AlertTriangleIcon } from "lucide-react";
import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { FlowNumber } from "@/components/flow-number";
import { TechnicalDetail } from "@/components/technical-detail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { StoredEvent } from "@/lib/api";
import { dailyCounts, type DayCount } from "@/lib/daily-counts";
import { fmtDay, relativeTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { ClusterSelection } from "@/lib/scope";
import { MIN_RELIABLE_N } from "@/lib/stats";
import { useNow } from "@/lib/use-now";
import { FILL } from "@/lib/cluster-fill";
import { cn } from "@/lib/utils";
import { CLUSTERS, CLUSTER_DEPTH_KM, RECENT_DAYS, type Cluster, type ClusterStats } from "../../core/clusters";

// Same idea as "Magnitud en el tiempo": squeezed into a phone's width forty days are slivers with no
// values, so below MIN_BAR of room per day every day gets PX_PER_DAY instead and the strip scrolls
// sideways, starting at the newest day. With that much room each bar can carry its count and the
// days can be labelled. Above it the strip simply fills its tile, as before.
const PX_PER_DAY = 28;
const MIN_BAR = 10;
const LABEL_EVERY = 3; // a date label needs about three days' width

/**
 * Events per Colombian day for one cluster, on a scale both clusters share, so that one going quiet
 * while the other carries on is visible without reading a number. `scroll` is shared by the two
 * strips: they cover the same days, so moving one moves the other.
 */
const DailyStrip = memo(function DailyStrip({
  days,
  max,
  cluster,
  label,
  caption,
  scroll,
}: {
  days: readonly DayCount[];
  max: number;
  cluster: Cluster;
  label: string;
  caption: string;
  scroll: { register: (c: Cluster, el: HTMLDivElement | null) => void; onScroll: (c: Cluster) => void };
}) {
  const { lang } = useI18n();
  const el = useRef<HTMLDivElement | null>(null);
  const [viewW, setViewW] = useState(0);
  // A callback ref, so the observer follows the node itself rather than an effect's idea of when it exists.
  const { register } = scroll;
  const attach = useCallback(
    (node: HTMLDivElement | null) => {
      el.current = node;
      register(cluster, node);
      if (!node) return;
      const ro = new ResizeObserver(([entry]) => setViewW(entry!.contentRect.width));
      ro.observe(node);
      return () => ro.disconnect();
    },
    [register, cluster],
  );
  const n = Math.max(1, days.length);
  const first = days[0],
    last = days.at(-1);
  const dense = viewW > 0 && viewW / n < MIN_BAR;
  // The reader starts at the newest day, which is where the difference between the groups shows.
  useLayoutEffect(() => {
    if (dense && el.current) el.current.scrollLeft = el.current.scrollWidth;
  }, [dense, n]);

  return (
    <>
      <div
        ref={attach}
        onScroll={() => scroll.onScroll(cluster)}
        role="group"
        aria-label={label}
        tabIndex={dense ? 0 : undefined}
        className={cn(
          "w-full min-w-0 rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring",
          dense && "overflow-x-auto overscroll-x-contain",
        )}
      >
        <div
          aria-hidden
          className={cn("flex items-end", dense ? "h-24 w-(--strip-w) gap-0.5" : "h-10 gap-px")}
          style={dense ? ({ "--strip-w": `${n * PX_PER_DAY}px` } as CSSProperties) : undefined}
        >
          {days.map((d, i) => {
            const c = d[cluster];
            return (
              <div key={d.start} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-0.5">
                {dense && c > 0 ? (
                  <span className="text-center text-2xs leading-none text-muted-foreground">{c}</span>
                ) : null}
                <span
                  className={cn("h-(--bar-h) rounded-t-px", c > 0 ? FILL[cluster] : "bg-border")}
                  style={
                    { "--bar-h": c > 0 ? `${Math.max(6, (c / max) * (dense ? 60 : 100))}%` : "1px" } as CSSProperties
                  }
                />
                {dense ? (
                  <span className="h-3 overflow-visible text-2xs leading-3 whitespace-nowrap text-muted-foreground">
                    {i % LABEL_EVERY === 0 ? fmtDay(d.start, lang) : ""}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      {/* The ends of the range are only true while the whole range is on screen; once it scrolls, each bar carries its own date.
        With no days there are no ends: the spans stay so the caption keeps its place, but they name no date. */}
      <div className="flex justify-between gap-2 text-xs text-muted-foreground">
        {dense ? null : <span>{first ? fmtDay(first.start, lang) : ""}</span>}
        <span className={dense ? undefined : "text-center"}>{caption}</span>
        {dense ? null : <span>{last ? fmtDay(last.start, lang) : ""}</span>}
      </div>
    </>
  );
});

/**
 * The sequence's two depth clusters side by side. It leads with what each has been doing lately,
 * which any reader can use; the b-values follow with their error, and a sentence says whether they
 * can be told apart at all.
 */
export function ClustersCard({
  events,
  stats,
  selection,
}: {
  events: readonly StoredEvent[];
  stats: ClusterStats;
  selection: ClusterSelection;
}) {
  const { t, lang } = useI18n();
  const now = useNow();
  const daily = useMemo(() => dailyCounts(events), [events]);

  // One gesture moves both strips. The flag stops the echo: setting scrollLeft fires a scroll event on the other strip.
  const strips = useRef<Partial<Record<Cluster, HTMLDivElement | null>>>({});
  const echo = useRef(false);
  const scroll = useMemo(
    () => ({
      register: (c: Cluster, node: HTMLDivElement | null) => {
        strips.current[c] = node;
      },
      onScroll: (c: Cluster) => {
        if (echo.current) {
          echo.current = false;
          return;
        }
        const self = strips.current[c],
          other = strips.current[c === "shallow" ? "deep" : "shallow"];
        if (!self || !other || other.scrollLeft === self.scrollLeft) return;
        echo.current = true;
        other.scrollLeft = self.scrollLeft;
      },
    }),
    [],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.clustersTitle}</CardTitle>
        <CardDescription className="max-w-none">{t.clustersDesc(CLUSTER_DEPTH_KM)}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-4 md:grid-cols-2">
          {CLUSTERS.map((c) => {
            const part = stats[c];
            const { fit } = part.stats;
            const on = selection.cluster === c;
            return (
              <section
                key={c}
                aria-labelledby={`cluster-${c}`}
                className={cn(
                  "flex min-w-0 flex-col gap-4 rounded-xl border p-4 transition-colors duration-200 ease-(--ease-out)",
                  on && "border-foreground/30 bg-muted/50",
                )}
              >
                {/* The name and its button share a row; where the group lies takes the full width under
                    them. Beside the button, at 320 px, it was squeezed into a column of 80 px. */}
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center justify-between gap-3">
                    <h3 id={`cluster-${c}`} className="flex items-center gap-2 font-medium">
                      <span aria-hidden className={cn("size-2.5 rounded-full", FILL[c])} />
                      {t.clusterName[c]}
                    </h3>
                    {/* The label says what a press does, "Ver solo este grupo" or "Ver todos", so it
                        carries no aria-pressed as well: a screen reader read "Ver todos, pressed". */}
                    <Button
                      variant={on ? "secondary" : "outline"}
                      size="sm-touch"
                      className="shrink-0"
                      onClick={() => selection.onChange(on ? "all" : c)}
                    >
                      {on ? t.clusterClear : t.clusterOnly}
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">{t.clusterWhere[c](CLUSTER_DEPTH_KM)}</p>
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex items-baseline gap-2">
                    <FlowNumber value={part.recent} lang={lang} className="text-3xl font-semibold tracking-tight" />
                    <span className="text-sm text-muted-foreground">{t.clusterRecentLabel(RECENT_DAYS)}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {part.recentMaxMag !== null ? `${t.clusterMax(part.recentMaxMag.toFixed(1))} · ` : ""}
                    {part.lastTime ? t.clusterLast(relativeTime(part.lastTime, lang, now)) : ""}
                  </p>
                </div>

                {/* min-w-0 all the way up: otherwise the scrolling strip widens its tile instead of scrolling inside it. */}
                <div className="flex min-w-0 flex-col gap-1">
                  <DailyStrip
                    days={daily.days}
                    max={daily.maxCluster}
                    cluster={c}
                    scroll={scroll}
                    caption={t.clusterDaily(part.stats.count.toLocaleString(lang))}
                    label={`${t.clusterName[c]}: ${t.clusterDaily(part.stats.count.toLocaleString(lang))}`}
                  />
                </div>

                <Separator />
                {/* The cautions come and go as Mc moves, and each wrapped onto a line of its own: the
                    card grew and shrank by 28–56 px under the Mc slider below it. Under 50 events the n
                    becomes the caution, as in the b card, so it takes no line of its own; for the
                    group's own Mc a hidden copy with the caution shown shares the cell, so the line is
                    always as tall as it can get. */}
                <div className="grid">
                  <div
                    aria-hidden
                    className="invisible col-start-1 row-start-1 flex flex-wrap items-center gap-2 text-sm"
                  >
                    <span className="font-medium whitespace-nowrap">{t.bTitle} 0.00 ± 0.00</span>
                    {/* The n as wide as the wider of its two forms, the plain count and the caution. */}
                    <span className="inline-grid">
                      <span className="col-start-1 row-start-1 whitespace-nowrap">
                        n = {(fit?.n ?? 0).toLocaleString(lang)} {t.eventsAboveMc}
                      </span>
                      <Badge variant="outline" className="col-start-1 row-start-1">
                        <AlertTriangleIcon data-icon="inline-start" />
                        n = {(fit?.n ?? 0).toLocaleString(lang)}: {t.bFewShort}
                      </Badge>
                    </span>
                    <Badge variant="outline">
                      <AlertTriangleIcon data-icon="inline-start" />
                      {t.clusterOwnMc("0.0")}
                    </Badge>
                  </div>
                  <div className="col-start-1 row-start-1 flex flex-wrap items-center gap-2 self-start text-sm">
                    {fit ? (
                      <>
                        <span className="font-medium whitespace-nowrap">
                          {t.bTitle} {fit.b.toFixed(2)} ± {fit.sigmaB.toFixed(2)}
                        </span>
                        {fit.n < MIN_RELIABLE_N ? (
                          <Badge variant="outline">
                            <AlertTriangleIcon data-icon="inline-start" />
                            <span aria-hidden>
                              n = {fit.n.toLocaleString(lang)}: {t.bFewShort}
                            </span>
                            <span className="sr-only">{t.bFewSr(fit.n.toLocaleString(lang))}</span>
                          </Badge>
                        ) : (
                          <span className="whitespace-nowrap text-muted-foreground">
                            n = {fit.n.toLocaleString(lang)} {t.eventsAboveMc}
                          </span>
                        )}
                        {part.ownMcHigher ? (
                          <Badge variant="outline">
                            <AlertTriangleIcon data-icon="inline-start" />
                            {t.clusterOwnMc(part.stats.mcMaxc!.toFixed(1))}
                          </Badge>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-muted-foreground">{t.clusterNoFit}</span>
                    )}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
        {/* Both verdicts share one cell, the other hidden, so the paragraph keeps the longer one's height
            when Mc moves the test across p = 0.05 (it lost a line in English at 1024 px), and keeps its
            place when a group has no b to compare. */}
        <div className="flex flex-col gap-1 text-sm text-pretty text-muted-foreground">
          <div className="grid">
            {[t.clusterDiffer, t.clusterSame].map((verdict) => (
              <p key={verdict} aria-hidden className="invisible col-start-1 row-start-1">
                {verdict} {t.clusterNotForecast}
              </p>
            ))}
            <p className="col-start-1 row-start-1">
              {stats.difference ? `${stats.difference.p < 0.05 ? t.clusterDiffer : t.clusterSame} ` : ""}
              {t.clusterNotForecast}
            </p>
          </div>
          {/* Always mounted, so a reader who opened it finds it still open when the comparison comes
              back; hidden meanwhile (neither seen nor reached), with its line and any open text kept. */}
          <div aria-hidden={!stats.difference || undefined} className={cn(!stats.difference && "invisible")}>
            <TechnicalDetail>
              {t.clusterTest(
                !stats.difference ? "0.00" : stats.difference.p < 0.001 ? "< 0.001" : stats.difference.p.toFixed(2),
              )}
            </TechnicalDetail>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
