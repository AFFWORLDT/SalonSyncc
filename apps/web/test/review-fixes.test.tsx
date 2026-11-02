import { describe, it, expect, vi, afterEach } from "vitest";
import { render, waitFor, screen } from "@testing-library/react";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { NotificationBell } from "@/components/app/notification-bell";
import { meFixture } from "./fixtures";

vi.mock("@/lib/push", () => ({ forgetPushToken: async () => {} }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {}, replace() {} }), usePathname: () => "/" }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  window.history.pushState({}, "", "/");
});

function Probe() {
  const { loading } = useAuth();
  return <p>{loading ? "loading" : "ready"}</p>;
}

describe("final review fixes", () => {
  it("public pages never call /api/me", async () => {
    window.history.pushState({}, "", "/rate/?t=x");
    const f = vi.fn(async () => new Response(JSON.stringify(meFixture())));
    vi.stubGlobal("fetch", f);
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText("ready")).toBeTruthy());
    expect(f).not.toHaveBeenCalled();
  });

  it("the notification bell loads once and never polls or refetches on focus", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ unread: 0, items: [] })));
    vi.stubGlobal("fetch", f);
    render(<NotificationBell />);
    await waitFor(() => expect(f).toHaveBeenCalledTimes(1));
    window.dispatchEvent(new Event("focus"));
    await new Promise((r) => setTimeout(r, 50));
    expect(f).toHaveBeenCalledTimes(1);
  });
});
