// @req ARCH-001
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { securityHeaders, serviceWorkerHeaders } from "../src/lib/security/headers";
import { buildEnv, dotenvKeys, OUT_DIRS } from "./build";
import {
  hostingConfig,
  hostingDrift,
  IMMUTABLE,
  NO_CACHE,
  NOT_RESERVED,
  readFirebaseJson,
  REVALIDATE,
  SW_PATH,
} from "./gen-hosting-config";
import { parseServeArgs, serveConfig } from "./serve-hosting";

const matches = (regex: string, path: string) => new RegExp(regex, "u").test(path);

describe("firebase.json hosting (generated from src/lib/security/headers.ts)", () => {
  it("firebase.json matches the generator (run `npm run gen:hosting` after editing headers.ts)", () => {
    expect(hostingDrift(readFirebaseJson().hosting)).toEqual([]);
  });

  it("reports drift", () => {
    const stale = { ...hostingConfig(), headers: [] };
    expect(hostingDrift(stale)).toEqual([
      "hosting.headers differs from scripts/gen-hosting-config.ts",
    ]);
    expect(hostingDrift(undefined)).toEqual(["firebase.json has no `hosting` object"]);
  });

  it("serves the export with clean URLs, no trailing slash, one share page", () => {
    const h = hostingConfig();
    expect(h.public).toBe("out");
    expect(h.cleanUrls).toBe(true);
    expect(h.trailingSlash).toBe(false);
    expect(h.rewrites).toEqual([{ source: "/p/**", destination: "/p/_.html" }]);
  });

  it("puts the security headers on everything but Hosting's reserved /__/ paths", () => {
    const rule = hostingConfig().headers.find((r) => r.regex === NOT_RESERVED)!;
    expect(rule.headers).toEqual(securityHeaders());
    for (const p of ["/", "/settings", "/tools/mana", "/_next/static/x.js", "/__next._tree.txt"]) {
      expect(matches(NOT_RESERVED, p), p).toBe(true);
    }
    for (const p of ["/__/auth/handler", "/__/auth/iframe", "/__/firebase/init.js"]) {
      expect(matches(NOT_RESERVED, p), p).toBe(false);
    }
  });

  it("caches hashed assets forever and revalidates pages, payloads and the manifest", () => {
    const h = hostingConfig();
    expect(h.headers).toContainEqual({
      source: "/_next/static/**",
      headers: [{ key: "Cache-Control", value: IMMUTABLE }],
    });
    const revalidate = h.headers.find((r) => r.regex === REVALIDATE)!;
    expect(revalidate.headers).toEqual([{ key: "Cache-Control", value: NO_CACHE }]);
    for (const p of [
      "/",
      "/settings",
      "/tools/mana",
      "/p/AbCdEfGh",
      "/~offline",
      "/settings.html",
      "/settings/__next.settings.__PAGE__.txt",
      "/__next._tree.txt",
      "/index.txt",
      "/manifest.webmanifest",
    ]) {
      expect(matches(REVALIDATE, p), p).toBe(true);
    }
    // not: hashed assets (immutable), the worker (its own rule), icons (Hosting default), /__/
    for (const p of [
      "/_next/static/chunks/a1b2.js",
      "/_next/static/css/x.css",
      SW_PATH,
      "/icons/icon-192.png",
      "/__/auth/handler",
    ]) {
      expect(matches(REVALIDATE, p), p).toBe(false);
    }
  });

  it("keeps the service worker uncached and allowed to control /", () => {
    expect(hostingConfig().headers).toContainEqual({
      source: SW_PATH,
      headers: serviceWorkerHeaders(),
    });
  });

  it("CSP allows the same-origin auth iframe; emulator relaxations only on request", () => {
    const csp = (o = {}) =>
      hostingConfig(o)
        .headers[0]!.headers.find((h) => h.key === "Content-Security-Policy")!
        .value.split("; ");
    expect(csp().find((d) => d.startsWith("frame-src"))).toMatch(/^frame-src 'self' /);
    expect(csp().join(";")).not.toContain("127.0.0.1");
    expect(csp({ emulators: true }).join(";")).toContain("http://127.0.0.1:*");
    expect(hostingConfig({ public: "out-emu" }).public).toBe("out-emu");
  });
});

describe("build profiles (scripts/build.ts)", () => {
  it("reads dotenv keys", () => {
    expect(dotenvKeys("# c\nA=1\n\n export B = 2\n# C=3\nbad line\n")).toEqual(["A", "B"]);
  });

  it("test builds blank the production env; production uses it", () => {
    expect(buildEnv("prod", ["NEXT_PUBLIC_X"])).toEqual({ NEXT_DIST_DIR: "out" });
    expect(buildEnv("test", ["NEXT_PUBLIC_X"])).toEqual({
      NEXT_DIST_DIR: "out-test",
      NEXT_PUBLIC_X: "",
      NEXT_PUBLIC_TEST_HOOKS: "1",
    });
    expect(buildEnv("emu", [])).toEqual({
      NEXT_DIST_DIR: "out-emu",
      NEXT_PUBLIC_TEST_HOOKS: "1",
      NEXT_PUBLIC_USE_EMULATORS: "1",
    });
    expect(OUT_DIRS).toEqual({ prod: "out", test: "out-test", emu: "out-emu" });
  });

  it("the committed .env.production holds the public production config", () => {
    const keys = dotenvKeys(readFileSync(join(process.cwd(), ".env.production"), "utf8"));
    for (const k of [
      "NEXT_PUBLIC_FIREBASE_API_KEY",
      "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
      "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
      "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
      "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
      "NEXT_PUBLIC_FIREBASE_APP_ID",
      "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID",
      "NEXT_PUBLIC_PAYWALL_ENABLED",
    ]) {
      expect(keys).toContain(k);
    }
    expect(
      keys.every((k) => k.startsWith("NEXT_PUBLIC_")),
      "public values only",
    ).toBe(true);
  });
});

describe("serve-hosting (Hosting emulator for e2e / Lighthouse)", () => {
  it("parses its flags and the old next-start ones", () => {
    expect(parseServeArgs([])).toEqual({
      dir: "out",
      port: 3000,
      host: "127.0.0.1",
      emulators: false,
    });
    expect(parseServeArgs(["--dir", "out-emu", "--port", "3290", "--emulators"])).toMatchObject({
      dir: "out-emu",
      port: 3290,
      emulators: true,
    });
    expect(parseServeArgs(["-p", "3190", "-H", "0.0.0.0"])).toMatchObject({
      port: 3190,
      host: "0.0.0.0",
    });
    expect(() => parseServeArgs(["--port", "x"])).toThrow(/invalid port/);
  });

  it("serves the chosen dir under the production rules", () => {
    const cwd = process.cwd();
    const c = serveConfig(
      { dir: "out-test", port: 3291, host: "127.0.0.1", emulators: false },
      join(cwd, ".firebase"),
    );
    expect(c.hosting).toEqual(hostingConfig({ public: "../out-test" }));
    expect(c.emulators.hosting).toEqual({ port: 3291, host: "127.0.0.1" });
  });
});
