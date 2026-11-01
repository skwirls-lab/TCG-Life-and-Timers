// @req AUTH-001 @req AUTH-002 @req AUTH-003
import type { Auth, User } from "firebase/auth";
import { describe, expect, it } from "vitest";
import {
  createFirebaseAuthDriver,
  fakeGoogleIdToken,
  toAuthUser,
  type FirebaseAuthApi,
} from "./firebaseDriver";

const user = (over: Partial<User> = {}) =>
  ({
    uid: "u1",
    email: "a@b.c",
    displayName: "A",
    photoURL: null,
    isAnonymous: false,
    ...over,
  }) as User;

function fakeApi(auth: { currentUser: User | null }) {
  const calls: string[] = [];
  let linkError: unknown = null;
  class Provider {
    params: unknown;
    setCustomParameters(p: unknown) {
      this.params = p;
    }
    static credential(token: string) {
      calls.push(`credential:${token}`);
      return { token };
    }
    static credentialFromError(err: { cred?: unknown }) {
      return err.cred ?? null;
    }
  }
  const api = {
    GoogleAuthProvider: Provider,
    onAuthStateChanged: (_a: Auth, cb: (u: User | null) => void) => {
      cb(auth.currentUser);
      return () => calls.push("unsub");
    },
    getRedirectResult: async () => void calls.push("redirectResult"),
    signInWithPopup: async () => void calls.push("popup"),
    signInWithRedirect: async () => void calls.push("redirect"),
    linkWithPopup: async () => {
      calls.push("linkPopup");
      if (linkError) throw linkError;
    },
    linkWithRedirect: async () => void calls.push("linkRedirect"),
    signInWithCredential: async (_a: Auth, c: unknown) =>
      void calls.push(`signInCred:${JSON.stringify(c)}`),
    linkWithCredential: async () => {
      calls.push("linkCred");
      if (linkError) throw linkError;
    },
    signInAnonymously: async () => ({
      user: user({ uid: "anon", isAnonymous: true, email: null }),
    }),
    signOut: async () => void calls.push("signOut"),
  } as unknown as FirebaseAuthApi;
  return { api, calls, setLinkError: (e: unknown) => (linkError = e) };
}

describe("firebase auth driver", () => {
  it("signs in with popup / redirect and maps users", async () => {
    const auth = { currentUser: null as User | null };
    const { api, calls } = fakeApi(auth);
    const d = createFirebaseAuthDriver(api, auth as unknown as Auth, { emulators: false });
    const seen: unknown[] = [];
    const unsub = d.onAuthStateChanged((u) => seen.push(u));
    unsub();
    expect(seen).toEqual([null]);
    await d.completeRedirect();
    await d.signInWithGoogle("popup");
    await d.signInWithGoogle("redirect");
    expect(calls).toEqual(["unsub", "redirectResult", "popup", "redirect"]);
    expect(await d.signInAnonymously()).toMatchObject({ uid: "anon", isAnonymous: true });
    await d.signOut();
    expect(d.currentUser()).toBeNull();
    expect(d.signInForTests).toBeUndefined();
    auth.currentUser = user();
    expect(d.currentUser()).toEqual({
      uid: "u1",
      email: "a@b.c",
      displayName: "A",
      photoURL: null,
      isAnonymous: false,
    });
    expect(toAuthUser(null)).toBeNull();
  });

  // @req AUTH-003
  it("links anonymous users, falling back to the existing Google account", async () => {
    const auth = { currentUser: user({ uid: "anon", isAnonymous: true }) as User | null };
    const { api, calls, setLinkError } = fakeApi(auth);
    const d = createFirebaseAuthDriver(api, auth as unknown as Auth, { emulators: true });
    await d.signInWithGoogle("popup");
    await d.signInWithGoogle("redirect");
    expect(calls).toEqual(["linkPopup", "linkRedirect"]);
    setLinkError({ code: "auth/credential-already-in-use", cred: { id: "c" } });
    await d.signInWithGoogle("popup");
    expect(calls).toContain('signInCred:{"id":"c"}');
    setLinkError({ code: "auth/credential-already-in-use" });
    await expect(d.signInWithGoogle("popup")).rejects.toMatchObject({
      code: "auth/credential-already-in-use",
    });
    setLinkError({ code: "auth/other" });
    await expect(d.signInWithGoogle("popup")).rejects.toMatchObject({ code: "auth/other" });
  });

  it("emulator test sign-in uses a fake Google id token", async () => {
    const auth = { currentUser: null as User | null };
    const { api, calls, setLinkError } = fakeApi(auth);
    const d = createFirebaseAuthDriver(api, auth as unknown as Auth, { emulators: true });
    await d.signInForTests!("t@x.io");
    expect(calls[0]).toBe(`credential:${fakeGoogleIdToken("t@x.io")}`);
    expect(JSON.parse(fakeGoogleIdToken("t@x.io"))).toMatchObject({
      sub: "test-t-x-io",
      email: "t@x.io",
    });
    auth.currentUser = user({ isAnonymous: true });
    await d.signInForTests!("t@x.io");
    expect(calls).toContain("linkCred");
    setLinkError({ code: "auth/credential-already-in-use" });
    await d.signInForTests!("t@x.io");
    setLinkError({ code: "auth/nope" });
    await expect(d.signInForTests!("t@x.io")).rejects.toMatchObject({ code: "auth/nope" });
  });
});
