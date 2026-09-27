import { type ReactElement, type ReactNode, useRef, useState } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/** What a press on the button found, read by the click that follows it. A keyboard click has none. */
export interface Press {
  touch: boolean;
  wasOpen: boolean;
}

/**
 * Whether the tip is open after a click. A tap toggles it, from what the press found: a phone that
 * focuses what it taps has opened it on focus by the time the click arrives. A mouse click or the
 * keyboard only ever opens it, since the hover or the focus before it has already done so.
 */
export const openAfterClick = (press: Press | null): boolean => (press?.touch ? !press.wasOpen : true);

interface Props {
  /** The button `InfoTip` draws; this adds the tip's behaviour to it. */
  children: ReactElement;
  content: ReactNode;
}

/**
 * `InfoTip`'s behaviour, in its own chunk: Radix's Tooltip brings Popper and floating-ui, 14 kB
 * gzipped that nothing else on the page loads at startup.
 *
 * Hover and focus open it, as Radix does. Radix ignores touch and closes on every press and click;
 * cancelling those (`preventDefault`) lets a tap open and close it, and a click keep open what the
 * hover opened. Escape, a tap elsewhere and a scroll close it.
 */
export function InfoTipTooltip({ children, content }: Props) {
  const [open, setOpen] = useState(false);
  const press = useRef<Press | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  return (
    // Its own provider, so neither page has to import this module to render one.
    <TooltipProvider>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger
          ref={trigger}
          asChild
          onPointerDown={(e) => {
            e.preventDefault();
            press.current = { touch: e.pointerType !== "mouse", wasOpen: open };
          }}
          // A press that turned into a scroll never clicks; it must not decide a later click.
          onPointerCancel={() => {
            press.current = null;
          }}
          onClick={(e) => {
            e.preventDefault();
            // `detail` is 0 for a click from the keyboard, whatever press came before it.
            setOpen(openAfterClick(e.detail === 0 ? null : press.current));
            press.current = null;
          }}
        >
          {children}
        </TooltipTrigger>
        {/* Below, so it does not cover the control and the value it explains; inside the page's
            16px gutter, not against the screen's edge. */}
        {/* A press on the button is outside the tip, and Radix would close it there: a click then
            blinked it shut and open again, and a tap was left to the click to decide. */}
        <TooltipContent
          side="bottom"
          collisionPadding={16}
          onPointerDownOutside={(e) => {
            if (e.target instanceof Node && trigger.current?.contains(e.target)) e.preventDefault();
          }}
        >
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
