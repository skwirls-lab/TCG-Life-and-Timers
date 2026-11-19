/**
 * Service worker runtime caching for Scryfall (T5.5: ART-006, ART-009, PWA-002). Pure config so
 * the matchers and limits are unit-tested; src/app/sw.ts builds the Serwist strategies from it.
 *
 * - `cards.scryfall.io` images: cache-first, 200 entries, 30 days, LRU eviction
 *   (ExpirationPlugin evicts the least recently used entries beyond maxEntries).
 * - `api.scryfall.com` JSON: stale-while-revalidate, 50 entries, 24 h.
 */
export const SCRYFALL_IMAGE_CACHE = "scryfall-images";
export const SCRYFALL_API_CACHE = "scryfall-api";

export const SCRYFALL_IMAGE_LIMITS = { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 } as const;
export const SCRYFALL_API_LIMITS = { maxEntries: 50, maxAgeSeconds: 24 * 60 * 60 } as const;

/** Opaque (no-cors CSS backgrounds) and OK responses are cacheable. */
export const CACHEABLE_STATUSES = [0, 200] as const;

export function isScryfallImage(url: URL): boolean {
  return url.protocol === "https:" && url.hostname === "cards.scryfall.io";
}

/**
 * How the SW handles a card image request: no-cors loads (`<img>`, CSS backgrounds) are served
 * cache-first; CORS fetches (the page copying the image into IndexedDB) go to the network, since
 * an opaque cached response can't answer a CORS request.
 */
export function scryfallImageRoute(url: URL, mode: string): "cache" | "network" | null {
  if (!isScryfallImage(url)) return null;
  return mode === "cors" ? "network" : "cache";
}

export function isScryfallApi(url: URL, method = "GET"): boolean {
  return method === "GET" && url.protocol === "https:" && url.hostname === "api.scryfall.com";
}

/** A Serwist route matcher: a callback, a RegExp tested against the URL, or an exact URL string. */
export type SwMatcher<A extends { url: URL } = { url: URL }> =
  ((args: A) => unknown) | RegExp | string;

/**
 * Restrict a runtime-caching rule to the app's own origin. Cross-origin requests that no rule
 * matches are not answered by the worker at all, so the browser loads them as usual. That
 * matters for Google sign-in (apis.google.com, accounts.google.com, the auth iframe), Firebase
 * and Stripe: a worker-side fetch is checked against `connect-src`, so proxying a `<script>` or
 * an iframe through the worker breaks it. Scryfall has its own explicit rules.
 */
export function sameOriginOnly<A extends { url: URL }>(
  matcher: SwMatcher<A>,
  origin: string,
): (args: A) => unknown {
  return (args) => {
    if (args.url.origin !== origin) return false;
    if (args.url.pathname.startsWith("/__/")) return false; // proxied Firebase Auth handler
    if (typeof matcher === "function") return matcher(args);
    if (matcher instanceof RegExp) return matcher.test(args.url.href);
    return new URL(matcher, origin).href === args.url.href;
  };
}
