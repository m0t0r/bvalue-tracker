import { type ReactNode, useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { ExplainerCard } from "./card";
import type { ExplainerId, LinkId } from "./ids";
import {
  type Action,
  CLOSED,
  HOVER_DELAY_MS,
  LEAVE_GRACE_MS,
  type Press,
  type State,
  isWarm,
  next,
} from "./interaction";

type Card = typeof ExplainerCard;

// One fetch for every explainer on the page: the card, Radix's Popover and Dialog and the drawings are
// a chunk neither page loads at startup. It is started by the reader's first scroll, pointer move,
// press or key once the page has loaded (`preloadOnActivity`), so a tap on a word rarely waits for it;
// or by the first hover, focus or press on an explainer itself. Not on idle after `load`: that fires
// before the catalogue has arrived, and on a slow phone the chunk took bandwidth from it, /insights'
// LCP 120 ms later in every run (docs/performance.md).
//
// The card, once here, is every word's at once (`loaded`), so a word first used afterwards draws it in
// the same render. A failed download is final for the page: the browser keeps a failed module for the
// document's life, and a second `import()` rejects without a request (checked in Chrome 154, offline
// then back online: no second request for the chunk). A reload brings the cards back; until then a link
// is a plain link and a term a plain word.
let loading: Promise<Card> | undefined;
let loaded: Card | undefined;
let failed = false;
const loadCard = () =>
  (loading ??= import("./card").then(
    (m) => (loaded = m.ExplainerCard),
    (e: unknown) => {
      failed = true;
      throw e;
    },
  ));

let preloading = false;
const ACTIVITY = ["scroll", "pointermove", "pointerdown", "keydown", "touchstart"] as const;
function preloadOnActivity() {
  if (preloading) return;
  preloading = true;
  const go = () => {
    for (const e of ACTIVITY) window.removeEventListener(e, go, true);
    void loadCard().catch(() => {});
  };
  const listen = () => {
    for (const e of ACTIVITY) window.addEventListener(e, go, { capture: true, passive: true });
  };
  if (document.readyState === "complete") listen();
  else window.addEventListener("load", listen, { once: true });
}

// Whether any pointer of the device can hover: a phone's cannot, a laptop's or an iPad with a trackpad
// can. Read at each event, so a mouse plugged in later counts. Where nothing can hover the card does
// not exist and every opening is the sheet, whatever pointer type an event claims (`interaction.ts`,
// docs/frontend.md). Without `matchMedia`, as in a test, the device is taken for a desktop.
const canHover = () => typeof window === "undefined" || (window.matchMedia?.("(any-hover: hover)").matches ?? true);

// How many cards are open, and when the last one closed: a card opened while another is open, or
// right after, skips the pause and the entrance, so reading along a paragraph is not slowed down.
let openCards = 0;
let lastClosedAt = Number.NEGATIVE_INFINITY;
const warm = () => openCards > 0 || isWarm(lastClosedAt, performance.now());

/**
 * A link's explainer always has its address (the card previews where it goes); a source or a term may
 * be a link to its own site, or a word that explains itself.
 */
type Target = { id: LinkId; href: string } | { id: Exclude<ExplainerId, LinkId>; href?: string };

type Props = Target & {
  /** A link's own look, where the page's links differ from the story's (the questions tab's). */
  linkClassName?: string;
  children: ReactNode;
};

/**
 * A word that explains itself in a card: a source (who they are, what this page takes from them), a
 * link (where it goes), or a term (what it means, drawn where a drawing helps). With a mouse the card
 * opens on a pause over the word, on touch on a tap, from the keyboard on focus; `interaction.ts`
 * has the rules.
 *
 * The word is drawn at once and looks the same before and after the card's chunk arrives, so the
 * static header can hold one. If the chunk never arrives, a link is a plain link and a term a plain
 * word: the sentence around it already says what the card would.
 */
export function Explain({ id, href, linkClassName = "underline underline-offset-4", children }: Props) {
  const { lang } = useI18n();
  const [Card, setCard] = useState<Card | undefined>(() => loaded);
  const [state, setState] = useState<State>(CLOSED);
  const [instant, setInstant] = useState(false);
  const word = useRef<HTMLElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const timer = useRef<number>(undefined);
  const press = useRef<Press | null>(null);
  // The state as of the last dispatch, for a timer that fires after renders have moved on.
  const current = useRef(state);
  // Focus that `dismiss` hands back to the word: it closes a card, it must not open one as a preview.
  const refocusing = useRef(false);

  const wait = (ms: number, f: () => void) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(f, ms);
  };
  const cancelWait = () => window.clearTimeout(timer.current);

  const apply = (to: State) => {
    const from = current.current;
    if (from.open && !to.open) {
      openCards -= 1;
      lastClosedAt = performance.now();
    }
    if (!from.open && to.open) {
      setInstant(to.by === "focus" || to.by === "key" || warm());
      openCards += 1;
    }
    current.current = to;
    setState(to);
  };
  const dispatch = (a: Action, hover = canHover()) => {
    const r = next(current.current, a, hover);
    if (r.state !== current.current) apply(r.state);
    return r.cancel;
  };
  const load = () => {
    if (Card) return;
    if (loaded) return setCard(() => loaded);
    loadCard().then(
      (c) => setCard(() => c),
      () => {
        if (current.current.open) apply(CLOSED);
      },
    );
  };

  useEffect(() => {
    preloadOnActivity();
    return () => {
      cancelWait();
      // A word that goes while its card is open (a refetch changed the sentence) still closes it.
      if (current.current.open) {
        openCards -= 1;
        lastClosedAt = performance.now();
      }
    };
  }, []);

  const dismiss = (refocus: boolean) => {
    cancelWait();
    dispatch({ type: "dismiss" });
    if (refocus) {
      refocusing.current = true;
      word.current?.focus({ preventScroll: true });
      refocusing.current = false;
    }
  };
  const leaveSoon = () => wait(LEAVE_GRACE_MS, () => dispatch({ type: "leave" }));

  const handlers = {
    onPointerEnter: (e: React.PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      load();
      // After a failed download there is no card to preview; on a device that cannot hover, never.
      if (failed || !canHover()) return;
      if (current.current.open) return cancelWait();
      // Checked again when the pause is over: the download can fail during it.
      wait(warm() ? 0 : HOVER_DELAY_MS, () => {
        if (!failed) dispatch({ type: "hover" });
      });
    },
    onPointerLeave: (e: React.PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      if (current.current.open) leaveSoon();
      else cancelWait();
    },
    onPointerDown: (e: React.PointerEvent) => {
      press.current = e.pointerType === "mouse" ? "mouse" : "touch";
      load();
    },
    // A press that became a scroll never clicks; it must not decide a later click.
    onPointerCancel: () => {
      press.current = null;
    },
    onFocus: (e: React.FocusEvent<HTMLElement>) => {
      load();
      if (failed || refocusing.current) return;
      // Focus from a press is the press's to handle; only the keyboard's focus previews.
      if (e.currentTarget.matches(":focus-visible")) dispatch({ type: "focus" });
    },
    onBlur: (e: React.FocusEvent) => {
      if (e.relatedTarget instanceof Node && card.current?.contains(e.relatedTarget)) return;
      dispatch({ type: "blur" });
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key !== "Escape" || !current.current.open) return;
      e.stopPropagation();
      dismiss(false);
    },
    onClick: (e: React.MouseEvent) => {
      // `detail` is 0 for a click from the keyboard, whatever press came before it.
      const how: Press = e.detail === 0 ? "key" : (press.current ?? "mouse");
      press.current = null;
      if (activate(how)) e.preventDefault();
    },
  };
  // A term is a `span` with the button role, not a `<button>`, which stays one box and cannot wrap
  // inside a sentence ("magnitud de completitud" at 320 px). So it answers the keys a button does:
  // Enter on the press, Space on the release, as a native button.
  const termKeys = {
    onKeyDown: (e: React.KeyboardEvent) => {
      handlers.onKeyDown(e);
      if (e.key === "Enter" && !e.repeat) {
        e.preventDefault();
        activate("key");
      } else if (e.key === " ") e.preventDefault();
    },
    onKeyUp: (e: React.KeyboardEvent) => {
      if (e.key === " ") activate("key");
    },
  };
  function activate(pressed: Press) {
    // No card: a link is followed and a term is a word.
    if (failed) return false;
    // With nothing that can hover, every press is a tap. Read once, for this check and for `next`.
    const hover = canHover();
    const how = hover ? pressed : "touch";
    // A second tap while the card is still on its way would close what the reader has not seen yet.
    // Not a link's click or Enter, which always go where the link says.
    if (!Card && current.current.open && (how === "touch" || href === undefined)) return true;
    load();
    cancelWait();
    return dispatch({ type: "click", press: how, link: href !== undefined }, hover);
  }

  const open = state.open;
  // Opened, and waiting for the chunk: only on a slow connection, with nothing done before the press.
  // The word pulses, so a tap is seen to have registered.
  const pending = open && !Card;
  const busy = {
    "aria-busy": pending || undefined,
    "data-pending": pending ? "" : undefined,
  };
  const trigger = href ? (
    <a
      ref={word as React.RefObject<HTMLAnchorElement>}
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`${linkClassName} data-pending:motion-safe:animate-pulse`}
      {...busy}
      {...handlers}
    >
      {children}
    </a>
  ) : (
    <span
      ref={word as React.RefObject<HTMLSpanElement>}
      role="button"
      tabIndex={0}
      aria-expanded={open}
      aria-haspopup="dialog"
      className="cursor-help rounded-xs underline decoration-muted-foreground decoration-dotted underline-offset-4 outline-ring hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 aria-expanded:decoration-foreground data-pending:motion-safe:animate-pulse"
      {...busy}
      {...handlers}
      {...termKeys}
    >
      {children}
    </span>
  );

  return (
    <>
      {trigger}
      {Card ? (
        <Card
          id={id}
          href={href}
          lang={lang}
          state={state}
          instant={instant}
          anchor={word}
          contentRef={card}
          onDismiss={dismiss}
          onPointerEnter={cancelWait}
          onPointerLeave={() => {
            if (current.current.open) leaveSoon();
          }}
        />
      ) : null}
    </>
  );
}
