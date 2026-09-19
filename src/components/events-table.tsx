import {
  createColumnHelper, createPaginatedRowModel, createSortedRowModel,
  rowPaginationFeature, rowSortingFeature, sortFn_alphanumeric, sortFn_basic, sortFn_text, tableFeatures, useTable,
} from "@tanstack/react-table";
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, ChevronLeftIcon, ChevronRightIcon, DownloadIcon } from "lucide-react";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toCsv } from "../../core/csv";
import type { StoredEvent } from "@/lib/api";
import { fmtDateTime, fmtNum } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const features = tableFeatures({
  rowSortingFeature, sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic, text: sortFn_text },
  rowPaginationFeature, paginatedRowModel: createPaginatedRowModel(),
});
const helper = createColumnHelper<typeof features, StoredEvent>();
const num = (v: number | null, d: number) => (v === null ? "—" : v.toFixed(d));
// Numbers align to the trailing edge so place values line up down a column.
const NUMERIC = new Set(["mag", "depthKm", "lat", "lon", "phases", "rmsS", "gapDeg", "errH", "errDepthKm"]);

const sgcUrl = (id: string) => `https://www.sgc.gov.co/detallesismo/${id}/resumen`;

function download(events: readonly StoredEvent[]) {
  const url = URL.createObjectURL(new Blob([toCsv(events)], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "sgc-choco-events.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function EventsTable({ events }: { events: StoredEvent[] }) {
  const { t } = useI18n();
  const columns = useMemo(
    () => helper.columns([
      helper.accessor("time", {
        header: t.colTime,
        cell: (c) => (
          <a className="underline underline-offset-4" href={sgcUrl(c.row.original.id)} target="_blank" rel="noreferrer">
            {fmtDateTime(c.getValue())}
          </a>
        ),
      }),
      helper.accessor("mag", { header: t.colMag, cell: (c) => <span className="font-medium">{c.getValue().toFixed(1)}</span> }),
      helper.accessor("magType", { header: t.colType }),
      helper.accessor("depthKm", { header: t.colDepth, cell: (c) => c.getValue().toFixed(1) }),
      helper.accessor("lat", { header: t.colLat, cell: (c) => fmtNum(c.getValue(), 3) }),
      helper.accessor("lon", { header: t.colLon, cell: (c) => fmtNum(c.getValue(), 3) }),
      helper.accessor("phases", { header: t.colPhases, cell: (c) => num(c.getValue(), 0) }),
      helper.accessor("rmsS", { header: t.colRms, cell: (c) => num(c.getValue(), 1) }),
      helper.accessor("gapDeg", { header: t.colGap, cell: (c) => num(c.getValue(), 0) }),
      helper.accessor((e) => (e.errLatKm === null || e.errLonKm === null ? null : Math.hypot(e.errLatKm, e.errLonKm)), {
        id: "errH", header: t.colErrH, cell: (c) => num(c.getValue(), 1),
      }),
      helper.accessor("errDepthKm", { header: t.colErrZ, cell: (c) => num(c.getValue(), 1) }),
      helper.accessor("region", { header: t.colRegion, cell: (c) => c.getValue().replace(", Colombia", "") }),
      helper.accessor("status", {
        header: t.colStatus,
        cell: (c) => (
          <Badge variant={c.getValue() === "manual" ? "secondary" : "outline"}>
            {c.getValue() === "manual" ? t.statusManual : c.getValue() === "automatic" ? t.statusAutomatic : c.getValue()}
          </Badge>
        ),
      }),
    ]),
    [t],
  );

  const table = useTable(
    {
      features, columns, data: events,
      initialState: { sorting: [{ id: "time", desc: true }], pagination: { pageIndex: 0, pageSize: 25 } },
    },
    (state) => ({ pagination: state.pagination, sorting: state.sorting }),
  );
  const pageCount = Math.max(1, table.getPageCount());

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.tableTitle}</CardTitle>
        <CardAction>
          <Button variant="outline" size="sm" onClick={() => download(events)} disabled={events.length === 0}>
            <DownloadIcon data-icon="inline-start" />
            {t.downloadCsv}
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
          <div className="relative after:pointer-events-none after:absolute after:inset-y-0 after:end-0 after:w-8 after:bg-linear-to-l after:from-card lg:after:hidden" title={t.scrollHint}>
          <Table className="[&_td]:px-1 [&_th]:px-1">
            <TableHeader>
              {table.getHeaderGroups().map((group) => (
                <TableRow key={group.id}>
                  {group.headers.map((header) => {
                    const sorted = header.column.getIsSorted();
                    const Icon = sorted === "asc" ? ArrowUpIcon : sorted === "desc" ? ArrowDownIcon : ArrowUpDownIcon;
                    const numeric = NUMERIC.has(header.column.id);
                    return (
                      <TableHead key={header.id} className={numeric ? "text-end" : undefined}
                        aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"}>
                        <Button variant="ghost" size="sm" className={cn("text-sm", numeric ? "-me-2.5" : "-ms-2.5", "px-2")} onClick={header.column.getToggleSortingHandler()}>
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
                    <TableCell key={cell.id} className={NUMERIC.has(cell.column.id) ? "text-end" : undefined}><table.FlexRender cell={cell} /></TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        )}
      </CardContent>
      <CardFooter className="justify-between">
        <span className="text-sm text-muted-foreground">
          {t.page(table.state.pagination.pageIndex + 1, pageCount)}
        </span>
        <div className="flex gap-2">
          <Button variant="outline" size="icon-sm" aria-label={t.prevPage} onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}><ChevronLeftIcon /></Button>
          <Button variant="outline" size="icon-sm" aria-label={t.nextPage} onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}><ChevronRightIcon /></Button>
        </div>
      </CardFooter>
    </Card>
  );
}
