import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";
import pkg from "./package.json";
import { securityHeaders, serviceWorkerHeaders } from "./src/lib/security/headers";

const cspOptions = {
  dev: process.env.NODE_ENV === "development",
  emulators: process.env.NEXT_PUBLIC_USE_EMULATORS === "1",
};

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  reactStrictMode: true,
  poweredByHeader: false,
  // Bundle analysis only (`ANALYZE_SOURCEMAPS=1`); never set for deploys.
  productionBrowserSourceMaps: process.env.ANALYZE_SOURCEMAPS === "1",
  env: { NEXT_PUBLIC_APP_VERSION: pkg.version },
  // T8.4 (PRD §19.6): CSP + HSTS + nosniff + Referrer/Permissions-Policy on every response.
  async headers() {
    return [
      // Not on /__/* (the proxied Firebase Auth handler below): it is framed by the app and sets
      // its own headers, so our frame-ancestors 'none' / X-Frame-Options DENY would break it.
      { source: "/:path((?!__/).*)", headers: securityHeaders(cspOptions) },
      { source: "/serwist/sw.js", headers: serviceWorkerHeaders() },
    ];
  },
  // Same-origin Firebase Auth handler (NEXT_PUBLIC_AUTH_SAME_ORIGIN, src/lib/firebase/config.ts):
  // the redirect sign-in flow needs /__/auth on the app's own host in browsers that partition
  // third-party storage. Harmless while the flag is off.
  async rewrites() {
    const domain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
    if (!domain || domain === "REPLACE_ME" || cspOptions.emulators) return [];
    return [
      { source: "/__/auth/:path*", destination: `https://${domain}/__/auth/:path*` },
      { source: "/__/firebase/:path*", destination: `https://${domain}/__/firebase/:path*` },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withSerwist(nextConfig);
