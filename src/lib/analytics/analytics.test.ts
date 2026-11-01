// @req LEG-004
// @req REL-005
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetErrorReportingForTests, errorReportingActive, captureError } from "@/lib/errors";
import type { TelemetryConfig } from "./config";
import {
  analyticsConfigured,
  errorsConfigured,
  telemetryConfig,
  telemetryConfigured,
  TEST_TELEMETRY_KEY,
} from "./config";
import { CONSENT_KEY, currentConsent, readConsent, useConsent, writeConsent } from "./consent";
import { ANALYTICS_EVENTS, isAnalyticsEvent, sanitizeParams } from "./events";
import {
  applyConsent,
  bootTelemetry,
  configureTelemetry,
  resetTelemetryForTests,
  track,
  type AnalyticsDriver,
} from "./telemetry";

const FULL: TelemetryConfig = {
  firebase: {
    apiKey: "k",
    authDomain: "a.firebaseapp.com",
    projectId: "p",
    storageBucket: "b",
    messagingSenderId: "1",
    appId: "app",
  },
  measurementId: "G-1",
  sentryDsn: "https://k@o1.ingest.sentry.io/1",
  release: "1.0.0",
};
const NONE: TelemetryConfig = {
  firebase: null,
  measurementId: null,
  sentryDsn: null,
  release: "x",
};

function setup(cfg: TelemetryConfig) {
  const logs: [string, Record<string, unknown>][] = [];
  const enabled: boolean[] = [];
  const driver: AnalyticsDriver = {
    log: (n, p) => logs.push([n, p]),
    setEnabled: (on) => enabled.push(on),
  };
  const loadAnalytics = vi.fn(async () => driver);
  const captured: unknown[] = [];
  const close = vi.fn(async () => undefined);
  const loadErrors = vi.fn(async () => ({ capture: (e: unknown) => captured.push(e), close }));
  configureTelemetry({ config: () => cfg, loadAnalytics, loadErrors });
  return { logs, enabled, loadAnalytics, loadErrors, captured, close };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  useConsent.setState({ choice: null });
  resetTelemetryForTests();
  resetErrorReportingForTests();
});
afterEach(() => vi.unstubAllEnvs());

describe("consent storage (LEG-004)", () => {
  it("defaults to unset and round-trips granted/denied", () => {
    expect(readConsent()).toBe("unset");
    writeConsent("granted", localStorage, 5);
    expect(JSON.parse(localStorage.getItem(CONSENT_KEY)!)).toEqual({
      v: 1,
      choice: "granted",
      at: 5,
    });
    expect(readConsent()).toBe("granted");
    writeConsent("denied");
    expect(readConsent()).toBe("denied");
    writeConsent("unset");
    expect(localStorage.getItem(CONSENT_KEY)).toBeNull();
  });

  it("treats corrupt or unknown values as unset and survives broken storage", () => {
    localStorage.setItem(CONSENT_KEY, "{nope");
    expect(readConsent()).toBe("unset");
    localStorage.setItem(CONSENT_KEY, JSON.stringify({ v: 2, choice: "granted" }));
    expect(readConsent()).toBe("unset");
    const broken = {
      getItem: () => {
        throw new Error("x");
      },
      setItem: () => {
        throw new Error("x");
      },
      removeItem: () => undefined,
    };
    expect(readConsent(broken)).toBe("unset");
    expect(() => writeConsent("granted", broken)).not.toThrow();
    expect(readConsent(null)).toBe("unset");
  });

  it("the store hydrates from storage and persists choices", () => {
    writeConsent("denied");
    expect(currentConsent()).toBe("denied");
    useConsent.getState().hydrate();
    expect(useConsent.getState().choice).toBe("denied");
    useConsent.getState().set("granted");
    expect(readConsent()).toBe("granted");
    expect(currentConsent()).toBe("granted");
  });
});

describe("config", () => {
  it("is unconfigured without env", () => {
    const cfg = telemetryConfig();
    expect(analyticsConfigured(cfg)).toBe(false);
    expect(errorsConfigured(cfg)).toBe(false);
    expect(telemetryConfigured(cfg)).toBe(false);
  });

  it("needs Firebase config + measurement id for analytics, a DSN for errors", () => {
    expect(analyticsConfigured(FULL)).toBe(true);
    expect(analyticsConfigured({ ...FULL, measurementId: null })).toBe(false);
    expect(analyticsConfigured({ ...FULL, firebase: null })).toBe(false);
    expect(errorsConfigured({ ...NONE, sentryDsn: "x" })).toBe(true);
    expect(telemetryConfigured({ ...NONE, sentryDsn: "x" })).toBe(true);
  });

  it("reads the literal env vars and ignores placeholders", () => {
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID", "G-ABC");
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "REPLACE_ME");
    const cfg = telemetryConfig();
    expect(cfg.measurementId).toBe("G-ABC");
    expect(cfg.sentryDsn).toBeNull();
  });

  it("test builds can switch on fake config with ?telemetry=1 (never in prod builds)", () => {
    window.history.replaceState(null, "", "/?telemetry=1");
    expect(telemetryConfig().measurementId).toBeNull(); // hooks off
    vi.stubEnv("NEXT_PUBLIC_TEST_HOOKS", "1");
    expect(telemetryConfig().measurementId).toBe("G-TEST000000");
    expect(sessionStorage.getItem(TEST_TELEMETRY_KEY)).toBe("1");
    window.history.replaceState(null, "", "/");
    expect(analyticsConfigured()).toBe(true); // remembered for the tab
    window.history.replaceState(null, "", "/?telemetry=0");
    expect(analyticsConfigured()).toBe(false);
    window.history.replaceState(null, "", "/");
  });
});

