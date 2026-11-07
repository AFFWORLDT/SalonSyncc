"use client";

import { FeatureGate } from "@/components/app/feature-gate";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LedgerShop } from "@/components/app/ledger-shop";
import { LedgerBarbers } from "@/components/app/ledger-barbers";

/** The ledger (admin only): the shop's cash and bank book, and what each barber is owed. */
function LedgerPageInner() {
  const [tab, setTab] = useState<"shop" | "barbers">("shop");
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl">Ledger</h1>
        <p className="text-sm text-muted-foreground">Every money movement, newest first. Nothing here is ever rewritten.</p>
      </div>
      <Tabs value={tab} onValueChange={(v) => setTab(v as "shop" | "barbers")}>
        <TabsList>
          <TabsTrigger value="shop">Shop</TabsTrigger>
          <TabsTrigger value="barbers">Barbers</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === "shop" ? <LedgerShop /> : <LedgerBarbers />}
    </div>
  );
}

/** Gated by the salon's plan: without "ledger" the page shows the Upgrade card and makes no API calls. */
export default function LedgerPage() {
  return (
    <FeatureGate feature="ledger">
      <LedgerPageInner />
    </FeatureGate>
  );
}
