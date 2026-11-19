import { createSerwistRoute } from "@serwist/turbopack";
import { spawnSync } from "node:child_process";

const revision =
  spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim() ||
  crypto.randomUUID();

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute(
  {
    swSrc: "src/app/sw.ts",
    useNativeEsbuild: true,
    // The precache manifest globs the build's `static/` output. In a static export a custom
    // `distDir` (NEXT_DIST_DIR=out-test, next.config.ts) only names the export destination; the
    // build itself (and `static/`) is always in `.next`, so point Serwist there.
    nextConfig: { distDir: ".next" },
    additionalPrecacheEntries: [
      { url: "/~offline", revision },
      { url: "/", revision },
    ],
  },
);
