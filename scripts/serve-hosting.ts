/**
 * Serves a static export with the Firebase Hosting emulator, with the same headers, rewrites and
 * clean URLs as production (scripts/gen-hosting-config.ts). Used by Playwright (`start:test`,
 * `start:emu`), Lighthouse CI (`start`) and by hand.
 *
 *   tsx scripts/serve-hosting.ts [--dir out] [--port 3000] [--host 127.0.0.1] [--emulators]
 *
 * `--emulators` serves the emulator build's CSP (local emulator origins allowed). Each run writes
 * its own config to `.firebase/serve-<port>.json` (gitignored) and uses its own demo project id
 * (`demo-hosting-<port>`), so it can run next to `firebase emulators:exec` (test:e2e:emu) or another
 * instance without sharing the emulator hub's per-project locator file.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { hostingConfig } from "./gen-hosting-config";

export interface ServeOptions {
  dir: string;
  port: number;
  host: string;
  emulators: boolean;
}

export function parseServeArgs(argv: string[]): ServeOptions {
  const val = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  // `npm run start -- -p 3190 -H 127.0.0.1` (the old `next start` flags) keeps working.
  const port = Number(val("--port") ?? val("-p") ?? process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port <= 0) throw new Error(`invalid port: ${String(port)}`);
  return {
    dir: val("--dir") ?? "out",
    port,
    host: val("--host") ?? val("-H") ?? "127.0.0.1",
    emulators: argv.includes("--emulators"),
  };
}

/** The firebase.json-shaped config the Hosting emulator runs with (paths relative to `.firebase/`). */
export function serveConfig(o: ServeOptions, configDir: string) {
  return {
    hosting: hostingConfig({
      public: relative(configDir, resolve(o.dir)),
      emulators: o.emulators,
    }),
    emulators: {
      hosting: { port: o.port, host: o.host },
      ui: { enabled: false },
      singleProjectMode: true,
    },
  };
}

function main(argv: string[]): void {
  const o = parseServeArgs(argv);
  if (!existsSync(join(o.dir, "index.html"))) {
    console.error(`${o.dir}/index.html not found: build the export first (npm run build:*)`);
    process.exit(1);
  }
  const configDir = resolve(".firebase");
  mkdirSync(configDir, { recursive: true });
  const configPath = join(configDir, `serve-${o.port}.json`);
  writeFileSync(configPath, JSON.stringify(serveConfig(o, configDir), null, 2));
  const bin = resolve("node_modules/.bin/firebase");
  const child = spawn(
    bin,
    [
      "emulators:start",
      "--only",
      "hosting",
      "--project",
      `demo-hosting-${o.port}`,
      "--config",
      configPath,
    ],
    { stdio: "inherit" },
  );
  const stop = (sig: NodeJS.Signals) => {
    if (!child.killed) child.kill(sig);
  };
  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));
  child.on("exit", (code, signal) => process.exit(code ?? (signal ? 0 : 1)));
}

if (process.argv[1] && /serve-hosting\.ts$/.test(process.argv[1])) {
  main(process.argv.slice(2));
}
