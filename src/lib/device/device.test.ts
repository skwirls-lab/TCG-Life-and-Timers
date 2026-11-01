// @req PWA-005 @req PWA-006 @req INP-008
import { describe, expect, it, vi } from "vitest";
import { createWakeLock } from "./wakeLock";
import { hapticsSupported, vibrate } from "./haptics";
import { createAudioPlayer, TONES } from "./audio";
import { enterFullscreen, exitFullscreen, fullscreenSupported, isStandalone } from "./fullscreen";

function fakeDoc(visibility: DocumentVisibilityState = "visible") {
  const listeners: Record<string, () => void> = {};
  const doc = {
    visibilityState: visibility,
    addEventListener: (t: string, cb: () => void) => (listeners[t] = cb),
    removeEventListener: vi.fn(),
    createElement: (tag: string) => document.createElement(tag),
    body: document.body,
  };
  return {
    doc: doc as unknown as Parameters<typeof createWakeLock>[0]["document"],
    listeners,
    raw: doc,
  };
}

describe("wake lock", () => {
  it("uses the API and re-acquires after visibility returns", async () => {
    const release = vi.fn(() => Promise.resolve());
    let releaseCb: (() => void) | undefined;
    const request = vi.fn(() =>
      Promise.resolve({
        release,
        addEventListener: (_t: string, cb: () => void) => (releaseCb = cb),
      }),
    );
    const { doc, listeners } = fakeDoc();
    const wl = createWakeLock({ wakeLock: { request }, document: doc });
    expect(await wl.enable()).toBe("api");
    expect(wl.active).toBe(true);
    releaseCb!(); // OS released it when hidden
    expect(wl.active).toBe(false);
    listeners.visibilitychange!();
    await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(2);
    await wl.disable();
    expect(release).toHaveBeenCalled();
  });

  it("falls back to a looping video when asked", async () => {
    const { doc } = fakeDoc();
    const play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockImplementation(() => Promise.resolve());
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    const wl = createWakeLock({ document: doc });
    expect(await wl.enable({ fallback: true })).toBe("fallback");
    expect(document.querySelector("video")).not.toBeNull();
    await wl.disable();
    expect(document.querySelector("video")).toBeNull();
    play.mockRestore();
    pause.mockRestore();
  });

  it("reports unsupported without API or fallback; tolerates request failure", async () => {
    const { doc } = fakeDoc();
    expect(await createWakeLock({ document: doc }).enable()).toBe("unsupported");
    const wl = createWakeLock({
      wakeLock: { request: () => Promise.reject(new Error("denied")) },
      document: doc,
    });
    expect(await wl.enable()).toBe("api");
    expect(wl.active).toBe(false);
  });
});

describe("haptics", () => {
  it("vibrates only when supported and enabled", () => {
    const v = vi.fn(() => true);
    expect(hapticsSupported({})).toBe(false);
    expect(vibrate({}, "tick", true)).toBe(false);
    expect(vibrate({ vibrate: v }, "tick", false)).toBe(false);
    expect(vibrate({ vibrate: v }, "warn", true)).toBe(true);
    expect(v).toHaveBeenCalledWith([60, 80, 60]);
    expect(
      vibrate(
        {
          vibrate: () => {
            throw new Error("x");
          },
        },
        "tick",
        true,
      ),
    ).toBe(false);
  });
});

describe("audio", () => {
  function fakeCtx(state: AudioContextState = "suspended") {
    const osc = {
      type: "",
      frequency: { value: 0 },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    const gain = {
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
    };
    const ctx = {
      currentTime: 0,
      state,
      resume: vi.fn(async function (this: { state: string }) {
        ctx.state = "running";
      }),
      createOscillator: vi.fn(() => osc),
      createGain: vi.fn(() => gain),
      destination: {},
    };
    return ctx;
  }
  it("must be unlocked before playing", async () => {
    const ctx = fakeCtx();
    const p = createAudioPlayer(() => ctx as never);
    expect(p.play("tap", 1)).toBe(false);
    expect(await p.unlock()).toBe(true);
    expect(p.unlocked).toBe(true);
    expect(p.play("timeout", 1)).toBe(true);
    expect(ctx.createOscillator).toHaveBeenCalledTimes(TONES.timeout.repeat!);
    expect(p.play("tap", 0)).toBe(false);
  });
  it("handles missing context and resume failure", async () => {
    expect(await createAudioPlayer(() => null).unlock()).toBe(false);
    const ctx = fakeCtx();
    ctx.resume = vi.fn(() => Promise.reject(new Error("no")));
    expect(await createAudioPlayer(() => ctx as never).unlock()).toBe(false);
  });
});

describe("fullscreen", () => {
  it("enters and exits when supported", async () => {
    const requestFullscreen = vi.fn(() => Promise.resolve());
    const env = {
      documentElement: { requestFullscreen },
      fullscreenElement: null as Element | null,
      exitFullscreen: vi.fn(() => Promise.resolve()),
    };
    expect(fullscreenSupported(env)).toBe(true);
    expect(await enterFullscreen(env)).toBe(true);
    env.fullscreenElement = document.body;
    expect(await enterFullscreen(env)).toBe(true);
    await exitFullscreen(env);
    expect(env.exitFullscreen).toHaveBeenCalled();
  });
  it("handles unsupported and rejection", async () => {
    expect(await enterFullscreen({ documentElement: {}, fullscreenElement: null })).toBe(false);
    expect(
      await enterFullscreen({
        documentElement: { requestFullscreen: () => Promise.reject(new Error("x")) },
        fullscreenElement: null,
      }),
    ).toBe(false);
  });
  it("detects standalone mode", () => {
    expect(isStandalone(() => ({ matches: false }), { standalone: true })).toBe(true);
    expect(isStandalone((q) => ({ matches: q.includes("standalone") }))).toBe(true);
    expect(isStandalone(() => ({ matches: false }))).toBe(false);
  });
});
