import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

// Local change: `AlertAction` is a grid column of its own from `sm`, beside the title and description,
// and a row under them on a phone. Upstream pins it top-right over 72 px of padding, which fits an `xs`
// button; "Cargar ahora" and "Reintentar" at `sm-touch` ran under the text, so the page put its buttons
// inside the description instead (docs/frontend.md). The action takes the text colour, not the
// alert's: a red "Reintentar" read as a destructive action.
const alertVariants = cva(
  "group/alert relative grid w-full gap-0.5 rounded-lg border px-2.5 py-2 text-left text-sm sm:has-data-[slot=alert-action]:grid-cols-[1fr_auto] sm:has-data-[slot=alert-action]:gap-x-4 has-[>svg]:grid-cols-[auto_1fr] sm:has-data-[slot=alert-action]:has-[>svg]:grid-cols-[auto_1fr_auto] has-[>svg]:gap-x-2 *:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg]:text-current *:[svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-card text-card-foreground",
        // A state tints its whole surface: fill, border, and the title and icon that name it.
        // The description is left on `--muted-foreground` by `AlertDescription`, so only the
        // line that states the state is coloured — and the fill is chosen to keep that grey
        // above 4.5:1. The values and why they are these values are in `index.css`.
        destructive:
          "border-destructive-edge bg-destructive-surface text-destructive-strong *:[svg]:text-current",
        caution:
          "border-caution-edge bg-caution-surface text-caution-strong *:[svg]:text-current",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "font-medium group-has-[>svg]/alert:col-start-2 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "text-sm text-balance text-muted-foreground group-has-[>svg]/alert:col-start-2 md:text-pretty [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mb-4",
        className
      )}
      {...props}
    />
  )
}

function AlertAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-action"
      className={cn(
        "mt-2 text-foreground group-has-[>svg]/alert:col-start-2 sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:mt-0 sm:self-start sm:group-has-[>svg]/alert:col-start-3",
        className
      )}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription, AlertAction }
