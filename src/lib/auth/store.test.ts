// @req AUTH-001 @req AUTH-002 @req AUTH-004
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  defaultPreferRedirect,
  ensureAnonymous,
  initAuth,
  linkAnonymousToGoogle,
  resetAuthForTests,
  signInForTests,
  signInWithGoogle,
  signOut,
  useAuth,
} from "./store";
import type { AuthDriver, AuthUser, SignInMode } from "./types";
import { errorCode } from "./types";

const google: AuthUser = {
  uid: "g1",
  email: "a@b.c",
  displayName: "A",
  photoURL: null,
  isAnonymous: false,
};
const anon: AuthUser = {
  uid: "anon1",
  email: null,
  displayName: null,
  photoURL: null,
  isAnonymous: true,
};

class FakeDriver implements AuthDriver {
  user: AuthUser | null = null;
  cb: ((u: AuthUser | null) => void) | null = null;
  calls: string[] = [];
  popupError: unknown = null;
  redirectError: unknown = null;
  onAuthStateChanged(cb: (u: AuthUser | null) => void) {
    this.cb = cb;
    queueMicrotask(() => cb(this.user));
    return () => (this.cb = null);
  }
  async completeRedirect() {
    this.calls.push("completeRedirect");
    if (this.redirectError) throw this.redirectError;
  }
  async signInWithGoogle(mode: SignInMode) {
    this.calls.push(`google:${mode}:${this.user?.isAnonymous ? "link" : "new"}`);
    if (mode === "popup" && this.popupError) throw this.popupError;
    if (mode === "popup")
      this.set(this.user?.isAnonymous ? { ...google, uid: this.user.uid } : google);
  }
  async signInAnonymously() {
    this.calls.push("anon");
    this.set(anon);
    return anon;
  }
  async signOut() {
    this.calls.push("signOut");
    this.set(null);
  }
  currentUser() {
    return this.user;
  }
  async signInForTests(email: string) {
    this.set({ ...google, email });
  }
  set(u: AuthUser | null) {
    this.user = u;
    this.cb?.(u);
  }
}

function setup(
  opts: { redirect?: boolean; configured?: boolean; driver?: FakeDriver | null } = {},
) {
  const driver = opts.driver === undefined ? new FakeDriver() : opts.driver;
  const hooks: string[] = [];
  resetAuthForTests({
    cloudConfigured: () => opts.configured ?? true,
    loadDriver: async () => driver,
    preferRedirect: () => opts.redirect ?? false,
    beforeSignOut: async (o) => void hooks.push(`before:${o.removeLocalData === true}`),
    afterSignOut: async (o) => void hooks.push(`after:${o.removeLocalData === true}`),
  });
  return { driver: driver!, hooks };
}

afterEach(() => resetAuthForTests());

