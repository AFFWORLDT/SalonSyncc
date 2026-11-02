import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import ReceiptPage from "@/app/r/page";
import RatePage from "@/app/rate/page";
import { setFormat } from "@/lib/format";

afterEach(() => {
  vi.unstubAllGlobals();
  setFormat(null);
});

function serve(routes: Record<string, (init?: RequestInit) => Response>) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      calls.push(`${init?.method ?? "GET"} ${u}`);
      for (const [k, f] of Object.entries(routes)) if (u.startsWith(k)) return f(init);
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
    })
  );
  return calls;
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });

const receipt = {
  sale: { bill_no: "SS-9", created_at: Date.now(), barber_name: "Sonu", customer_label: "Ali", customer_phone: null, payment_mode: "cash", items: [{ service_id: 1, name: "Cut", price: 2500, qty: 1 }], note: null, amount: 2500, vat_rate: 0, vat_amount: 0 },
  salon: { salon_name: "Gulf Cuts", display_name: "Gulf Cuts", salon_name_ar: null, tagline: null, address: null, phone: null, trn: null, licence_no: null, receipt_footer: null, logo_url: null, currency: "KWD", currency_minor: 1000, locale: "en-GB", timezone: "Asia/Kuwait" },
};

describe("public receipt", () => {
  it("formats with the receipt's own salon and never calls /api/me", async () => {
    window.history.pushState({}, "", "/r/?t=abc");
    const calls = serve({ "/api/public/receipt/abc": () => json(receipt) });
    render(<ReceiptPage />);
    await waitFor(() => expect(screen.getByText("Gulf Cuts")).toBeTruthy());
    expect(screen.getAllByText("2.500").length).toBeGreaterThan(0);
    expect(calls.some((c) => c.includes("/api/me"))).toBe(false);
  });
});

describe("public rating page", () => {
  const page = { first_name: "Ali", barber_name: "Sonu", bill_no: "SS-9", day: "2026-11-02", salon_name: "Gulf Cuts", phone: null, google_review_url: "https://g.page/r/x", instagram_url: null, stars: null, comment: null };
  it("posts the stars, thanks the customer and offers Google after 5 stars", async () => {
    window.history.pushState({}, "", "/rate/?t=tok");
    const calls = serve({ "/api/public/feedback/tok": (init) => json(init?.method === "POST" ? { ...page, stars: 5 } : page) });
    render(<RatePage />);
    fireEvent.click(await screen.findByLabelText("5 stars"));
    fireEvent.click(screen.getByText("Send rating"));
    await waitFor(() => expect(screen.getByTestId("rate-thanks")).toBeTruthy());
    expect(calls).toContain("POST /api/public/feedback/tok");
    expect(screen.getByText("Review us on Google").closest("a")?.getAttribute("href")).toBe("/api/public/review/tok");
    expect(calls.some((c) => c.includes("/api/me"))).toBe(false);
  });
  it("an unknown or expired link says so", async () => {
    window.history.pushState({}, "", "/rate/?t=gone");
    serve({});
    render(<RatePage />);
    expect(await screen.findByText("This link has expired.")).toBeTruthy();
  });
});
