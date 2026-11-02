import { test as base, expect } from "@playwright/test";

/** The first-login tour would cover the page: e2e runs with it off. */
const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => localStorage.setItem("ss_tour_off", "1"));
    await use(page);
  },
});

/** A new salon signs up (same-origin POST, as the site does), follows its handoff link and lands signed in. */
test("signup to signed-in dashboard, link single-use", async ({ page }) => {
  const slug = `e2e-${Date.now().toString(36)}`;
  await page.goto("/login/");
  const res = await page.evaluate(async (s) => {
    const r = await fetch("/api/public/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ salon_name: "E2E Cuts", slug: s, owner_name: "Eve Owner", email: `${s}@example.com`, phone: "", password: "longpass1", country: "IN" }),
    });
    return { status: r.status, body: await r.json() };
  }, slug);
  expect(res.status).toBe(201);
  const url: string = res.body.handoff_url;
  expect(url).toContain(`org=${slug}`);
  await page.goto(url);
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  await expect(page.getByText(/left in your free trial/)).toBeVisible();
  await expect(page.getByTestId("setup-checklist")).toBeVisible();
  // The link works once.
  await page.context().clearCookies();
  await page.goto(url);
  await expect(page.getByText("This sign-in link has expired. Sign in with your password.")).toBeVisible();
});
