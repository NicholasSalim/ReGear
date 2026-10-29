import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
// HTTPS-only protections are enabled whenever the public origin is HTTPS
// (always the case in a real deployment; plain-HTTP local runs stay usable).
const isHttps = (process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https://");

// Content Security Policy.
// Cache Components / Partial Prerendering serve prerendered static shells, which
// cannot carry per-request nonces, so Next's inline bootstrap scripts require
// 'unsafe-inline'. Everything else is locked down: no third-party origins, no
// plugins, no framing, no <base> hijacking, forms may only post to ourselves.
// See README "Security" for the nonce-based alternative.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // Map tiles for the delivery pin (OpenStreetMap).
  "img-src 'self' data: blob: https://tile.openstreetmap.org",
  "font-src 'self'",
  // Place search for the delivery pin (OpenStreetMap Nominatim).
  `connect-src 'self' https://nominatim.openstreetmap.org${isDev ? " ws: wss:" : ""}`,
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  ...(isHttps ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=(), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  ...(isHttps ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }] : []),
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ["sharp"],
  experimental: {
    authInterrupts: true,
    // The root layout lives under app/[lang]; unmatched URLs need a 404 of their own.
    globalNotFound: true,
    // Verification documents are posted through a Server Action (validated & capped at 8MB in code).
    serverActions: { bodySizeLimit: "10mb" },
  },
  images: {
    formats: ["image/avif", "image/webp"],
    localPatterns: [{ pathname: "/media/**" }],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    deviceSizes: [384, 640, 828, 1080, 1280, 1600],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async redirects() {
    // Wearables became Smartwatches; keep old links and bookmarks working.
    return [{ source: "/c/wearables", destination: "/c/smartwatches", permanent: true }];
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Authenticated areas and pages that carry one-time tokens must never be
      // stored by shared caches, in either language.
      ...["", "/en"].map((prefix) => ({
        source: `${prefix}/(account|sell|admin|checkout|disputes|login|register|forgot-password|reset-password|verify-email|goodbye)(.*)`,
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      })),
    ];
  },
};

export default nextConfig;
