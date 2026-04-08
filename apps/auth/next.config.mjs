import process from "node:process";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["192.168.100.4"],
  transpilePackages: ["@nodiox/ui", "@nodiox/utils", "@nodiox/i18n"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "fonts.gstatic.com",
      },
    ],
  },
  async headers() {
    const isProd = process.env.NODE_ENV === "production";
    return [
      {
        source: "/(.*)",
        headers: [
          // CSP is now handled dynamically in proxy.ts (middleware) with per-request nonces
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
          },
          // Helps isolate browsing contexts and reduce XS leaks.
          // If this breaks a specific integration, we can scope it by route.
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          {
            key: "Cross-Origin-Resource-Policy",
            value: "same-site",
          },
          {
            key: "Strict-Transport-Security",
            value: isProd ? "max-age=31536000; includeSubDomains; preload" : "",
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
