import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AuthProvider } from "@/lib/auth-context";
import { WaAnnouncements } from "@/components/app/wa-announcements";
import { meFixture } from "./fixtures";

vi.mock("@/lib/push", () => ({ forgetPushToken: async () => {} }));
afterEach(() => vi.unstubAllGlobals());

function serve(me: object) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL) => (calls.push(String(url)), new Response(String(url) === "/api/me" ? JSON.stringify(me) : "[]"))));
  return calls;
}

describe("WhatsApp campaigns tab", () => {
  it("without the campaigns feature: Upgrade card, no /api/wa calls", async () => {
    const calls = serve(meFixture({ features: ["core_sales", "whatsapp"], waReady: true }));
    render(
      <AuthProvider>
        <WaAnnouncements />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId("upgrade-card")).toBeTruthy());
    expect(calls.filter((u) => u.startsWith("/api/wa"))).toEqual([]);
  });
  it("with the feature but no connected number: the Connect hint", async () => {
    const calls = serve(meFixture({ features: ["core_sales", "whatsapp", "whatsapp_campaigns"], waReady: false }));
    render(
      <AuthProvider>
        <WaAnnouncements />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText("Connect WhatsApp in Settings")).toBeTruthy());
    expect(calls.filter((u) => u.startsWith("/api/wa"))).toEqual([]);
  });
});
