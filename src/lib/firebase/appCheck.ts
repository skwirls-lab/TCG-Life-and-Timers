/**
 * App Check (T4.6, SEC-007).
 * - `NEXT_PUBLIC_APPCHECK_SITE_KEY` set (production): reCAPTCHA Enterprise provider.
 * - Emulators: the debug token is enabled (the emulators don't enforce App Check); the provider
 *   is only initialised when a site key is also set, so e2e never loads reCAPTCHA.
 * - Otherwise: no-op (cloud not configured, or App Check not set up yet).
 * Enforcement itself is switched on in the Firebase console (see DEPLOY.md).
 */
import type { FirebaseApp } from "firebase/app";
import { emulatorsEnabled } from "./config";
import { getFirebaseApp } from "./client";

export type AppCheckMode = "recaptcha" | "debug" | "none";

export interface AppCheckEnv {
  siteKey?: string;
  debugToken?: string;
  emulators: boolean;
}

export function readAppCheckEnv(): AppCheckEnv {
  return {
    siteKey: process.env.NEXT_PUBLIC_APPCHECK_SITE_KEY || undefined,
    debugToken: process.env.NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN || undefined,
    emulators: emulatorsEnabled(),
  };
}

export function appCheckMode(env: AppCheckEnv): AppCheckMode {
  if (env.emulators) return "debug";
  return env.siteKey && env.siteKey !== "REPLACE_ME" ? "recaptcha" : "none";
}

export interface AppCheckFactories {
  getApp: () => Promise<FirebaseApp | null>;
  load: () => Promise<
    Pick<typeof import("firebase/app-check"), "initializeAppCheck" | "ReCaptchaEnterpriseProvider">
  >;
  /** Where the SDK looks for `FIREBASE_APPCHECK_DEBUG_TOKEN`. */
  global: { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean };
}

const defaultFactories = (): AppCheckFactories => ({
  getApp: getFirebaseApp,
  load: () => import("firebase/app-check"),
  global: globalThis as AppCheckFactories["global"],
});

let initPromise: Promise<AppCheckMode> | null = null;

/** Initialise App Check once. Resolves with the mode that was applied. */
export function initAppCheck(
  env: AppCheckEnv = readAppCheckEnv(),
  factories: AppCheckFactories = defaultFactories(),
): Promise<AppCheckMode> {
  initPromise ??= (async () => {
    const mode = appCheckMode(env);
    if (mode === "none") return mode;
    if (mode === "debug") factories.global.FIREBASE_APPCHECK_DEBUG_TOKEN = env.debugToken ?? true;
    if (!env.siteKey) return mode;
    const app = await factories.getApp();
    if (!app) return "none";
    const { initializeAppCheck, ReCaptchaEnterpriseProvider } = await factories.load();
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(env.siteKey),
      isTokenAutoRefreshEnabled: true,
    });
    return mode;
  })().catch((err: unknown) => {
    initPromise = null;
    throw err;
  });
  return initPromise;
}

/** Test hook. */
export function resetAppCheckForTests(): void {
  initPromise = null;
}
