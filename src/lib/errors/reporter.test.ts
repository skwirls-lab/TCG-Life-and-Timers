// @req REL-005
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TelemetryConfig } from "@/lib/analytics/config";
import {
  captureError,
  configureErrorReporting,
  errorReportingActive,
  loadSentry,
  resetErrorReportingForTests,
  scrubUrl,
  startErrorReporting,
  stopErrorReporting,
} from "./reporter";

const init = vi.fn();
const captureException = vi.fn();
const close = vi.fn(async () => true);
vi.mock("@sentry/browser", () => ({ init, captureException, close }));

const CFG: TelemetryConfig = {
  firebase: null,
  measurementId: null,
  sentryDsn: "https://k@o1.ingest.sentry.io/1",
  release: "1.2.3",
};

beforeEach(() => {
  resetErrorReportingForTests();
  init.mockClear();
  captureException.mockClear();
});

describe("error reporting (REL-005)", () => {
  it("does nothing without a DSN", async () => {
    expect(await startErrorReporting({ ...CFG, sentryDsn: null })).toBeNull();
    expect(errorReportingActive()).toBe(false);
    captureError(new Error("x"));
    expect(init).not.toHaveBeenCalled();
  });

  it("inits Sentry once with PII collection off and forwards errors", async () => {
    const r1 = startErrorReporting(CFG);
    const r2 = startErrorReporting(CFG);
    expect(r1).toBe(r2);
    await r1;
    expect(init).toHaveBeenCalledTimes(1);
    const opts = init.mock.calls[0]![0] as Record<string, unknown> & {
      beforeSend: (e: Record<string, unknown>) => Record<string, unknown>;
    };
    expect(opts).toMatchObject({
      dsn: CFG.sentryDsn,
      release: "1.2.3",
      tracesSampleRate: 0,
      dataCollection: { userInfo: false, cookies: false, urlQueryParams: false },
    });
    const ev = opts.beforeSend({
      request: { url: "https://app/p/ABC?seed=1#x", cookies: { a: "1" }, headers: { h: "1" } },
      user: { email: "a@b" },
    });
    expect(ev).toEqual({ request: { url: "https://app/p/ABC" } });
    expect(opts.beforeSend({ message: "m" })).toEqual({ message: "m" });
    captureError(new Error("boom"));
    await Promise.resolve();
    await Promise.resolve();
    expect(captureException).toHaveBeenCalledTimes(1);
    // Error-boundary context (componentStack) is forwarded as a React context.
    captureError(new Error("render"), { componentStack: "\n    at Board" });
    await Promise.resolve();
    await Promise.resolve();
    expect(captureException).toHaveBeenLastCalledWith(expect.any(Error), {
      contexts: { react: { componentStack: "\n    at Board" } },
    });
    await stopErrorReporting();
    expect(close).toHaveBeenCalled();
    expect(errorReportingActive()).toBe(false);
  });

  it("recovers from a failed load", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    configureErrorReporting(async () => {
      throw new Error("blocked");
    });
    expect(await startErrorReporting(CFG)).toBeNull();
    expect(errorReportingActive()).toBe(false);
    warn.mockRestore();
    expect(loadSentry).toBeTypeOf("function");
  });

  it("scrubs query strings and fragments", () => {
    expect(scrubUrl("https://a/b?c=1")).toBe("https://a/b");
    expect(scrubUrl("https://a/b#c")).toBe("https://a/b");
    expect(scrubUrl("https://a/b")).toBe("https://a/b");
    expect(scrubUrl(undefined)).toBeUndefined();
  });
});
