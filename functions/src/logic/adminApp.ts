/**
 * Initialize the DEFAULT Firebase Admin app if it doesn't exist yet.
 *
 * Checking `getApps().length === 0` is not enough: before a callable function runs, the
 * firebase-functions SDK verifies the caller's ID token with its own named app
 * ("__FIREBASE_FUNCTIONS_SDK__"). With that app present, the length check skipped
 * `initializeApp()`, and `getFirestore()` then failed with `app/no-app` in production.
 */
export const DEFAULT_APP_NAME = "[DEFAULT]";

export function ensureDefaultApp(
  getApps: () => ReadonlyArray<{ name: string }>,
  initializeApp: () => unknown,
): void {
  if (!getApps().some((a) => a.name === DEFAULT_APP_NAME)) initializeApp();
}
