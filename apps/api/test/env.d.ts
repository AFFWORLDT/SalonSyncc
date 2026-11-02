import type { D1Migration } from "@cloudflare/vitest-plugin";

declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      SESSION_SECRET: string;
      BRAND_NAME: string;
      ROOT_DOMAIN: string;
      ADMIN_HOST: string;
      MAIL_FROM: string;
      SUPPORT_EMAIL: string;
      TEST_MIGRATIONS: D1Migration[];
      ENVIRONMENT: string;
    }
  }
}
