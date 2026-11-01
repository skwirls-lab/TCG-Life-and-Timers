import { afterEach, describe, expect, it, vi } from "vitest";
import { browserHaptics } from "./haptics";
import { browserAudio } from "./audio";
import { browserWakeLock } from "./wakeLock";

describe("browser adapters", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("haptics adapter detects navigator.vibrate", () => {
    const vib = vi.fn(() => true);
    Object.defineProperty(navigator, "vibrate", { configurable: true, value: vib });
    const env = browserHaptics();
    expect(env.vibrate?.(5)).toBe(true);
    Object.defineProperty(navigator, "vibrate", { configurable: true, value: undefined });
    expect(browserHaptics().vibrate).toBeUndefined();
  });

  it("audio adapter is a singleton and unlocks via AudioContext", async () => {
    class FakeAC {
      state = "suspended";
      currentTime = 0;
      destination = {};
      async resume() {
        this.state = "running";
      }
      createOscillator() {
        return {};
      }
      createGain() {
        return {};
      }
    }
    vi.stubGlobal("AudioContext", FakeAC);
    const a = browserAudio();
    expect(browserAudio()).toBe(a);
    expect(await a.unlock()).toBe(true);
  });

  it("wake lock adapter wires navigator.wakeLock", async () => {
    const request = vi.fn(() => Promise.resolve({ release: () => Promise.resolve() }));
    Object.defineProperty(navigator, "wakeLock", { configurable: true, value: { request } });
    const wl = browserWakeLock();
    expect(await wl.enable()).toBe("api");
    expect(request).toHaveBeenCalledWith("screen");
    await wl.disable();
  });
});
