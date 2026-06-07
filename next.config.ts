import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Cut bundle size for tree-shakeable libs
  experimental: {
    optimizePackageImports: ["three", "motion"],
  },
  // Turbopack settings (replaces deprecated experimental.turbo)
  turbopack: {},
  // Allow loading local images / future Vercel-hosted assets
  images: {
    formats: ["image/avif", "image/webp"],
  },
  // Security + performance headers
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // Force HTTPS on the (www) origin the user lands on, closing the
          // first-load SSL-strip window for ad clicks on hostile networks.
          // The apex→www redirect strips response headers, so this only sticks
          // on the final origin — which is where the user ends up. `preload`
          // is intentionally omitted (it needs an hstspreload.org submission +
          // a permanent all-subdomains-HTTPS commitment — a manual decision).
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
