/**
 * When an explainer's card opens and closes, and as what, as a pure function of what the reader did.
 * `Explain` feeds it the events and draws what it returns; the tests hold every path here.
 *
 * - **With a mouse** the card is a preview: it opens after a pause on the word and closes after the
 *   pointer leaves both the word and the card. A click on a term keeps it open ("pinned") until a
 *   click elsewhere or Escape. A click on a link follows the link, as it always did.
 * - **On touch** there is no hover, so a tap opens the sheet and the next tap closes it; on a link the
 *   tap opens the sheet instead of leaving the page, and the sheet holds the way out. A device with no
 *   hovering pointer at all (`canHover` false) is touch for every event, whatever the event says.
 * - **From the keyboard** focus shows the card, as hover does; Enter on a term opens it with focus
 *   inside, so its links are reachable. Enter on a link follows the link.
 */

/** How the card was opened, which decides how it closes and whether focus moves into it. */
export type OpenedBy = "hover" | "focus" | "pin" | "key" | "tap";

/** The card is a floating card beside the word, or a sheet from the bottom on touch. */
export type Surface = "card" | "sheet";

export type State = { open: false } | { open: true; by: OpenedBy; surface: Surface };

export const CLOSED: State = { open: false };

export type Press = "mouse" | "touch" | "key";

export type Action =
  | { type: "hover" }
  | { type: "leave" }
  | { type: "focus" }
  | { type: "blur" }
  | { type: "click"; press: Press; link: boolean }
  | { type: "dismiss" };

/** A preview goes when the pointer or the focus that opened it goes; an opening the reader asked for stays. */
const transient = (s: State) => s.open && (s.by === "hover" || s.by === "focus");

/**
 * The next state, and whether a click must be cancelled (`preventDefault`): a tap on a link opens its
 * card rather than following it.
 *
 * `canHover` is whether the device has a pointer that can hover at all (`Explain` reads it from
 * `(any-hover: hover)`). Without one, a phone, the card does not exist: nothing previews, and a press
 * of any kind (a tap, a screen reader's activation, an event that claims to be a mouse's) opens the
 * sheet. The kind of the event is not to be trusted on such a device, the device is.
 */
export function next(s: State, a: Action, canHover = true): { state: State; cancel: boolean } {
  const keep = { state: s, cancel: false };
  switch (a.type) {
    case "hover":
      return s.open || !canHover ? keep : { state: { open: true, by: "hover", surface: "card" }, cancel: false };
    case "focus":
      return s.open || !canHover ? keep : { state: { open: true, by: "focus", surface: "card" }, cancel: false };
    case "leave":
    case "blur":
      return transient(s) ? { state: CLOSED, cancel: false } : keep;
    case "dismiss":
      return { state: CLOSED, cancel: false };
    case "click": {
      if (a.press === "touch" || !canHover) {
        // A tap toggles, on a link as on a term. A phone that focuses what it taps has opened a
        // preview on focus by the time the click arrives: that is not an opening the reader saw.
        const shown = s.open && s.surface === "sheet";
        return { state: shown ? CLOSED : { open: true, by: "tap", surface: "sheet" }, cancel: true };
      }
      if (a.link) return keep;
      if (a.press === "key") {
        // Enter on a term: open with focus inside, or close what Enter opened.
        return s.open && s.by === "key"
          ? { state: CLOSED, cancel: true }
          : { state: { open: true, by: "key", surface: "card" }, cancel: true };
      }
      // A mouse click pins what the hover opened, and a second click lets it go.
      return s.open && s.by === "pin"
        ? { state: CLOSED, cancel: true }
        : { state: { open: true, by: "pin", surface: "card" }, cancel: true };
    }
  }
}

/** The pause before a hover opens a card, so a pointer crossing a paragraph opens nothing. */
export const HOVER_DELAY_MS = 350;
/** How long the pointer has to travel from the word into the card before it closes. */
export const LEAVE_GRACE_MS = 250;
/** A card opened this soon after another closed opens at once, and without its entrance. */
export const WARM_MS = 500;

/** Whether a card opening at `now` follows another closely enough to skip the pause and the entrance. */
export const isWarm = (lastClosedAt: number, now: number) => now - lastClosedAt < WARM_MS;
