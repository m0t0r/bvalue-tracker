import * as React from "react"
import { cn } from "cn"
import { OTPInput, OTPInputContext } from "input-otp"
import { MinusIcon } from "lucide-react"

function InputOTP({
  className,
  containerClassName,
  ...props
}: React.ComponentProps<typeof OTPInput> & {
  containerClassName?: string
}) {
  return (
    <OTPInput
      data-slot="input-otp"
      containerClassName={cn(
        "flex items-center has-disabled:opacity-50",
        containerClassName
      )}
      spellCheck={false}
      className={cn("disabled:cursor-not-allowed", className)}
      {...props}
    />
  )
}

/**
 * A local addition: `size`, shared by the group and its slots. "lg" is a code typed on its own, the
 * field the whole dialog is for: on a phone the group fills the width and the slots share it, 56 px
 * tall; from `sm` each slot is a 56 px square and the group as wide as they are.
 */
type OTPSize = "default" | "lg"

const groupSizes: Record<OTPSize, string> = {
  default: "",
  lg: "w-full sm:w-auto",
}

const slotSizes: Record<OTPSize, string> = {
  default: "size-8 pointer-coarse:size-10 text-sm pointer-coarse:text-base",
  lg: "h-14 flex-1 text-2xl sm:w-14 sm:flex-none",
}

const caretSizes: Record<OTPSize, string> = {
  default: "h-4",
  lg: "h-7",
}

function InputOTPGroup({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"div"> & { size?: OTPSize }) {
  return (
    <div
      data-slot="input-otp-group"
      className={cn(
        "flex items-center rounded-lg has-aria-invalid:border-destructive has-aria-invalid:ring-3 has-aria-invalid:ring-destructive/20 dark:has-aria-invalid:ring-destructive/40",
        groupSizes[size],
        className
      )}
      {...props}
    />
  )
}

/**
 * Local changes: named transitions rather than `transition-all`; the default slot grows to 40 px with
 * 16 px text on a coarse pointer, as the page's touch controls do; and `size` (above). The container
 * lost shadcn's `cn-input-otp` hook class, which no CSS here defines.
 */
function InputOTPSlot({
  index,
  className,
  size = "default",
  ...props
}: React.ComponentProps<"div"> & {
  index: number
  size?: OTPSize
}) {
  const inputOTPContext = React.useContext(OTPInputContext)
  const { char, hasFakeCaret, isActive } = inputOTPContext?.slots[index] ?? {}

  return (
    <div
      data-slot="input-otp-slot"
      data-active={isActive}
      className={cn(
        "relative flex items-center justify-center border-y border-r border-input transition-[color,border-color,box-shadow] outline-none first:rounded-l-lg first:border-l last:rounded-r-lg aria-invalid:border-destructive data-[active=true]:z-10 data-[active=true]:border-ring data-[active=true]:ring-3 data-[active=true]:ring-ring/50 data-[active=true]:aria-invalid:border-destructive data-[active=true]:aria-invalid:ring-destructive/20 dark:bg-input/30 dark:data-[active=true]:aria-invalid:ring-destructive/40",
        slotSizes[size],
        className
      )}
      {...props}
    >
      {char}
      {hasFakeCaret && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className={cn(
              "w-px animate-caret-blink bg-foreground duration-1000",
              caretSizes[size]
            )}
          />
        </div>
      )}
    </div>
  )
}

function InputOTPSeparator({ ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-otp-separator"
      className="flex items-center [&_svg:not([class*='size-'])]:size-4"
      role="separator"
      {...props}
    >
      <MinusIcon />
    </div>
  )
}

export { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator }
