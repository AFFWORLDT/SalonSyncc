"use client";

import { Input } from "@/components/ui/input";

/** A date field that opens the calendar when tapped anywhere, not only on the small icon. */
export function DateInput(props: Omit<React.ComponentProps<typeof Input>, "type">) {
  return (
    <Input
      {...props}
      type="date"
      onClick={(e) => {
        props.onClick?.(e);
        try {
          e.currentTarget.showPicker?.();
        } catch {
          // Some browsers only allow it from a direct tap; the native icon still works.
        }
      }}
      className={`cursor-pointer ${props.className ?? ""}`}
    />
  );
}
