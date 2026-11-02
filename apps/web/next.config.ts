import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/**
 * Production: a static export served by the Worker's assets (api/wrangler.jsonc).
 * Dev: `next dev` with /api proxied to `wrangler dev` on :8787.
 */
const nextConfig: NextConfig = {
  images: { unoptimized: true },
  ...(isProd
    ? { output: "export", trailingSlash: true }
    : {
        async rewrites() {
          return [{ source: "/api/:path*", destination: "http://localhost:8787/api/:path*" }];
        },
      }),
};

export default nextConfig;
