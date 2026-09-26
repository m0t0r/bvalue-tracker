import {
  createColumnHelper,
  createPaginatedRowModel,
  createSortedRowModel,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_text,
  tableFeatures,
  useTable,
  type PaginationState,
} from "@tanstack/react-table";
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
} from "lucide-react";
import { XIcon } from "lucide-react";
import { memo, useCallback, useMemo, useState, type RefObject } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toCsv } from "../../core/csv";
import type { StoredEvent } from "@/lib/api";
import type { DayRange } from "@/lib/daily-counts";
import { downloadCsv } from "@/lib/download";
import { fmtDayRange, fmtIsoDateTime, fmtIsoDay, fmtNum, fmtRegion, fmtUtc, sgcEventUrl } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useZone } from "@/lib/zone";

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic, text: sortFn_text },
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
});
const helper = createColumnHelper<typeof features, StoredEvent>();
const num = (v: number | null, d: number) => (v === null ? "—" : v.toFixed(d));
// Numbers align to the trailing edge so place values line up down a column.
const NUMERIC = new Set(["mag", "depthKm", "lat", "lon", "phases", "rmsS", "gapDeg", "errH", "errDepthKm"]);

/**
 * `events` are what the table lists: the page's events, or only those of the `days` the daily bars
 * chose, out of `of`. The CSV is what the table lists, and its button says how many events that is,
 * so a file of one day or of a filtered catalogue is never taken for the whole one. Its name says
 * which days.
 */
