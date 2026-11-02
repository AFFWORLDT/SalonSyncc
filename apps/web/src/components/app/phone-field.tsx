"use client";

import { ChevronDown } from "lucide-react";
import { countriesFor, getFormat } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

/** Country code picker (the salon's own country first) + national number, with the error shown under it. */
export function PhoneField({
  id,
  cc,
  local,
  onChange,
  error,
  inputProps,
}: {
  id: string;
  cc: string;
  local: string;
  onChange: (cc: string, local: string) => void;
  error: string | null;
  /** Extra props for the number input (focus/keyboard handlers). */
  inputProps?: React.ComponentProps<typeof Input>;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className={cn("flex h-11 overflow-hidden rounded-lg border border-input bg-transparent focus-within:ring-3 focus-within:ring-ring/50", error && "border-destructive")}>
        <label className="relative flex w-[4.75rem] shrink-0 items-center justify-center gap-1 border-r border-input bg-muted/50 text-sm font-medium">
          <span className="num">{cc ? `+${cc}` : "+…"}</span>
          <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
          <select
            aria-label="Country code"
            value={cc}
            onChange={(e) => onChange(e.target.value, local)}
            className="absolute inset-0 cursor-pointer opacity-0"
          >
            {countriesFor(getFormat().phoneCountry).map((c) => (
              <option key={c.label} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <Input
          {...inputProps}
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete={inputProps?.autoComplete ?? "off"}
          placeholder={countriesFor(getFormat().phoneCountry).find((c) => c.code === cc)?.example ?? ""}
          value={local}
          onChange={(e) => onChange(cc, e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          className="h-full rounded-none border-0 shadow-none focus-visible:ring-0"
        />
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
