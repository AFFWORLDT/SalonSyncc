import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { SETTINGS_INPUT_KEYS } from "@ss/contract";
import { AuthProvider } from "@/lib/auth-context";
import { settingsBody } from "@/lib/settings-body";
import SettingsPage from "@/app/settings/page";
import { meFixture } from "./fixtures";

vi.mock("@/lib/push", () => ({ forgetPushToken: async () => {} }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
afterEach(() => vi.unstubAllGlobals());

const full = () => {
  const m = meFixture({ features: ["core_sales", "whatsapp", "ratings", "push"], waReady: true });
  const s = Object.fromEntries(SETTINGS_INPUT_KEYS.map((k) => [k, (m.settings as unknown as Record<string, unknown>)[k] ?? ""])) as Record<string, unknown>;
  Object.assign(s, { vat_enabled: true, vat_rate: 5, quick_amounts: [10], notify_sale_min: 0, wa_reminder_days: 30, phone_country: "91" });
  return { ...m, settings: { ...m.settings, ...s } } as typeof m;
};

describe("settings", () => {
  it("the PUT body has every key the API requires and nothing read-only", () => {
    const body = settingsBody({ ...(full().settings as object), currency_minor: 100, logo_url: "x", brand_color: null } as never);
    expect(Object.keys(body).sort()).toEqual([...SETTINGS_INPUT_KEYS].sort());
  });

  it("saves VAT as a percent and hides WhatsApp without the feature", async () => {
    const me = full();
    me.features = ["core_sales"];
    const calls: { url: string; body?: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(url), body: init?.body as string | undefined });
        return new Response(JSON.stringify(String(url) === "/api/me" ? me : { ok: true }));
      })
    );
    render(
      <AuthProvider>
        <SettingsPage />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText("Save settings")).toBeTruthy());
    expect(screen.queryByText("WhatsApp Business")).toBeNull();
    expect(screen.queryByTestId("wa-connect")).toBeNull();
    fireEvent.click(screen.getByText("Save settings"));
    await waitFor(() => expect(calls.some((c) => c.url === "/api/settings")).toBe(true));
    const put = JSON.parse(calls.find((c) => c.url === "/api/settings")!.body!);
    expect(put.vat_rate).toBe(5);
    expect(calls.some((c) => c.url.startsWith("/api/whatsapp"))).toBe(false);
  });

  it("the WhatsApp connection never pre-fills the token and shows a duplicate-number error inline", async () => {
    const me = full();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const u = String(url);
        if (u === "/api/me") return new Response(JSON.stringify(me));
        if (u === "/api/whatsapp/config" && (!init?.method || init.method === "GET"))
          return new Response(JSON.stringify({ phone_number_id: "123456", waba_id: "654321", test_numbers: [], has_token: true }));
        if (u === "/api/whatsapp/config") return new Response(JSON.stringify({ error: "That WhatsApp number is already connected to another salon" }), { status: 409 });
        return new Response("null");
      })
    );
    render(
      <AuthProvider>
        <SettingsPage />
      </AuthProvider>
    );
    const token = (await screen.findByLabelText("Access token", {}, { timeout: 8000 })) as HTMLInputElement;
    expect(token.value).toBe("");
    fireEvent.change(token, { target: { value: "EAAB" } });
    fireEvent.click(screen.getByText("Save WhatsApp settings"));
    expect(await screen.findByText("That WhatsApp number is already connected to another salon", {}, { timeout: 8000 })).toBeTruthy();
  });
});
