import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AuthProvider } from "@/lib/auth-context";
import { promoFor, PromoBar } from "@/components/app/promo-bar";
import { CommandPalette, pageItems, quickActions } from "@/components/app/command-palette";
import { meFixture } from "./fixtures";

const push = vi.fn();
const openNew = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace() {} }), usePathname: () => "/" }));
vi.mock("@/components/app/sale-sheet", () => ({ useSaleSheet: () => ({ openNew, openEdit() {} }) }));
vi.mock("@/lib/push", () => ({ forgetPushToken: async () => {} }));
afterEach(() => {
  vi.unstubAllGlobals();
  push.mockReset();
  openNew.mockReset();
});

const DAY = 86_400_000;
const now = Date.UTC(2026, 10, 3, 12);
const sub = (status: string, planId = "pro_max", extra: Partial<{ trialEndsAt: number | null; graceEndsAt: number | null }> = {}) => ({ status, planId, trialEndsAt: null, graceEndsAt: null, ...extra });

describe("subscribe bar: when it shows and what it says", () => {
  const opts = { isAdmin: true, price: "AED 200", now };
  it("trial: days left and the Pro price, hideable", () =>
    expect(promoFor(sub("trial", "pro_max", { trialEndsAt: now + 5 * DAY }), opts)).toEqual({ tone: "promo", lead: "5 days left in your free trial", offer: "Start Pro from AED 200/month", cta: "Subscribe", dismissible: true }));
  it("free plan: the upsell", () => expect(promoFor(sub("active", "free"), opts)).toMatchObject({ tone: "promo", lead: "Unlock customers, reports and WhatsApp", cta: "Subscribe" }));
  it("a paid plan, an expired salon and a manual plan show nothing", () => {
    expect(promoFor(sub("active", "pro"), opts)).toBeNull();
    expect(promoFor(sub("active", "pro_max"), opts)).toBeNull();
    expect(promoFor(sub("expired", "pro_max"), opts)).toBeNull();
  });
  it("grace and past due are red and can't be hidden", () => {
    expect(promoFor(sub("grace", "pro_max", { graceEndsAt: now + 2 * DAY }), opts)).toEqual({ tone: "danger", lead: "Your trial has ended", offer: "Subscribe within 2 days to keep everything", cta: "Subscribe", dismissible: false });
    expect(promoFor(sub("past_due", "pro", { graceEndsAt: now + DAY }), opts)).toMatchObject({ tone: "danger", cta: "Fix billing", dismissible: false });
  });
  it("barbers never see it", () => expect(promoFor(sub("trial", "pro_max", { trialEndsAt: now + DAY }), { ...opts, isAdmin: false })).toBeNull());

  it("the bar's button and close work; an overdue bar has no close", () => {
    const onSubscribe = vi.fn();
    const onDismiss = vi.fn();
    const { rerender } = render(<PromoBar promo={promoFor(sub("trial", "pro_max", { trialEndsAt: now + DAY }), opts)!} onSubscribe={onSubscribe} onDismiss={onDismiss} />);
    expect(screen.getByText("1 day left in your free trial")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Subscribe/ }));
    fireEvent.click(screen.getByRole("button", { name: "Hide until tomorrow" }));
    expect(onSubscribe).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledOnce();
    rerender(<PromoBar promo={promoFor(sub("past_due", "pro", { graceEndsAt: now + DAY }), opts)!} onSubscribe={onSubscribe} onDismiss={onDismiss} />);
    expect(screen.queryByRole("button", { name: "Hide until tomorrow" })).toBeNull();
  });
});

describe("command palette: what each person can find", () => {
  const owner = meFixture({ role: "owner", features: ["core_sales", "expenses", "daily_sheet", "ledger", "customers_crm"] });
  const barber = meFixture({ role: "barber", features: ["core_sales", "expenses", "daily_sheet", "ledger"] });

  it("barbers get New sale and their own pages, never admin ones", () => {
    expect(quickActions(barber, "").map((a) => a.label)).toEqual(["New sale"]);
    const pages = pageItems(barber, "").map((p) => p.label);
    expect(pages).toContain("My bills");
    expect(pages).not.toContain("Ledger");
    expect(pages).not.toContain("Staff");
  });
  it("pages follow the plan and the query", () => {
    expect(pageItems(owner, "ledg").map((p) => p.run)).toEqual([{ href: "/ledger/" }]);
    expect(pageItems(meFixture({ role: "owner", features: ["core_sales"] }), "ledg")).toEqual([]);
  });
  it("a read-only (expired) salon gets no New sale or Add expense", () => {
    expect(quickActions(owner, "", true).map((a) => a.label)).toEqual(["Today's daily sheet"]);
  });
});

describe("command palette: ⌘K", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL) => {
        const u = String(url);
        if (u === "/api/me") return new Response(JSON.stringify(meFixture({ role: "owner", features: ["core_sales", "customers_crm"] })));
        if (u.startsWith("/api/sales")) return new Response(JSON.stringify({ items: [{ id: 7, bill_no: "MN-20261103-018", token: "tok", customer_label: "Imran Hassan", barber_name: "Omar", amount: 2500 }], total: 1, sum: 2500, page: 1, page_size: 5 }));
        if (u.startsWith("/api/customers")) return new Response(JSON.stringify({ items: [{ id: 3, name: "Imran Hassan", phone: "0550001029" }], total: 1, page: 1, page_size: 5 }));
        if (u === "/api/services") return new Response(JSON.stringify([]));
        if (u === "/api/users") return new Response(JSON.stringify([]));
        return new Response("{}", { status: 404 });
      })
    );
  });

  it("opens with ⌘K, finds a customer and a bill, and Enter opens the first result", async () => {
    render(
      <AuthProvider>
        <CommandPalette />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId("search-trigger")).toBeTruthy());
    act(() => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });
    const input = await screen.findByRole("combobox");
    expect(screen.getByText("New sale")).toBeTruthy();
    fireEvent.change(input, { target: { value: "imran" } });
    await waitFor(() => expect(screen.getByText("MN-20261103-018 · Imran Hassan")).toBeTruthy());
    expect(screen.getByText("Customers")).toBeTruthy();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(push).toHaveBeenCalledWith("/customers/view/?id=3");
  });

  it("New sale runs the sale sheet", async () => {
    render(
      <AuthProvider>
        <CommandPalette />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId("search-trigger")).toBeTruthy());
    fireEvent.click(screen.getByTestId("search-trigger"));
    const input = await screen.findByRole("combobox");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(openNew).toHaveBeenCalledOnce();
  });
});
