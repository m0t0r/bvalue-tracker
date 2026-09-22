import { Suspense, useState, type ReactNode } from "react";
import { useIntersectionObserver } from "usehooks-ts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Recharts and MapLibre are most of the JavaScript this page ships (~1.3 MB and ~1.0 MB of
 * sources), and every card that needs them is below the b-value the reader came for — the map
 * is five screens down on a phone. Loaded with the rest of the page they held the first paint
 * behind a megabyte of script and cost 1.8 s of scripting on a mid-range phone, so each card
 * asks for its chunk only once it is within 600 px of the viewport. A card already on screen
 * loads immediately, one screen after the shell has painted.
 *
 * The placeholder is the same card with the same title, so only the drawing arrives late and
 * nothing below it moves. `height` names the drawing, whose container the skeleton must match.
 */
export function Deferred({ title, height = "chart", children }: { title: string; height?: "chart" | "map"; children: ReactNode }) {
  // No observer (an old browser, a test environment): draw it rather than leave a skeleton.
  const [near, setNear] = useState(() => typeof IntersectionObserver === "undefined");
  // Latched: once drawn, a card is never swapped back for its skeleton when it scrolls away.
  const { ref: slot } = useIntersectionObserver({
    rootMargin: "600px",
    freezeOnceVisible: true,
    onChange: (isIntersecting) => { if (isIntersecting) setNear(true); },
  });

  const placeholder = (
    <Card className="h-full" aria-busy="true">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription><Skeleton className="h-4 w-full max-w-md" /></CardDescription>
      </CardHeader>
      <CardContent>
        {/* A chart's h-80, or the map's h-96 canvas plus the depth/magnitude legend under it. */}
        <Skeleton className={height === "map" ? "h-104 w-full" : "h-80 w-full"} />
      </CardContent>
    </Card>
  );

  return (
    <div ref={slot} className="h-full">
      {near ? <Suspense fallback={placeholder}>{children}</Suspense> : placeholder}
    </div>
  );
}
