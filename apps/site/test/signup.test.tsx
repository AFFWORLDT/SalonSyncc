import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SignupForm } from "@/components/signup-form";

afterEach(() => vi.unstubAllGlobals());

function serve(slugAnswer: (s: string) => object, signup: () => Response) {
  const calls: { url: string; body?: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      calls.push({ url: u, body: init?.body as string | undefined });
      if (u.startsWith("/api/public/slug")) return new Response(JSON.stringify(slugAnswer(new URL(u, "http://x").searchParams.get("s")!)));
      return signup();
    })
  );
  return calls;
}
const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("signup form", () => {
  it("suggests the salon ID from the name and checks it live", async () => {
    const calls = serve((s) => ({ slug: s, available: true }), () => new Response("{}"));
    render(<SignupForm />);
    fill("Salon name", "Beard & Co. Salon");
    expect((screen.getByLabelText("Salon ID") as HTMLInputElement).value).toBe("beard-co-salon");
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("beard-co-salon is yours"), { timeout: 3000 });
    expect(calls.some((c) => c.url === "/api/public/slug?s=beard-co-salon")).toBe(true);
  });

  it("shows when the ID is taken", async () => {
    serve((s) => ({ slug: s, available: false, reason: "taken" }), () => new Response("{}"));
    render(<SignupForm />);
    fill("Salon name", "Taken Salon");
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("That salon ID is taken"), { timeout: 3000 });
  });

  it("posts the API's shape and goes to the new salon", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    const calls = serve((s) => ({ slug: s, available: true }), () => new Response(JSON.stringify({ slug: "fresh-cuts", handoff_url: "https://fresh-cuts.salonkit.online/login/?handoff=x" }), { status: 201 }));
    render(<SignupForm />);
    fill("Salon name", "Fresh Cuts");
    fill("Your name", "Sam Owner");
    fill("Email", "sam@example.com");
    fill("Password", "longpass1");
    await waitFor(() => expect((screen.getByText("Start my free trial").closest("button") as HTMLButtonElement).disabled).toBe(false), { timeout: 3000 });
    fireEvent.click(screen.getByText("Start my free trial"));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://fresh-cuts.salonkit.online/login/?handoff=x"));
    const body = JSON.parse(calls.find((c) => c.url === "/api/public/signup")!.body!);
    expect(body).toEqual({ salon_name: "Fresh Cuts", slug: "fresh-cuts", owner_name: "Sam Owner", email: "sam@example.com", phone: "", password: "longpass1", country: "AE" });
  });

  it("a 409 from the API is shown", async () => {
    serve((s) => ({ slug: s, available: true }), () => new Response(JSON.stringify({ error: "That salon ID is taken" }), { status: 409 }));
    render(<SignupForm />);
    fill("Salon name", "Race Salon");
    fill("Your name", "Sam");
    fill("Email", "s@example.com");
    fill("Password", "longpass1");
    await waitFor(() => expect((screen.getByText("Start my free trial").closest("button") as HTMLButtonElement).disabled).toBe(false), { timeout: 3000 });
    fireEvent.click(screen.getByText("Start my free trial"));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "That salon ID is taken");
  });

  it("no Turnstile widget without a site key", () => {
    serve(() => ({ available: true }), () => new Response("{}"));
    render(<SignupForm />);
    expect(screen.queryByTestId("turnstile")).toBeNull();
    expect(document.querySelector('script[src*="turnstile"]')).toBeNull();
  });
});

import { EMAIL_RE, phoneOk } from "@/components/signup-form";
describe("form rules match the API", () => {
  it("phones", () => {
    expect(phoneOk("+971 50-123-4567")).toBe(true);
    expect(phoneOk("(050) 123 4567")).toBe(true);
    expect(phoneOk("")).toBe(true);
    expect(phoneOk("call me")).toBe(false);
  });
  it("emails", () => {
    expect(EMAIL_RE.test("sam@example.com")).toBe(true);
    expect(EMAIL_RE.test("o'brien@x.com")).toBe(false);
  });
});
