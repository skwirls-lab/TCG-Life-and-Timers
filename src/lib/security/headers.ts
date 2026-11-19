/**
 * Security response headers (T8.4 · PRD §19.6). The single source of truth for firebase.json's
 * `hosting.headers` (scripts/gen-hosting-config.ts, drift-checked by a unit test) and for
 * `next dev` (next.config.ts); relative imports only, no `@/` alias. The emulator relaxations only
 * exist where the e2e emulator build is served (scripts/serve-hosting.ts), never in firebase.json.
 *
 * script-src keeps `'unsafe-inline'` on purpose: every App Router page embeds its RSC payload as
 * inline `<script>self.__next_f.push(…)</script>` tags. Nonces would force dynamic rendering of
 * every route (the Next CSP guide), which breaks the statically prerendered, service-worker
 * precached app shell this offline-first PWA relies on; the payloads differ per page and per
 * deploy, so static hashes are not maintainable. Script *origins* stay locked to the list below.
 */

export interface CspOptions {
  /** `next dev` (React needs eval for debugging). */
  dev?: boolean;
  /** Emulator build: allow the local Firebase emulators on 127.0.0.1 / localhost. */
  emulators?: boolean;
}

export type CspDirectives = Record<string, string[]>;

const FIREBASE_CONNECT = [
  "https://*.googleapis.com", // firestore, identitytoolkit, securetoken, firebaseinstallations, appcheck, storage
  "https://firestore.googleapis.com",
  "https://identitytoolkit.googleapis.com",
  "https://securetoken.googleapis.com",
  "https://firebaseinstallations.googleapis.com",
  "https://firebasestorage.googleapis.com",
  "https://*.firebaseio.com",
  "wss://*.firebaseio.com",
  "https://*.cloudfunctions.net",
];
const ANALYTICS = [
  "https://www.googletagmanager.com",
  "https://*.google-analytics.com",
  "https://*.analytics.google.com",
];
const SCRYFALL_API = ["https://api.scryfall.com"];
const SCRYFALL_IMAGES = ["https://cards.scryfall.io", "https://svgs.scryfall.io"];
const STRIPE = ["https://api.stripe.com", "https://checkout.stripe.com"];
const SENTRY = ["https://*.ingest.sentry.io"];
const RECAPTCHA = ["https://www.google.com/recaptcha/", "https://www.gstatic.com/recaptcha/"];
const GOOGLE_AUTH_FRAMES = ["https://*.firebaseapp.com", "https://accounts.google.com"];
const LOCAL = ["http://127.0.0.1:*", "http://localhost:*", "ws://127.0.0.1:*", "ws://localhost:*"];

export function cspDirectives(opts: CspOptions = {}): CspDirectives {
  const local = opts.emulators ? LOCAL : [];
  const localHttp = local.filter((s) => s.startsWith("http"));
  return {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      "'unsafe-inline'",
      ...(opts.dev ? ["'unsafe-eval'"] : []),
      "https://apis.google.com", // Firebase Auth popup helper (gapi)
      "https://www.googletagmanager.com", // Firebase Analytics (gtag), loaded only after consent
      ...RECAPTCHA, // App Check (reCAPTCHA Enterprise)
      ...localHttp,
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": [
      "'self'",
      "data:",
      "blob:",
      ...SCRYFALL_IMAGES,
      "https://*.googleusercontent.com",
      "https://firebasestorage.googleapis.com",
      "https://*.google-analytics.com",
      "https://www.googletagmanager.com",
      ...localHttp,
    ],
    "font-src": ["'self'", "data:"],
    "connect-src": [
      "'self'",
      "blob:",
      "data:",
      ...FIREBASE_CONNECT,
      ...ANALYTICS,
      "https://apis.google.com", // Firebase Auth helper (gapi); belt-and-braces if fetched
      ...SCRYFALL_API,
      ...SCRYFALL_IMAGES, // CORS copy of chosen card art into IndexedDB (ART-009)
      ...STRIPE,
      ...SENTRY,
      ...local,
    ],
    "frame-src": [
      "'self'",
      ...GOOGLE_AUTH_FRAMES,
      "https://checkout.stripe.com",
      "https://js.stripe.com",
      "https://www.google.com/recaptcha/",
      "https://recaptcha.google.com/recaptcha/",
      ...localHttp,
    ],
    "worker-src": ["'self'", "blob:"],
    "media-src": ["'self'", "data:", "blob:"], // wake-lock video-loop fallback (PWA-005)
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
}

export function serializeCsp(d: CspDirectives): string {
  return Object.entries(d)
    .map(([k, v]) => `${k} ${v.join(" ")}`)
    .join("; ");
}

export function contentSecurityPolicy(opts: CspOptions = {}): string {
  return serializeCsp(cspDirectives(opts));
}

export interface HeaderEntry {
  key: string;
  value: string;
}

export function securityHeaders(opts: CspOptions = {}): HeaderEntry[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(opts) },
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      // camera: photo capture for seat art uploads (ART-021); everything else off.
      value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()",
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  ];
}

/**
 * Extra headers for the service worker script `/serwist/sw.js` (Next PWA guide): never HTTP-cached,
 * so updates are picked up (PWA-004), and allowed to control scope `/` although it lives under
 * `/serwist/`. The static export serves the worker as a plain file, so Hosting sends these
 * (firebase.json); Content-Type comes from the `.js` extension. The worker keeps the site CSP (not
 * the guide's `script-src 'self'`-only policy) because the CSP of the SW response governs the
 * worker's own fetches (Scryfall runtime caching, PWA-002).
 */
export function serviceWorkerHeaders(): HeaderEntry[] {
  return [
    { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
    { key: "Service-Worker-Allowed", value: "/" },
  ];
}
