import { Suspense, useState, type ReactNode } from "react";
import { useIntersectionObserver } from "usehooks-ts";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * MapLibre is most of the JavaScript this page ships (~1.0 MB of sources), and the map and the
 * charts are all below the b-value the reader came for — the map is five screens down on a phone.
 * Loaded with the rest of the page (the charts were then on Recharts, ~1.3 MB more) they held the
 * first paint behind a megabyte of script and cost 1.8 s of scripting on a mid-range phone, so each
 * card asks for its chunk only once it is within 600 px of the viewport (`margin`). A card already on screen
 * loads immediately, one screen after the shell has painted.
 *
 * The card and its header are drawn here, and the chunk brings only the card's content (`children`
 * is a `CardContent`), so only the drawing arrives late, nothing below it moves, and nothing in the
 * header is drawn twice: a chart's name, which opens its explainer, and the CSV button keep their
 * elements, an open card and the focus. `placeholder` stands in for the drawing and must be exactly
 * its height, at every width: a key that wraps is drawn for real in it (`MapPlaceholder`,
 * `MagnitudeTimePlaceholder`), since a skeleton cannot guess how many lines it takes. The default is
 * a chart's h-80. `action` is the card's header action, which works without the chunk.
 * `description` is the card's own, written without the chunk (`bTimeDescription`, `fmdDescription`,
 * `mapDescription`), so the text is there with the data rather than with the drawing, and a
 * description that wraps to four lines on a phone does not leave the placeholder four lines short.
 */
export function Deferred({
  title,
  description,
  action,
  placeholder = <Skeleton className="h-80 w-full" />,
  margin = "600px",
  children,
}: {
  title: ReactNode;
  description: string;
  /** The card's header action, where it works without the chunk (`BTimeCsvButton`). */
  action?: ReactNode;
  placeholder?: ReactNode;
  /**
   * How near the viewport the card must come before its chunk is fetched. The map passes 0 from `lg`:
   * on a desktop `/` it sits just under the fold, and 600 px fetched MapLibre and ~1.5 MB of tiles at
   * first paint (issue #72); its placeholder shows a picture of the map instead.
   */
  margin?: string;
  children: ReactNode;
}) {
  // No observer (an old browser, a test environment): draw it rather than leave a skeleton.
  const [near, setNear] = useState(() => typeof IntersectionObserver === "undefined");
  // Latched: once drawn, a card is never swapped back for its skeleton when it scrolls away.
  const { ref: slot } = useIntersectionObserver({
    rootMargin: margin,
    freezeOnceVisible: true,
    onChange: (isIntersecting) => {
      if (isIntersecting) setNear(true);
    },
  });

  const waiting = <CardContent aria-busy="true">{placeholder}</CardContent>;

  // The header is drawn here, once, and the chunk brings only what goes under it: a chart's name opens
  // its explainer (issue #145), and the drawing landing must not take an open card, or the focus, with it.
  return (
    <div ref={slot} className="h-full">
      <Card className="h-full">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
          {action ? <CardAction>{action}</CardAction> : null}
        </CardHeader>
        {near ? <Suspense fallback={waiting}>{children}</Suspense> : waiting}
      </Card>
    </div>
  );
}
