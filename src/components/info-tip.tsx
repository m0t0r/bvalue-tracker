import { InfoIcon } from "lucide-react";
import { type ComponentType, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { InfoTipTooltip } from "./info-tip-tooltip";

type Tip = typeof InfoTipTooltip;

// One fetch for every tip on the page, started by the first to mount, after the first paint.
let loading: Promise<Tip> | undefined;
const loadTip = () => (loading ??= import("./info-tip-tooltip").then((m) => m.InfoTipTooltip));

interface Props {
  /** The button's name: what the tip answers ("¿Por qué la curvatura máxima?"). */
  label: string;
  children: ReactNode;
}

/**
 * An info icon that shows a short explanation beside the control it explains: on hover with a
 * mouse, on focus from the keyboard, and on a tap on a phone, which has no hover (see
 * `InfoTipTooltip`).
 *
 * The behaviour is its own chunk. Until it lands the button is drawn without it, looking the same,
 * and if it never lands the button stays so: an info tip is not worth the page. Loaded in an effect
 * rather than with `lazy`, which suspends even on a chunk that has arrived and holds it back 300 ms,
 * and which throws a failed load at the nearest error boundary, of which the page has none.
 *
 * The text is the button's description at all times (`aria-describedby` on a `hidden` copy, which a
 * description may point to), so a screen reader reaches it without opening anything, and only
 * once: Radix links its own copy only while open.
 */
export function InfoTip({ label, children }: Props) {
  const descriptionId = useId();
  const [Tooltip, setTooltip] = useState<ComponentType<Parameters<Tip>[0]>>();
  const button = useRef<HTMLButtonElement>(null);
  // Whether the button had focus when the chunk arrived: the swap replaces it.
  const refocus = useRef(false);

  useEffect(() => {
    let live = true;
    loadTip().then(
      (tip) => {
        if (!live) return;
        refocus.current = document.activeElement === button.current;
        setTooltip(() => tip);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!Tooltip || !refocus.current) return;
    refocus.current = false;
    button.current?.focus();
  }, [Tooltip]);

  const trigger = (
    <Button
      ref={button}
      type="button"
      variant="ghost"
      size="icon-inline"
      className="ms-1"
      aria-label={label}
      aria-describedby={descriptionId}
    >
      <InfoIcon />
    </Button>
  );

  return (
    <>
      {Tooltip ? <Tooltip content={children}>{trigger}</Tooltip> : trigger}
      <span id={descriptionId} hidden>
        {children}
      </span>
    </>
  );
}
