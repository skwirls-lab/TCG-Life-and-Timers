/**
 * Firebase Auth implementation of AuthDriver (T4.1). Loaded only through a dynamic import from
 * ./store.ts, so firebase/auth never reaches the board chunk (PERF-003).
 */
import type * as AuthModule from "firebase/auth";
import type { Auth, User } from "firebase/auth";
import { emulatorsEnabled } from "@/lib/firebase/config";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { errorCode, type AuthDriver, type AuthUser } from "./types";

export type FirebaseAuthApi = Pick<
  typeof AuthModule,
  | "GoogleAuthProvider"
  | "onAuthStateChanged"
  | "getRedirectResult"
  | "signInWithPopup"
  | "signInWithRedirect"
  | "linkWithPopup"
  | "linkWithRedirect"
  | "signInWithCredential"
  | "linkWithCredential"
  | "signInAnonymously"
  | "signOut"
>;

export function toAuthUser(u: User | null): AuthUser | null {
  if (!u) return null;
  return {
    uid: u.uid,
    email: u.email,
    displayName: u.displayName,
    photoURL: u.photoURL,
    isAnonymous: u.isAnonymous,
  };
}

/** Auth emulator fake IdP token: `{"sub": …, "email": …}` is accepted as a Google id token. */
export function fakeGoogleIdToken(email: string): string {
  const sub = `test-${email.replace(/[^A-Za-z0-9]/g, "-")}`;
  return JSON.stringify({ sub, email, email_verified: true, name: email.split("@")[0] });
}

export function createFirebaseAuthDriver(
  api: FirebaseAuthApi,
  auth: Auth,
  opts: { emulators: boolean },
): AuthDriver {
  const provider = () => {
    const p = new api.GoogleAuthProvider();
    p.setCustomParameters({ prompt: "select_account" });
    return p;
  };

  /** Anonymous → Google; if that Google account already exists, sign in to it instead. */
  async function linkOrSignIn(user: User, mode: "popup" | "redirect"): Promise<void> {
    try {
      if (mode === "redirect") await api.linkWithRedirect(user, provider());
      else await api.linkWithPopup(user, provider());
    } catch (err) {
      const code = errorCode(err);
      if (code !== "auth/credential-already-in-use" && code !== "auth/email-already-in-use")
        throw err;
      const cred = api.GoogleAuthProvider.credentialFromError(err as AuthModule.AuthError);
      if (!cred) throw err;
      await api.signInWithCredential(auth, cred);
    }
  }

  return {
    onAuthStateChanged: (cb) => api.onAuthStateChanged(auth, (u) => cb(toAuthUser(u))),
    async completeRedirect() {
      await api.getRedirectResult(auth);
    },
    async signInWithGoogle(mode) {
      const cur = auth.currentUser;
      if (cur?.isAnonymous) return linkOrSignIn(cur, mode);
      if (mode === "redirect") await api.signInWithRedirect(auth, provider());
      else await api.signInWithPopup(auth, provider());
    },
    async signInAnonymously() {
      const cred = await api.signInAnonymously(auth);
      return toAuthUser(cred.user)!;
    },
    signOut: () => api.signOut(auth),
    currentUser: () => toAuthUser(auth.currentUser),
    signInForTests: opts.emulators
      ? async (email: string) => {
          const cred = api.GoogleAuthProvider.credential(fakeGoogleIdToken(email));
          const cur = auth.currentUser;
          if (cur?.isAnonymous) {
            try {
              await api.linkWithCredential(cur, cred);
              return;
            } catch (err) {
              if (errorCode(err) !== "auth/credential-already-in-use") throw err;
            }
          }
          await api.signInWithCredential(auth, cred);
        }
      : undefined,
  };
}

export async function loadFirebaseAuthDriver(): Promise<AuthDriver | null> {
  const auth = await getFirebaseAuth();
  if (!auth) return null;
  const api = await import("firebase/auth");
  return createFirebaseAuthDriver(api, auth, { emulators: emulatorsEnabled() });
}
