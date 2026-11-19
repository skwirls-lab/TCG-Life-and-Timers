import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";
import pkg from "./package.json";
import { securityHeaders, serviceWorkerHeaders } from "./src/lib/security/headers";

const dev = process.env.NODE_ENV === "development";

/**
 * Production builds are a static export (`output: "export"`) served by Firebase Hosting (DEPLOY.md
 * Part 3). With a static export, `distDir` names the export destination: `out/` by default,
 * `out-test/` / `out-emu/` for the e2e builds (NEXT_DIST_DIR, scripts/build.ts); build artefacts
 * still go to `.next/`. Response headers (CSP, HSTS, caching, the service worker's) live in
 * firebase.json, generated from src/lib/security/headers.ts by scripts/gen-hosting-config.ts.
 */
const nextConfig: NextConfig = {
  ...(dev ? {} : { output: "export" as const }),
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // URLs stay `/settings`, `/tools/mana` (files `settings.html`, `tools/mana.html`; Hosting cleanUrls).
  trailingSlash: false,
  reactStrictMode: true,
  poweredByHeader: false,
  // No image optimizer in a static export (the app uses plain <img> today).
  images: { unoptimized: true },
  // Bundle analysis only (`ANALYZE_SOURCEMAPS=1`); never set for deploys.
  productionBrowserSourceMaps: process.env.ANALYZE_SOURCEMAPS === "1",
  env: { NEXT_PUBLIC_APP_VERSION: pkg.version },
  // `next dev` only (an export ignores headers()): the same security headers as firebase.json.
  ...(dev
    ? {
        async headers() {
          return [
            {
              source: "/:path((?!__/).*)",
              headers: securityHeaders({
                dev: true,
                emulators: process.env.NEXT_PUBLIC_USE_EMULATORS === "1",
              }),
            },
            { source: "/serwist/sw.js", headers: serviceWorkerHeaders() },
          ];
        },
      }
    : {}),
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
