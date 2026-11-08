import { describe, it, expect, vi, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AuthProvider } from "@/lib/auth-context";
import LoginPage from "@/app/login/page";

// One router object, as in Next (a new one per render would re-run the page's mount effect and clear the salon ID).
const router = { push() {}, replace() {} };
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/login/" }));
vi.mock("@paper-design/shaders-react", () => ({ MeshGradient: () => null }));
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("login: sign in with an email code", () => {
  it("salon ID, email, Email me a code, then the 6 digits", async () => {
    const calls: { url: string; body: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const u = String(url);
        if (init?.body) calls.push({ url: u, body: JSON.parse(String(init.body)) });
        if (u.startsWith("/api/public/brand")) return new Response(JSON.stringify({ name: null, logo_url: null }));
        if (u === "/api/auth/code" || u === "/api/auth/code/verify") return new Response(JSON.stringify({ ok: true }));
        return new Response(JSON.stringify({ error: "Please sign in" }), { status: 401 });
      })
    );
    render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    );
    fireEvent.click(await screen.findByText("Email me a sign-in code"));
    fireEvent.change(screen.getByLabelText("Salon ID"), { target: { value: "Super" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "sam@mail.com" } });
    const send = screen.getByRole("button", { name: "Email me a code" }) as HTMLButtonElement;
    expect(send.disabled).toBe(false);
    fireEvent.submit(send.closest("form")!);
    const box = await screen.findByLabelText("6-digit code");
    expect(calls.find((c) => c.url === "/api/auth/code")!.body).toEqual({ email: "sam@mail.com", org: "super" });
    expect(screen.getByText(/a 6-digit code is on its way/)).toBeTruthy();
    fireEvent.change(box, { target: { value: "123 456" } });
    fireEvent.submit(box.closest("form")!);
    await waitFor(() => expect(calls.some((c) => c.url === "/api/auth/code/verify")).toBe(true));
    expect(calls.find((c) => c.url === "/api/auth/code/verify")!.body).toEqual({ email: "sam@mail.com", code: "123456", org: "super" });
  });
});
