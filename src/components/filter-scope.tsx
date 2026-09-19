import { FilterIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ClusterChoice, FilterChip } from "@/lib/filters";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { CLUSTER_DEPTH_KM, type Cluster } from "../../core/clusters";

/** The clusters' own colours, as everywhere else on the page. */
const DOT: Record<Cluster, string> = { shallow: "bg-(--chart-1)", deep: "bg-(--chart-3)" };

/**
 * How far the page has to move before a scroll counts as a change of direction. Momentum, a
 * trackpad's tail and the browser's own scroll anchoring all produce a few pixels in the wrong
 * direction; without this the bar flickers at the end of every flick.
 */
const STEP_PX = 8;

function Chip({ chip, className }: { chip: FilterChip; className?: string }) {
  return (
    <Badge variant="outline" className={cn("shrink-0 gap-1.5", className)}>
      {chip.cluster ? <span aria-hidden className={cn("size-1.5 rounded-full", DOT[chip.cluster])} /> : null}
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
 * The bar is fixed to the top of the window for everything below the fold, because both the groups
 * card and the filters card scroll out of sight long before the map and the table do, and a reader
 * looking at a chart has no way of telling that it is drawn from a quarter of the catalogue.
 *
 * The bar is **shy**: it stays away while the reader is moving down the page — they are following
 * something they just set — and comes back the moment they scroll up, which is when someone is
 * looking for where they are. That keeps a permanent strip off a phone's screen. Turning a filter
 * on or off also brings it in wherever the reader is, since that is the one moment the answer is
 * worth interrupting for.
 */
export function FilterScope({ chips, cluster, shown, total, onClear }: Props) {
  const { t, lang } = useI18n();
  const notice = useRef<HTMLDivElement>(null);
  const [past, setPast] = useState(false);
  const [up, setUp] = useState(true);
  const active = chips.length > 0;
  // The chips' own text: it changes on exactly the changes the reader should be told about.
  const signature = chips.map((c) => c.label).join("|");

  // The bar stands in for the notice, so it may only appear once the notice itself has gone.
  useEffect(() => {
    const el = notice.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setPast(!e!.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [active]);

  useEffect(() => {
    if (!active) return;
    let last = window.scrollY;
    let frame = 0;
    const read = () => {
      frame = 0;
      // iOS rubber-banding reports positions above the top of the document; a bounce must not read
      // as the reader turning round.
      const y = Math.max(0, window.scrollY);
      const d = y - last;
      if (Math.abs(d) < STEP_PX) return;
      last = y;
      setUp(d < 0);
    };
    const onScroll = () => { frame ||= requestAnimationFrame(read); };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(frame); };
  }, [active]);

  // A filter that has just changed is what the reader is waiting to see confirmed, wherever on the
  // page the control was.
  useEffect(() => { setUp(true); }, [signature]);

  if (!active) return null;

  const visible = past && up;
  const where = cluster === "all" ? null : t.clusterWhere[cluster](CLUSTER_DEPTH_KM);
  const counts = [shown.toLocaleString(lang), total.toLocaleString(lang)] as const;

  return (
    <>
      {/* One row wherever there is room for one, so that the bar above reads as the same object come
          back rather than a second thing. The group's depth and place take the row below, because
          only one of the chips has any more to say. */}
      <Alert ref={notice} role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 *:[svg]:translate-y-0">
        <FilterIcon className="text-muted-foreground" />
        <span className="text-sm font-medium">{t.scopeTitle(...counts)}</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((c) => <Chip key={c.key} chip={c} />)}
        </div>
        {/* ps-7 lines it up under the count rather than under the icon: 1rem of icon and the row's 0.75rem gap. */}
        {where ? <p className="order-last w-full ps-7 text-sm text-muted-foreground">{where}</p> : null}
        <Button variant="outline" size="sm" className="ms-auto pointer-coarse:h-10 pointer-coarse:px-4" onClick={onClear}>
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
          "transition-[transform,opacity] ease-(--ease-out) motion-reduce:transition-opacity",
          visible
            ? "translate-y-0 opacity-100 duration-[220ms]"
            // Leaving is quicker than arriving: the reader has already moved on.
            : "pointer-events-none -translate-y-full opacity-0 duration-150 motion-reduce:translate-y-0",
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
            {chips.map((c, i) => <Chip key={c.key} chip={c} className={i > 0 ? "max-sm:hidden" : undefined} />)}
          </div>
          {chips.length > 1 ? <Badge variant="outline" className="shrink-0 sm:hidden">+{chips.length - 1}</Badge> : null}
          <Button tabIndex={-1} variant="outline" size="sm" className="shrink-0 pointer-coarse:h-10 pointer-coarse:px-4" onClick={onClear}>
            <XIcon data-icon="inline-start" />
            {t.scopeClear}
          </Button>
        </div>
      </div>
    </>
  );
}
