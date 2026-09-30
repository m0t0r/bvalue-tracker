// PROTOTYPE (issue #144): throwaway. Three card variants, switchable with ?variant=A|B|C and the bar
// at the bottom (built with VITE_PROTOTYPE=1), on the real pages: /insights "¿Cuánto duró?" and
// Chaparral steps, and the monitor's b card.
//
// This file is all that is in the first chunk: the word and its handlers. The card, Radix's Popover
// and the animations are one chunk loaded on the first hover, focus or press.
import { type ComponentType, type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "cn";
import { useI18n } from "@/lib/i18n";
import type { EntryId } from "./entries.prototype";
import type { LayerProps, OpenedBy, Variant } from "./layer.prototype";

type LayerT = ComponentType<LayerProps>;
let loading: Promise<LayerT> | undefined;
const loadLayer = () => (loading ??= import("./layer.prototype").then((m) => m.Layer));

// The variant lives in the URL; the bar changes it without a reload.
const VARIANT_EVENT = "prototype-variant";
const readVariant = (): Variant => {
  const v = new URLSearchParams(location.search).get("variant");
  return v === "B" || v === "C" ? v : "A";
};
const useVariant = () =>
  useSyncExternalStore(
    (cb) => {
      window.addEventListener(VARIANT_EVENT, cb);
      window.addEventListener("popstate", cb);
      return () => {
        window.removeEventListener(VARIANT_EVENT, cb);
        window.removeEventListener("popstate", cb);
      };
    },
    readVariant,
    () => "A" as Variant,
  );

if (import.meta.env.VITE_PROTOTYPE && typeof window !== "undefined") {
  void import("./switcher.prototype").then((m) => m.mountSwitcher(VARIANT_EVENT));
}

const HOVER_OPEN_MS = 350;
const HOVER_CLOSE_MS = 250;

interface Props {
  id: EntryId;
  /** A link: the card previews where it goes. Without, the word is a button that explains itself. */
  href?: string;
  children: ReactNode;
}

export function Explain({ id, href, children }: Props) {
  const { lang } = useI18n();
  const variant = useVariant();
  const [Layer, setLayer] = useState<LayerT>();
  const [open, setOpen] = useState(false);
  const [openedBy, setOpenedBy] = useState<OpenedBy>("hover");
  const el = useRef<HTMLElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const timer = useRef<number>(undefined);
  const touchPress = useRef(false);

  const clear = () => window.clearTimeout(timer.current);
  const later = (ms: number, f: () => void) => {
    clear();
    timer.current = window.setTimeout(f, ms);
  };
  const ensure = () =>
    loadLayer().then(
      (l) => {
        setLayer(() => l);
        return true;
      },
      () => false,
    );
  const show = (by: OpenedBy) => {
    void ensure().then((ok) => {
      if (!ok) return;
      setOpenedBy(by);
      setOpen(true);
    });
  };
  const hide = (refocus: boolean) => {
    clear();
    setOpen(false);
    if (refocus) el.current?.focus();
  };

  useEffect(() => clear, []);

  const hoverable = variant !== "C";
  const handlers = {
    onPointerEnter: (e: React.PointerEvent) => {
      if (e.pointerType !== "mouse" || !hoverable) return;
      void ensure();
      if (!open) later(HOVER_OPEN_MS, () => show("hover"));
      else clear();
    },
    onPointerLeave: (e: React.PointerEvent) => {
      if (e.pointerType !== "mouse" || !hoverable) return;
      if (!open) clear();
      else if (openedBy === "hover" || openedBy === "focus") later(HOVER_CLOSE_MS, () => setOpen(false));
    },
    onPointerDown: (e: React.PointerEvent) => {
      touchPress.current = e.pointerType !== "mouse";
      void ensure();
    },
    onFocus: (e: React.FocusEvent) => {
      if (!hoverable || !(e.target as HTMLElement).matches(":focus-visible") || open) return;
      show("focus");
    },
    onBlur: (e: React.FocusEvent) => {
      if (content.current?.contains(e.relatedTarget as Node)) return;
      if (openedBy === "focus") setOpen(false);
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        e.stopPropagation();
        hide(false);
      }
    },
    onClick: (e: React.MouseEvent) => {
      const keyboard = e.detail === 0;
      const touch = !keyboard && touchPress.current;
      touchPress.current = false;
      // A link with a mouse or the keyboard goes where it says; the card was its preview.
      if (href && !touch && variant !== "C") return;
      if (href && !touch && variant === "C" && !keyboard) return;
      e.preventDefault();
      clear();
      if (open && (openedBy === "tap" || openedBy === "click" || openedBy === "key" || touch)) hide(false);
      else show(keyboard ? "key" : touch ? "tap" : "click");
    },
  };

  const word = "underline underline-offset-4";
  const trigger = href ? (
    <a
      ref={el as React.RefObject<HTMLAnchorElement>}
      href={href}
      target="_blank"
      rel="noreferrer"
      className={word}
      aria-expanded={variant === "C" ? open : undefined}
      {...handlers}
    >
      {children}
    </a>
  ) : (
    <button
      ref={el as React.RefObject<HTMLButtonElement>}
      type="button"
      aria-expanded={open}
      aria-haspopup={variant === "C" ? undefined : "dialog"}
      className={cn(
        word,
        "inline cursor-help rounded-xs decoration-muted-foreground decoration-dotted decoration-from-font hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        open && "decoration-foreground",
      )}
      {...handlers}
    >
      {children}
    </button>
  );

  return (
    <>
      {trigger}
      {Layer && el.current ? (
        <Layer
          id={id}
          variant={variant}
          lang={lang}
          open={open}
          openedBy={openedBy}
          anchor={el.current}
          onClose={hide}
          onContentEnter={clear}
          onContentLeave={() => {
            if (openedBy === "hover" || openedBy === "focus") later(HOVER_CLOSE_MS, () => setOpen(false));
          }}
          contentRef={content}
        />
      ) : null}
    </>
  );
}
