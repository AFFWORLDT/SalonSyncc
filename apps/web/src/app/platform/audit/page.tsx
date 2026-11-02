"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ErrorState } from "@/components/admin/states";
import { actionLabel, type AuditItem, pDateTime, papi, usePapi } from "@/lib/platform";

const pretty = (j: string | null) => {
  if (!j) return "—";
  try {
    return JSON.stringify(JSON.parse(j), null, 2);
  } catch {
    return j;
  }
};

/** Every change made in this panel, newest first. Nothing here can be edited. */
export default function PlatformAudit() {
  const first = usePapi<AuditItem[]>("/audit");
  const [more, setMore] = useState<AuditItem[]>([]);
  const [end, setEnd] = useState(false);
  const [open, setOpen] = useState<AuditItem | null>(null);
  const rows = [...(first.data ?? []), ...more];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl">Audit</h1>
        <p className="text-sm text-muted-foreground">Every change made in the admin panel, including each time someone signed in as a salon.</p>
      </div>
      <Card className="gap-0 p-0">
        {first.error && !first.data ? (
          <ErrorState message={first.error} onRetry={first.reload} />
        ) : !first.data ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-11" />
            ))}
          </div>
        ) : rows.length ? (
          <ul className="divide-y">
            {rows.map((a) => (
              <li key={a.id}>
                <button type="button" className="w-full px-4 py-3 text-left hover:bg-muted/40" onClick={() => setOpen(a)}>
                  <p className="truncate text-sm">
                    <span className="font-medium">{a.who}</span> {actionLabel(a.action)}
                    {a.slug ? (
                      <>
                        {" "}
                        · <span className="font-medium">{a.slug}</span>
                      </>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">{pDateTime(a.at)}</p>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">Nothing yet.</p>
        )}
        {rows.length >= 100 && !end && (
          <div className="border-t p-3 text-center">
            <Button
              variant="outline"
              onClick={async () => {
                const next = await papi<AuditItem[]>(`/audit?before=${rows[rows.length - 1]!.id}`);
                setMore((m) => [...m, ...next]);
                if (next.length < 100) setEnd(true);
              }}
            >
              Show more
            </Button>
          </div>
        )}
      </Card>
      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="sm:max-w-lg">
          {open && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {open.who} {actionLabel(open.action)}
                </DialogTitle>
                <DialogDescription>
                  {pDateTime(open.at)}
                  {open.org_id && (
                    <>
                      {" · "}
                      <Link className="underline" href={`/platform/salons/view/?id=${encodeURIComponent(open.org_id)}`}>
                        {open.slug ?? "salon"}
                      </Link>
                    </>
                  )}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 text-xs sm:grid-cols-2">
                <div>
                  <p className="mb-1 font-semibold">Before</p>
                  <pre className="max-h-64 overflow-auto rounded bg-muted p-2 whitespace-pre-wrap">{pretty(open.before_json)}</pre>
                </div>
                <div>
                  <p className="mb-1 font-semibold">After</p>
                  <pre className="max-h-64 overflow-auto rounded bg-muted p-2 whitespace-pre-wrap">{pretty(open.after_json)}</pre>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
