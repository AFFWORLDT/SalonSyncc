import { defineConfig } from "@playwright/test";

/**
 * End-to-end smoke against the real Worker serving the built dashboard (same origin, local D1):
 *   npm run build -w @ss/web && npm run db:migrate:local -w @ss/api && npm run db:seed:local -w @ss/api
 *   npm run e2e -w @ss/web
 * ROOT_DOMAIN is cleared so localhost login asks for the salon ID.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: { baseURL: "http://localhost:8787", trace: "retain-on-failure" },
  webServer: {
    command: "npx wrangler dev --local --port 8787 --var ROOT_DOMAIN:",
    cwd: "../api",
    url: "http://localhost:8787/api/health",
    reuseExistingServer: true,
    timeout: 120_000,
    env: { XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME ?? `${process.env.HOME}/.wrangler-affworld` },
  },
});
