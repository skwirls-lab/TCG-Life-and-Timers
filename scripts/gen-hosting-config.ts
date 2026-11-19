/**
 * Firebase Hosting config (DEPLOY.md Part 3), generated from src/lib/security/headers.ts, the
 * single source of truth for the security headers.
 *
 *   tsx scripts/gen-hosting-config.ts            check that firebase.json `hosting` matches (exit 1)
 *   tsx scripts/gen-hosting-config.ts --write    rewrite firebase.json `hosting`
 *
 * `hostingConfig()` is also used by scripts/serve-hosting.ts, which serves the e2e / Lighthouse
 * builds with the Hosting emulator under the same headers, rewrites and clean URLs (the emulator
 * build gets the CSP's local-emulator relaxations).
 *
 * Header rules use RE2 `regex` (Hosting and the emulator both support it) so that they can leave
 * out `/__/*`: Hosting's reserved namespace (the Firebase Auth handler `/__/auth/handler`, which
 * the SDK frames same-origin, and `/__/firebase/init.js`). The app CSP's `frame-ancestors 'none'`
 * and `X-Frame-Options: DENY` would break the framed handler. RE2 has no lookahead, hence the
 * spelled-out "first segment is not `__`" alternatives.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import {
  securityHeaders,
  serviceWorkerHeaders,
  type CspOptions,
  type HeaderEntry,
} from "../src/lib/security/headers";
import { SHARE_PAGE_PLACEHOLDER } from "../src/lib/share/sharePath";

/** Any path except Hosting's reserved `/__/…` namespace. */
export const NOT_RESERVED = "^/(?:[^_].*|_[^_].*|__[^/].*|_|__)?$";
/**
 * Pages and their RSC payloads, which change with every deploy: extension-less URLs (clean URLs:
 * `/`, `/settings`, `/tools/mana`), `*.html`, the `*.txt` RSC payloads a client navigation
 * fetches, and the web manifest. `/__/…` is left out; `/_next/static/` only holds hashed .js/.css.
 */
export const REVALIDATE =
  "^/(?:[^_.][^.]*|_[^_.][^.]*|__[^/.][^.]*)?$|^/(?:[^_]|_[^_]|__[^/]).*\\.(?:html|txt|webmanifest)$";

export const IMMUTABLE = "public, max-age=31536000, immutable";
export const NO_CACHE = "no-cache";
export const SW_PATH = "/serwist/sw.js";

export interface HostingHeaderRule {
  source?: string;
  regex?: string;
  headers: HeaderEntry[];
}

export interface HostingConfig {
  public: string;
  ignore: string[];
  cleanUrls: boolean;
  trailingSlash: boolean;
  rewrites: { source: string; destination: string }[];
  headers: HostingHeaderRule[];
}

export interface HostingOptions extends CspOptions {
  /** Directory to serve (default `out`, the production export). */
  public?: string;
}

export function hostingConfig(opts: HostingOptions = {}): HostingConfig {
  const { public: dir = "out", ...csp } = opts;
  return {
    public: dir,
    ignore: ["firebase.json", "**/.*", "**/node_modules/**"],
    // `/settings` serves settings.html; `/settings.html` and `/settings/` redirect to `/settings`.
    cleanUrls: true,
    trailingSlash: false,
    rewrites: [
      // One exported share page reads the code from the URL (src/app/p/[code]/page.tsx).
      { source: "/p/**", destination: `/p/${SHARE_PAGE_PLACEHOLDER}.html` },
    ],
    headers: [
      // Security headers on every response but /__/* (T8.4, PRD §19.6).
      { regex: NOT_RESERVED, headers: securityHeaders(csp) },
      // Content-hashed build output: cache forever.
      { source: "/_next/static/**", headers: [{ key: "Cache-Control", value: IMMUTABLE }] },
      // HTML, RSC payloads, the manifest: always revalidate (ETag), so a deploy shows up at once.
      { regex: REVALIDATE, headers: [{ key: "Cache-Control", value: NO_CACHE }] },
      // The service worker script: never HTTP-cached (PWA-004), allowed to control scope `/`.
      { source: SW_PATH, headers: serviceWorkerHeaders() },
    ],
  };
}

const FIREBASE_JSON = "firebase.json";

export function readFirebaseJson(path = FIREBASE_JSON): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

/** Differences between firebase.json's `hosting` and the generated config ([] when in sync). */
export function hostingDrift(actual: unknown, expected: HostingConfig = hostingConfig()): string[] {
  if (isDeepStrictEqual(actual, expected)) return [];
  if (!actual || typeof actual !== "object") return ["firebase.json has no `hosting` object"];
  const a = actual as Record<string, unknown>;
  const keys = new Set([...Object.keys(a), ...Object.keys(expected)]);
  return [...keys]
    .filter((k) => !isDeepStrictEqual(a[k], (expected as unknown as Record<string, unknown>)[k]))
    .map((k) => `hosting.${k} differs from scripts/gen-hosting-config.ts`);
}

async function main(argv: string[]): Promise<number> {
  const json = readFirebaseJson();
  if (argv.includes("--write")) {
    const prettier = await import("prettier");
    const next = { ...json, hosting: hostingConfig() };
    const options = (await prettier.resolveConfig(FIREBASE_JSON)) ?? {};
    const text = await prettier.format(JSON.stringify(next), {
      ...options,
      filepath: FIREBASE_JSON,
    });
    writeFileSync(FIREBASE_JSON, text);
    console.log("firebase.json hosting written");
    return 0;
  }
  const drift = hostingDrift(json.hosting);
  if (drift.length) {
    console.error("firebase.json is out of date; run `npm run gen:hosting`:");
    for (const d of drift) console.error("  " + d);
    return 1;
  }
  console.log("firebase.json hosting OK");
  return 0;
}

if (process.argv[1] && /gen-hosting-config\.ts$/.test(process.argv[1])) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
