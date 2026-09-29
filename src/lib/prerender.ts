/**
 * Chrome may load and run a page before the reader opens it (`public/speculation-rules.json`): it
 * prerenders the page a link points to from the moment the link is pressed, and the reader may still
 * slide off it. Such a page may read, but must not reach SGC until it is opened: `postRefresh` waits
 * for `whenActivated`, and the monitor's return-to-the-tab refresh does not count the opening as a
 * return (`useReturnToTab`).
 */
import { focusManager } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef } from "react";

// `prerendering` is missing from TypeScript's DOM types. Absent (Safari, Firefox) means never prerendered.
const prerendering = () => (document as { prerendering?: boolean }).prerendering === true;

/** Settled at once on an ordinary load; on a prerendered page, once the reader opens it. */
export function whenActivated(): Promise<void> {
  if (!prerendering()) return Promise.resolve();
  return new Promise((resolve) => document.addEventListener("prerenderingchange", () => resolve(), { once: true }));
}

/**
 * Calls `onReturn` when the reader comes back to the tab: shown again after being hidden, as TanStack
 * Query's focus signal reports it. Showing for the first time is not a return. That matters for a
 * prerendered page, which is hidden until opened: the library reports the opening as focus, and it is
 * the reader's first look, like a load. Counted from a hide the hook saw, rather than from
 * `prerenderingchange`, so the order Chrome sends the two in makes no difference.
 */
export function useReturnToTab(onReturn: () => void): void {
  const latest = useRef(onReturn);
  useLayoutEffect(() => {
    latest.current = onReturn;
  });
  // One subscription for the component's life, so a hide seen before a re-render still counts after it.
  useEffect(() => {
    let hidden = false;
    return focusManager.subscribe((focused) => {
      if (!focused) hidden = true;
      else if (hidden) {
        hidden = false;
        latest.current();
      }
    });
  }, []);
}
