/**
 * For `CartesianGrid`'s `verticalCoordinatesGenerator` on a grid drawn with `vertical={false}`. Recharts
 * places the vertical lines even when it draws none, by running the x axis' own tick rule, which
 * measures every candidate label in the DOM: 23 forced layouts in "Valor b en el tiempo"'s first render
 * while Recharts drew it (issue #96). Asked for no lines, it computes none.
 */
export const NO_VERTICAL_LINES = (): number[] => [];
