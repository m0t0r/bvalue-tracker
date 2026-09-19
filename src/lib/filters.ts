import type { StoredEvent } from "@/lib/api";
import { MAINSHOCK_ID } from "../../core/seiscomp";

export { MAINSHOCK_ID };

export interface Filters {
  from: string;
  to: string;
  minMag: number;
  manualOnly: boolean;
  excludeMainshock: boolean;
  /** null = use the maximum-curvature estimate. */
  mc: number | null;
}

export const DEFAULT_FILTERS: Filters = {
  from: "2026-08-10", to: "", minMag: 0, manualOnly: false, excludeMainshock: false, mc: null,
};

export function applyFilters(events: readonly StoredEvent[], f: Filters): StoredEvent[] {
  const from = f.from ? `${f.from}T00:00:00Z` : "";
  const to = f.to ? `${f.to}T23:59:59Z` : "9999";
  return events.filter(
    (e) =>
      e.time >= from && e.time <= to && e.mag >= f.minMag &&
      (!f.manualOnly || e.status === "manual") &&
      (!f.excludeMainshock || e.id !== MAINSHOCK_ID),
  );
}
