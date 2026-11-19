/** Firebase web config. Values are public by design; they come from env (see .env.production). */
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
    // The configured domain; the lazy client picks the same-origin one (./authDomain, client.ts).
    authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
    storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
    messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId: env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
  };
  const missing = Object.values(cfg).some((v) => !v || v === "REPLACE_ME");
  return missing ? null : cfg;
}

/** True when cloud features (sign-in, sync) can be offered at all. */
export function isCloudConfigured(env: Record<string, string | undefined> = publicEnv()): boolean {
  return readFirebaseConfig(env) !== null;
}
