/** Firebase web config. Values are public by design; they come from env (see apphosting.yaml). */
export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export const DEMO_PROJECT_ID = "demo-tcg-life";

/**
 * Public env with literal `process.env.NEXT_PUBLIC_*` reads: Next only inlines those, while the
 * client-side `process.env` object is an empty polyfill (so `env = process.env` saw nothing).
 */
export function publicEnv(): Record<string, string | undefined> {
  return {
    NEXT_PUBLIC_USE_EMULATORS: process.env.NEXT_PUBLIC_USE_EMULATORS,
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    NEXT_PUBLIC_AUTH_SAME_ORIGIN: process.env.NEXT_PUBLIC_AUTH_SAME_ORIGIN,
  };
}

export function emulatorsEnabled(env: Record<string, string | undefined> = publicEnv()): boolean {
  return env.NEXT_PUBLIC_USE_EMULATORS === "1";
}

export function readFirebaseConfig(
  env: Record<string, string | undefined> = publicEnv(),
): FirebaseWebConfig | null {
  if (emulatorsEnabled(env)) {
    return {
      apiKey: "demo-api-key",
      authDomain: `${DEMO_PROJECT_ID}.firebaseapp.com`,
      projectId: DEMO_PROJECT_ID,
      storageBucket: `${DEMO_PROJECT_ID}.appspot.com`,
      messagingSenderId: "0",
      appId: "demo-app",
    };
  }
  const cfg = {
    apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
    authDomain: authDomainFor(env, typeof window === "undefined" ? undefined : window.location),
    projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
    storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
    messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId: env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
  };
  const missing = Object.values(cfg).some((v) => !v || v === "REPLACE_ME");
  return missing ? null : cfg;
}

/**
 * The auth domain the SDK uses for its sign-in handler. With `NEXT_PUBLIC_AUTH_SAME_ORIGIN=1` the
 * app's own host is used: next.config proxies `/__/auth/*` to `<project>.firebaseapp.com`, so the
 * redirect flow keeps working in browsers that partition third-party storage (mobile Safari and
 * Chrome). That host's `https://<host>/__/auth/handler` must be an authorized redirect URI of the
 * OAuth web client (DEPLOY.md). Local hosts keep the configured domain.
 */
export function authDomainFor(
  env: Record<string, string | undefined>,
  loc?: { host: string; hostname: string },
): string {
  const configured = env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "";
  if (env.NEXT_PUBLIC_AUTH_SAME_ORIGIN !== "1" || !loc || !configured) return configured;
  if (loc.hostname === "localhost" || loc.hostname === "127.0.0.1") return configured;
  return loc.host;
}

/** True when the sign-in handler is served from the app's own origin (see authDomainFor). */
export function sameOriginAuth(env: Record<string, string | undefined> = publicEnv()): boolean {
  if (typeof window === "undefined") return false;
  return authDomainFor(env, window.location) === window.location.host;
}

/** True when cloud features (sign-in, sync) can be offered at all. */
export function isCloudConfigured(env: Record<string, string | undefined> = publicEnv()): boolean {
  return readFirebaseConfig(env) !== null;
}
