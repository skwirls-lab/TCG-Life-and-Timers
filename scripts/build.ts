/**
 * Static-export builds (DEPLOY.md Part 3). `next build` with `output: "export"` (next.config.ts):
 *
 *   tsx scripts/build.ts            production → out/       (public config from .env.production)
 *   tsx scripts/build.ts test       e2e        → out-test/  (no cloud, NEXT_PUBLIC_TEST_HOOKS=1)
 *   tsx scripts/build.ts emu        e2e @emu   → out-emu/   (local emulators, test hooks)
 *
 * Next always loads `.env.production` for `next build`, and only fills variables that are not
 * already set, so the test builds set every key it holds to "" (an empty value reads as unset
 * everywhere: readFirebaseConfig, defaultPolicy, analytics). They never see the real project.
 *
 * The production export drops the dev-only `/dev/*` harness pages (they render the not-found page
 * outside test builds) so Hosting answers them with a real 404; it also refuses to build when
 * firebase.json's hosting headers have drifted from src/lib/security/headers.ts.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { hostingDrift, readFirebaseJson } from "./gen-hosting-config";

export type Profile = "prod" | "test" | "emu";

export const OUT_DIRS: Record<Profile, string> = { prod: "out", test: "out-test", emu: "out-emu" };

/** Keys assigned in a dotenv file (comments and blank lines skipped). */
export function dotenvKeys(text: string): string[] {
  const keys: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (m) keys.push(m[1]!);
  }
  return keys;
}

/** Environment overrides for a profile's `next build`. */
export function buildEnv(profile: Profile, prodKeys: string[]): Record<string, string> {
  const env: Record<string, string> = { NEXT_DIST_DIR: OUT_DIRS[profile] };
  if (profile === "prod") return env;
  for (const k of prodKeys) env[k] = "";
  env.NEXT_PUBLIC_TEST_HOOKS = "1";
  if (profile === "emu") env.NEXT_PUBLIC_USE_EMULATORS = "1";
  return env;
}

function main(argv: string[]): number {
  const profile = (argv[0] ?? "prod") as Profile;
  if (!(profile in OUT_DIRS)) {
    console.error(`unknown build profile "${profile}" (prod | test | emu)`);
    return 1;
  }
  if (profile === "prod") {
    const drift = hostingDrift(readFirebaseJson().hosting);
    if (drift.length) {
      console.error(
        "firebase.json is out of date; run `npm run gen:hosting`:\n  " + drift.join("\n  "),
      );
      return 1;
    }
  }
  const envFile = ".env.production";
  const keys = existsSync(envFile) ? dotenvKeys(readFileSync(envFile, "utf8")) : [];
  const out = OUT_DIRS[profile];
  rmSync(out, { recursive: true, force: true });
  const r = spawnSync(resolve("node_modules/.bin/next"), ["build"], {
    stdio: "inherit",
    env: { ...process.env, ...buildEnv(profile, keys) },
  });
  if (r.status !== 0) return r.status ?? 1;
  if (profile === "prod") {
    for (const p of ["dev", "dev.html", "dev.txt"])
      rmSync(join(out, p), { recursive: true, force: true });
  }
  console.log(`static export ready in ${out}/`);
  return 0;
}

if (process.argv[1] && /scripts[\\/]build\.ts$/.test(process.argv[1])) {
  process.exit(main(process.argv.slice(2)));
}
