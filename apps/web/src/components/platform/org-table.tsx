"use client";

import Link from "next/link";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type AdminOrg, pDate, periodEnd, relDays, STATUS_LABEL, statusClass } from "@/lib/platform";
import { cn } from "@/lib/utils";

const PLAN: Record<string, string> = { free: "Free", pro: "Pro", pro_max: "Pro Max" };

/** The salons table (Salons page and the expired queue). With `selected`, rows get checkboxes. */
export function OrgTable({ orgs, selected, onToggle }: { orgs: AdminOrg[]; selected?: Set<string>; onToggle?: (id: string) => void }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {selected && <TableHead className="w-8" />}
            <TableHead>Salon</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Plan</TableHead>
            <TableHead>Ends</TableHead>
            <TableHead className="text-right">Staff</TableHead>
            <TableHead className="text-right">Sales 30d</TableHead>
            <TableHead>Last sale</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orgs.map((o) => (
            <TableRow key={o.id}>
              {selected && (
                <TableCell>
                  <Checkbox aria-label={`Select ${o.name}`} checked={selected.has(o.id)} onCheckedChange={() => onToggle?.(o.id)} />
                </TableCell>
              )}
              <TableCell>
                <Link href={`/platform/salons/view/?id=${encodeURIComponent(o.id)}`} className="block max-w-56 hover:underline">
                  <span className="block truncate font-medium">{o.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {o.slug}
                    {o.owner_email ? ` · ${o.owner_email}` : ""}
                  </span>
                </Link>
              </TableCell>
              <TableCell>
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", statusClass(o.status))}>{STATUS_LABEL[o.status] ?? o.status}</span>
              </TableCell>
              <TableCell>{PLAN[o.plan_id] ?? o.plan_id}</TableCell>
              <TableCell className="text-sm">{relDays(periodEnd(o))}</TableCell>
              <TableCell className="num text-right">{o.staff}</TableCell>
              <TableCell className="num text-right">{o.sales_30d}</TableCell>
              <TableCell className="text-sm">{o.last_sale_at ? relDays(o.last_sale_at) : "—"}</TableCell>
              <TableCell className="text-sm">{pDate(o.created_at)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export const PLAN_LABEL = PLAN;
