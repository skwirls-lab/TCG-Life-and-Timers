/**
 * App-wide Scryfall client (ART-006): one request queue and one 24 h IndexedDB response cache
 * shared by every picker instance.
 */
import {
  createIndexedDbCache,
  createMemoryCache,
  createScryfallClient,
  ScryfallError,
  type ScryfallClient,
} from "@/lib/scryfall";

let client: ScryfallClient | null = null;

export function getScryfall(): ScryfallClient {
  client ??= createScryfallClient({
    cache: typeof indexedDB === "undefined" ? createMemoryCache() : createIndexedDbCache(),
  });
  return client;
}

/** Test hook: inject (or drop with null) the shared client. */
export function setScryfallForTests(c: ScryfallClient | null): void {
  client = c;
}

/** True when an error means "no network" (ART-009 offline message). */
export function isOfflineError(e: unknown, online: boolean = navigatorOnline()): boolean {
  if (!online) return true;
  return e instanceof ScryfallError && e.isNetwork;
}

export function navigatorOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}
