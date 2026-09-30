// PROTOTYPE (issue #144): throwaway. The lazy chunk: the card's content and the three variants.
//   A  "Hover card"   a compact floating card under the word, on every device.
//   B  "Preview"      media first, like a link unfurl; a floating card with a mouse, a bottom sheet on touch.
//   C  "Inline"       no floating layer: the card opens in the text, under the paragraph.
import { ArrowUpRightIcon, XIcon } from "lucide-react";
import { useEffect, useState, type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";
import { Popover as P } from "radix-ui";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { Lang } from "@/lib/startup";
import { CARD_COPY, ENTRIES, type Entry, type EntryId } from "./entries.prototype";
import { BValueFigure, SwarmFigure } from "./figures.prototype";

export type OpenedBy = "hover" | "focus" | "tap" | "click" | "key";
export type Variant = "A" | "B" | "C";

export interface LayerProps {
  id: EntryId;
  variant: Variant;
  lang: Lang;
  open: boolean;
  openedBy: OpenedBy;
  anchor: HTMLElement;
  onClose: (refocus: boolean) => void;
  onContentEnter: () => void;
  onContentLeave: () => void;
  contentRef: Ref<HTMLDivElement>;
}

const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? "");

function Figure({ entry, lang, large }: { entry: Extract<Entry, { kind: "term" }>; lang: Lang; large?: boolean }) {
  return entry.figure === "b-value" ? <BValueFigure lang={lang} large={large} /> : <SwarmFigure lang={lang} large={large} />;
}

function Logo({ src, ratio, h }: { src: string; ratio: number; h: number }) {
  return <img src={src} alt="" width={Math.round(h * ratio)} height={h} className="shrink-0 dark:rounded-sm dark:bg-white dark:p-0.5" />;
}

