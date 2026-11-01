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

export function emulatorsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.NEXT_PUBLIC_USE_EMULATORS === "1";
}

export function readFirebaseConfig(
  env: Record<string, string | undefined> = process.env,
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
export function isCloudConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return readFirebaseConfig(env) !== null;
}
