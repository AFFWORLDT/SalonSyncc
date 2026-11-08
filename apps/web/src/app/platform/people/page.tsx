"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BellRing, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorState, TableSkeleton } from "@/components/admin/states";
import { PageHeader } from "@/components/admin/page-header";
import { RelativeTime } from "@/components/admin/relative-time";
import { SimpleSelect } from "@/components/app/simple-select";
import { PlatformBadge } from "@/components/platform/insights-ui";
import { STATUS_LABEL, statusClass, usePapi } from "@/lib/platform";
import { cn } from "@/lib/utils";

interface Person {
  id: number;
  name: string;
  username: string;
  email: string | null;
  role: string;
  active: number;
  org_id: string;
  salon: string;
  slug: string;
  salon_status: string;
  platform: string | null;
  app_version: string | null;
  last_at: number | null;
  push_devices: number;
}

const ROLES = [
  { value: "all", label: "Every role" },
  { value: "owner", label: "Owners" },
  { value: "admin", label: "Admins" },
  { value: "barber", label: "Barbers" },
];
const PLATFORMS = [
  { value: "all", label: "Any platform" },
  { value: "web", label: "Web" },
  { value: "ios", label: "iOS" },
  { value: "android", label: "Android" },
];
const INACTIVE = [
  { value: "0", label: "Any activity" },
  { value: "7", label: "Inactive 7+ days" },
  { value: "30", label: "Inactive 30+ days" },
  { value: "90", label: "Inactive 90+ days" },
];

const qs = (o: Record<string, string | number | null>) => {
  const p = Object.entries(o).filter(([, v]) => v !== null && v !== "" && v !== "all" && v !== "0" && v !== 0);
  return p.length ? `?${p.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&")}` : "";
};

/** Every salon's staff in one list (the deHertz admin's Users), with when and where they last used SalonKit. */
export default function PeoplePage() {
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [role, setRole] = useState("all");
  const [platform, setPlatform] = useState("all");
  const [inactive, setInactive] = useState("0");
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => (setQ(text.trim()), setOffset(0)), 300);
    return () => clearTimeout(t);
  }, [text]);
  const { data, error, reload } = usePapi<{ people: Person[]; total: number; page_size: number }>(`/insights/people${qs({ q, role, platform, inactive, offset })}`);
  const size = data?.page_size ?? 25;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="People" description="Everyone on a salon's team, across SalonKit." />
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Name, email, username or salon" value={text} onChange={(e) => setText(e.target.value)} className="h-9 pl-9" />
        </div>
        <SimpleSelect label="Role" value={role} onChange={(v) => (setRole(v), setOffset(0))} options={ROLES} className="h-9 w-36" />
        <SimpleSelect label="Platform" value={platform} onChange={(v) => (setPlatform(v), setOffset(0))} options={PLATFORMS} className="h-9 w-36" />
        <SimpleSelect label="Activity" value={inactive} onChange={(v) => (setInactive(v), setOffset(0))} options={INACTIVE} className="h-9 w-44" />
      </div>

      {error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <TableSkeleton />
      ) : (
        <Card className="gap-0 overflow-hidden p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead>Salon</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Last on</TableHead>
                  <TableHead>Last active</TableHead>
                  <TableHead className="text-center">Push</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.people.map((p) => (
                  <TableRow key={p.id} className={cn(!p.active && "opacity-60")}>
                    <TableCell>
                      <p className="font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.email ?? p.username}</p>
                    </TableCell>
                    <TableCell>
                      <Link href={`/platform/salons/view/?id=${encodeURIComponent(p.org_id)}`} className="font-medium hover:underline">
                        {p.salon}
                      </Link>
                      <span className={cn("ml-2 rounded-full px-2 py-0.5 text-[11px]", statusClass(p.salon_status))}>{STATUS_LABEL[p.salon_status] ?? p.salon_status}</span>
                    </TableCell>
                    <TableCell className="capitalize">
                      {p.role}
                      {!p.active && <span className="ml-1 text-xs text-muted-foreground normal-case">(turned off)</span>}
                    </TableCell>
                    <TableCell>
                      <PlatformBadge platform={p.platform} version={p.app_version} />
                    </TableCell>
                    <TableCell className="text-sm">{p.last_at ? <RelativeTime ms={p.last_at} /> : <span className="text-muted-foreground">Not since tracking began</span>}</TableCell>
                    <TableCell className="text-center">
                      {p.push_devices ? (
                        <span className="inline-flex items-center gap-1 text-xs" title={`${p.push_devices} device(s) with notifications on`}>
                          <BellRing className="size-3.5" />
                          <span className="num">{p.push_devices}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!data.people.length && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      Nobody matches.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between gap-3 border-t px-4 py-2.5 text-sm text-muted-foreground">
            <span>
              {data.total ? `${offset + 1}–${Math.min(offset + size, data.total)} of ${data.total.toLocaleString()}` : "0 people"}
            </span>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" aria-label="Previous page" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - size))}>
                <ChevronLeft className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" aria-label="Next page" disabled={offset + size >= data.total} onClick={() => setOffset(offset + size)}>
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
