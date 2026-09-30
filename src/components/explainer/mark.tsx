import { cva } from "class-variance-authority";

/**
 * How a source is shown at a glance: its own logo where its owner allows that (SGC's is in the public
 * domain), otherwise its short name in a neutral tile. USGS and ESA forbid their logos without written
 * permission, and ISC, GEBCO and Open-Meteo publish no policy; the reasons are in `docs/security.md`.
 * A tile is never drawn in a source's colours, so it cannot pass for its logo.
 */
export type MarkSpec = { kind: "logo"; src: string; width: number; height: number } | { kind: "tile"; text: string };

type Size = "xs" | "md" | "lg";
const HEIGHT: Record<Size, number> = { xs: 16, md: 32, lg: 56 };

// The logo sits on white in both themes, with the same padding in each, so its box never changes size.
const plate = cva("shrink-0 rounded-sm bg-white", {
  variants: { size: { xs: "p-px", md: "p-1", lg: "rounded-lg p-3 shadow-sm" } },
});
const tile = cva(
  "inline-flex shrink-0 items-center justify-center rounded-md border bg-background font-semibold tracking-tight text-foreground",
  {
    variants: {
      size: { xs: "h-4 px-1 text-2xs", md: "h-8 px-2 text-xs", lg: "h-14 rounded-lg px-4 text-lg shadow-sm" },
    },
  },
);

export function Mark({ mark, size }: { mark: MarkSpec; size: Size }) {
  if (mark.kind === "tile")
    return (
      <span aria-hidden className={tile({ size })}>
        {mark.text}
      </span>
    );
  const h = HEIGHT[size];
  return (
    <span className={plate({ size })}>
      <img src={mark.src} alt="" width={Math.round((h * mark.width) / mark.height)} height={h} className="block" />
    </span>
  );
}
