"use client"

import { useState } from "react"
import { Switch as SwitchPrimitive } from "@base-ui/react/switch"
import { cn } from "@/lib/utils"
import { haptic } from "@/lib/haptics"

/**
 * The app's switch, with the transitions.dev "Toggle" motion (globals.css .t-toggle): the thumb overshoots and
 * settles, the track colour flips at once. `is-init` is added on the first change, so switches don't bounce on load.
 */
function Switch({
  className,
  size = "default",
  onCheckedChange,
  ...props
}: SwitchPrimitive.Root.Props & {
  size?: "sm" | "default"
}) {
  const [init, setInit] = useState(false)
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      onCheckedChange={(checked, details) => {
        setInit(true)
        onCheckedChange?.(checked, details)
        try {
          haptic("select")
        } catch {
          // A tick is a nicety; never let it stop the change.
        }
      }}
      className={cn(
        "t-toggle peer group/switch relative inline-flex shrink-0 items-center rounded-full border border-transparent outline-none group-has-[:focus-visible]/field-label:border-transparent group-has-[:focus-visible]/field-label:ring-0 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-[size=default]:h-[18.4px] data-[size=default]:w-[32px] data-[size=sm]:h-[14px] data-[size=sm]:w-[24px] dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:bg-primary data-unchecked:bg-input dark:data-unchecked:bg-input/80 data-disabled:cursor-not-allowed data-disabled:opacity-50",
        init && "is-init",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="t-toggle-thumb pointer-events-none block rounded-full bg-background ring-0 group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 dark:data-checked:bg-primary-foreground dark:data-unchecked:bg-foreground"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
