// @req PERF-003
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  chunksFromHtml,
  evaluate,
  firebaseMarkersIn,
  kb,
  measureRoute,
  PLAY_BUDGET_BYTES,
  type RouteReport,
} from "./check-bundle";

describe("check-bundle (PERF-003)", () => {
  it("collects script and flight-data chunks, skipping noModule polyfills", () => {
    const html = [
      '<script src="/_next/static/chunks/poly.js" noModule=""></script>',
      '<script src="/_next/static/chunks/a.js" async=""></script>',
      '<link rel="preload" as="script" href="/_next/static/chunks/b.js"/>',
      '<script>self.__next_f.push([1,"2:I[1,[\\"static/chunks/c.js\\"]]"])</script>',
      '<script src="/_next/static/chunks/a.js"></script>',
    ].join("");
    expect(chunksFromHtml(html)).toEqual(["a.js", "b.js", "c.js"]);
  });

  it("flags Firebase SDK markers", () => {
    expect(firebaseMarkersIn('x("@firebase/app")')).toEqual(["@firebase/"]);
    expect(firebaseMarkersIn("class FirebaseError extends Error{}; identitytoolkit")).toEqual([
      "FirebaseError",
      "identitytoolkit",
    ]);
    expect(firebaseMarkersIn("plain code")).toEqual([]);
  });

  it("fails over budget or with Firebase in a /play chunk", () => {
    const ok: RouteReport = {
      route: "/play",
      html: "play.html",
      gzipTotal: PLAY_BUDGET_BYTES,
      chunks: [{ file: "a.js", raw: 1, gzip: 1, firebase: [] }],
    };
    expect(evaluate(ok)).toEqual([]);
    expect(evaluate({ ...ok, gzipTotal: PLAY_BUDGET_BYTES + 1 })[0]).toMatch(/over the/);
    expect(
      evaluate({ ...ok, chunks: [{ file: "f.js", raw: 1, gzip: 1, firebase: ["@firebase/"] }] }),
    ).toEqual(["/play chunk f.js contains Firebase SDK markers: @firebase/"]);
    expect(kb(2048)).toBe("2.0 KB");
  });

  it("measures a route from a dist dir", () => {
    const dist = mkdtempSync(join(tmpdir(), "bundle-"));
    mkdirSync(join(dist, "server", "app"), { recursive: true });
    mkdirSync(join(dist, "static", "chunks"), { recursive: true });
    writeFileSync(join(dist, "static", "chunks", "a.js"), "console.log('a')".repeat(100));
    writeFileSync(
      join(dist, "server", "app", "play.html"),
      '<script src="/_next/static/chunks/a.js"></script>',
    );
    const r = measureRoute(dist, "/play", "play.html");
    expect(r.chunks).toHaveLength(1);
    expect(r.chunks[0]!.raw).toBe(1600);
    expect(r.gzipTotal).toBeGreaterThan(0);
    expect(r.gzipTotal).toBeLessThan(200);
    expect(() => measureRoute(dist, "/", "index.html")).toThrow(/npm run build/);
  });
});
