/**
 * First-visit welcome (sign-in first). The user's choice is a tiny device-local record, read
 * synchronously so the launcher knows at once whether to offer the welcome screen again.
 */
import type { StorageLike } from "@/lib/analytics/consent";

export const WELCOME_KEY = "tcg.welcome.v1";

/** "guest": Continue without an account. "google": signed in with Google on this device. */
export type WelcomeChoice = "guest" | "google";

interface StoredWelcome {
  v: 1;
  choice: WelcomeChoice;
  at: number;
}

export function defaultWelcomeStorage(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function readWelcomeChoice(
  storage: StorageLike | null = defaultWelcomeStorage(),
): WelcomeChoice | null {
  try {
    const raw = storage?.getItem(WELCOME_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<StoredWelcome>;
    return p.v === 1 && (p.choice === "guest" || p.choice === "google") ? p.choice : null;
  } catch {
    return null;
  }
}

export function writeWelcomeChoice(
  choice: WelcomeChoice,
  storage: StorageLike | null = defaultWelcomeStorage(),
  now: number = Date.now(),
): void {
  try {
    storage?.setItem(WELCOME_KEY, JSON.stringify({ v: 1, choice, at: now }));
  } catch {
    // Storage unavailable: the welcome may show again next visit, which is harmless.
  }
}

export interface WelcomeInputs {
  /** This deployment has Firebase config (otherwise there is nothing to sign in to). */
  cloudConfigured: boolean;
  /** The first auth state is known (a returning signed-in user must never see the welcome). */
  authInitialized: boolean;
  /** Signed in with Google (anonymous users still count as signed out). */
  signedIn: boolean;
  choice: WelcomeChoice | null;
}

/** What the launcher's account area shows. */
export type LauncherAccountView = "none" | "loading" | "welcome" | "signIn" | "signedIn";

export function launcherAccountView(i: WelcomeInputs): LauncherAccountView {
  if (!i.cloudConfigured) return "none";
  if (!i.authInitialized) return "loading";
  if (i.signedIn) return "signedIn";
  return i.choice === null ? "welcome" : "signIn";
}
