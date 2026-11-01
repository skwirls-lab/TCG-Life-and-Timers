/**
 * Runs before the app becomes interactive (Next `instrumentation-client`), on every page.
 * Keep it tiny: it is part of every route's initial JS (PERF-003).
 * - Captures `beforeinstallprompt` before React mounts (PWA-003; the event fires early).
 * - Resumes analytics / error reporting only if the user previously granted consent (LEG-004);
 *   the SDKs themselves load through dynamic imports.
 * - Puts Zod in jitless mode before any schema runs: its JIT feature probe calls `new Function`,
 *   which our CSP (no 'unsafe-eval', §19.6) blocks and reports as a violation.
 */
import { z } from "zod";
import { captureInstallPrompt } from "@/features/install/installEvents";
import { bootTelemetry } from "@/lib/analytics/telemetry";

z.config({ jitless: true });

try {
  captureInstallPrompt();
  bootTelemetry();
} catch (e) {
  console.warn("[instrumentation] start-up failed", e);
}
