import { test as base, expect } from "@playwright/test";
import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => localStorage.setItem("ss_tour_off", "1"));
    await use(page);
  },
});

const env = { ...process.env, XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME ?? `${process.env.HOME}/.wrangler-affworld` };
const EMAIL = "e2e-admin@salonkit.test";
const PASSWORD = "e2e-admin-pass-1";

test.beforeAll(() => {
  // A local-only super admin, made with the same script used for production (password from env, not stored anywhere).
  const sqlText = execSync(`node --experimental-strip-types scripts/platform-user.ts ${EMAIL} owner`, { cwd: "../api", env: { ...env, PLATFORM_PASSWORD: PASSWORD }, stdio: ["ignore", "pipe", "ignore"] }).toString();
  const file = join(mkdtempSync(join(tmpdir(), "pu-")), "pu.sql");
  writeFileSync(file, sqlText);
  execSync(`npx wrangler d1 execute salonkit-db --local --file ${file}`, { cwd: "../api", env, stdio: "pipe" });
});

test("super admin signs in, opens a salon and logs in as it (support mode)", async ({ page, context }) => {
  await page.goto("/platform/");
  await page.waitForURL(/\/platform\/login/);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  await page.getByRole("link", { name: "Salons" }).first().click();
  await page.getByPlaceholder("Name, salon ID or email").fill("bravo");
  await page.getByRole("link", { name: /bravo/i }).first().click();
  await expect(page.getByText("Features")).toBeVisible();

  const [tab] = await Promise.all([context.waitForEvent("page"), page.getByRole("button", { name: "Log in as salon" }).click()]);
  await tab.waitForURL((u) => !u.pathname.startsWith("/login"));
  await expect(tab.getByTestId("support-banner")).toBeVisible();
});
