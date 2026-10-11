/**
 * Chrome may load and run a page before the reader opens it (`public/speculation-rules.json`): it
 * prerenders the page a link points to from the moment the link is pressed, and the reader may still
 * slide off it. Such a page may read, but must not reach SGC until it is opened: `postRefresh` waits
 * for `whenActivated`. Nothing on the page reaches SGC unless the reader presses "Sincronizar ahora",
 * so this is the second guard, for a caller added later.
 */

// `prerendering` is missing from TypeScript's DOM types. Absent (Safari, Firefox) means never prerendered.
const prerendering = () => (document as { prerendering?: boolean }).prerendering === true;

/** Settled at once on an ordinary load; on a prerendered page, once the reader opens it. */
export function whenActivated(): Promise<void> {
  if (!prerendering()) return Promise.resolve();
  return new Promise((resolve) => document.addEventListener("prerenderingchange", () => resolve(), { once: true }));
}
