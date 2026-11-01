/**
 * G-BUILD bundle budget (T8.1 · PERF-003). Run after `npm run build`.
 *
 * For each checked route, the JS a browser loads up-front is every `/_next/static/chunks/*.js`
 * referenced by the prerendered HTML: `<script src>` tags plus the client-component chunks named
 * in the inline RSC flight data. `noModule` polyfill scripts are skipped (modern browsers ignore
 * them). Chunks fetched later through dynamic `import()` are not referenced by the HTML and are
 * therefore not counted, which is exactly the lazy-loading contract.
 *
 * Fails when `/play` exceeds 200 KB gzip, or when any `/play` chunk contains a Firebase SDK
 * marker (the SDK must only arrive through dynamic imports, D-051).
 *
 * Usage: tsx scripts/check-bundle.ts [--dist .next] [--json]
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

/**
 * PERF-003 as revised in D-067: the PRD's "≤ 200 KB gzip" applies to the board's APP code on top
 * of the shared React/Next root runtime (~131 KB in Next 16, identical on every route), plus a
 * hard cap on the total so the runtime can't grow unnoticed.
 */
export const PLAY_BUDGET_BYTES = 200 * 1024;
export const PLAY_TOTAL_CAP_BYTES = 300 * 1024;
export const FIREBASE_MARKERS = ["@firebase/", "FirebaseError", "identitytoolkit"] as const;

/** Chunk paths (relative to the dist dir's `static/chunks`) referenced by a prerendered page. */
export function chunksFromHtml(html: string): string[] {
  const noModule = new Set<string>();
  for (const m of html.matchAll(/<script\b[^>]*>/g)) {
    const tag = m[0];
    if (!/\bnomodule\b/i.test(tag)) continue;
    const src = /src="\/_next\/static\/chunks\/([^"]+\.js)"/.exec(tag);
    if (src?.[1]) noModule.add(src[1]);
  }
  const out = new Set<string>();
  for (const m of html.matchAll(/\/_next\/static\/chunks\/([A-Za-z0-9_\-./]+?\.js)/g)) {
    const p = m[1]!;
    if (!noModule.has(p)) out.add(p);
  }
  // Flight data references chunks without the leading slash ("static/chunks/x.js").
  for (const m of html.matchAll(/(?<!_next\/)static\/chunks\/([A-Za-z0-9_\-./]+?\.js)/g)) {
    const p = m[1]!;
    if (!noModule.has(p)) out.add(p);
  }
  return [...out].sort();
}

export function firebaseMarkersIn(source: string): string[] {
  return FIREBASE_MARKERS.filter((m) => source.includes(m));
}

export interface ChunkInfo {
  file: string;
  raw: number;
  gzip: number;
  firebase: string[];
  /** One of the build manifest's rootMainFiles (React/Next runtime shared by every route). */
  framework?: boolean;
}

export interface RouteReport {
  route: string;
  html: string;
  chunks: ChunkInfo[];
  gzipTotal: number;
}

/** The React/Next runtime chunks every route loads (build-manifest `rootMainFiles`). */
export function frameworkChunks(dist: string): Set<string> {
  const p = join(dist, "build-manifest.json");
  if (!existsSync(p)) return new Set();
  const m = JSON.parse(readFileSync(p, "utf8")) as { rootMainFiles?: string[] };
  return new Set((m.rootMainFiles ?? []).map((f) => f.replace(/^static\/chunks\//, "")));
}

export function frameworkGzip(r: RouteReport): number {
  return r.chunks.filter((c) => c.framework).reduce((n, c) => n + c.gzip, 0);
}

export function measureRoute(dist: string, route: string, htmlFile: string): RouteReport {
  const htmlPath = join(dist, "server", "app", htmlFile);
  if (!existsSync(htmlPath)) {
    throw new Error(`${htmlPath} not found — run \`npm run build\` first`);
  }
  const html = readFileSync(htmlPath, "utf8");
  const framework = frameworkChunks(dist);
  const chunks = chunksFromHtml(html).map((file): ChunkInfo => {
    const path = join(dist, "static", "chunks", file);
    const buf = readFileSync(path);
    return {
      file,
      raw: buf.length,
      gzip: gzipSync(buf, { level: 9 }).length,
      firebase: firebaseMarkersIn(buf.toString("utf8")),
      ...(framework.has(file) ? { framework: true } : {}),
    };
  });
  return {
    route,
    html: htmlFile,
    chunks,
    gzipTotal: chunks.reduce((n, c) => n + c.gzip, 0),
  };
}

export function evaluate(play: RouteReport): string[] {
  const errors: string[] = [];
  const app = play.gzipTotal - frameworkGzip(play);
  if (app > PLAY_BUDGET_BYTES) {
    errors.push(
      `/play app JS is ${kb(app)} gzip, over the ${kb(PLAY_BUDGET_BYTES)} budget (PERF-003, D-067)`,
    );
  }
  if (play.gzipTotal > PLAY_TOTAL_CAP_BYTES) {
    errors.push(
      `/play loads ${kb(play.gzipTotal)} gzip in total, over the ${kb(PLAY_TOTAL_CAP_BYTES)} cap (PERF-003, D-067)`,
    );
  }
  for (const c of play.chunks) {
    if (c.firebase.length) {
      errors.push(`/play chunk ${c.file} contains Firebase SDK markers: ${c.firebase.join(", ")}`);
    }
  }
  return errors;
}

export function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function print(r: RouteReport): void {
  const fw = frameworkGzip(r);
  console.log(
    `\n${r.route}  (${r.chunks.length} chunks, ${kb(r.gzipTotal)} gzip = ` +
      `${kb(fw)} root runtime (React, Next, instrumentation-client) + ${kb(r.gzipTotal - fw)} app)`,
  );
  for (const c of [...r.chunks].sort((a, b) => b.gzip - a.gzip)) {
    const flag =
      (c.framework ? "  [root]" : "") +
      (c.firebase.length ? `  FIREBASE: ${c.firebase.join(",")}` : "");
    console.log(`  ${kb(c.gzip).padStart(9)}  ${kb(c.raw).padStart(9)} raw  ${c.file}${flag}`);
  }
}

function main(argv: string[]): number {
  const distIdx = argv.indexOf("--dist");
  const dist = distIdx >= 0 ? argv[distIdx + 1]! : (process.env.NEXT_DIST_DIR ?? ".next");
  const launcher = measureRoute(dist, "/", "index.html");
  const play = measureRoute(dist, "/play", "play.html");
  if (argv.includes("--json")) {
    console.log(JSON.stringify({ launcher, play }, null, 2));
  } else {
    print(launcher);
    print(play);
  }
  const errors = evaluate(play);
  if (errors.length) {
    console.error(`\ncheck:bundle FAILED`);
    for (const e of errors) console.error("  " + e);
    return 1;
  }
  console.log(
    `\ncheck:bundle OK — / ${kb(launcher.gzipTotal)}, /play ${kb(play.gzipTotal)} gzip ` +
      `(app budget ${kb(PLAY_BUDGET_BYTES)}, total cap ${kb(PLAY_TOTAL_CAP_BYTES)}); ` +
      `no Firebase SDK in /play chunks`,
  );
  return 0;
}

if (process.argv[1] && /check-bundle\.ts$/.test(process.argv[1])) {
  process.exit(main(process.argv.slice(2)));
}
