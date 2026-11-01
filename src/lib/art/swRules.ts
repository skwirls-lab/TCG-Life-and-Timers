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
