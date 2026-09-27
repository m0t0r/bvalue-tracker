import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

const buttonVariants = cva(
  "group/button relative inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,scale] duration-150 ease-(--ease-out) outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring active:not-aria-[haspopup]:scale-[0.96] disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        // Floats over the page, so it is opaque on hover too (`default` turns 80 % transparent there
        // and lets the text underneath through) and lifted off it by a shadow.
        floating:
          "bg-primary text-primary-foreground shadow-lg hover:bg-[color-mix(in_oklch,var(--primary),var(--background)_18%)]",
        link: "text-primary underline-offset-4 hover:underline",
        // A disclosure that should not compete with the text it sits under ("Detalle técnico").
        "link-muted":
          "text-muted-foreground underline-offset-4 hover:underline",
        // A link inside a sentence: the sentence's own weight and colour, told apart by its underline
        // alone, and the text colour on hover. With `size="inline"`, which takes the sentence's size.
        "link-inline":
          "font-normal underline underline-offset-4 hover:text-foreground",
      },
      size: {
        default:
          "h-8 pointer-coarse:after:absolute pointer-coarse:after:-inset-y-1.5 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        // `default`, growing on touch to 40px with a 44px hit area, like `sm-touch`.
        "default-touch":
          "h-8 pointer-coarse:h-10 pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-0.5 gap-1.5 px-2.5 pointer-coarse:px-4 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 pointer-coarse:after:absolute pointer-coarse:after:-inset-x-1 pointer-coarse:after:-inset-y-2 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        // `sm`, but on touch the button itself grows to 40px and its hit area to 44px, rather than
        // relying on an invisible hit area alone. The page's own controls use this. Icons are 16px,
        // 20px on touch, the same as `icon-sm-touch`, so a header's icons match.
        "sm-touch":
          "h-7 pointer-coarse:h-10 pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-0.5 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 pointer-coarse:px-4 text-xs pointer-coarse:text-sm in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-4 pointer-coarse:[&_svg:not([class*='size-'])]:size-5",
        // A sortable column header: `sm`'s height, the table's own text size, tighter sides.
        header:
          "h-7 pointer-coarse:after:absolute pointer-coarse:after:-inset-x-1 pointer-coarse:after:-inset-y-2 gap-1 rounded-[min(var(--radius-md),12px)] px-2 text-sm has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        // A link-button inside running text: no box of its own, the text's own size, and it wraps like
        // the text (unwrapped, "Switch back to automatic Mc…" ran past a 320px card). No border either:
        // its 2px made the line taller than the text it replaces, and the focus ring is a shadow.
        inline:
          "h-auto border-0 pointer-coarse:after:absolute pointer-coarse:after:-inset-x-1 pointer-coarse:after:-inset-y-2 gap-1 rounded-[min(var(--radius-md),12px)] p-0 text-left text-[length:inherit] whitespace-normal [&_svg:not([class*='size-'])]:size-3.5",
        // `inline`, but on touch it grows to 40px, and its hit area to 44px, like `sm-touch`.
        "inline-touch":
          "h-auto pointer-coarse:h-10 pointer-coarse:after:absolute pointer-coarse:after:-inset-x-2 pointer-coarse:after:-inset-y-0.5 gap-1 rounded-[min(var(--radius-md),12px)] p-0 pointer-coarse:pr-4 text-xs pointer-coarse:text-sm [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8 pointer-coarse:after:absolute pointer-coarse:after:-inset-1.5",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 pointer-coarse:after:absolute pointer-coarse:after:-inset-2 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        // `icon-sm`, growing on touch like `sm-touch`.
        "icon-sm-touch":
          "size-7 pointer-coarse:size-10 pointer-coarse:after:absolute pointer-coarse:after:-inset-0.5 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-4 pointer-coarse:[&_svg:not([class*='size-'])]:size-5",
        "icon-lg": "size-9",
        // An icon inside a line of text (an info tip), centred on it. It keeps the line's height, so
        // on touch it reaches 44px through its hit area instead of growing. That area reaches past
        // the end of the line and below it, not back over the text before it or up into the control
        // above (in the filters card, the link back to the automatic Mc and the Mc slider).
        "icon-inline":
          "size-5 rounded-full align-middle after:absolute after:-inset-1 pointer-coarse:after:-top-2 pointer-coarse:after:-bottom-4 pointer-coarse:after:-start-1 pointer-coarse:after:-end-5 [&_svg:not([class*='size-'])]:size-4",
        // A round 44px button, at that size on every pointer so it needs no hit area outside itself.
        // It clips its content, so an icon can travel out through the edge of the circle.
        "icon-round": "size-11 overflow-hidden rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
