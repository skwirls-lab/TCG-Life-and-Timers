/**
 * Which host serves the Firebase Auth sign-in handler (AUTH-001). Kept out of ./config, which is
 * part of every route's start-up JS (analytics consent boot), and imported only by the lazy
 * Firebase client (client.ts) and the sign-in store (PERF-003).
 */

/** Literal `process.env.NEXT_PUBLIC_*` reads (Next inlines only those, D-050). */
export function authEnv(): Record<string, string | undefined> {
  return {
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_AUTH_SAME_ORIGIN: process.env.NEXT_PUBLIC_AUTH_SAME_ORIGIN,
    NEXT_PUBLIC_AUTH_SAME_ORIGIN_HOSTS: process.env.NEXT_PUBLIC_AUTH_SAME_ORIGIN_HOSTS,
  };
}

/** Hosts Firebase Hosting serves for a site (`<site>.web.app`, `<site>.firebaseapp.com`). */
const HOSTING_DOMAIN = /\.(?:web\.app|firebaseapp\.com)$/i;

/** A comma-separated host list (`NEXT_PUBLIC_AUTH_SAME_ORIGIN_HOSTS`), lower-cased and trimmed. */
export function hostList(v: string | undefined): string[] {
  return (v ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * The auth domain the SDK uses for its sign-in handler. Firebase Hosting serves the handler at
 * `/__/auth/*` on every domain of the site, so where that handler is an authorized OAuth redirect
 * URI the app's own host is used, and the redirect flow keeps working in browsers that partition
 * third-party storage (mobile Safari and Chrome):
 *  - `<site>.web.app` / `<site>.firebaseapp.com`: automatically (Firebase registers their redirect
 *    URIs). Preview channels (`<site>--<channel>-<hash>.web.app`) are not registered, so they
 *    keep the configured domain.
 *  - a custom domain: only when listed in `NEXT_PUBLIC_AUTH_SAME_ORIGIN_HOSTS` (comma-separated),
 *    after `https://<domain>/__/auth/handler` was added to the OAuth client (DEPLOY.md Part 9);
 *    otherwise sign-in fails with redirect_uri_mismatch.
 *  - `NEXT_PUBLIC_AUTH_SAME_ORIGIN=1` (the older flag): any host.
 * Local hosts, the server and builds without a configured domain keep the configured domain.
 */
export function authDomainFor(
  env: Record<string, string | undefined>,
  loc?: { host: string; hostname: string },
): string {
  const configured = env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "";
  if (!loc || !configured) return configured;
  const hostname = loc.hostname.toLowerCase();
  if (hostname === "localhost" || hostname === "127.0.0.1") return configured;
  const hostingDomain = HOSTING_DOMAIN.test(hostname) && !hostname.includes("--");
  const listed = hostList(env.NEXT_PUBLIC_AUTH_SAME_ORIGIN_HOSTS).includes(hostname);
  if (hostingDomain || listed || env.NEXT_PUBLIC_AUTH_SAME_ORIGIN === "1") return loc.host;
  return configured;
}

/** True when the sign-in handler is served from the app's own origin (see authDomainFor). */
export function sameOriginAuth(
  env: Record<string, string | undefined> = authEnv(),
  loc: { host: string; hostname: string } | undefined = typeof window === "undefined"
    ? undefined
    : window.location,
): boolean {
  if (!loc) return false;
  return authDomainFor(env, loc) === loc.host;
}