describe("events (§19.5)", () => {
  it("lists exactly the PRD event names", () => {
    expect([...ANALYTICS_EVENTS].sort()).toEqual(
      [
        "game_start",
        "game_end",
        "timer_respond",
        "timer_timeout",
        "preset_custom_created",
        "art_scryfall_selected",
        "art_uploaded",
        "sign_in",
        "paywall_view",
        "purchase",
      ].sort(),
    );
    expect(isAnalyticsEvent("game_start")).toBe(true);
    expect(isAnalyticsEvent("page_view")).toBe(false);
  });

  it("keeps primitive params only and truncates long strings", () => {
    expect(
      sanitizeParams({
        a: "x".repeat(150),
        b: 3,
        c: true,
        d: { nested: 1 },
        e: Number.NaN,
        f: null,
      }),
    ).toEqual({ a: "x".repeat(100), b: 3, c: true });
    expect(sanitizeParams(undefined)).toEqual({});
  });
});

describe("track() is consent-gated (LEG-004)", () => {
  it("does nothing and loads nothing before consent", async () => {
    const s = setup(FULL);
    expect(track("game_start", { preset: "p", players: 4, timers: false, mode: "off" })).toBe(
      false,
    );
    bootTelemetry();
    await flush();
    expect(s.loadAnalytics).not.toHaveBeenCalled();
    expect(s.loadErrors).not.toHaveBeenCalled();
    expect(s.logs).toEqual([]);
  });

  it("queues nothing: events before consent are dropped, later ones are sent", async () => {
    const s = setup(FULL);
    track("timer_respond");
    bootTelemetry();
    useConsent.getState().set("granted");
    await flush();
    expect(s.loadAnalytics).toHaveBeenCalledTimes(1);
    expect(s.enabled).toEqual([true]);
    expect(s.logs).toEqual([]);
    expect(track("sign_in", { method: "google" })).toBe(true);
    await flush();
    expect(s.logs).toEqual([["sign_in", { method: "google" }]]);
  });

  it("never loads anything when not configured, even with consent", async () => {
    const s = setup(NONE);
    useConsent.getState().set("granted");
    applyConsent("granted");
    expect(track("timer_timeout")).toBe(false);
    await flush();
    expect(s.loadAnalytics).not.toHaveBeenCalled();
    expect(s.loadErrors).not.toHaveBeenCalled();
  });

  it("resumes on boot for a stored grant and stops on withdrawal", async () => {
    writeConsent("granted");
    const s = setup(FULL);
    bootTelemetry();
    await flush();
    expect(s.loadAnalytics).toHaveBeenCalledTimes(1);
    expect(s.loadErrors).toHaveBeenCalledTimes(1);
    expect(errorReportingActive()).toBe(true);
    captureError(new Error("boom"));
    await flush();
    expect(s.captured).toHaveLength(1);
    useConsent.getState().set("denied");
    await flush();
    expect(s.enabled).toEqual([true, false]);
    expect(s.close).toHaveBeenCalled();
    expect(errorReportingActive()).toBe(false);
    expect(track("purchase", { plan: "yearly" })).toBe(false);
  });

  it("survives a failing SDK load and retries on the next consent", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    configureTelemetry({
      config: () => FULL,
      loadAnalytics: vi.fn(async () => {
        throw new Error("blocked");
      }),
      loadErrors: vi.fn(async () => {
        throw new Error("blocked");
      }),
    });
    useConsent.getState().set("granted");
    applyConsent("granted");
    await flush();
    expect(warn).toHaveBeenCalled();
    expect(track("art_uploaded")).toBe(true);
    await flush();
    warn.mockRestore();
  });

  it("only Sentry starts when only a DSN is configured", async () => {
    const s = setup({ ...NONE, sentryDsn: "https://k@o1.ingest.sentry.io/1" });
    applyConsent("granted");
    await flush();
    expect(s.loadAnalytics).not.toHaveBeenCalled();
    expect(s.loadErrors).toHaveBeenCalledTimes(1);
  });
});
