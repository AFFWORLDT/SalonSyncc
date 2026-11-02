"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/admin/states";
import { SimpleSelect } from "@/components/app/simple-select";
import { OrgTable } from "@/components/platform/org-table";
import { qs } from "@/lib/api";
import { type AdminOrg, STATUS_LABEL, STATUS_OPTIONS, usePapi } from "@/lib/platform";

const STATUSES = [{ value: "all", label: "All (not deleted)" }, ...STATUS_OPTIONS.map((s) => ({ value: s, label: STATUS_LABEL[s]! }))];
const PLANS = [
  { value: "all", label: "Every plan" },
  { value: "free", label: "Free" },
  { value: "pro", label: "Pro" },
  { value: "pro_max", label: "Pro Max" },
];

export default function SalonsPage() {
  const [status, setStatus] = useState("all");
  const [plan, setPlan] = useState("all");
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("status");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (s && (STATUS_OPTIONS as readonly string[]).includes(s)) setStatus(s);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);
  const { data, error, reload } = usePapi<AdminOrg[]>(`/orgs${qs({ status: status === "all" ? null : status, plan: plan === "all" ? null : plan, q: q || null })}`);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl">Salons</h1>
        <p className="text-sm text-muted-foreground">Open a salon to change its plan, extend its trial, switch features or sign in as it.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Name, salon ID or email" value={text} onChange={(e) => setText(e.target.value)} className="h-9 pl-9" />
        </div>
        <SimpleSelect label="Status" value={status} onChange={setStatus} options={STATUSES} className="h-9 w-44" />
        <SimpleSelect label="Plan" value={plan} onChange={setPlan} options={PLANS} className="h-9 w-36" />
      </div>
      <Card className="gap-0 p-0">
        <div className="border-b px-4 py-3 text-sm font-semibold">{data ? `${data.length} salon${data.length === 1 ? "" : "s"}` : "Salons"}</div>
        {error && !data ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !data ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-11" />
            ))}
          </div>
        ) : data.length ? (
          <OrgTable orgs={data} />
        ) : (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">No salons match.</p>
        )}
      </Card>
    </div>
  );
}
