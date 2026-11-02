import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AuthProvider } from "@/lib/auth-context";
import { Bill, BillActions } from "@/components/app/bill";
import { setFormat, includedVat, businessToday, setServerToday } from "@/lib/format";
import type { Sale } from "@/lib/types";
import { meFixture } from "./fixtures";

vi.mock("@/lib/push", () => ({ forgetPushToken: async () => {} }));
afterEach(() => {
  vi.unstubAllGlobals();
  setFormat(null);
  setServerToday(null);
});

const sale = {
  id: 7, bill_no: "SS-1", token: "t", day: "2026-11-02", barber_id: 1, barber_name: "Sonu", customer_id: null, customer_label: "Ali",
  customer_phone: "+919812345678", amount: 10000, payment_mode: "cash", note: null, commission_pct: 20, commission: 2000, vat_rate: 5,
  vat_amount: 476, created_at: Date.now(), items: [{ service_id: 1, name: "Cut", price: 10000, qty: 1 }],
} as unknown as Sale;
const billSettings = { display_name: "Alpha Cuts", salon_name_ar: null, address: null, phone: null, trn: null, receipt_footer: null, logo_url: null };

describe("bill", () => {
  it("shows VAT as a percent, the salon name and the salon currency", () => {
    setFormat({ currency: "KWD", currency_minor: 1000, locale: "en-GB", timezone: "Asia/Kuwait", day_start_hour: 0, phone_country: "965" });
    render(<Bill sale={{ ...sale, amount: 10000, items: [{ service_id: 1, name: "Cut", price: 10000, qty: 1 }] }} settings={billSettings} />);
    expect(screen.getAllByText("5%").length).toBeGreaterThan(0);
    expect(screen.getByText("VAT 5%")).toBeTruthy();
    expect(screen.queryByText(/500%/)).toBeNull();
    expect(screen.getByText("Alpha Cuts")).toBeTruthy();
    expect(screen.getAllByText("10.000").length).toBeGreaterThan(0);
    expect(screen.getByText(/Amounts in KWD/)).toBeTruthy();
  });

  it("sends from the salon's number only with the whatsapp feature and a connected number", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(meFixture({ features: ["core_sales"], waReady: true })))));
    const { container } = render(
      <AuthProvider>
        <BillActions sale={sale} settings={{ ...(meFixture().settings as object), wa_ready: true } as never} />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText("WhatsApp")).toBeTruthy());
    // Without the feature it is a wa.me link, never the Cloud API send.
    expect(container.querySelector('a[href^="https://wa.me/"]')).toBeTruthy();
  });
});

describe("sale maths", () => {
  it("VAT inside the total, percent rate", () => {
    expect(includedVat(10500, 5)).toBe(500);
    expect(includedVat(10000, 0)).toBe(0);
  });
  it("the sale day defaults to the API's business day, not the device clock", () => {
    setFormat({ currency: "AED", currency_minor: 100, locale: "en-GB", timezone: "Asia/Kolkata", day_start_hour: 6, phone_country: "91" });
    setServerToday("2026-01-15");
    expect(businessToday()).toBe("2026-01-15");
  });
});
