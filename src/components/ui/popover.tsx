"use client"

import * as React from "react"
import { cn } from "cn"
import { Popover as PopoverPrimitive } from "radix-ui"

// shadcn's Popover, with local changes: it enters on `--ease-out` from 96 % and leaves in 100 ms
// as a fade alone (leaving is quicker than arriving), grows from where its anchor is, never runs
// wider than the room Radix says is free, and skips both animations with `data-instant` (an
// opening from the keyboard, or one that follows another at once).

function Popover({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverAnchor({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />
}

function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 w-72 max-w-(--radix-popover-content-available-width) origin-(--radix-popover-content-transform-origin) overflow-hidden rounded-xl border bg-popover p-4 text-sm text-popover-foreground shadow-lg outline-hidden data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:duration-[160ms] data-[state=open]:ease-(--ease-out) data-[state=open]:motion-safe:zoom-in-96 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-100 data-instant:animate-none",
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger }
