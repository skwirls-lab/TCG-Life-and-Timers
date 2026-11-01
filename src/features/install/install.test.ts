// @req PWA-003
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  captureInstallPrompt,
  deferredInstallPrompt,
  promptInstall,
  resetInstallEventsForTests,
  subscribeInstall,
  wasInstalled,
} from "./installEvents";
import {
  EMPTY_INSTALL_RECORD,
  INSTALL_KEY,
  installOffer,
  isIosSafari,
  justCompleted,
  readInstallRecord,
  writeInstallRecord,
  type OfferInput,
} from "./policy";

const IOS_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const IOS_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";

const base: OfferInput = {
  record: { completedGame: true, dismissedAt: null },
  standalone: false,
  installed: false,
  hasPrompt: true,
  iosSafari: false,
};

describe("install policy (PWA-003)", () => {
  it("never offers before the first completed game (not on first open)", () => {
    expect(installOffer({ ...base, record: EMPTY_INSTALL_RECORD })).toBeNull();
    expect(installOffer(base)).toBe("prompt");
  });

  it("never offers after dismissal, when installed or running standalone", () => {
    expect(installOffer({ ...base, record: { completedGame: true, dismissedAt: 1 } })).toBeNull();
    expect(installOffer({ ...base, standalone: true })).toBeNull();
    expect(installOffer({ ...base, installed: true })).toBeNull();
  });

  it("Android needs the captured prompt; iOS Safari gets the instruction sheet", () => {
    expect(installOffer({ ...base, hasPrompt: false })).toBeNull();
    expect(installOffer({ ...base, hasPrompt: false, iosSafari: true })).toBe("ios");
  });

  it("detects iOS Safari only", () => {
    expect(isIosSafari(IOS_SAFARI)).toBe(true);
    expect(isIosSafari(IOS_CHROME)).toBe(false);
    expect(isIosSafari(ANDROID, 5)).toBe(false);
    expect(isIosSafari(IPAD_DESKTOP, 5)).toBe(true);
    expect(isIosSafari(IPAD_DESKTOP, 0)).toBe(false);
  });

  it("records persist and tolerate bad data", () => {
    localStorage.clear();
    expect(readInstallRecord(localStorage)).toEqual(EMPTY_INSTALL_RECORD);
    writeInstallRecord(localStorage, { completedGame: true, dismissedAt: 7 });
    expect(readInstallRecord(localStorage)).toEqual({ completedGame: true, dismissedAt: 7 });
    localStorage.setItem(INSTALL_KEY, "{bad");
    expect(readInstallRecord(localStorage)).toEqual(EMPTY_INSTALL_RECORD);
    localStorage.setItem(INSTALL_KEY, JSON.stringify({ completedGame: "yes", dismissedAt: "x" }));
    expect(readInstallRecord(localStorage)).toEqual(EMPTY_INSTALL_RECORD);
    expect(readInstallRecord(null)).toEqual(EMPTY_INSTALL_RECORD);
    const throwing = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => undefined,
    };
    expect(() => writeInstallRecord(throwing, EMPTY_INSTALL_RECORD)).not.toThrow();
  });

  it("detects a game that has just been completed", () => {
    expect(justCompleted({ id: "a", status: "ended" }, { id: "a", status: "running" })).toBe(true);
    expect(justCompleted({ id: "a", status: "ended" }, { id: "a", status: "ended" })).toBe(false);
    expect(justCompleted({ id: "b", status: "ended" }, { id: "a", status: "ended" })).toBe(true);
    expect(justCompleted({ id: "a", status: "ended" }, undefined)).toBe(true);
    expect(justCompleted({ id: "a", status: "running" }, undefined)).toBe(false);
    expect(justCompleted(undefined, undefined)).toBe(false);
  });
});

describe("beforeinstallprompt capture", () => {
  beforeEach(() => resetInstallEventsForTests());

  function fire(outcome: "accepted" | "dismissed") {
    const e = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: string }>;
    };
    e.prompt = vi.fn(async () => undefined);
    e.userChoice = Promise.resolve({ outcome });
    window.dispatchEvent(e);
    return e;
  }

  it("suppresses the browser UI, stores the event and prompts once", async () => {
    const seen = vi.fn();
    captureInstallPrompt(window);
    captureInstallPrompt(window); // idempotent
    subscribeInstall(seen);
    expect(await promptInstall()).toBe("unavailable");
    const e = fire("accepted");
    expect(e.defaultPrevented).toBe(true);
    expect(deferredInstallPrompt()).toBe(e);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(await promptInstall()).toBe("accepted");
    expect(e.prompt).toHaveBeenCalledTimes(1);
    expect(deferredInstallPrompt()).toBeNull();
    fire("dismissed");
    expect(await promptInstall()).toBe("dismissed");
  });

  it("tracks appinstalled", () => {
    captureInstallPrompt(window);
    fire("accepted");
    window.dispatchEvent(new Event("appinstalled"));
    expect(wasInstalled()).toBe(true);
    expect(deferredInstallPrompt()).toBeNull();
    captureInstallPrompt(undefined);
  });
});
