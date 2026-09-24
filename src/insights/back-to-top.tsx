import { ArrowUpIcon } from "lucide-react";
import { useEffect, useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { useReducedMotion } from "./use-reduced-motion";

/**
 * A round button that takes the reader back to the top, shown only once they are near the end of
 * the tab. Both tabs run to many screens, and on a phone the story's drawing is pinned over half
 * of the window, so a button there for the whole read would sit on the text the whole time.
 *
 * One `IntersectionObserver` on `end`, the element after the content (the footer), decides it,
 * with nothing running on a scroll frame: "near" is within half a window of it, or past its top.
 * `tabs` is the tab list, whose selected tab takes focus once the page is back at the top, so a
 * keyboard reader lands where they can switch to the other tab. Render it just before `end`, so it
 * comes after the content in the tab order; being fixed, it takes no room in the flow.
 */
export function BackToTop({
  label,
  tabs,
  end,
}: {
  label: string;
  tabs: RefObject<HTMLElement | null>;
  end: RefObject<HTMLElement | null>;
}) {
  const [shown, setShown] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = end.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        // Never at the very top, where a page too short to scroll would show it for nothing.
        setShown((entry.isIntersecting || entry.boundingClientRect.top <= 0) && window.scrollY > 0);
      },
      { rootMargin: "0px 0px 50% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [end]);

  const toTop = () => {
    tabs.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: reduced ? "instant" : "smooth" });
  };

  return (
    // Hidden is `inert`, so it leaves the tab order and the accessibility tree as well as the screen.
    <div
      data-shown={shown || undefined}
      inert={!shown}
      className="rise fixed right-4 bottom-4 z-20 sm:right-6 sm:bottom-6"
    >
      <Button variant="floating" size="icon-round" aria-label={label} onClick={toTop}>
        {/* Two arrows, one a circle below the other. On hover both rise by the circle's height:
              the first leaves through the top edge and the second takes its place. */}
        <span className="absolute inset-0 flex items-center justify-center transition-transform duration-300 ease-(--ease-slide) group-hover/button:-translate-y-full motion-reduce:transition-none">
          <ArrowUpIcon className="size-5" />
        </span>
        <span
          aria-hidden
          className="absolute inset-0 flex translate-y-full items-center justify-center transition-transform duration-300 ease-(--ease-slide) group-hover/button:translate-y-0 motion-reduce:transition-none"
        >
          <ArrowUpIcon className="size-5" />
        </span>
      </Button>
    </div>
  );
}
