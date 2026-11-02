import { test, expect, type Page } from "@playwright/test";
import { execSync } from "node:child_process";

const sql = (q: string) =>
  execSync(`npx wrangler d1 execute salonkit-db --local --command "${q}"`, {
    cwd: "../api",
    env: { ...process.env, XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME ?? `${process.env.HOME}/.wrangler-affworld` },
    stdio: "pipe",
  });

async function login(page: Page, org: string) {
  await page.goto("/login/");
  await page.getByLabel("Salon ID").fill(org);
  await page.getByLabel("Username").fill("owner");
  await page.getByLabel("Password").fill("pass1234");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test.afterAll(() => sql("UPDATE orgs SET status='active' WHERE slug='alpha'"));

test("trial salon owner gets the admin menu and the ledger", async ({ page }) => {
  await login(page, "bravo");
  await expect(page.getByRole("link", { name: "Sales" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Ledger" }).first()).toBeVisible();
  await expect(page.getByText(/left in your free trial/)).toBeVisible();
});

test("free salon has no ledger; opening it shows the Upgrade card", async ({ page }) => {
  sql("UPDATE orgs SET status='active' WHERE slug='alpha'");
  await login(page, "alpha");
  await expect(page.getByRole("link", { name: "Sales" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Ledger" })).toHaveCount(0);
  await page.goto("/ledger/");
  await expect(page.getByText(/Upgrade to unlock Ledger/)).toBeVisible();
});

test("an expired salon is read-only", async ({ page }) => {
  sql("UPDATE orgs SET status='active' WHERE slug='alpha'");
  await login(page, "alpha");
  sql("UPDATE orgs SET status='expired' WHERE slug='alpha'");
  await page.goto("/sales/");
  await expect(page.getByTestId("expired-screen")).toBeVisible();
});
