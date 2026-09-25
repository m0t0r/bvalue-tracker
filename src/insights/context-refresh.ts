/**
 * When the insights page asks `/api/context` again while it is open, and what a later answer may
 * change. USGS's forecast goes stale on a schedule (`forecastStaleAt`) and the server stores the next
 * one only when the daily job runs (`core/products.ts`), so a page left open asks once per run after
 * the due time, on a return to the tab. USGS's felt figures decide whether question 2 exists, so a
 * later answer may update them but never add or remove them, and no refetch renumbers the questions
 * under the reader. See docs/frontend.md, "USGS's forecast is a box inside…".
 */
import { lastProductsRun } from "../../core/products";
import type { ContextResponse } from "../../worker/api-types";
import { forecastStaleAt } from "./claims";

/** The time the daily job is given to finish before the page counts on what it stored. */
export const PRODUCTS_RUN_MARGIN_MS = 5 * 60_000;
/** After a failed attempt, how long before a return to the tab may try again. */
export const CONTEXT_RECHECK_MS = 10 * 60_000;
/**
 * How long past the due time the page keeps asking: the daily job and USGS's own delay take up to
 * about a day, so two days covers a late forecast, and a forecast USGS never replaces is not asked
 * for for ever. A reload after that asks once more.
 */
export const CONTEXT_RECHECK_FOR_MS = 2 * 24 * 60 * 60_000;

/**
 * Whether a return to the tab should ask `/api/context` again: only when a job run has finished since
 * the stored forecast was due and since the page last had an answer, no sooner than
 * CONTEXT_RECHECK_MS after the last attempt (answered or failed), and for CONTEXT_RECHECK_FOR_MS past
 * the due time at most. Never after a failed first load, or with no forecast stored: the page keeps
 * what it opened with.
 */
export function contextRecheckDue(
  data: ContextResponse | undefined,
  lastAnswerAt: number,
  lastAttemptAt: number,
  now: number,
): boolean {
  const forecast = data?.forecast;
  if (!forecast) return false;
  const dueAt = forecastStaleAt(forecast.digest);
  if (now >= dueAt + CONTEXT_RECHECK_FOR_MS) return false;
  const run = lastProductsRun(now - PRODUCTS_RUN_MARGIN_MS);
  if (run < dueAt || lastAnswerAt >= run + PRODUCTS_RUN_MARGIN_MS) return false;
  return now >= lastAttemptAt + CONTEXT_RECHECK_MS;
}

/**
 * The context the page shows: the latest answer, except that a felt product (DYFI, PAGER) is there
 * only if the first answer had it, so question 2 never comes or goes after the page has drawn.
 * `first` is null after a failed first load.
 */
export function keepFeltFromFirst(
  first: ContextResponse | null,
  latest: ContextResponse | undefined,
): ContextResponse | null {
  if (latest === undefined) return first;
  return {
    ...latest,
    dyfi: first?.dyfi ? (latest.dyfi ?? first.dyfi) : null,
    pager: first?.pager ? (latest.pager ?? first.pager) : null,
  };
}
