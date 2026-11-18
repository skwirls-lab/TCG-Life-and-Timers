// @req AUTH-001 sign-in first: the welcome is offered once, never to signed-in users, never without cloud
import { describe, expect, it } from "vitest";
import {
  WELCOME_KEY,
  launcherAccountView,
  readWelcomeChoice,
  writeWelcomeChoice,
} from "./welcomeChoice";

function memoryStorage(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    map: m,
  };
}

describe("welcome choice record", () => {
  it("round-trips a choice", () => {
    const s = memoryStorage();
    expect(readWelcomeChoice(s)).toBeNull();
    writeWelcomeChoice("guest", s, 5);
    expect(JSON.parse(s.map.get(WELCOME_KEY)!)).toEqual({ v: 1, choice: "guest", at: 5 });
    expect(readWelcomeChoice(s)).toBe("guest");
    writeWelcomeChoice("google", s);
    expect(readWelcomeChoice(s)).toBe("google");
  });

  it("ignores junk and survives storage failures", () => {
    expect(readWelcomeChoice(memoryStorage({ [WELCOME_KEY]: "{" }))).toBeNull();
    expect(
      readWelcomeChoice(memoryStorage({ [WELCOME_KEY]: '{"v":2,"choice":"guest"}' })),
    ).toBeNull();
    expect(readWelcomeChoice(memoryStorage({ [WELCOME_KEY]: '{"v":1,"choice":"x"}' }))).toBeNull();
    expect(readWelcomeChoice(null)).toBeNull();
    const throwing = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {},
    };
    expect(readWelcomeChoice(throwing)).toBeNull();
    expect(() => writeWelcomeChoice("guest", throwing)).not.toThrow();
  });

  it("uses localStorage by default", () => {
    localStorage.removeItem(WELCOME_KEY);
    expect(readWelcomeChoice()).toBeNull();
    writeWelcomeChoice("guest");
    expect(readWelcomeChoice()).toBe("guest");
    localStorage.removeItem(WELCOME_KEY);
  });
});

describe("launcherAccountView", () => {
  const base = { cloudConfigured: true, authInitialized: true, signedIn: false, choice: null };

  it("shows nothing when cloud isn't configured", () => {
    expect(launcherAccountView({ ...base, cloudConfigured: false })).toBe("none");
  });

  it("waits for the first auth state", () => {
    expect(launcherAccountView({ ...base, authInitialized: false })).toBe("loading");
  });

  it("never offers the welcome to a signed-in user", () => {
    expect(launcherAccountView({ ...base, signedIn: true })).toBe("signedIn");
    expect(launcherAccountView({ ...base, signedIn: true, choice: "guest" })).toBe("signedIn");
  });

  it("offers the welcome once, then the sign-in entry", () => {
    expect(launcherAccountView(base)).toBe("welcome");
    expect(launcherAccountView({ ...base, choice: "guest" })).toBe("signIn");
    expect(launcherAccountView({ ...base, choice: "google" })).toBe("signIn");
  });
});
