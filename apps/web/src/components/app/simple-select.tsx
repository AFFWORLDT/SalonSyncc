"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface Option {
  value: string;
  label: string;
  disabled?: boolean;
}

/** One-line Select over a flat option list. */
export function SimpleSelect({
  value,
  onChange,
  options,
  label,
  placeholder,
  size = "default",
  className,
  disabled,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  label: string;
  placeholder?: string;
  size?: "sm" | "default";
  className?: string;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <Select items={options} value={value} onValueChange={(v) => v != null && onChange(String(v))} disabled={disabled}>
      <SelectTrigger id={id} size={size} aria-label={label} className={cn("min-w-36", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
