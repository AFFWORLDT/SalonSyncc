import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AuthProvider } from "@/lib/auth-context";
import LoginPage from "@/app/login/page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {}, replace() {} }), usePathname: () => "/login/" }));
vi.mock("@paper-design/shaders-react", () => ({ MeshGradient: () => null }));
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

function stub(brand: { name: string | null; logo_url: string | null }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.startsWith("/api/public/brand")) return new Response(JSON.stringify(brand));
      return new Response(JSON.stringify({ error: "Please sign in" }), { status: 401 });
    })
  );
}
const page = () =>
  render(
    <AuthProvider>
      <LoginPage />
    </AuthProvider>
  );

describe("login page shows the salon's own brand", () => {
  it("the salon's logo and name when it uploaded one", async () => {
    window.history.replaceState(null, "", "/login/?org=alpha");
    stub({ name: "Alpha Cuts", logo_url: "/api/public/logo/2?org=alpha" });
    page();
    expect(await screen.findByText("Sign in to Alpha Cuts")).toBeTruthy();
    expect(screen.getByAltText("Alpha Cuts").getAttribute("src")).toBe("/api/public/logo/2?org=alpha");
    expect(screen.queryByAltText("SalonKit")).toBeNull();
  });
  it("the SalonKit logo when the salon has no logo", async () => {
    window.history.replaceState(null, "", "/login/?org=beta");
    stub({ name: "Beta", logo_url: null });
    page();
    expect(await screen.findByText("Sign in to Beta")).toBeTruthy();
    expect(screen.getByAltText("SalonKit")).toBeTruthy();
  });
});
