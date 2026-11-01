/**
 * Error reporting (T8.3 · REL-005). Sentry's browser SDK is imported lazily and ONLY when the
 * deployment sets `NEXT_PUBLIC_SENTRY_DSN` and the user granted consent; otherwise this module
 * never loads it. No PII: default PII off, no session replay, no tracing, URLs stripped of queries.
 */
import type { TelemetryConfig } from "@/lib/analytics/config";

export interface ErrorReporter {
  capture: (error: unknown) => void;
  close: () => Promise<void>;
}

export type ReporterLoader = (cfg: TelemetryConfig) => Promise<ErrorReporter>;

/** Removes query strings and fragments (share codes, test params) from URLs in an event. */
export function scrubUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  const i = url.search(/[?#]/);
  return i >= 0 ? url.slice(0, i) : url;
}

export const loadSentry: ReporterLoader = async (cfg) => {
  const Sentry = await import("@sentry/browser");
  Sentry.init({
    dsn: cfg.sentryDsn ?? undefined,
    release: cfg.release,
    // No user info, cookies, headers, query params or bodies.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    tracesSampleRate: 0,
    // Errors only: no session-replay or tracing integrations are added.
    beforeSend(event) {
      if (event.request) {
        event.request.url = scrubUrl(event.request.url);
        delete event.request.cookies;
        delete event.request.headers;
      }
      delete event.user;
      return event;
    },
  });
  return {
    capture: (e) => {
      Sentry.captureException(e);
    },
    close: async () => {
      await Sentry.close();
    },
  };
};

let reporter: Promise<ErrorReporter | null> | null = null;
let loader: ReporterLoader = loadSentry;

export function configureErrorReporting(l: ReporterLoader): void {
  loader = l;
}

/** Starts Sentry once (callers check config + consent first). */
export function startErrorReporting(cfg: TelemetryConfig): Promise<ErrorReporter | null> {
  if (!cfg.sentryDsn) return Promise.resolve(null);
  reporter ??= loader(cfg).catch((e: unknown) => {
    console.warn("[errors] Sentry failed to start", e);
    reporter = null;
    return null;
  });
  return reporter;
}

export async function stopErrorReporting(): Promise<void> {
  const r = await reporter;
  reporter = null;
  await r?.close();
}

/** Reports an error if reporting is running; otherwise does nothing. */
export function captureError(error: unknown): void {
  void reporter?.then((r) => r?.capture(error));
}

export function errorReportingActive(): boolean {
  return reporter !== null;
}

export function resetErrorReportingForTests(): void {
  reporter = null;
  loader = loadSentry;
}
