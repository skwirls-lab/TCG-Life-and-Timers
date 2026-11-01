/**
 * Consent-gated analytics (T8.3 · LEG-004, PRD §19.5). `track()` is a no-op unless this deployment
 * has analytics config AND the user granted consent; nothing is queued before consent. The Firebase
 * Analytics SDK is loaded with dynamic `import()` only after consent, so it never lands in the
 * board or launcher chunks (PERF-003).
 */
export {
  track,
  applyConsent,
  bootTelemetry,
  configureTelemetry,
  resetTelemetryForTests,
} from "./telemetry";
export type { AnalyticsDriver, TelemetryEnv } from "./telemetry";
export * from "./events";
export * from "./consent";
export * from "./config";
