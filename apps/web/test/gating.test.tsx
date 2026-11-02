import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { FeatureGate } from "@/components/app/feature-gate";
import { api } from "@/lib/api";
import { navFor } from "@/components/admin/nav";
import { meFixture } from "./fixtures";
import { bannerText } from "@/components/app/subscription";

vi.mock("@/lib/push", () => ({ forgetPushToken: async () => {} }));
afterEach(() => vi.unstubAllGlobals());

function Nav() {
  const { me } = useAuth();
  return <p>{navFor(me).flatMap((g) => g.items.map((i) => i.href)).join(",")}</p>;
}

describe("feature gating", () => {
  it("FeatureGate shows the Upgrade card and never mounts the page without the feature", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(meFixture({ features: ["core_sales"] })))));
    const Page = vi.fn(() => <p>ledger page</p>);
    render(
      <AuthProvider>
        <FeatureGate feature="ledger">
          <Page />
        </FeatureGate>
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId("upgrade-card")).toBeTruthy());
    expect(screen.getByText(/Upgrade to unlock Ledger and payouts/)).toBeTruthy();
    expect(Page).not.toHaveBeenCalled();
  });

  it("a feature switched off mid-session: the 403 refreshes /api/me and the menu item disappears", async () => {
    let features = ["core_sales", "ledger"];
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url) === "/api/me") return new Response(JSON.stringify(meFixture({ role: "owner", features })));
      return new Response(JSON.stringify({ error: "This feature isn't in your plan", code: "feature_disabled" }), { status: 403 });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AuthProvider>
        <Nav />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText(/\/ledger/)).toBeTruthy());
    features = ["core_sales"];
    await api("/api/ledger/shop").catch(() => {});
    await waitFor(() => expect(screen.queryByText(/\/ledger/)).toBeNull());
    expect(fetchMock.mock.calls.filter((c) => String(c[0]) === "/api/me").length).toBe(2);
  });
});

describe("subscription banner", () => {
  const now = Date.parse("2026-11-02T10:00:00Z");
  it("trial counts days left", () => expect(bannerText({ status: "trial", trialEndsAt: now + 3 * 86_400_000, graceEndsAt: null }, now)).toEqual({ tone: "info", text: "3 days left in your free trial" }));
  it("grace is red with the days to upgrade", () =>
    expect(bannerText({ status: "grace", trialEndsAt: null, graceEndsAt: now + 86_400_000 }, now)).toEqual({ tone: "danger", text: "Your trial has ended — upgrade within 1 day to keep using everything" }));
  it("active says nothing", () => expect(bannerText({ status: "active", trialEndsAt: null, graceEndsAt: null }, now)).toBeNull());
});
