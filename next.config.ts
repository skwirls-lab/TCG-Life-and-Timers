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
      { source: "/:path*", headers: securityHeaders(cspOptions) },
      { source: "/serwist/sw.js", headers: serviceWorkerHeaders() },
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