function OpenLink({ entry, lang, block }: { entry: Entry; lang: Lang; block?: boolean }) {
  if (entry.kind === "term") return null;
  const k = CARD_COPY[lang];
  const text = entry.kind === "article" ? k.openArticle : fill(k.open, { domain: entry.domain });
  const note = entry.kind === "article" && entry.titleLang !== lang ? k.inSpanish : "";
  return block ? (
    <Button asChild size="default-touch" className="w-full">
      <a href={entry.url} target="_blank" rel="noreferrer">
        {text}
        {note ? <span className="font-normal opacity-80">· {note}</span> : null}
        <ArrowUpRightIcon />
      </a>
    </Button>
  ) : (
    <a
      href={entry.url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-sm font-medium underline underline-offset-4"
    >
      {text}
      {note ? <span className="font-normal text-muted-foreground">· {note}</span> : null}
      <ArrowUpRightIcon className="size-4" />
    </a>
  );
}

// ---------------------------------------------------------------------------------------------
// A: compact card. Identity row, text, figure, link.

function CompactBody({ entry, lang, noFigure }: { entry: Entry; lang: Lang; noFigure?: boolean }) {
  const k = CARD_COPY[lang];
  if (entry.kind === "authority")
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <Logo src={entry.logo} ratio={entry.logoRatio} h={32} />
          <div className="min-w-0">
            <p className="leading-tight font-semibold">{entry.name[lang]}</p>
            <p className="text-xs text-muted-foreground">
              {entry.short} · {entry.domain}
            </p>
          </div>
        </div>
        <p className="text-sm">{entry.about[lang]}</p>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{k.onThisPage}:</span> {entry.role[lang]}
        </p>
        <OpenLink entry={entry} lang={lang} />
      </div>
    );
  if (entry.kind === "article")
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Logo src={entry.logo} ratio={entry.logoRatio} h={18} />
          <span className="truncate">
            {entry.publisher[lang]} · {entry.domain}
          </span>
        </div>
        <p lang={entry.titleLang} className="leading-snug font-semibold">
          {entry.title}
        </p>
        <p className="text-sm text-muted-foreground">{entry.summary[lang]}</p>
        <OpenLink entry={entry} lang={lang} />
      </div>
    );
  return (
    <div className="flex flex-col gap-2">
      <p className="font-semibold">{entry.term[lang]}</p>
      {noFigure ? null : <Figure entry={entry} lang={lang} />}
      <p className="text-sm">{entry.definition[lang]}</p>
      {entry.caveat ? <p className="text-xs text-muted-foreground">{entry.caveat[lang]}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// B: media first. A band of picture on top (logo, a thumbnail, or the animation), then the words.

function MediaBody({ entry, lang, large }: { entry: Entry; lang: Lang; large?: boolean }) {
  const k = CARD_COPY[lang];
  const media =
    entry.kind === "term" ? (
      <div className="bg-muted/60 px-4 pt-4 pb-2">
        <Figure entry={entry} lang={lang} large={large} />
      </div>
    ) : (
      <div className="flex h-32 items-center justify-center bg-muted/60">
        <div className="rounded-lg bg-white p-3 shadow-sm">
          <Logo src={entry.logo} ratio={entry.logoRatio} h={large ? 56 : 44} />
        </div>
      </div>
    );
  return (
    <div className="flex flex-col">
      {media}
      <div className="flex flex-col gap-2 p-4">
        {entry.kind === "authority" ? (
          <>
            <p className="text-xs tracking-wide text-muted-foreground uppercase">{entry.domain}</p>
            <p className="text-base leading-tight font-semibold">
              {entry.name[lang]} ({entry.short})
            </p>
            <p className="text-sm">{entry.about[lang]}</p>
            <p className="text-sm text-muted-foreground">{entry.role[lang]}</p>
          </>
        ) : entry.kind === "article" ? (
          <>
            <p className="text-xs tracking-wide text-muted-foreground uppercase">
              {entry.domain} · {entry.publisher[lang]}
            </p>
            <p lang={entry.titleLang} className="text-base leading-snug font-semibold">
              {entry.title}
            </p>
            <p className="text-sm text-muted-foreground">{entry.summary[lang]}</p>
          </>
        ) : (
          <>
            <p className="text-xs tracking-wide text-muted-foreground uppercase">{k.about}</p>
            <p className="text-base font-semibold">{entry.term[lang]}</p>
            <p className="text-sm">{entry.definition[lang]}</p>
            {entry.caveat ? <p className="text-xs text-muted-foreground">{entry.caveat[lang]}</p> : null}
          </>
        )}
        {entry.kind !== "term" ? (
          <div className="pt-2">
            <OpenLink entry={entry} lang={lang} block />
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function Floating({ p, className, children }: { p: LayerProps; className: string; children: ReactNode }) {
  const moveFocus = p.openedBy === "key" || p.openedBy === "tap";
  return (
    <P.Root open={p.open} onOpenChange={(o) => !o && p.onClose(false)} modal={false}>
      <P.Anchor virtualRef={{ current: p.anchor }} />
      <P.Portal>
        <P.Content
          ref={p.contentRef}
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={16}
          onOpenAutoFocus={(e) => {
            if (!moveFocus) e.preventDefault();
          }}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onEscapeKeyDown={() => p.onClose(true)}
          onInteractOutside={(e) => {
            if (e.target instanceof Node && p.anchor.contains(e.target)) e.preventDefault();
          }}
          onPointerEnter={p.onContentEnter}
          onPointerLeave={p.onContentLeave}
          aria-label={title(p)}
          className={cn(
            "z-50 max-w-(--radix-popover-content-available-width) origin-(--radix-popover-content-transform-origin) overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg outline-hidden",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:motion-safe:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
            className,
          )}
        >
          {children}
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}

function title(p: LayerProps) {
  const e = ENTRIES[p.id] as Entry;
  return e.kind === "authority" ? e.name[p.lang] : e.kind === "article" ? e.title : e.term[p.lang];
}

function VariantA(p: LayerProps) {
  return (
    <Floating p={p} className="w-80 p-4">
      <CompactBody entry={ENTRIES[p.id] as Entry} lang={p.lang} />
    </Floating>
  );
}

function VariantB(p: LayerProps) {
  const [touch] = useState(() => p.openedBy === "tap");
  const entry = ENTRIES[p.id] as Entry;
  if (touch)
    return (
      <Sheet open={p.open} onOpenChange={(o) => !o && p.onClose(false)}>
        <SheetContent side="bottom" className="max-h-[85svh] gap-0 overflow-y-auto rounded-t-2xl p-0">
          <SheetTitle className="sr-only">{title(p)}</SheetTitle>
          <SheetDescription className="sr-only">{title(p)}</SheetDescription>
          <MediaBody entry={entry} lang={p.lang} large />
        </SheetContent>
      </Sheet>
    );
  return (
    <Floating p={p} className="w-[22rem]">
      <MediaBody entry={entry} lang={p.lang} />
    </Floating>
  );
}

/** The paragraph (or card header) the term sits in: the inline card opens right after it. */
const hostOf = (el: HTMLElement) => el.closest<HTMLElement>("p, [data-slot=card-header], li") ?? el.parentElement!;

function VariantC(p: LayerProps) {
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!p.open) return;
    const div = document.createElement("div");
    hostOf(p.anchor).insertAdjacentElement("afterend", div);
    setSlot(div);
    return () => {
      div.remove();
      setSlot(null);
    };
  }, [p.open, p.anchor]);
  if (!p.open || !slot) return null;
  const entry = ENTRIES[p.id] as Entry;
  const k = CARD_COPY[p.lang];
  return createPortal(
    <section
      ref={p.contentRef}
      aria-label={title(p)}
      className="relative my-3 rounded-lg border-l-4 border-l-chart-1 bg-muted/50 p-4 pr-10 text-left motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1"
    >
      <Button
        variant="ghost"
        size="icon-sm"
        className="absolute top-2 right-2"
        aria-label={k.close}
        onClick={() => p.onClose(true)}
      >
        <XIcon />
      </Button>
      <div className="flex flex-col gap-4 sm:flex-row">
        {entry.kind === "term" ? (
          <div className="sm:w-1/2">
            <Figure entry={entry} lang={p.lang} />
          </div>
        ) : null}
        <div className={cn("min-w-0", entry.kind === "term" && "sm:w-1/2")}>
          <CompactBody entry={entry} lang={p.lang} noFigure />
        </div>
      </div>
    </section>,
    slot,
  );
}

export function Layer(p: LayerProps) {
  return p.variant === "B" ? <VariantB {...p} /> : p.variant === "C" ? <VariantC {...p} /> : <VariantA {...p} />;
}
