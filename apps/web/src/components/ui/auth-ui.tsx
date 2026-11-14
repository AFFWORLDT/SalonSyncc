"use client";

import * as React from "react";
import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Shared auth form pieces, built on the app's own Input/Label (base-ui). */

export interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

/** Password field with a show/hide eye button. */
export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(({ className, label, id: idProp, ...props }, ref) => {
  const auto = useId();
  const id = idProp ?? auto;
  const [show, setShow] = useState(false);
  return (
    <div className="grid w-full items-center gap-2">
      {label && <Label htmlFor={id}>{label}</Label>}
      <div className="relative">
        <Input id={id} type={show ? "text" : "password"} className={cn("pe-10", className)} ref={ref} {...props} />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute inset-y-0 end-0 flex h-full w-10 items-center justify-center text-muted-foreground/80 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </button>
      </div>
    </div>
  );
});
PasswordInput.displayName = "PasswordInput";
