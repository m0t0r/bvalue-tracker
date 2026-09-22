import { FilterIcon, XIcon } from "lucide-react";
import { useIntersectionObserver } from "usehooks-ts";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ClusterChoice, FilterChip } from "@/lib/filters";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { CLUSTER_DEPTH_KM, type Cluster } from "../../core/clusters";

/** The clusters' own colours, as everywhere else on the page. */
const DOT: Record<Cluster, string> = { shallow: "bg-(--chart-1)", deep: "bg-(--chart-3)" };

function Chip({ chip, className }: { chip: FilterChip; className?: string }) {
  return (
    <Badge variant="outline" className={cn("shrink-0", className)}>
      {/* me-0.5 widens the badge's own gap-1 to 1.5 for the dot alone. */}
      {chip.cluster ? <span aria-hidden className={cn("me-0.5 size-1.5 rounded-full", DOT[chip.cluster])} /> : null}
      {chip.label}
    </Badge>
  );
}

interface Props {
  chips: FilterChip[];
  cluster: ClusterChoice;
  /** Events that pass every filter, out of the whole catalogue. */
  shown: number;
  total: number;
  onClear: () => void;
}

/**
 * What the page is currently scoped to, and the one control that undoes all of it.
 *
 * Two presentations of the same thing. The notice sits in the flow under the status bar, where the
 * reader can meet it on the way down; it is the accessible one, and the only one in the tab order.
 * The bar is fixed to the top of the window and takes over the moment the notice has scrolled off
 * the top, because both the groups card and the filters card leave the screen long before the map
 * and the table do, and a reader looking at a chart has no way of telling that it is drawn from a
 * quarter of the catalogue.
 *
 * So the two never both state the scope, and the reader is never without it: the bar is out of the
 * way at the top of the page, where the notice itself answers the question, and present for the
 * whole way down, where nothing else does. One `IntersectionObserver` on the notice decides it —
 * no scroll handler, no pixel threshold, and nothing that runs on a scroll frame.
 */
export function FilterScope({ chips, cluster, shown, total, onClear }: Props) {
  const { t, lang } = useI18n();
  // `entry`, not `isIntersecting`: the notice being out of view is not enough. On a short screen it
  // starts out of view *below* the fold, and the bar must not pre-empt a notice the reader has yet
  // to reach. Only a notice that has gone off the **top** is one the bar stands in for. Before the
  // first callback there is no entry, and the bar stays away, so a load never starts with it on.
  const { ref: notice, entry } = useIntersectionObserver({ threshold: 0 });
  const past = entry ? !entry.isIntersecting && entry.boundingClientRect.bottom <= 0 : false;

  if (chips.length === 0) return null;

  const where = cluster === "all" ? null : t.clusterWhere[cluster](CLUSTER_DEPTH_KM);
  const counts = [shown.toLocaleString(lang), total.toLocaleString(lang)] as const;

  return (
    <>
      {/* One row wherever there is room for one, so that the bar above reads as the same object come
          back rather than a second thing. The group's depth and place take the row below, because
          only one of the chips has any more to say. */}
      <Alert
        ref={notice}
        role="status"
        className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 *:[svg]:translate-y-0"
      >
        <FilterIcon className="text-muted-foreground" />
        <span className="text-sm font-medium">{t.scopeTitle(...counts)}</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <Chip key={c.key} chip={c} />
          ))}
        </div>
        {/* ps-7 lines it up under the count rather than under the icon: 1rem of icon and the row's 0.75rem gap. */}
        {where ? <p className="order-last w-full ps-7 text-sm text-muted-foreground">{where}</p> : null}
        <Button variant="outline" size="sm-touch" className="ms-auto" onClick={onClear}>
          <XIcon data-icon="inline-start" />
          {t.scopeClear}
        </Button>
      </Alert>

      {/* Fixed, so it is not a flex item of the page column and adds no gap to it.
          Hidden from assistive technology on purpose: it is a second view of the notice above, which
          a screen reader has already read out and can still reach. Its button is out of the tab
          order for the same reason — it would otherwise be a duplicate stop on every page. */}
      <div
        aria-hidden
        className={cn(
          // Opaque, not a frosted pane: what scrolls under it is dense text and charts, and a sentence
          // ghosting through the line that says what the page is scoped to defeats the point of it.
          // The shadow is what separates the bar from the page, and it needs a solid surface to sit on.
          "fixed inset-x-0 top-0 z-50 border-b bg-background shadow-lg",
          // Transform alone, so the bar travels rather than materialises: a fade over the same
          // 260 ms reads as an appearance, and it is the edge moving that says "this came from the
          // top of the window and is still there". Reduced motion gets that fade instead, which is
          // the one case where not moving is the point.
          "transition-transform ease-(--ease-slide) motion-reduce:transition-opacity",
          past
            ? "translate-y-0 duration-260 motion-reduce:opacity-100"
            : // The extra 1.5rem clears `shadow-lg`, which would otherwise hang into the top of the
              // page as a grey band while the bar itself is out of sight.
              // Leaving is quicker than arriving: the reader has already moved on.
              "pointer-events-none translate-y-[calc(-100%_-_1.5rem)] duration-180 motion-reduce:translate-y-0 motion-reduce:opacity-0",
        )}
      >
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2 sm:gap-3 sm:px-6">
          <FilterIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="shrink-0 text-sm font-medium">
            <span className="sm:hidden">{t.scopeShort(...counts)}</span>
            <span className="hidden sm:inline">{t.scopeTitle(...counts)}</span>
          </span>
          {/* One line at every width: the bar's height must not change as it slides in. A phone has
              room for the first chip, which is the cluster whenever one is chosen; the rest are counted. */}
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
            {chips.map((c, i) => (
              <Chip key={c.key} chip={c} className={i > 0 ? "max-sm:hidden" : undefined} />
            ))}
          </div>
          {chips.length > 1 ? (
            <Badge variant="outline" className="shrink-0 sm:hidden">
              +{chips.length - 1}
            </Badge>
          ) : null}
          <Button tabIndex={-1} variant="outline" size="sm-touch" className="shrink-0" onClick={onClear}>
            <XIcon data-icon="inline-start" />
            {t.scopeClear}
          </Button>
        </div>
      </div>
    </>
  );
}
