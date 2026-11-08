import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AuthProvider } from "@/lib/auth-context";
import LoginPage from "@/app/login/page";
import { SetupChecklist } from "@/components/app/setup-checklist";
import { meFixture } from "./fixtures";

const replace = vi.fn();
vi.mock("@/lib/push", () => ({ forgetPushToken: async () => {} }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push() {} }), usePathname: () => "/login/" }));
vi.mock("@paper-design/shaders-react", () => ({ MeshGradient: () => null }));
afterEach(() => {
  vi.unstubAllGlobals();
  replace.mockReset();
  window.history.pushState({}, "", "/");
});

describe("signup handoff", () => {
  it("signs in with the link and goes to the dashboard", async () => {
    window.history.pushState({}, "", "/login/?org=fresh&handoff=tok123");
    let signedIn = false;
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const u = String(url);
        calls.push(`${init?.method ?? "GET"} ${u} ${init?.body ?? ""}`);
        if (u === "/api/auth/handoff") return (signedIn = true), new Response(JSON.stringify({ ok: true, slug: "fresh" }));
        if (u === "/api/me") return signedIn ? new Response(JSON.stringify(meFixture({ slug: "fresh" }))) : new Response(JSON.stringify({ error: "Please sign in" }), { status: 401 });
        return new Response("null");
      })
    );
    render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    expect(calls.find((c) => c.includes("/api/auth/handoff"))).toContain('"token":"tok123"');
  });

  it("an expired link shows a message and the password form", async () => {
    window.history.pushState({}, "", "/login/?handoff=old");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL) =>
        String(url) === "/api/auth/handoff"
          ? new Response(JSON.stringify({ error: "This sign-in link has expired. Sign in with your password." }), { status: 401 })
          : new Response(JSON.stringify({ error: "Please sign in" }), { status: 401 })
      )
    );
    render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    );
    expect(await screen.findByText("This sign-in link has expired. Sign in with your password.")).toBeTruthy();
    expect(screen.getByLabelText("Email or username")).toBeTruthy();
  });
});

describe("setup checklist", () => {
  const serve = (setup: object) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL) => new Response(JSON.stringify(String(url) === "/api/me" ? meFixture({ role: "owner", features: ["core_sales", "ratings"], slug: `s${Math.random()}` }) : setup)))
    );
  it("lists what is left", async () => {
    serve({ logo: true, services: false, staff: false, vat: false, google_review: false, details: false });
    render(
      <AuthProvider>
        <SetupChecklist />
      </AuthProvider>
    );
    expect(await screen.findByTestId("setup-checklist")).toBeTruthy();
    expect(screen.getByText("1 of 6 done")).toBeTruthy();
  });
  it("disappears when everything is done", async () => {
    serve({ logo: true, services: true, staff: true, vat: true, google_review: true, details: true });
    render(
      <AuthProvider>
        <SetupChecklist />
      </AuthProvider>
    );
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.queryByTestId("setup-checklist")).toBeNull();
  });
});
