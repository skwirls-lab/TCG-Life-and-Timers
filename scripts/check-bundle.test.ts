// @req PERF-003
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  chunksFromHtml,
  evaluate,
  firebaseMarkersIn,
  frameworkChunks,
  frameworkGzip,
  kb,
  measureRoute,
  PLAY_BUDGET_BYTES,
  PLAY_TOTAL_CAP_BYTES,
  sameBuild,
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
    // app JS (non-framework chunks) over the 200 KB app budget (D-067)
    expect(evaluate({ ...ok, gzipTotal: PLAY_BUDGET_BYTES + 1 })[0]).toMatch(/app JS .* over the/);
    // framework runtime is excluded from the app budget but counts toward the total cap
    const withRuntime: RouteReport = {
      ...ok,
      gzipTotal: 280 * 1024,
      chunks: [
        { file: "rt.js", raw: 1, gzip: 131 * 1024, firebase: [], framework: true },
        { file: "app.js", raw: 1, gzip: 149 * 1024, firebase: [] },
      ],
    };
    expect(evaluate(withRuntime)).toEqual([]);
    expect(evaluate({ ...withRuntime, gzipTotal: PLAY_TOTAL_CAP_BYTES + 1 }).join(" ")).toMatch(
      /total, over the/,
    );
    expect(
      evaluate({ ...ok, chunks: [{ file: "f.js", raw: 1, gzip: 1, firebase: ["@firebase/"] }] }),
    ).toEqual(["/play chunk f.js contains Firebase SDK markers: @firebase/"]);
    expect(kb(2048)).toBe("2.0 KB");
  });

  it("measures a route from a static export", () => {
    const dist = mkdtempSync(join(tmpdir(), "bundle-out-"));
    const build = mkdtempSync(join(tmpdir(), "bundle-build-"));
    mkdirSync(join(dist, "_next", "static", "chunks"), { recursive: true });
    writeFileSync(join(dist, "_next", "static", "chunks", "a.js"), "console.log('a')".repeat(100));
    writeFileSync(
      join(dist, "play.html"),
      '<script src="/_next/static/chunks/a.js"></script><script>self.__next_f.push([1,"b:BID1"])</script>',
    );
    const r = measureRoute(dist, "/play", "play.html", build);
    expect(r.chunks).toHaveLength(1);
    expect(r.chunks[0]!.raw).toBe(1600);
    expect(r.gzipTotal).toBeGreaterThan(0);
    expect(r.gzipTotal).toBeLessThan(200);
    expect(() => measureRoute(dist, "/", "index.html", build)).toThrow(/npm run build/);
    expect(frameworkGzip(r)).toBe(0);
    writeFileSync(
      join(build, "build-manifest.json"),
      JSON.stringify({ rootMainFiles: ["static/chunks/a.js"] }),
    );
    // a manifest from another build is refused
    expect(() => measureRoute(dist, "/play", "play.html", build)).toThrow(/another build/);
    writeFileSync(join(build, "BUILD_ID"), "OTHER");
    expect(sameBuild(build, "BID1")).toBe(false);
    expect(() => measureRoute(dist, "/play", "play.html", build)).toThrow(/another build/);
    writeFileSync(join(build, "BUILD_ID"), "BID1\n");
    expect([...frameworkChunks(build)]).toEqual(["a.js"]);
    const r2 = measureRoute(dist, "/play", "play.html", build);
    expect(r2.chunks[0]!.framework).toBe(true);
    expect(frameworkGzip(r2)).toBe(r2.gzipTotal);
  });
});
