/**
 * What a chart on this page is, apart from what it draws: a drawing sized to its card (`usePlotSize`),
 * with a text alternative, a focus ring and a keyboard layer (`Drawing`, `focusRing`), a grid and axis
 * labels where Recharts put them (`GridRows`, `TickLabels`, `preserveEndTicks`, `ownPlaceLabels`), and
 * one tooltip that a pointer, a finger and the keyboard share by one set of rules (`useReading`,
 * `ChartTip`), also inside a sideways scroller (`useScrollView`). A chart brings its scales and its
 * marks; D3's maths is its own import.
 */
export { ChartKey, Drawing, GridRows, PlotClip, TickLabels, focusRing, type AxisLabels } from "./drawing";
export { ownPlaceLabels, preserveEndTicks, type LabelRoom } from "./labels";
export { inPlot, usePlotSize, type PlotArea, type PlotSize } from "./plot";
export { useReading, type Reading, type ReadingHandlers, type ReadingOptions, type ReadingScroll } from "./reading";
export { useScrollView, type ScrollView } from "./scroll";
export { labelWidth } from "./text";
export { ChartTip, tipPosition } from "./tip";
