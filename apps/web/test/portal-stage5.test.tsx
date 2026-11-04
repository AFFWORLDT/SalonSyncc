import { describe, it, expect, vi, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { actionLabel, featureSource } from "@/lib/platform";
import PlatformLoginPage from "@/app/platform/login/page";
import BundlesPage from "@/app/platform/bundles/page";
import AppVersionsPage from "@/app/platform/app/page";
import { RoleGrid } from "@/components/platform/role-grid";
import { ApplyBundle } from "@/components/platform/apply-bundle";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {}, replace() {} }), usePathname: () => "/platform/" }));
afterEach(() => vi.unstubAllGlobals());
// jsdom has no PointerEvent; the switch component dispatches one.
if (!("PointerEvent" in window)) Object.assign(window, { PointerEvent: MouseEvent });

type Call = { key: string; body: unknown };
function stub(routes: Record<string, (body: unknown) => unknown | Response>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const key = `${init?.method ?? "GET"} ${String(url)}`;
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ key, body });
      const h = routes[key];
      if (!h) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
      const out = h(body);
      return out instanceof Response ? out : new Response(JSON.stringify(out));
    }),
  );
  return calls;
}

describe("Atlantic Portal helpers", () => {
  it("feature source: plan, override, bundle", () => {
    expect(featureSource(undefined)).toBe("Plan");
    expect(featureSource({ reason: "Pilot" })).toBe("Override");
    expect(featureSource({ reason: "Bundle: Barber extras" })).toBe("Bundle: Barber extras");
  });
  it("new audit actions read as sentences", () => {
    expect(actionLabel("bundle_apply")).toBe("applied a bundle");
    expect(actionLabel("bundle_create")).toBe("created a bundle");
    expect(actionLabel("role_feature")).toBe("changed a role switch");
    expect(actionLabel("app_config")).toBe("changed the app versions");
  });
});

describe("Atlantic Portal name", () => {
  it("login says Atlantic Portal", () => {
    render(<PlatformLoginPage />);
    expect(screen.getByText("Atlantic Portal")).toBeTruthy();
    expect(screen.getByText("For the SalonKit team only.")).toBeTruthy();
  });
});

describe("Bundles page", () => {
  const list = [{ id: 1, name: "Barber extras", description: "Ledger + audit", features: { ledger: true, audit_log: true }, updated_at: 1 }];

  it("lists bundles with what they switch", async () => {
    stub({ "GET /api/platform/bundles": () => list });
    render(<BundlesPage />);
    expect(await screen.findByText("Barber extras")).toBeTruthy();
    expect(screen.getByText("Ledger + audit")).toBeTruthy();
    expect(screen.getByText(/Ledger and payouts on/)).toBeTruthy();
  });

  it("creates a bundle from the three-way switches", async () => {
    const calls = stub({ "GET /api/platform/bundles": () => [], "POST /api/platform/bundles": (b) => ({ id: 2, ...(b as object), updated_at: 2 }) });
    render(<BundlesPage />);
    fireEvent.click(await screen.findByText("New bundle"));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "WhatsApp pack" } });
    fireEvent.click(screen.getByLabelText("WhatsApp bills and reminders: on"));
    fireEvent.click(screen.getByLabelText("Push notifications: off"));
    fireEvent.click(screen.getByText("Save bundle"));
    await waitFor(() => expect(calls.some((c) => c.key === "POST /api/platform/bundles")).toBe(true));
    expect(calls.find((c) => c.key === "POST /api/platform/bundles")!.body).toEqual({ name: "WhatsApp pack", description: "", features: { push: false, whatsapp: true } });
  });

  it("shows the server's words", async () => {
    stub({
      "GET /api/platform/bundles": () => [],
      "POST /api/platform/bundles": () => new Response(JSON.stringify({ error: "A bundle with that name exists" }), { status: 409 }),
    });
    render(<BundlesPage />);
    fireEvent.click(await screen.findByText("New bundle"));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Dup" } });
    fireEvent.click(screen.getByLabelText("Ledger and payouts: on"));
    fireEvent.click(screen.getByText("Save bundle"));
    expect(await screen.findByText("A bundle with that name exists")).toBeTruthy();
  });
});

