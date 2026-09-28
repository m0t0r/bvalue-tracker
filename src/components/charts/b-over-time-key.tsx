import { useI18n } from "@/lib/i18n";
import { windowIncomplete, type Stats } from "@/lib/stats";
import { cn } from "@/lib/utils";

/**
 * "Valor b en el tiempo"'s key, apart from Recharts so that `Deferred` draws it in the card's
 * placeholder too: on a phone it wraps to two or three lines, and a placeholder without it was that
 * much shorter than the chart it stood for.
 *
 * Its entries follow the data: the dashed line only while there is another magnitude reading, the
 * shaded stretch only while some window may have lost small events. The second one comes and goes
 * as Mc moves, and this card sits above the filters on a phone, so the key is laid over a hidden
 * copy with every entry it can have: it keeps that height, and the Mc slider does not move under
 * the reader's pointer (docs/frontend.md). The copy stays when the windows run out and there is no
 * line to explain, for the same reason.
 */
export function BTimeKey({ stats, other, otherKey }: { stats: Stats; other: Stats | null; otherKey: string | null }) {
  const { t } = useI18n();
  // With no line to explain, only the reserved room is left, so the card keeps its height when Mc
  // runs the windows out.
  const drawn = stats.windows.length >= 2;
  const showOther = otherKey !== null && (other?.windows.length ?? 0) >= 2;
  const showIncomplete = stats.windows.some((w) => windowIncomplete(w));
  const items = (all: boolean) => (
    <>
      <li className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-full bg-(--chart-1) ring-2 ring-card" />
        {t.bTimeKeyIndependent}
      </li>
      <li className="flex items-center gap-1.5">
        <span className="h-2.5 w-5 bg-(--chart-1)/20" />
        {t.bLegendError}
      </li>
      {otherKey !== null && (all || showOther) ? (
        <li className="flex items-center gap-1.5">
          <span className="w-5 border-t-2 border-dashed border-(--chart-1)" />
          {otherKey}
        </li>
      ) : null}
      {all || showIncomplete ? (
        <li className="flex items-center gap-1.5">
          <span className="h-2.5 w-5 bg-caution-edge" />
          {t.bTimeKeyIncomplete}
        </li>
      ) : null}
    </>
  );
  const LIST = "col-start-1 row-start-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground";
  return (
    <div aria-hidden className="mt-3 grid">
      <ul className={cn(LIST, "invisible")}>{items(true)}</ul>
      {drawn ? <ul className={LIST}>{items(false)}</ul> : null}
    </div>
  );
}
