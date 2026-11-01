// T8.4 · PRD §19.6 security headers and Content Security Policy (no PRD requirement ID).
import { describe, expect, it } from "vitest";
import {
  contentSecurityPolicy,
  cspDirectives,
  securityHeaders,
  serializeCsp,
  serviceWorkerHeaders,
} from "./headers";

const header = (key: string, opts = {}) => securityHeaders(opts).find((h) => h.key === key)?.value;

describe("security headers (§19.6)", () => {
  it("sends CSP, HSTS, nosniff, referrer, permissions and frame protection", () => {
    expect(header("Strict-Transport-Security")).toMatch(/max-age=\d{8,}/);
    expect(header("X-Content-Type-Options")).toBe("nosniff");
    expect(header("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(header("X-Frame-Options")).toBe("DENY");
    const pp = header("Permissions-Policy")!;
    expect(pp).toContain("camera=(self)");
    expect(pp).toContain("microphone=()");
    expect(pp).toContain("geolocation=()");
    expect(header("Content-Security-Policy")).toBe(contentSecurityPolicy());
  });

  it("locks the default and framing to self / none", () => {
    const d = cspDirectives();
    expect(d["default-src"]).toEqual(["'self'"]);
    expect(d["frame-ancestors"]).toEqual(["'none'"]);
    expect(d["object-src"]).toEqual(["'none'"]);
    expect(d["base-uri"]).toEqual(["'self'"]);
  });

  it("allows only the §19.6 origins for network access", () => {
    const c = cspDirectives()["connect-src"]!;
    for (const o of [
      "'self'",
      "https://*.googleapis.com",
      "https://*.firebaseio.com",
      "https://identitytoolkit.googleapis.com",
      "https://securetoken.googleapis.com",
      "https://firebaseinstallations.googleapis.com",
      "https://firestore.googleapis.com",
      "https://firebasestorage.googleapis.com",
      "https://api.scryfall.com",
      "https://api.stripe.com",
      "https://checkout.stripe.com",
      "https://*.ingest.sentry.io",
    ]) {
      expect(c).toContain(o);
    }
    expect(c.some((s) => s.includes("127.0.0.1"))).toBe(false);
    expect(c).not.toContain("*");
    expect(c).not.toContain("https:");
  });

  it("allows Scryfall/Google/Firebase images, auth + Stripe frames, blob workers, data media", () => {
    const d = cspDirectives();
    for (const o of [
      "data:",
      "blob:",
      "https://cards.scryfall.io",
      "https://svgs.scryfall.io",
      "https://*.googleusercontent.com",
      "https://firebasestorage.googleapis.com",
    ]) {
      expect(d["img-src"]).toContain(o);
    }
    for (const o of ["https://*.firebaseapp.com", "https://accounts.google.com"]) {
      expect(d["frame-src"]).toContain(o);
    }
    expect(d["frame-src"]).toContain("https://checkout.stripe.com");
    expect(d["worker-src"]).toEqual(["'self'", "blob:"]);
    expect(d["media-src"]).toContain("data:");
  });

  it("never allows eval in production, only in dev", () => {
    expect(cspDirectives()["script-src"]).not.toContain("'unsafe-eval'");
    expect(cspDirectives({ dev: true })["script-src"]).toContain("'unsafe-eval'");
  });

  it("opens 127.0.0.1 only for emulator builds", () => {
    const emu = cspDirectives({ emulators: true });
    expect(emu["connect-src"]).toContain("http://127.0.0.1:*");
    expect(emu["connect-src"]).toContain("ws://127.0.0.1:*");
    expect(emu["img-src"]).toContain("http://127.0.0.1:*");
    expect(emu["frame-src"]).toContain("http://127.0.0.1:*");
  });

  it("serializes directives as a single header line", () => {
    expect(serializeCsp({ a: ["x", "y"], b: ["z"] })).toBe("a x y; b z");
    expect(contentSecurityPolicy()).not.toMatch(/\n/);
  });

  it("serves the service worker uncached", () => {
    expect(serviceWorkerHeaders()).toEqual([
      { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
    ]);
  });
});
