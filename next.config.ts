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
          // Force HTTPS for 2 years, closing the first-load SSL-strip window
          // for ad clicks on hostile networks. `includeSubDomains` is omitted
          // on purpose: this header is served from the apex too (the apex→www
          // redirect does NOT strip it), so the directive would pin every
          // *.prsloy.online subdomain to HTTPS for 2 years — an irreversible,
          // browser-cached commitment — and we have not confirmed every
          // subdomain is HTTPS-only. `preload` is likewise omitted (it needs an
          // hstspreload.org submission plus that same all-subdomains pledge).
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000",
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
