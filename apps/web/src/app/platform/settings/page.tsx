"use client";

import { Check, Monitor, Moon, Sun } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/admin/page-header";
import { useAppTheme } from "@/components/theme/theme-provider";
import { ACCENTS } from "@/components/theme/theme";
import { cn } from "@/lib/utils";

const MODES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Follow my device", icon: Monitor },
] as const;

/** The portal's look in this browser: light, dark or the device's setting, and the accent colour. */
export default function AppearancePage() {
  const { appearance, accent, resolved, setAppearance, setAccent } = useAppTheme();
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Appearance" description="How Atlantic Portal looks in this browser." />
      <Card className="gap-4 p-5">
        <p className="text-sm font-semibold">Mode</p>
        <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Mode">
          {MODES.map(({ value, label, icon: Icon }) => {
            const on = appearance === value;
            const dark = value === "dark" || (value === "system" && resolved === "dark");
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setAppearance(value)}
                className={cn("grid gap-2 rounded-xl border-2 p-2 text-left transition-colors duration-150", on ? "border-primary" : "border-border hover:border-muted-foreground/40")}
              >
                <div className={cn("flex h-20 gap-1.5 rounded-lg p-2", dark ? "bg-[#0d1714]" : "bg-[#f3efe6]")} aria-hidden>
                  <div className={cn("w-1/4 rounded", dark ? "bg-[#13201c]" : "bg-white")} />
                  <div className="flex flex-1 flex-col gap-1.5">
                    <div className={cn("h-3 rounded", dark ? "bg-[#1c2c27]" : "bg-white")} />
                    <div className={cn("flex-1 rounded", dark ? "bg-[#13201c]" : "bg-white")} />
                  </div>
                </div>
                <span className="flex items-center gap-2 px-1 text-sm font-medium">
                  <Icon className="size-4" />
                  {label}
                  {on && <Check className="ml-auto size-4 text-primary" />}
                </span>
              </button>
            );
          })}
        </div>
      </Card>
      <Card className="gap-4 p-5">
        <p className="text-sm font-semibold">Accent</p>
        <div className="flex flex-wrap gap-3">
          {ACCENTS.map((a) => (
            <button
              key={a.hex}
              type="button"
              onClick={() => setAccent(a.hex)}
              aria-label={a.name}
              title={a.name}
              aria-pressed={accent.toLowerCase() === a.hex.toLowerCase()}
              className={cn("grid size-10 place-items-center rounded-full ring-offset-2 ring-offset-background transition-shadow", accent.toLowerCase() === a.hex.toLowerCase() && "ring-2 ring-primary")}
              style={{ background: a.hex }}
            >
              {accent.toLowerCase() === a.hex.toLowerCase() && <Check className="size-4 text-white mix-blend-difference" />}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-4">
          <Button size="sm">Primary</Button>
          <Button size="sm" variant="outline">
            Outline
          </Button>
          <Badge>Badge</Badge>
          <span className="text-sm text-primary">Accent text</span>
        </div>
      </Card>
      <p className="text-xs text-muted-foreground">Saved in this browser, and shared with the salon app on this device.</p>
    </div>
  );
}
