/// <reference lib="webworker" />
import { defaultCache } from "@serwist/turbopack/worker";
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import {
  CacheableResponsePlugin,
  CacheFirst,
  ExpirationPlugin,
  NetworkOnly,
  Serwist,
  StaleWhileRevalidate,
} from "serwist";
import {
  CACHEABLE_STATUSES,
  isScryfallApi,
  scryfallImageRoute,
  SCRYFALL_API_CACHE,
  SCRYFALL_API_LIMITS,
  SCRYFALL_IMAGE_CACHE,
  SCRYFALL_IMAGE_LIMITS,
} from "@/lib/art/swRules";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// T5.5 (ART-006, ART-009): Scryfall rules come first so they win over the default cross-origin rule.
const scryfallCaching: RuntimeCaching[] = [
  {
    // The page's CORS copy-to-IndexedDB fetch must never be answered with an opaque cached
    // response (that is a network error for a CORS request), so it goes to the network.
    matcher: ({ url, request }) => scryfallImageRoute(url, request.mode) === "network",
    handler: new NetworkOnly(),
  },
  {
    matcher: ({ url, request }) => scryfallImageRoute(url, request.mode) === "cache",
    handler: new CacheFirst({
      cacheName: SCRYFALL_IMAGE_CACHE,
      plugins: [
        new CacheableResponsePlugin({ statuses: [...CACHEABLE_STATUSES] }),
        // LRU: entries are evicted by last use beyond maxEntries.
        new ExpirationPlugin({
          ...SCRYFALL_IMAGE_LIMITS,
          maxAgeFrom: "last-used",
          purgeOnQuotaError: true,
        }),
      ],
    }),
  },
  {
    matcher: ({ url, request }) => isScryfallApi(url, request.method),
    handler: new StaleWhileRevalidate({
      cacheName: SCRYFALL_API_CACHE,
      plugins: [
        new CacheableResponsePlugin({ statuses: [200] }),
        new ExpirationPlugin({ ...SCRYFALL_API_LIMITS, purgeOnQuotaError: true }),
      ],
    }),
  },
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // PWA-004: never auto-activate mid-game. The page asks the waiting worker to skip waiting.
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [...scryfallCaching, ...defaultCache],
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") void self.skipWaiting();
});

serwist.addEventListeners();
