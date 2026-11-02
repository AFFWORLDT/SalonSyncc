import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { money } from "@/lib/format";
import { meFixture } from "./fixtures";

vi.mock("@/lib/push", () => ({ forgetPushToken: async () => {} }));
afterEach(() => vi.unstubAllGlobals());

function Probe() {
  const a = useAuth();
  if (!a.me) return <p>none</p>;
  return (
    <p>
      {a.isAdmin ? "admin" : "staff"} {a.has("ledger") ? "ledger" : "no-ledger"} {a.readOnly ? "ro" : "rw"} {money(2500)}
    </p>
  );
}

describe("session", () => {
  it("loads /api/me once, treats the owner as admin and formats in the salon currency", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(meFixture({ role: "owner", features: ["core_sales", "ledger"], currency: "KWD", minor: 1000 }))));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText(/admin ledger rw/)).toBeTruthy());
    expect(screen.getByText(/KWD 2.5/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe("/api/me");
  });
  it("an expired salon is read-only; a barber is not admin", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(meFixture({ role: "barber", status: "expired" })))));
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText(/staff no-ledger ro/)).toBeTruthy());
  });
});
