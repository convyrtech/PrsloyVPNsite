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
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
