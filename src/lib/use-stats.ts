import { useMemo } from "react";
import { computeStats, type CatalogStats } from "../../core/gr";
import type { StoredEvent } from "@/lib/api";

export { WINDOW_SIZE, dominantMagType } from "../../core/gr";
export const MIN_RELIABLE_N = 50;
export type Stats = CatalogStats;

export function useStats(events: readonly StoredEvent[], mcOverride: number | null): Stats {
  return useMemo(() => computeStats(events, mcOverride), [events, mcOverride]);
}
