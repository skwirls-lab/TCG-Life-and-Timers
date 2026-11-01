// @req SEC-007
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FirebaseApp } from "firebase/app";
import {
  appCheckMode,
  initAppCheck,
  readAppCheckEnv,
  resetAppCheckForTests,
  type AppCheckFactories,
} from "./appCheck";

function factories(app: FirebaseApp | null = {} as FirebaseApp) {
  const initializeAppCheck = vi.fn();
  const providers: string[] = [];
  class ReCaptchaEnterpriseProvider {
    readonly key: string;
    constructor(key: string) {
      this.key = key;
      providers.push(key);
    }
  }
  const f: AppCheckFactories = {
    getApp: async () => app,
    load: async () => ({ initializeAppCheck, ReCaptchaEnterpriseProvider }) as never,
    global: {},
  };
  return { f, initializeAppCheck, providers };
}

afterEach(() => resetAppCheckForTests());

describe("App Check init", () => {
  it("chooses the mode from env", () => {
    expect(appCheckMode({ emulators: false })).toBe("none");
    expect(appCheckMode({ emulators: false, siteKey: "REPLACE_ME" })).toBe("none");
    expect(appCheckMode({ emulators: false, siteKey: "key" })).toBe("recaptcha");
    expect(appCheckMode({ emulators: true, siteKey: "key" })).toBe("debug");
    expect(readAppCheckEnv()).toMatchObject({ emulators: false });
  });

  it("no-op without a site key", async () => {
    const { f, initializeAppCheck } = factories();
    expect(await initAppCheck({ emulators: false }, f)).toBe("none");
    expect(initializeAppCheck).not.toHaveBeenCalled();
    expect(f.global.FIREBASE_APPCHECK_DEBUG_TOKEN).toBeUndefined();
  });

  it("reCAPTCHA Enterprise provider when the site key is set (once)", async () => {
    const { f, initializeAppCheck, providers } = factories();
    expect(await initAppCheck({ emulators: false, siteKey: "site-1" }, f)).toBe("recaptcha");
    expect(await initAppCheck({ emulators: false, siteKey: "site-1" }, f)).toBe("recaptcha");
    expect(providers).toEqual(["site-1"]);
    expect(initializeAppCheck).toHaveBeenCalledTimes(1);
    expect(initializeAppCheck.mock.calls[0]?.[1]).toMatchObject({
      isTokenAutoRefreshEnabled: true,
    });
  });

  it("emulators: debug token, provider only with a site key", async () => {
    const a = factories();
    expect(await initAppCheck({ emulators: true }, a.f)).toBe("debug");
    expect(a.f.global.FIREBASE_APPCHECK_DEBUG_TOKEN).toBe(true);
    expect(a.initializeAppCheck).not.toHaveBeenCalled();
    resetAppCheckForTests();
    const b = factories();
    await initAppCheck({ emulators: true, siteKey: "k", debugToken: "tok" }, b.f);
    expect(b.f.global.FIREBASE_APPCHECK_DEBUG_TOKEN).toBe("tok");
    expect(b.initializeAppCheck).toHaveBeenCalledTimes(1);
  });

  it("returns none when Firebase isn't configured and can retry after a failure", async () => {
    expect(await initAppCheck({ emulators: false, siteKey: "k" }, factories(null).f)).toBe("none");
    resetAppCheckForTests();
    const bad = factories();
    bad.f.load = () => Promise.reject(new Error("chunk"));
    await expect(initAppCheck({ emulators: false, siteKey: "k" }, bad.f)).rejects.toThrow("chunk");
    expect(await initAppCheck({ emulators: false, siteKey: "k" }, factories().f)).toBe("recaptcha");
  });
});
