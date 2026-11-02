import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AuthProvider } from "@/lib/auth-context";
import LedgerPage from "@/app/ledger/page";
import CustomersPage from "@/app/customers/page";
import { moneyNum, workbookName } from "@/lib/excel";
import { setFormat } from "@/lib/format";
import { fieldLabel } from "@/components/app/audit-diff";
import { meFixture } from "./fixtures";

vi.mock("@/lib/push", () => ({ forgetPushToken: async () => {} }));
afterEach(() => {
  vi.unstubAllGlobals();
  setFormat(null);
});

function serve(me: object) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: RequestInfo | URL) => {
      calls.push(String(url));
      return new Response(String(url) === "/api/me" ? JSON.stringify(me) : "null");
    })
  );
  return calls;
}

describe("gated pages make no calls without the feature", () => {
  it("ledger", async () => {
    const calls = serve(meFixture({ features: ["core_sales"] }));
    render(
      <AuthProvider>
        <LedgerPage />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId("upgrade-card")).toBeTruthy());
    expect(calls.filter((u) => u.startsWith("/api/ledger") || u.startsWith("/api/payouts"))).toEqual([]);
  });
  it("customers", async () => {
    const calls = serve(meFixture({ features: ["core_sales"] }));
    render(
      <AuthProvider>
        <CustomersPage />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText(/Upgrade to unlock Customers/)).toBeTruthy());
    expect(calls.filter((u) => u.startsWith("/api/customers"))).toEqual([]);
  });
});

describe("excel export per salon", () => {
  it("amounts keep the salon currency's decimals and files carry the salon name", () => {
    setFormat({ currency: "KWD", currency_minor: 1000, locale: "en-GB", timezone: "Asia/Kuwait", day_start_hour: 0, phone_country: "965" });
    expect(moneyNum(1234567)).toBe(1234.567);
    expect(workbookName("Alpha Cuts", "November 2026")).toBe("Alpha Cuts November 2026.xlsx");
    expect(workbookName("", "2026 summary")).toBe("2026 summary.xlsx");
    expect(workbookName("A/B: Cuts", "x")).toBe("A B  Cuts x.xlsx");
  });
});

describe("audit labels", () => {
  it("new settings and WhatsApp fields read well", () => {
    expect(fieldLabel("display_name")).toBe("Salon name");
    expect(fieldLabel("phone_number_id")).toBe("WhatsApp phone number ID");
  });
});
