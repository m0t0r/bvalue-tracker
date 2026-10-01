import { describe, expect, it } from "vitest";
import { type Action, CLOSED, isWarm, next, type State, WARM_MS } from "./interaction";

const hover: State = { open: true, by: "hover", surface: "card" };
const focus: State = { open: true, by: "focus", surface: "card" };
const pinned: State = { open: true, by: "pin", surface: "card" };
const key: State = { open: true, by: "key", surface: "card" };
const sheet: State = { open: true, by: "tap", surface: "sheet" };

describe("an explainer with a mouse", () => {
  it("opens a preview on hover and closes it when the pointer leaves", () => {
    expect(next(CLOSED, { type: "hover" }).state).toEqual(hover);
    expect(next(hover, { type: "leave" }).state).toEqual(CLOSED);
  });

  it("pins a term's preview on a click, which leaving then does not close, and a second click lets go", () => {
    const r = next(hover, { type: "click", press: "mouse", link: false });
    expect(r).toEqual({ state: pinned, cancel: true });
    expect(next(pinned, { type: "leave" }).state).toEqual(pinned);
    expect(next(pinned, { type: "click", press: "mouse", link: false }).state).toEqual(CLOSED);
  });

  it("follows a link on a click, as a link always did", () => {
    expect(next(hover, { type: "click", press: "mouse", link: true })).toEqual({ state: hover, cancel: false });
    expect(next(CLOSED, { type: "click", press: "mouse", link: true })).toEqual({ state: CLOSED, cancel: false });
  });
});

describe("an explainer on touch", () => {
  it("opens the sheet on a tap instead of following a link, and closes it on the next", () => {
    expect(next(CLOSED, { type: "click", press: "touch", link: true })).toEqual({ state: sheet, cancel: true });
    expect(next(sheet, { type: "click", press: "touch", link: true })).toEqual({ state: CLOSED, cancel: true });
  });

  it("opens the sheet on a phone that focused the word first, whose focus preview is not what was tapped", () => {
    expect(next(focus, { type: "click", press: "touch", link: false }).state).toEqual(sheet);
  });
});

describe("an explainer from the keyboard", () => {
  it("previews on focus and closes the preview on blur", () => {
    expect(next(CLOSED, { type: "focus" }).state).toEqual(focus);
    expect(next(focus, { type: "blur" }).state).toEqual(CLOSED);
  });

  it("opens a term with Enter, focus inside, and closes it with the next Enter", () => {
    expect(next(focus, { type: "click", press: "key", link: false })).toEqual({ state: key, cancel: true });
    expect(next(key, { type: "click", press: "key", link: false }).state).toEqual(CLOSED);
  });

  it("keeps what Enter opened when focus moves into the card", () => {
    expect(next(key, { type: "blur" }).state).toEqual(key);
  });

  it("follows a link on Enter", () => {
    expect(next(focus, { type: "click", press: "key", link: true })).toEqual({ state: focus, cancel: false });
  });
});

describe("an explainer on a device that cannot hover", () => {
  const noHover = (s: State, a: Action) => next(s, a, false);

  it("never previews on a pointer's hover or on focus, whatever pointer type the event claims", () => {
    expect(noHover(CLOSED, { type: "hover" })).toEqual({ state: CLOSED, cancel: false });
    expect(noHover(CLOSED, { type: "focus" })).toEqual({ state: CLOSED, cancel: false });
  });

  it("opens the sheet for every kind of press, on a term and on a link, never the card", () => {
    for (const press of ["mouse", "touch", "key"] as const) {
      for (const link of [false, true]) {
        expect(noHover(CLOSED, { type: "click", press, link })).toEqual({ state: sheet, cancel: true });
      }
    }
  });

  it("closes the sheet on the next press, of any kind", () => {
    for (const press of ["mouse", "touch", "key"] as const) {
      expect(noHover(sheet, { type: "click", press, link: false })).toEqual({ state: CLOSED, cancel: true });
    }
  });
});

describe("closing", () => {
  it("closes any card on dismiss (Escape, a press outside)", () => {
    for (const s of [hover, focus, pinned, key, sheet]) expect(next(s, { type: "dismiss" }).state).toEqual(CLOSED);
  });
});

describe("isWarm", () => {
  it("skips the pause for a card opened right after another closed", () => {
    expect(isWarm(1000, 1000 + WARM_MS - 1)).toBe(true);
    expect(isWarm(1000, 1000 + WARM_MS)).toBe(false);
  });
});
