import type { Cluster } from "../../core/clusters";

/**
 * The depth groups' own colours, as fills, everywhere on the page: shallow the blue, deep the teal
 * (docs/frontend.md). One map, because a copy drifted once: the scope chip's deep dot was grey.
 */
export const FILL: Record<Cluster, string> = { shallow: "bg-(--chart-1)", deep: "bg-(--chart-4)" };
