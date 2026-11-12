import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/** The SalonKit marketing site: a static export served by the salonkit-site Worker; /api goes to the app Worker. */
const nextConfig: NextConfig = {
  images: { unoptimized: true },
  experimental: { globalNotFound: true },
  ...(isProd
    ? { output: "export", trailingSlash: true }
    : {
        async rewrites() {
          return [{ source: "/api/:path*", destination: "http://localhost:8787/api/:path*" }];
        },
      }),
};

export default nextConfig;
