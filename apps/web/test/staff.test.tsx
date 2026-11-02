import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AuthProvider } from "@/lib/auth-context";
import BarbersPage from "@/app/barbers/page";
import ServicesPage from "@/app/services/page";
import { staffError } from "@/lib/staff";
import { ApiError } from "@/lib/api";
import { meFixture } from "./fixtures";

vi.mock("@/lib/push", () => ({ forgetPushToken: async () => {} }));
afterEach(() => vi.unstubAllGlobals());

const user = (id: number, role: string, active = true) => ({ id, name: `U${id}`, username: `u${id}`, phone: null, role, commission_pct: null, sort_order: id, active, can_add_expense: false, avatar_url: null, created_at: 0 });
function serve(me: object, routes: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u === "/api/me") return new Response(JSON.stringify(me));
      for (const [k, v] of Object.entries(routes)) if (u.startsWith(k)) return new Response(JSON.stringify(v));
      return new Response("null");
    })
  );
}

describe("staff page", () => {
  it("the owner row has no deactivate or delete; a free salon at its limit can't add staff", async () => {
    serve(meFixture({ role: "owner", maxStaff: 2 }), { "/api/users": [user(1, "owner"), user(2, "barber"), user(3, "barber")] });
    render(
      <AuthProvider>
        <BarbersPage />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText("Owner")).toBeTruthy());
    expect(screen.getByTestId("staff-limit").textContent).toContain("2 of 2 staff");
    expect((screen.getByText("Add staff").closest("button") as HTMLButtonElement).disabled).toBe(true);
  });
  it("staff_limit 409 becomes an upgrade hint", () => {
    expect(staffError(new ApiError("Staff limit reached for your plan", 409, "staff_limit"), 2)).toBe("Your plan allows 2 active staff. Upgrade your plan to add more.");
    expect(staffError(new ApiError("Username is taken", 409), 2)).toBe("Username is taken");
  });
});

describe("services page", () => {
  it("offers the starter price list only when the list is empty", async () => {
    serve(meFixture(), { "/api/services": [] });
    const { unmount } = render(
      <AuthProvider>
        <ServicesPage />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText("Add starter price list")).toBeTruthy());
    unmount();
  });
});
