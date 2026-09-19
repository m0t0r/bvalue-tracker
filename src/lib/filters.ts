import type { StoredEvent } from "@/lib/api";
import { dayBounds } from "@/lib/format";
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
  // The date fields are Colombian calendar days, like every other date on the page.
  const from = f.from ? dayBounds(f.from)[0] : "";
  const to = f.to ? dayBounds(f.to)[1] : "9999";
  return events.filter(
    (e) =>
      e.time >= from && e.time <= to && e.mag >= f.minMag &&
      (!f.manualOnly || e.status === "manual") &&
      (!f.excludeMainshock || e.id !== MAINSHOCK_ID),
  );
}
