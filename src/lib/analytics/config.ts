/**
 * Telemetry configuration (T8.3 · LEG-004, REL-005). Analytics needs the Firebase web config plus
 * `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`; error reporting needs `NEXT_PUBLIC_SENTRY_DSN`. Env reads
 * are literal so Next inlines them (D-050). Without them every telemetry call is a no-op and the
 * consent banner never shows.
 *
 * Test builds only (`NEXT_PUBLIC_TEST_HOOKS=1`): `?telemetry=1` stores a session flag that swaps in
 * fake config so e2e can prove, with route interception, that nothing is requested before consent.
 */
import { readFirebaseConfig, type FirebaseWebConfig } from "@/lib/firebase/config";

export interface TelemetryConfig {
  firebase: FirebaseWebConfig | null;
  measurementId: string | null;
  sentryDsn: string | null;
  release: string;
}

export const TEST_TELEMETRY_KEY = "tcg.test.telemetry";

const TEST_CONFIG: TelemetryConfig = {
  firebase: {
    apiKey: "test-api-key",
    authDomain: "tcg-test.firebaseapp.com",
    projectId: "tcg-test",
    storageBucket: "tcg-test.appspot.com",
    messagingSenderId: "0",
    appId: "1:0:web:0",
  },
  measurementId: "G-TEST000000",
  sentryDsn: "https://public@o0.ingest.sentry.io/0",
  release: "test",
};

function clean(v: string | undefined): string | null {
  return v && v !== "REPLACE_ME" ? v : null;
}

function testTelemetryOn(): boolean {
  if (process.env.NEXT_PUBLIC_TEST_HOOKS !== "1" || typeof window === "undefined") return false;
  try {
    const flag = new URLSearchParams(window.location.search).get("telemetry");
    if (flag === "1") window.sessionStorage.setItem(TEST_TELEMETRY_KEY, "1");
    if (flag === "0") window.sessionStorage.removeItem(TEST_TELEMETRY_KEY);
    return window.sessionStorage.getItem(TEST_TELEMETRY_KEY) === "1";
  } catch {
    return false;
  }
}

export function telemetryConfig(): TelemetryConfig {
  if (testTelemetryOn()) return TEST_CONFIG;
  return {
    firebase: readFirebaseConfig(),
    measurementId: clean(process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID),
    sentryDsn: clean(process.env.NEXT_PUBLIC_SENTRY_DSN),
    release: process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0",
  };
}

export function analyticsConfigured(cfg: TelemetryConfig = telemetryConfig()): boolean {
  return cfg.firebase !== null && cfg.measurementId !== null;
}

export function errorsConfigured(cfg: TelemetryConfig = telemetryConfig()): boolean {
  return cfg.sentryDsn !== null;
}

/** True when this deployment collects anything that needs consent (shows the banner). */
export function telemetryConfigured(cfg: TelemetryConfig = telemetryConfig()): boolean {
  return analyticsConfigured(cfg) || errorsConfigured(cfg);
}