export const EventsTable = memo(function EventsTable({
  events,
  days = null,
  of = events.length,
  onAllDays,
  titleRef,
}: {
  events: StoredEvent[];
  days?: DayRange | null;
  of?: number;
  onAllDays?: () => void;
  titleRef?: RefObject<HTMLHeadingElement | null>;
}) {
  const { t, lang } = useI18n();
  const zone = useZone();
  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor("time", {
          header: t.colTime,
          cell: (c) => (
            // The UTC form, as SGC and the CSV give it, stays one hover away for matching a row against them.
            <a
              className="underline underline-offset-4"
              href={sgcEventUrl(c.row.original.id)}
              target="_blank"
              rel="noreferrer"
              title={fmtUtc(c.getValue())}
            >
              {fmtIsoDateTime(c.getValue())}
            </a>
          ),
        }),
        helper.accessor("mag", {
          header: t.colMag,
          cell: (c) => <span className="font-medium">{c.getValue().toFixed(1)}</span>,
        }),
        helper.accessor("magType", { header: t.colType }),
        helper.accessor("depthKm", { header: t.colDepth, cell: (c) => c.getValue().toFixed(1) }),
        helper.accessor("lat", { header: t.colLat, cell: (c) => fmtNum(c.getValue(), 3) }),
        helper.accessor("lon", { header: t.colLon, cell: (c) => fmtNum(c.getValue(), 3) }),
        helper.accessor("phases", { header: t.colPhases, cell: (c) => num(c.getValue(), 0) }),
        helper.accessor("rmsS", { header: t.colRms, cell: (c) => num(c.getValue(), 1) }),
        helper.accessor("gapDeg", { header: t.colGap, cell: (c) => num(c.getValue(), 0) }),
        helper.accessor(
          (e) => (e.errLatKm === null || e.errLonKm === null ? null : Math.hypot(e.errLatKm, e.errLonKm)),
          {
            id: "errH",
            header: t.colErrH,
            cell: (c) => num(c.getValue(), 1),
          },
        ),
        helper.accessor("errDepthKm", { header: t.colErrZ, cell: (c) => num(c.getValue(), 1) }),
        helper.accessor("region", { header: t.colRegion, cell: (c) => fmtRegion(c.getValue()) }),
        helper.accessor("status", {
          header: t.colStatus,
          cell: (c) => (
            <Badge variant={c.getValue() === "manual" ? "secondary" : "outline"}>
              {c.getValue() === "manual"
                ? t.statusManual
                : c.getValue() === "automatic"
                  ? t.statusAutomatic
                  : c.getValue()}
            </Badge>
          ),
        }),
      ]),
    [t],
  );

  // Held here rather than in the table, so a new choice of days can start at the first page in the same
  // render that narrows the rows (page 4 of a whole catalogue is past the end of one day). An effect did
  // it a frame late, after "Página 4 de 1" had been painted.
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 25 });
  const [pagedDays, setPagedDays] = useState(days);
  if (pagedDays !== days) {
    setPagedDays(days);
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }
  const table = useTable(
    {
      features,
      columns,
      data: events,
      initialState: { sorting: [{ id: "time", desc: true }] },
      state: { pagination },
      onPaginationChange: setPagination,
    },
    (state) => ({ pagination: state.pagination, sorting: state.sorting }),
  );
  const pageCount = Math.max(1, table.getPageCount());

  const chosen = days
    ? t.tableDays(fmtDayRange(days.from, days.to, lang), events.length.toLocaleString(lang), of.toLocaleString(lang))
    : null;
  const csvName = days
    ? `sgc-${zone.id}-events-${fmtIsoDay(days.from)}${days.to === days.from ? "" : `_${fmtIsoDay(days.to)}`}.csv`
    : `sgc-${zone.id}-events.csv`;

  // The fade at the table's trailing edge says "more columns this way", so it goes once there are
  // none: at the end of the scroll, or when the table fits. Scroll events do not bubble, so the
  // wrapper listens in the capture phase for the scroller inside `Table`; a ResizeObserver catches
  // the table fitting or overflowing as the window, the page of rows or the sort changes it.
  const [atEnd, setAtEnd] = useState(true);
  const measure = useCallback((el: Element) => setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1), []);
  const watch = useCallback(
    (node: HTMLDivElement | null) => {
      const scroller = node?.querySelector("[data-slot=table-container]");
      if (!scroller) return;
      const ro = new ResizeObserver(() => measure(scroller));
      ro.observe(scroller);
      if (scroller.firstElementChild) ro.observe(scroller.firstElementChild);
      return () => ro.disconnect();
    },
    [measure],
  );

  return (
    <Card>
      <CardHeader>
        {/* Focused by the daily bars' "N eventos en el catálogo", which scrolls here. */}
        <CardTitle ref={titleRef} tabIndex={-1} className="scroll-mt-20">
          {t.tableTitle}
        </CardTitle>
        {chosen ? (
          <CardDescription>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>{chosen}</span>
              <Button variant="outline" size="sm-touch" onClick={onAllDays}>
                <XIcon data-icon="inline-start" />
                {t.dailyAll}
              </Button>
            </div>
          </CardDescription>
        ) : null}
        {/* Mounted empty, since a live region inserted with its text already in it is often not read out. */}
        <span role="status" className="sr-only">
          {chosen}
        </span>
        <CardAction>
          <Button
            variant="outline"
            size="sm-touch"
            onClick={() => downloadCsv(csvName, toCsv(events, lang))}
            disabled={events.length === 0}
          >
            <DownloadIcon data-icon="inline-start" />
            {/* "Descargar 145 eventos en CSV"; on a phone the icon and "CSV" alone, the rest kept as its name. */}
            <span className="max-sm:sr-only">
              {t.downloadEventsIn(events.length.toLocaleString(lang), events.length === 1)}
            </span>
            CSV
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{t.noEvents}</EmptyTitle>
              <EmptyDescription>{t.noEventsBody}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div
            ref={watch}
            onScrollCapture={(e) => measure(e.target as Element)}
            className={cn(
              "relative",
              !atEnd &&
                "after:pointer-events-none after:absolute after:inset-y-0 after:end-0 after:w-8 after:bg-linear-to-l after:from-card",
            )}
            title={atEnd ? undefined : t.scrollHint}
          >
            <Table size="sm">
              <TableHeader>
                {table.getHeaderGroups().map((group) => (
                  <TableRow key={group.id}>
                    {group.headers.map((header) => {
                      const sorted = header.column.getIsSorted();
                      const Icon = sorted === "asc" ? ArrowUpIcon : sorted === "desc" ? ArrowDownIcon : ArrowUpDownIcon;
                      const numeric = NUMERIC.has(header.column.id);
                      return (
                        <TableHead
                          key={header.id}
                          className={numeric ? "text-end" : undefined}
                          aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"}
                        >
                          <Button
                            variant="ghost"
                            size="header"
                            className={numeric ? "-me-2.5" : "-ms-2.5"}
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            <table.FlexRender header={header} />
                            <Icon data-icon="inline-end" className={sorted ? undefined : "opacity-40"} />
                          </Button>
                        </TableHead>
                      );
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow key={row.original.id}>
                    {row.getAllCells().map((cell) => (
                      <TableCell key={cell.id} className={NUMERIC.has(cell.column.id) ? "text-end" : undefined}>
                        <table.FlexRender cell={cell} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      <CardFooter className="justify-between">
        <span className="text-sm text-muted-foreground">{t.page(table.state.pagination.pageIndex + 1, pageCount)}</span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon-sm-touch"
            aria-label={t.prevPage}
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            variant="outline"
            size="icon-sm-touch"
            aria-label={t.nextPage}
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <ChevronRightIcon />
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
});
