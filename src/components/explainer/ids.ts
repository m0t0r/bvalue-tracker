/**
 * Every explainer the pages can open, by kind. Only the names live here, so a page can name one
 * without loading the words: those are in `entries.ts`, in the card's own chunk.
 */
export const SOURCE_IDS = ["sgc", "usgs", "isc-gem", "slab2", "dyfi", "pager"] as const;
export const LINK_IDS = [
  "sgc-catalogue",
  "sgc-duration",
  "sgc-felt-report",
  "usgs-event",
  "usgs-finite-fault",
  "usgs-summary",
  "usgs-forecast",
  "iscgem-catalogue",
  "gps-velocities",
] as const;
export const TERM_IDS = [
  "b-value",
  "mc",
  "magnitude",
  "magnitude-types",
  "reviewed",
  "mainshock",
  "aftershocks",
  "swarm",
  "depth-groups",
  "subduction",
  "hypocentre",
  "crust",
] as const;

/** The monitor's charts, each explained by its own name in its card's title (issue #145). */
export const CHART_IDS = ["fmd", "b-over-time", "magnitude-time"] as const;

/**
 * Where each chart's name is: the page's own title strings, so the word in the card's title and the
 * heading of the card it opens can never name the chart two ways.
 */
export const CHART_TITLE = { fmd: "fmdTitle", "b-over-time": "bTimeTitle", "magnitude-time": "magTimeTitle" } as const;

export type SourceId = (typeof SOURCE_IDS)[number];
export type LinkId = (typeof LINK_IDS)[number];
export type TermId = (typeof TERM_IDS)[number];
export type ChartId = (typeof CHART_IDS)[number];
export type ExplainerId = SourceId | LinkId | TermId | ChartId;
