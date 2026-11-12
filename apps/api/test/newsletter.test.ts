import { env } from "cloudflare:test";
import { describe, it, expect, afterEach } from "vitest";
import app from "../src/index";
import { fakeServices } from "./fakes";
import { setServicesForTest } from "../src/core/services";
import { NEWSLETTER_PER_IP_HOUR } from "../src/platform/newsletter";

const ROOT = "salonkit.online";
let pending: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => pending.push(p), passThroughOnException() {} } as unknown as ExecutionContext;
const settle = async () => {
  while (pending.length) await Promise.all(pending.splice(0));
};
const e = { ...env, ROOT_DOMAIN: ROOT };
const sub = (body: Record<string, unknown>, ip = "10.60.0.1") =>
  app.fetch(
    new Request(`https://${ROOT}/api/public/newsletter`, {
      method: "POST",
      headers: { "content-type": "application/json", "CF-Connecting-IP": ip, Origin: `https://${ROOT}` },
      body: JSON.stringify(body),
    }),
    e,
    ctx,
  );
const get = (path: string) => app.fetch(new Request(`https://${ROOT}/api/public/newsletter${path}`, { redirect: "manual" }), e, ctx);
const row = (email: string) => env.DB.prepare("SELECT * FROM newsletter_subscribers WHERE email = ?").bind(email).first<{ status: string; token: string; lang: string }>();

afterEach(() => setServicesForTest(null));

describe("newsletter", () => {
  it("double opt-in: pending, confirm link, then unsubscribe", async () => {
    const f = fakeServices();
    f.install();
    const r = await sub({ email: " Owner@Salon.ae ", lang: "ar" });
    expect(r.status).toBe(200);
    await settle();
    const p = await row("owner@salon.ae");
    expect(p).toMatchObject({ status: "pending", lang: "ar" });
    expect(f.mails).toHaveLength(1);
    expect(f.mails[0]!.to).toBe("owner@salon.ae");
    expect(f.mails[0]!.html).toContain(`/newsletter/confirm?t=${p!.token}`);

    const c = await get(`/confirm?t=${p!.token}`);
    expect(c.status).toBe(302);
    expect(c.headers.get("location")).toBe(`https://${ROOT}/ar/newsletter/?s=confirmed`);
    expect((await row("owner@salon.ae"))!.status).toBe("confirmed");

    // Signing up again while confirmed sends nothing.
    await sub({ email: "owner@salon.ae" });
    await settle();
    expect(f.mails).toHaveLength(1);

    const u = await get(`/unsubscribe?t=${p!.token}`);
    expect(u.headers.get("location")).toBe(`https://${ROOT}/ar/newsletter/?s=unsubscribed`);
    expect((await row("owner@salon.ae"))!.status).toBe("unsubscribed");
  });

  it("one confirmation email per address per day, bots and bad emails are ignored", async () => {
    const f = fakeServices();
    f.install();
    await sub({ email: "a@b.ae" }, "10.60.1.1");
    await sub({ email: "a@b.ae" }, "10.60.1.2");
    await settle();
    expect(f.mails).toHaveLength(1);
    expect((await sub({ email: "x@y.ae", website: "spam" }, "10.60.1.3")).status).toBe(200);
    expect(await row("x@y.ae")).toBeNull();
    expect((await sub({ email: "not-an-email" }, "10.60.1.4")).status).toBe(400);
    expect((await get("/confirm?t=nope")).headers.get("location")).toBe(`https://${ROOT}/newsletter/?s=invalid`);
  });

  it(`at most ${NEWSLETTER_PER_IP_HOUR} sign-ups per IP per hour`, async () => {
    fakeServices().install();
    for (let i = 0; i < NEWSLETTER_PER_IP_HOUR; i++) expect((await sub({ email: `n${i}@b.ae` }, "10.60.2.1")).status).toBe(200);
    expect((await sub({ email: "late@b.ae" }, "10.60.2.1")).status).toBe(429);
    await settle();
  });
});
