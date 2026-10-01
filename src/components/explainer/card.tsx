import { ArrowUpRightIcon } from "lucide-react";
import { type ReactNode, type RefObject, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { dicts } from "@/lib/i18n";
import { fill, Rich } from "@/lib/rich";
import type { Lang } from "@/lib/startup";
import {
  CHART_PARTS,
  type ChartEntry,
  type Entry,
  ENTRIES,
  type LinkEntry,
  publisherOf,
  type SourceEntry,
  SOURCES,
  type TermEntry,
  WORDS,
} from "./entries";
import { Explain, NestedExplainers } from "./explain";
import { Figure } from "./figures";
import { CHART_TITLE, type ChartId, type ExplainerId } from "./ids";
import type { State } from "./interaction";
import { Mark } from "./mark";

interface Props {
  id: ExplainerId;
  href: string | undefined;
  lang: Lang;
  state: State;
  /** Skip the entrance: opened from the keyboard, or right after another card. */
  instant: boolean;
  /** The word, which the card is placed under and which a press on is the word's own. */
  anchor: RefObject<HTMLElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
  onDismiss: (refocus: boolean) => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}

// The chunk arrives before any card opens (see `Explain`); the one logo comes with it.
if (typeof window !== "undefined") new Image().src = SOURCES.sgc.mark.kind === "logo" ? SOURCES.sgc.mark.src : "";

/** The domain a link goes to, for the reader to see before leaving: `www2.sgc.gov.co` is `sgc.gov.co`. */
export const domainOf = (href: string) => {
  try {
    return new URL(href).hostname.replace(/^(www\d*|earthquake)\./, "");
  } catch {
    return href;
  }
};

function title(id: ExplainerId, e: Entry, lang: Lang) {
  if (e.kind === "source") return e.name[lang];
  if (e.kind === "link") return e.title[lang];
  // A chart's name is the page's own title string, the one its word shows (`CHART_TITLE`).
  if (e.kind === "chart") return dicts[lang][CHART_TITLE[id as ChartId]];
  return e.term[lang];
}

function OpenLink({ href, entry, lang, block }: { href: string; entry: Entry; lang: Lang; block: boolean }) {
  const w = WORDS[lang];
  const text = fill(entry.kind === "link" ? w.openLink : w.openSite, { domain: domainOf(href) });
  // A destination in the other language says so, before the reader leaves.
  const note = entry.kind === "link" && entry.destLang && entry.destLang !== lang ? w.inLang[entry.destLang] : null;
  const inner = (
    <>
      {text}
      {note ? <span className="font-normal opacity-80">· {note}</span> : null}
      <ArrowUpRightIcon />
    </>
  );
  return block ? (
    <Button asChild size="default-touch" className="w-full">
      <a href={href} target="_blank" rel="noreferrer">
        {inner}
      </a>
    </Button>
  ) : (
    <Button asChild variant="link-inline" size="inline" className="self-start">
      <a href={href} target="_blank" rel="noreferrer">
        {inner}
      </a>
    </Button>
  );
}

/** Who a link's destination belongs to, as a small mark and a line. */
function Publisher({ entry, href, lang }: { entry: LinkEntry; href: string; lang: Lang }) {
  const src = publisherOf(entry.publisher);
  return (
    <p className="flex items-center gap-2 text-xs text-muted-foreground">
      <Mark mark={src.mark} size="xs" />
      <span className="min-w-0 truncate">
        {src.name[lang]} · {domainOf(href)}
      </span>
    </p>
  );
}

function SourceText({ entry, lang }: { entry: SourceEntry; lang: Lang }) {
  const w = WORDS[lang];
  return (
    <>
      <p>{entry.about[lang]}</p>
      <p className="text-muted-foreground">
        <span className="font-medium text-foreground">{w.onThisPage}</span> {entry.role[lang]}
      </p>
    </>
  );
}

function TermText({ entry, lang }: { entry: TermEntry; lang: Lang }) {
  return (
    <>
      <p>{entry.definition[lang]}</p>
      {entry.note ? <p className="text-xs text-muted-foreground">{entry.note[lang]}</p> : null}
    </>
  );
}

/**
 * A chart's paragraphs. The terms they lean on (the b-value, Mc) are explainers of their own inside the
 * card, opening their own cards over it, so they are defined once, in `TERMS`.
 */
function ChartText({ entry, lang }: { entry: ChartEntry; lang: Lang }) {
  const parts = Object.fromEntries(
    Object.entries(CHART_PARTS).map(([name, p]) => [
      name,
      "term" in p ? <Explain id={p.term}>{p.word[lang]}</Explain> : p.value,
    ]),
  );
  return (
    <NestedExplainers>
      {entry.parts.map((p) => (
        <p key={p.en}>
          <Rich text={p[lang]} parts={parts} />
        </p>
      ))}
      {entry.note ? <p className="text-xs text-muted-foreground">{entry.note[lang]}</p> : null}
    </NestedExplainers>
  );
}

/** The card beside the word, with a mouse or the keyboard: who or what, then why, then the way out. */
function CardBody({ entry, name, href, lang }: { entry: Entry; name: string; href: string | undefined; lang: Lang }) {
  const link = href ?? (entry.kind === "source" ? entry.url : undefined);
  let head: ReactNode;
  let body: ReactNode;
  if (entry.kind === "source") {
    head = (
      <div className="flex items-center gap-3">
        <Mark mark={entry.mark} size="md" />
        <div className="min-w-0">
          <p className="leading-tight font-semibold">{entry.name[lang]}</p>
          {entry.short ? <p className="text-xs text-muted-foreground">{entry.short}</p> : null}
        </div>
      </div>
    );
    body = <SourceText entry={entry} lang={lang} />;
  } else if (entry.kind === "link") {
    head = (
      <>
        {href ? <Publisher entry={entry} href={href} lang={lang} /> : null}
        <p className="leading-snug font-semibold">{entry.title[lang]}</p>
      </>
    );
    body = <p className="text-muted-foreground">{entry.summary[lang]}</p>;
  } else if (entry.kind === "chart") {
    head = <p className="font-semibold">{name}</p>;
    body = (
      <>
        <Figure id={entry.figure} lang={lang} />
        <ChartText entry={entry} lang={lang} />
      </>
    );
  } else {
    head = <p className="font-semibold">{entry.term[lang]}</p>;
    body = (
      <>
        {entry.figure ? <Figure id={entry.figure} lang={lang} /> : null}
        <TermText entry={entry} lang={lang} />
      </>
    );
  }
  return (
    <div className="flex flex-col gap-2.5">
      {head}
      {body}
      {link ? <OpenLink href={link} entry={entry} lang={lang} block={false} /> : null}
    </div>
  );
}

/** The sheet on touch: the picture first (the mark, or the drawing at its larger size), then the words. */
function SheetBody({ entry, name, href, lang }: { entry: Entry; name: string; href: string | undefined; lang: Lang }) {
  const w = WORDS[lang];
  const link = href ?? (entry.kind === "source" ? entry.url : undefined);
  const mark = entry.kind === "source" ? entry.mark : entry.kind === "link" ? publisherOf(entry.publisher).mark : null;
  const kicker =
    entry.kind === "source"
      ? entry.short
      : entry.kind === "link" && href
        ? `${domainOf(href)} · ${publisherOf(entry.publisher).name[lang]}`
        : entry.kind === "chart"
          ? w.howToRead
          : w.whatItMeans;
  const figure = entry.kind === "term" || entry.kind === "chart" ? entry.figure : undefined;
  return (
    <>
      <div className="flex min-h-32 items-center justify-center bg-muted px-4 pt-6 pb-4">
        {mark ? <Mark mark={mark} size="lg" /> : null}
        {figure ? (
          <div className="w-full max-w-md">
            <Figure id={figure} lang={lang} large />
          </div>
        ) : null}
      </div>
      <div className="flex flex-col gap-2 px-4 pt-4">
        {kicker ? <p className="text-xs tracking-wide text-muted-foreground uppercase">{kicker}</p> : null}
        <SheetTitle>{name}</SheetTitle>
        {/* Not a SheetDescription: it greys its text, and this is the card's body, not a gloss on it. */}
        <div className="flex flex-col gap-2 text-sm">
          {entry.kind === "source" ? <SourceText entry={entry} lang={lang} /> : null}
          {entry.kind === "link" ? <p className="text-muted-foreground">{entry.summary[lang]}</p> : null}
          {entry.kind === "term" ? <TermText entry={entry} lang={lang} /> : null}
          {entry.kind === "chart" ? <ChartText entry={entry} lang={lang} /> : null}
        </div>
      </div>
      <div className="p-4">{link ? <OpenLink href={link} entry={entry} lang={lang} block /> : null}</div>
    </>
  );
}

/**
 * `Explain`'s card, in its own chunk. With a mouse or the keyboard it is a floating card under the
 * word (Radix's Popover, not its HoverCard: that one ignores touch and the keyboard); on touch it is a
 * sheet from the bottom, the picture first and a button the width of the screen to leave by.
 */
export function ExplainerCard({
  id,
  href,
  lang,
  state: s,
  instant,
  anchor,
  contentRef,
  onDismiss,
  onPointerEnter,
  onPointerLeave,
}: Props) {
  const entry = ENTRIES[id] as Entry;
  const name = title(id, entry, lang);
  const w = WORDS[lang];
  const moveFocus = s.open && (s.by === "key" || s.by === "pin");

  // Enter on a term the keyboard's focus is already previewing: the card is open, so Radix will not
  // move focus on opening, and it has to go in here, or the card's link is out of the keyboard's reach.
  // Onto the card itself, so a screen reader starts at its title, not at a control halfway down.
  useEffect(() => {
    if (!moveFocus) return;
    const card = contentRef.current;
    if (!card || card.contains(document.activeElement)) return;
    card.focus();
  }, [moveFocus, contentRef]);

  // Both are always rendered, each open only on its own surface: a sheet unmounted on close would vanish
  // without leaving, and take focus with it to the top of the page.
  return (
    <>
      <Sheet open={s.open && s.surface === "sheet"} onOpenChange={(o) => !o && onDismiss(false)}>
        <SheetContent
          side="bottom"
          aria-describedby={undefined}
          closeLabel={w.close}
          layout="card"
          // Focus goes to the sheet, not its first button: a tap should not light up "Cerrar".
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            if (e.currentTarget instanceof HTMLElement) e.currentTarget.focus();
          }}
          // Back to the word it came from, without scrolling to it: where a screen reader left off.
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            onDismiss(true);
          }}
        >
          <SheetBody entry={entry} name={name} href={href} lang={lang} />
        </SheetContent>
      </Sheet>
      <Popover open={s.open && s.surface === "card"} onOpenChange={(o) => !o && onDismiss(false)}>
        <PopoverAnchor virtualRef={anchor as RefObject<HTMLElement>} />
        <PopoverContent
          ref={contentRef}
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={16}
          data-instant={instant ? "" : undefined}
          aria-label={name}
          // A chart's card says more than a term's, and is wider so that it is not as tall.
          className={entry.kind === "chart" ? "w-96" : "w-80"}
          // Opened by Enter or a click: focus onto the card itself, where a screen reader starts at its
          // title. A preview leaves focus where it is.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            if (moveFocus && e.currentTarget instanceof HTMLElement) e.currentTarget.focus();
          }}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onEscapeKeyDown={() => onDismiss(moveFocus)}
          onInteractOutside={(e) => {
            // A press on the word is the word's to handle: to Radix it is outside the card.
            if (e.target instanceof Node && anchor.current?.contains(e.target)) e.preventDefault();
          }}
          onPointerEnter={onPointerEnter}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse") onPointerLeave();
          }}
          onKeyDown={(e) => {
            // Tab out of either end goes back to the word: the card is portalled to the end of the
            // page, where the next stop would be the browser's own chrome.
            if (e.key !== "Tab") return;
            // A card opened from a word inside this one is portalled elsewhere but bubbles through here:
            // its keys are its own, or a Tab out of it closed this card too (code review).
            if (!(e.target instanceof Node && e.currentTarget.contains(e.target))) return;
            const stops = [...e.currentTarget.querySelectorAll<HTMLElement>("a[href], button, [tabindex='0']")];
            const at = document.activeElement;
            const leaving = e.shiftKey
              ? at === e.currentTarget || at === stops[0]
              : stops.length === 0 || at === stops.at(-1);
            if (leaving) {
              e.preventDefault();
              onDismiss(true);
            }
          }}
        >
          <CardBody entry={entry} name={name} href={href} lang={lang} />
        </PopoverContent>
      </Popover>
    </>
  );
}
