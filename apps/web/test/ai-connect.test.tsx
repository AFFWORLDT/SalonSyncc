import { describe, it, expect, vi, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PLAN_DEFAULTS } from "@ss/features";
import { AuthProvider } from "@/lib/auth-context";
import { navFor } from "@/components/admin/nav";
import { nextPath } from "@/lib/next-path";
import AiConnectPage from "@/app/ai-connect/page";
import ConnectAuthorizePage from "@/app/connect/authorize/page";
import { meFixture } from "./fixtures";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {}, replace }), usePathname: () => "/ai-connect/" }));
afterEach(() => {
  vi.unstubAllGlobals();
  replace.mockReset();
  window.history.replaceState(null, "", "/");
});

const hrefs = (features: string[], role: "owner" | "barber" = "owner") => navFor(meFixture({ role, features })).flatMap((g) => g.items.map((i) => i.href));
const ON = [...PLAN_DEFAULTS.pro_max.features, "mcp_api"];

function stub(routes: Record<string, (init?: RequestInit) => unknown>, me = meFixture({ role: "owner", features: ON })) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      calls.push({ url: u, init });
      if (u === "/api/me") return new Response(JSON.stringify(me));
      const key = `${init?.method ?? "GET"} ${u}`;
      const h = routes[key];
      if (!h) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
      const out = h(init);
      return out instanceof Response ? out : new Response(JSON.stringify(out), { status: init?.method === "POST" && u === "/api/mcp/keys" ? 201 : 200 });
    })
  );
  return calls;
}

describe("AI connect: menu and sign-in return", () => {
  it("the menu shows AI connect only when the super admin switched it on, never to barbers", () => {
    expect(hrefs(PLAN_DEFAULTS.pro_max.features)).not.toContain("/ai-connect");
    expect(hrefs(ON)).toContain("/ai-connect");
    expect(hrefs(ON, "barber")).not.toContain("/ai-connect");
  });
  it("after sign-in only paths on this site are followed", () => {
    expect(nextPath("?next=%2Fconnect%2Fauthorize%2F%3Freq%3Dar_1")).toBe("/connect/authorize/?req=ar_1");
    for (const bad of ["?next=https://evil.example", "?next=//evil.example", "?next=/\\evil.example", "?next=/login/", ""]) expect(nextPath(bad)).toBe("/");
  });
});

describe("AI connect page", () => {
  const page = { enabled: true, server_url: "https://alpha.salonkit.online/mcp", max_connections: 5, connections: [], calls: [] };

  it("explains how to get it when it is off", async () => {
    stub({ "GET /api/mcp": () => ({ enabled: false }) });
    render(
      <AuthProvider>
        <AiConnectPage />
      </AuthProvider>
    );
    expect(await screen.findByText("AI connect isn’t switched on for your salon")).toBeTruthy();
  });

  it("shows the server address and a new key once, with the Claude Code command", async () => {
    const calls = stub({
      "GET /api/mcp": () => page,
      "POST /api/mcp/keys": () => ({ secret: "skt_" + "x".repeat(40), command: 'claude mcp add --transport http salonkit https://alpha.salonkit.online/mcp --header "Authorization: Bearer skt_x"' }),
    });
    render(
      <AuthProvider>
        <AiConnectPage />
      </AuthProvider>
    );
    expect((await screen.findByTestId("mcp-url")).textContent).toBe("https://alpha.salonkit.online/mcp");
    fireEvent.click(screen.getByRole("button", { name: /New API key/ }));
    fireEvent.change(await screen.findByPlaceholderText("e.g. Claude on my laptop"), { target: { value: "Laptop" } });
    fireEvent.click(screen.getByRole("button", { name: "Create key" }));
    expect((await screen.findByTestId("mcp-secret")).textContent).toBe("skt_" + "x".repeat(40));
    expect(screen.getByText(/claude mcp add --transport http salonkit/)).toBeTruthy();
    const post = calls.find((c) => c.url === "/api/mcp/keys");
    expect(JSON.parse(String(post!.init!.body))).toEqual({ name: "Laptop", scope: "read", expires_days: 90 });
  });
});

describe("AI connect consent", () => {
  const req = { id: "ar_1", app_name: "Claude", redirect_host: "claude.ai", scopes: ["read", "write"], salon: "Alpha Cuts", user: "Sam", support: false };

  it("read is always on; ticking write asks for it; Allow goes back to the app", async () => {
    window.history.replaceState(null, "", "/connect/authorize/?req=ar_1");
    const assign = vi.fn();
    const loc = window.location;
    vi.stubGlobal("location", { ...loc, search: "?req=ar_1", pathname: "/connect/authorize/", set href(v: string) { assign(v); } });
    const calls = stub({
      "GET /api/mcp/requests/ar_1": () => req,
      "POST /api/mcp/requests/ar_1": () => ({ redirect: "https://claude.ai/api/mcp/auth_callback?code=c1&state=s" }),
    });
    render(
      <AuthProvider>
        <ConnectAuthorizePage />
      </AuthProvider>
    );
    expect(await screen.findByText("Claude wants to connect to Alpha Cuts")).toBeTruthy();
    expect(screen.getByText("Read your salon’s data")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /Allow/ }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://claude.ai/api/mcp/auth_callback?code=c1&state=s"));
    const post = calls.find((c) => c.init?.method === "POST");
    expect(JSON.parse(String(post!.init!.body))).toEqual({ approve: true, write: true });
  });

  it("a signed-out visitor is sent to sign in and back", async () => {
    window.history.replaceState(null, "", "/connect/authorize/?req=ar_1");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Please sign in" }), { status: 401 })));
    render(
      <AuthProvider>
        <ConnectAuthorizePage />
      </AuthProvider>
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login/?next=%2Fconnect%2Fauthorize%2F%3Freq%3Dar_1"));
  });
});
