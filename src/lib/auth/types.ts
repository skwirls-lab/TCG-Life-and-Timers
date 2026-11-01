/** Auth contracts (T4.1). The Firebase implementation is ./firebaseDriver.ts (lazy-loaded). */

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  isAnonymous: boolean;
}

export type AuthStatus = "unconfigured" | "signedOut" | "signingIn" | "signedIn";

export type SignInMode = "popup" | "redirect";

export interface AuthDriver {
  onAuthStateChanged(cb: (user: AuthUser | null) => void): () => void;
  /** Finish a pending signInWithRedirect / linkWithRedirect (no-op when there is none). */
  completeRedirect(): Promise<void>;
  /** Google sign-in; links the current anonymous user instead when there is one (AUTH-003). */
  signInWithGoogle(mode: SignInMode): Promise<void>;
  signInAnonymously(): Promise<AuthUser>;
  signOut(): Promise<void>;
  currentUser(): AuthUser | null;
  /** Emulator only: sign in with a fake Google IdP credential. */
  signInForTests?(email: string): Promise<void>;
}

/** Popup failures that should fall back to a full-page redirect (AUTH-001, iOS PWA quirks). */
export const POPUP_FALLBACK_CODES = new Set([
  "auth/popup-blocked",
  "auth/operation-not-supported-in-this-environment",
  "auth/web-storage-unsupported",
]);

/** The user dismissed the flow: not an error worth showing. */
export const CANCELLED_CODES = new Set([
  "auth/popup-closed-by-user",
  "auth/cancelled-popup-request",
]);

export function errorCode(err: unknown): string {
  if (err && typeof err === "object" && "code" in err)
    return String((err as { code: unknown }).code);
  return err instanceof Error ? err.message : String(err);
}
