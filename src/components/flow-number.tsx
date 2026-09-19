import NumberFlow from "@number-flow/react";

// The roll is on-screen movement, not an entrance, so it does not use the page's front-loaded
// --ease-out: that curve covers most of the distance in the first 90ms, and the digits read as a
// jump however long the duration. This one leaves gently and lands softly. 550ms is well under the
// library's 900ms default, which lags behind a dragged slider; while dragging, the digits retarget
// mid-roll and keep turning rather than restarting.
// Mirrored in CSS as `--ease-move` / `--duration-move` for marks that move with the digits, such as
// the b scale's; the two must stay identical.
const MOVE = { duration: 550, easing: "cubic-bezier(0.2, 0, 0, 1)" };
// Digits that appear or leave (9 → 10, 1,000 → 999) fade faster than the roll, so none linger half-visible.
const FADE = { duration: 300, easing: "ease-out" };

// The library pads its box above and below by this much — room for the mask that fades a rolling
// digit out as it leaves the top or the bottom. The padding is in the box, so a FlowNumber stood
// taller than the plain text beside it: at text-xl its line was 32px against 28px, which dropped
// the "Eventos" hint in the status bar 4px below the hints next to it and put its digits 2px off
// their baseline; at text-5xl the b-value's row was 72px against 48px. Taking the same amount back
// as a negative margin leaves the mask exactly where it was — it is drawn, not typeset, and nothing
// clips it — while the box measures like the text it replaces, so a FlowNumber sits on the line.
// The expression is the library's own (`number-flow`'s shadow CSS); keep the two in step.
const MASK = "calc(round(nearest, var(--number-flow-mask-height, 0.25em) / 2, 1px) * -2)";

interface Props {
  value: number;
  /** Fixed decimals. Decimals always use a point, matching SGC and the CSV; only integers follow `lang`. */
  digits?: number;
  lang?: string;
  prefix?: string;
  suffix?: string;
  className?: string;
}

/** A number whose digits roll to the new value, so the reader sees which figures a filter moved. Honours prefers-reduced-motion. */
export function FlowNumber({ value, digits = 0, lang, prefix, suffix, className }: Props) {
  return (
    <NumberFlow value={value} locales={digits > 0 ? "en-US" : lang} prefix={prefix} suffix={suffix} className={className}
      style={{ marginBlock: MASK }}
      format={{ minimumFractionDigits: digits, maximumFractionDigits: digits }}
      transformTiming={MOVE} spinTiming={MOVE} opacityTiming={FADE} />
  );
}
