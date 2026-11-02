"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, Circle, X } from "lucide-react";
import { useApi } from "@/hooks/use-api";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export interface SetupStatus {
  logo: boolean;
  services: boolean;
  staff: boolean;
  vat: boolean;
  google_review: boolean;
}

/** The checklist steps, each linked to where it is done. */
export const SETUP_STEPS: { key: keyof SetupStatus; label: string; href: string; feature?: "ratings" }[] = [
  { key: "logo", label: "Upload your salon logo", href: "/settings/" },
  { key: "services", label: "Add your services and prices", href: "/services/" },
  { key: "staff", label: "Add your staff", href: "/barbers/" },
  { key: "vat", label: "Set up VAT on bills", href: "/settings/" },
  { key: "google_review", label: "Add your Google review link", href: "/settings/", feature: "ratings" },
];

const key = (slug: string) => `ss_setup_dismissed:${slug}`;

/** "Get your salon ready" on the dashboard until every step is done or the owner hides it. */
export function SetupChecklist() {
  const { org, isAdmin, has, readOnly } = useAuth();
  const slug = org?.slug ?? "";
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    let h = false;
    try {
      h = localStorage.getItem(key(slug)) === "1";
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHidden(h);
  }, [slug]);
  const show = isAdmin && !readOnly && !!slug && !hidden;
  const { data } = useApi<SetupStatus>(show ? "/api/settings/setup" : null);
  if (!show || !data) return null;
  const steps = SETUP_STEPS.filter((s) => !s.feature || has(s.feature));
  const done = steps.filter((s) => data[s.key]).length;
  if (done === steps.length) return null;
  return (
    <Card data-testid="setup-checklist" data-tour="setup" className="gap-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold">Get your salon ready</p>
          <p className="text-sm text-muted-foreground">
            {done} of {steps.length} done
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Hide setup checklist"
          onClick={() => {
            try {
              localStorage.setItem(key(slug), "1");
            } catch {}
            setHidden(true);
          }}
        >
          <X />
        </Button>
      </div>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {steps.map((s) => (
          <li key={s.key}>
            <Link href={s.href} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted ${data[s.key] ? "text-muted-foreground line-through" : ""}`}>
              {data[s.key] ? <Check className="size-4 text-success" /> : <Circle className="size-4 text-muted-foreground" />}
              {s.label}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
