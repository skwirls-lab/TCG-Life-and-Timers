import {
  startErrorReporting,
  stopErrorReporting,
  configureErrorReporting,
  type ReporterLoader,
} from "@/lib/errors";
import { analyticsConfigured, telemetryConfig, type TelemetryConfig } from "./config";
import { currentConsent, onConsentChange, type ConsentChoice } from "./consent";
import { sanitizeParams, type AnalyticsEventName, type AnalyticsEvents } from "./events";

export interface AnalyticsDriver {
  log: (name: string, params: Record<string, string | number | boolean>) => void;
  setEnabled: (on: boolean) => void;
}

export type DriverLoader = (cfg: TelemetryConfig) => Promise<AnalyticsDriver | null>;

/** Firebase Analytics on its own named app (so the measurement id is in its options). */
export const loadFirebaseAnalytics: DriverLoader = async (cfg) => {
  if (!cfg.firebase || !cfg.measurementId) return null;
  const [{ initializeApp, getApps }, an] = await Promise.all([
    import("firebase/app"),
    import("firebase/analytics"),
  ]);
  if (!(await an.isSupported())) return null;
  const app =
    getApps().find((a) => a.name === "analytics") ??
    initializeApp({ ...cfg.firebase, measurementId: cfg.measurementId }, "analytics");
  const analytics = an.initializeAnalytics(app, {
    config: {
      anonymize_ip: true,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    },
  });
  return {
    log: (name, params) => an.logEvent(analytics, name, params),
    setEnabled: (on) => an.setAnalyticsCollectionEnabled(analytics, on),
  };
};

export interface TelemetryEnv {
  config: () => TelemetryConfig;
  loadAnalytics: DriverLoader;
  loadErrors?: ReporterLoader;
}

let env: TelemetryEnv = { config: telemetryConfig, loadAnalytics: loadFirebaseAnalytics };
let driver: Promise<AnalyticsDriver | null> | null = null;
let unsubscribe: (() => void) | null = null;

export function configureTelemetry(overrides: Partial<TelemetryEnv>): void {
  env = { ...env, ...overrides };
  if (overrides.loadErrors) configureErrorReporting(overrides.loadErrors);
}

export function resetTelemetryForTests(): void {
  env = { config: telemetryConfig, loadAnalytics: loadFirebaseAnalytics };
  driver = null;
  unsubscribe?.();
  unsubscribe = null;
}

function startAnalytics(cfg: TelemetryConfig): Promise<AnalyticsDriver | null> {
  driver ??= env.loadAnalytics(cfg).catch((e: unknown) => {
    console.warn("[analytics] failed to start", e);
    driver = null;
    return null;
  });
  return driver;
}

/** Starts or stops telemetry for a consent choice. Nothing loads unless "granted". */
export function applyConsent(choice: ConsentChoice): void {
  const cfg = env.config();
  if (choice === "granted") {
    if (analyticsConfigured(cfg)) {
      void startAnalytics(cfg).then((d) => d?.setEnabled(true));
    }
    void startErrorReporting(cfg);
    return;
  }
  // Withdrawn (or reset): stop collecting. Already-loaded SDKs stay in memory but send nothing.
  void driver?.then((d) => d?.setEnabled(false));
  void stopErrorReporting();
}

/**
 * App start-up (instrumentation-client): resumes telemetry only for a stored "granted" choice and
 * follows later choices. Safe to call more than once.
 */
export function bootTelemetry(): void {
  unsubscribe ??= onConsentChange(applyConsent);
  const choice = currentConsent();
  if (choice === "granted") applyConsent(choice);
}

/**
 * Logs a §19.5 event. Returns false (and does nothing, queues nothing) when analytics is not
 * configured or consent was not granted.
 */
export function track<E extends AnalyticsEventName>(
  name: E,
  ...params: AnalyticsEvents[E] extends Record<string, never> ? [] : [AnalyticsEvents[E]]
): boolean {
  const cfg = env.config();
  if (!analyticsConfigured(cfg) || currentConsent() !== "granted") return false;
  const clean = sanitizeParams(params[0] as Record<string, unknown> | undefined);
  void startAnalytics(cfg).then((d) => d?.log(name, clean));
  return true;
}
