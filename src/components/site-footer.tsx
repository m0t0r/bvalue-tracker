import type { ReactNode, Ref } from "react";
import { useI18n } from "@/lib/i18n";

/**
 * The footer both pages end in (issue #142). What the page says about itself, that it is independent
 * of SGC and that its figures are not a forecast, and the one place the zone of every time on it is
 * stated, are written here once, so a page cannot leave them out: the monitor did not say it was
 * independent while `/insights` did, since each page had written its own footer.
 *
 * `children` are the page's own lines (where its data comes from, how current it is), first, as
 * `<p>`s; the shared lines follow. Lines of one group are 4 px apart and the two groups 16 px, so the
 * footer reads as the page's facts and then what the page is. `csv` adds the note on
 * the downloaded files' time zone, for the page that has downloads. `ref` is for `BackToTop`, which
 * watches the footer to know when to show.
 */
export function SiteFooter({
  csv = false,
  ref,
  children,
}: {
  csv?: boolean;
  ref?: Ref<HTMLElement>;
  children?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    // `pb-12` on top of the frame's own padding keeps the last line 80 px above the window's bottom
    // edge at the end of the page, clear of the round back-to-top button (44 px, 16–24 px up from it),
    // which sat on the end of the disclaimer, the longest line, on a phone.
    <footer ref={ref} className="mt-auto border-t pt-6 pb-12 text-sm text-muted-foreground">
      <div className="flex max-w-2xl flex-col gap-4 text-pretty">
        <div className="flex flex-col gap-1">
          {children}
          <p>
            {t.timeNote}
            {csv ? ` ${t.timeNoteCsv}` : null}
          </p>
        </div>
        <p>{t.disclaimer}</p>
      </div>
    </footer>
  );
}
