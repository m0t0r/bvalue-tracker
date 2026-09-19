import NumberFlow from "@number-flow/react";

// The roll is on-screen movement, not an entrance, so it does not use the page's front-loaded
// --ease-out: that curve covers most of the distance in the first 90ms, and the digits read as a
// jump however long the duration. This one leaves gently and lands softly. 550ms is well under the
// library's 900ms default, which lags behind a dragged slider; while dragging, the digits retarget
// mid-roll and keep turning rather than restarting.
const MOVE = { duration: 550, easing: "cubic-bezier(0.2, 0, 0, 1)" };
// Digits that appear or leave (9 → 10, 1,000 → 999) fade faster than the roll, so none linger half-visible.
const FADE = { duration: 300, easing: "ease-out" };

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
      format={{ minimumFractionDigits: digits, maximumFractionDigits: digits }}
      transformTiming={MOVE} spinTiming={MOVE} opacityTiming={FADE} />
  );
}
