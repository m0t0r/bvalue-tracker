import type { StatusResponse } from "@/lib/api";
import { SGC_REQUEST_GAP_S } from "../../worker/plan.ts";

/**
 * The most requests one press sends while it catches up: a month of Chaparral's days, or as many of
 * Chocó's weeks. Each is one SGC request, one after another; a longer gap takes another press, and the
 * line under the button says so (`syncMore`).
 */
export const MAX_SYNC_STEPS = 31;
/**
 * The longest stand-down a catch-up waits out: another reader's run in flight, which the Worker answers
 * with 5 s, or what is left of the gap between requests (`SGC_REQUEST_GAP_S`, 15 s). A longer one is the
 * throttle or a cooldown's wait, and ends the press.
 */
export const IN_FLIGHT_WAIT_MAX_S = 30;
/** How many such waits one press sits through before it gives up: another reader is syncing too. */
export const MAX_SYNC_WAITS = 10;

/** History chunks the zone is still missing, from its first day to now. */
export const behind = (s: StatusResponse) => s.backfill.total - s.backfill.done;

export interface SyncHooks {
  /** One step of the press: `first` is the press's opening request, which also asks for USGS and the sea. */
  post: (first: boolean) => Promise<StatusResponse>;
  /** Every answer, as it arrives: the page stores it as the zone's status. */
  answer: (res: StatusResponse) => void;
  /** Which chunk the press is on, out of how many, while it catches up. */
  step: (i: number, n: number) => void;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * One press of "Sincronizar ahora" (docs/ingest.md, "On demand only"). While the zone is behind, the
 * Worker loads one history chunk per request, and the press asks again until the zone has caught up:
 * one request at a time, `SGC_REQUEST_GAP_S` apart (the Worker holds the same gap, so this only spares
 * it the stand-downs), and at most `MAX_SYNC_STEPS` chunks. It waits out short stand-downs (another
 * reader's run in flight, the rest of a gap), at most `MAX_SYNC_WAITS` of them, and stops on a failed
 * run (the page's alert says so) or on any longer wait. Caught up, it is one request. Returns the last
 * answer, and whether any request reached SGC.
 */
export async function syncZone(
  pendingAtPress: number,
  { post, answer, step, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }: SyncHooks,
): Promise<{ res: StatusResponse; progressed: boolean }> {
  let i = 1;
  let n = pendingAtPress;
  if (n > 0) step(i, n);
  let res = await post(true);
  answer(res);
  let progressed = res.refreshed === true;
  let chunks = res.refreshed ? 1 : 0;
  let waits = 0;
  for (;;) {
    if (!res.refreshed) {
      if ((res.retryAfterS ?? 0) > IN_FLIGHT_WAIT_MAX_S || waits >= MAX_SYNC_WAITS) break;
      waits++;
      await sleep((res.retryAfterS ?? 5) * 1000);
    } else {
      if (res.lastRun && !res.lastRun.ok) break;
      const left = behind(res);
      if (left === 0 || chunks >= MAX_SYNC_STEPS) break;
      i += 1;
      n = Math.max(n, i + left - 1);
      step(i, n);
      await sleep(SGC_REQUEST_GAP_S * 1000);
    }
    res = await post(false);
    answer(res);
    if (res.refreshed) {
      progressed = true;
      chunks++;
    }
  }
  return { res, progressed };
}