describe("useAuth", () => {
  it("is 'unconfigured' and inert when cloud isn't configured", async () => {
    setup({ configured: false });
    expect(useAuth.getState().status).toBe("unconfigured");
    await initAuth();
    await signInWithGoogle();
    expect(await ensureAnonymous()).toBeNull();
    await signOut();
    expect(useAuth.getState()).toMatchObject({ status: "unconfigured", initialized: true });
  });

  it("initAuth subscribes once and finishes redirects", async () => {
    const { driver } = setup();
    driver.user = google;
    await Promise.all([initAuth(), initAuth()]);
    expect(driver.calls).toEqual(["completeRedirect"]);
    expect(useAuth.getState()).toMatchObject({
      status: "signedIn",
      user: google,
      initialized: true,
    });
  });

  it("records redirect errors except cancellations", async () => {
    const { driver } = setup();
    driver.redirectError = { code: "auth/network-request-failed" };
    await initAuth();
    expect(useAuth.getState()).toMatchObject({
      status: "signedOut",
      error: "auth/network-request-failed",
    });
    const second = setup();
    second.driver.redirectError = { code: "auth/popup-closed-by-user" };
    await initAuth();
    expect(useAuth.getState().error).toBeNull();
  });

  it("records driver load failures", async () => {
    resetAuthForTests({
      cloudConfigured: () => true,
      loadDriver: () => Promise.reject(new Error("chunk")),
    });
    await initAuth();
    expect(useAuth.getState()).toMatchObject({ error: "chunk", initialized: true });
  });

  // @req AUTH-001
  it("desktop: popup sign-in", async () => {
    const { driver } = setup();
    const states: string[] = [];
    const unsub = useAuth.subscribe((s) => states.push(s.status));
    await signInWithGoogle();
    unsub();
    expect(driver.calls).toContain("google:popup:new");
    expect(states).toContain("signingIn");
    expect(useAuth.getState()).toMatchObject({ status: "signedIn", user: google, error: null });
  });

  // @req AUTH-001
  it("desktop: falls back to redirect when the popup is blocked", async () => {
    const { driver } = setup();
    driver.popupError = { code: "auth/popup-blocked" };
    await signInWithGoogle();
    expect(driver.calls.filter((c) => c.startsWith("google"))).toEqual([
      "google:popup:new",
      "google:redirect:new",
    ]);
    expect(useAuth.getState().status).toBe("signingIn"); // page navigates away
  });

  // @req AUTH-001
  it("mobile / standalone PWA: redirect", async () => {
    const { driver } = setup({ redirect: true });
    await signInWithGoogle();
    expect(driver.calls).toContain("google:redirect:new");
  });

  it("cancelled popups are not errors; other failures are", async () => {
    const { driver } = setup();
    driver.popupError = { code: "auth/popup-closed-by-user" };
    await signInWithGoogle();
    expect(useAuth.getState()).toMatchObject({ status: "signedOut", error: null });
    driver.popupError = { code: "auth/internal-error" };
    await signInWithGoogle();
    expect(useAuth.getState()).toMatchObject({ status: "signedOut", error: "auth/internal-error" });
  });

  // @req AUTH-002
  it("ensureAnonymous creates an anonymous user lazily, once", async () => {
    const { driver } = setup();
    await initAuth();
    expect(useAuth.getState().user).toBeNull();
    expect(await ensureAnonymous()).toEqual(anon);
    expect(await ensureAnonymous()).toEqual(anon);
    expect(driver.calls.filter((c) => c === "anon")).toHaveLength(1);
    expect(useAuth.getState()).toMatchObject({ status: "signedIn", user: { isAnonymous: true } });
  });

  // @req AUTH-003
  it("an anonymous user links to Google keeping its uid", async () => {
    const { driver } = setup();
    await ensureAnonymous();
    await linkAnonymousToGoogle();
    expect(driver.calls).toContain("google:popup:link");
    expect(useAuth.getState().user).toMatchObject({ uid: "anon1", isAnonymous: false });
  });

  // @req AUTH-004
  it("signOut runs the hooks around the driver sign-out", async () => {
    const { driver, hooks } = setup();
    driver.user = google;
    await initAuth();
    await signOut({ removeLocalData: true });
    expect(hooks).toEqual(["before:true", "after:true"]);
    expect(driver.calls).toContain("signOut");
    expect(useAuth.getState()).toMatchObject({ status: "signedOut", user: null });
    await signOut();
    expect(hooks).toEqual(["before:true", "after:true", "before:false", "after:false"]);
  });

  it("signInForTests only works with an emulator driver", async () => {
    setup();
    await signInForTests("t@example.com");
    expect(useAuth.getState().user?.email).toBe("t@example.com");
    const d = new FakeDriver();
    (d as { signInForTests?: unknown }).signInForTests = undefined;
    setup({ driver: d });
    await expect(signInForTests("x@y.z")).rejects.toThrow(/emulators/);
  });
});

describe("helpers", () => {
  it("errorCode reads codes and messages", () => {
    expect(errorCode({ code: "auth/x" })).toBe("auth/x");
    expect(errorCode(new Error("m"))).toBe("m");
    expect(errorCode(5)).toBe("5");
  });

  it("defaultPreferRedirect: popup everywhere except an installed iOS app with a same-origin handler", () => {
    const standalone = vi.fn(
      (q: string) => ({ matches: q === "(display-mode: standalone)" }) as MediaQueryList,
    );
    vi.stubGlobal("matchMedia", standalone);
    const ua = vi
      .spyOn(navigator, "userAgent", "get")
      .mockReturnValue("Mozilla/5.0 (Linux; Android 14)");
    // Android, installed or not: popup (the redirect result was lost → "still signed out")
    expect(defaultPreferRedirect()).toBe(false);
    // installed iOS app without a same-origin handler: still popup (redirect would fail too)
    ua.mockReturnValue("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)");
    expect(defaultPreferRedirect()).toBe(false);
    // installed iOS app with the same-origin handler (jsdom host = authDomain): redirect
    vi.stubEnv("NEXT_PUBLIC_AUTH_SAME_ORIGIN", "1");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "tcgtempo.firebaseapp.com");
    expect(defaultPreferRedirect()).toBe(window.location.hostname !== "localhost");
    // iOS Safari tab (not installed): popup
    standalone.mockImplementation(() => ({ matches: false }) as MediaQueryList);
    expect(defaultPreferRedirect()).toBe(false);
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    ua.mockRestore();
  });
});