describe("App page", () => {
  const cfg = {
    platforms: [
      { platform: "android", min_version: "1.0.0", latest_version: "1.0.0", store_url: "https://play.google.com/store/apps/details?id=online.salonkit.app", updated_at: 1 },
      { platform: "ios", min_version: "1.0.0", latest_version: "1.1.0", store_url: "https://apps.apple.com/app/salonkit", updated_at: 1 },
    ],
    devices: { ios: { "1.0.0": 3, "1.1.0": 5 }, android: {} },
  };

  it("shows versions and devices; saves; server errors shown", async () => {
    let n = 0;
    const calls = stub({
      "GET /api/platform/app-config": () => cfg,
      "PUT /api/platform/app-config/ios": () => (n++ === 0 ? new Response(JSON.stringify({ error: "The minimum version can't be above the latest" }), { status: 400 }) : { ok: true }),
    });
    render(<AppVersionsPage />);
    expect(await screen.findByText("iPhone")).toBeTruthy();
    expect(screen.getByText("1.1.0 · 5 devices")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("iPhone minimum version"), { target: { value: "2.0.0" } });
    fireEvent.click(screen.getByText("Save iPhone"));
    expect(await screen.findByText("The minimum version can't be above the latest")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("iPhone minimum version"), { target: { value: "1.1.0" } });
    fireEvent.click(screen.getByText("Save iPhone"));
    await waitFor(() => expect(calls.filter((c) => c.key === "PUT /api/platform/app-config/ios")).toHaveLength(2));
    expect(calls.filter((c) => c.key === "PUT /api/platform/app-config/ios")[1]!.body).toEqual({ min_version: "1.1.0", latest_version: "1.1.0", store_url: "https://apps.apple.com/app/salonkit" });
  });
});

describe("Salon page: By role", () => {
  it("shows the grid and switches a feature off for barbers", async () => {
    const all = (v: boolean) => ({ core_sales: true, expenses: v, ledger: true, ratings: true });
    const calls = stub({
      "GET /api/platform/orgs/o1/role-features": () => ({ barber: all(true), admin: all(true) }),
      "PUT /api/platform/orgs/o1/role-features/barber/ledger": () => ({ ok: true }),
    });
    render(<RoleGrid orgId="o1" features={["core_sales", "expenses", "ledger", "ratings"]} canEdit />);
    expect(await screen.findByText("By role")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Ledger and payouts for barbers"));
    await waitFor(() => expect(calls.some((c) => c.key === "PUT /api/platform/orgs/o1/role-features/barber/ledger")).toBe(true));
    expect(calls.find((c) => c.key === "PUT /api/platform/orgs/o1/role-features/barber/ledger")!.body).toEqual({ enabled: false });
    expect(screen.queryByLabelText("Sales and bills for barbers")).toBeNull();
  });
});

describe("Salon page: Apply bundle", () => {
  it("previews the changes, then applies", async () => {
    const calls = stub({
      "GET /api/platform/bundles": () => [{ id: 1, name: "Pro plus ledger", description: null, features: { ledger: true, push: false }, updated_at: 1 }],
      "GET /api/platform/orgs/o1/bundles/1/preview": () => ({ changes: [{ key: "push", from: true, to: false }, { key: "ledger", from: false, to: true }] }),
      "POST /api/platform/orgs/o1/bundles/1/apply": () => ({ ok: true, changed: 2 }),
    });
    const done = vi.fn();
    render(<ApplyBundle orgId="o1" onApplied={done} />);
    fireEvent.click(screen.getByText("Apply bundle"));
    fireEvent.click(await screen.findByText("Pro plus ledger"));
    expect(await screen.findByText("2 changes")).toBeTruthy();
    expect(screen.getByText("Push notifications: on → off")).toBeTruthy();
    expect(screen.getByText("Ledger and payouts: off → on")).toBeTruthy();
    fireEvent.click(screen.getByText("Apply"));
    await waitFor(() => expect(done).toHaveBeenCalled());
    expect(calls.some((c) => c.key === "POST /api/platform/orgs/o1/bundles/1/apply")).toBe(true);
  });

  it("nothing to change says so", async () => {
    stub({
      "GET /api/platform/bundles": () => [{ id: 1, name: "Same", description: null, features: { ledger: true }, updated_at: 1 }],
      "GET /api/platform/orgs/o1/bundles/1/preview": () => ({ changes: [] }),
    });
    render(<ApplyBundle orgId="o1" onApplied={() => {}} />);
    fireEvent.click(screen.getByText("Apply bundle"));
    fireEvent.click(await screen.findByText("Same"));
    expect(await screen.findByText("This salon already matches the bundle.")).toBeTruthy();
  });
});
