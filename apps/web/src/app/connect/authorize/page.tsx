"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Lock, ShieldCheck } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { BrandLogo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface ConsentRequest {
  id: string;
  app_name: string;
  redirect_host: string;
  scopes: string[];
  salon: string;
  user: string;
  support: boolean;
}

/**
 * OAuth consent for AI connect (/oauth/authorize sends the browser here with ?req=<id>). Outside the app frame; a
 * signed-out visitor goes to the login page and comes back. Read access is always granted; write only if ticked.
 */
export default function ConnectAuthorizePage() {
  const { user, loading, isAdmin } = useAuth();
  const router = useRouter();
  const [req, setReq] = useState<ConsentRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [write, setWrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setId(new URLSearchParams(window.location.search).get("req"));
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(`/login/?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return;
    }
    if (!id || !isAdmin) return;
    api<ConsentRequest>(`/api/mcp/requests/${encodeURIComponent(id)}`, { redirectOn401: false })
      .then(setReq)
      .catch((e) => setError(errorMessage(e, "This connection request has expired. Start again from the AI app.")));
  }, [loading, user, isAdmin, id, router]);

  const answer = async (approve: boolean) => {
    if (!req) return;
    setBusy(true);
    try {
      const r = await api<{ redirect: string }>(`/api/mcp/requests/${encodeURIComponent(req.id)}`, { method: "POST", body: { approve, write } });
      window.location.href = r.redirect;
    } catch (e) {
      setBusy(false);
      setError(errorMessage(e));
    }
  };

  const body = (() => {
    if (loading || !user) return <Skeleton className="h-48 w-full" />;
    if (!id) return <p className="text-sm text-muted-foreground">This link is incomplete. Start again from the AI app.</p>;
    if (!isAdmin) return <p className="text-sm text-muted-foreground">Only the salon’s owner or an admin can connect AI apps.</p>;
    if (error) return <p className="text-sm text-destructive">{error}</p>;
    if (!req) return <Skeleton className="h-48 w-full" />;
    const canWrite = req.scopes.includes("write");
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary">
            <Bot className="size-5" />
          </span>
          <div>
            <p className="font-semibold">{req.app_name} wants to connect to {req.salon}</p>
            <p className="text-xs text-muted-foreground">
              Signed in as {req.user} · it will send you back to {req.redirect_host}
            </p>
          </div>
        </div>
        <ul className="flex flex-col gap-3 rounded-lg border p-4 text-sm">
          <li className="flex items-start gap-3">
            <Lock className="mt-0.5 size-4 text-muted-foreground" />
            <div>
              <p className="font-medium">Read your salon’s data</p>
              <p className="text-xs text-muted-foreground">Sales, bills, reports, customers, staff, services, expenses and ratings. Always included.</p>
            </div>
          </li>
          {canWrite && (
            <li className="flex items-start gap-3">
              <input id="mcp-write" type="checkbox" checked={write} onChange={(e) => setWrite(e.target.checked)} className="mt-0.5 size-4 accent-primary" />
              <label htmlFor="mcp-write">
                <p className="font-medium">Make changes</p>
                <p className="text-xs text-muted-foreground">Add shop expenses and send team announcements. Recorded in your audit log.</p>
              </label>
            </li>
          )}
        </ul>
        {req.support ? (
          <p className="text-sm text-muted-foreground">Support mode can’t connect AI apps for the salon.</p>
        ) : (
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={() => void answer(false)}>
              Deny
            </Button>
            <Button disabled={busy} onClick={() => void answer(true)}>
              <ShieldCheck className="size-4" />
              {busy ? "Connecting…" : "Allow"}
            </Button>
          </div>
        )}
      </div>
    );
  })();

  return (
    <main className="grid min-h-full place-items-center bg-background px-4 py-10">
      <div className="flex w-full max-w-md flex-col items-center gap-6">
        <BrandLogo className="max-w-[180px]" />
        <Card className="w-full gap-0 p-6">{body}</Card>
        <p className="text-center text-xs text-muted-foreground">You can revoke access at any time on the AI connect page.</p>
      </div>
    </main>
  );
}
