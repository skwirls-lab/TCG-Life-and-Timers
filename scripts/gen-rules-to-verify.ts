/**
 * T3.3: writes docs/RULES-TO-VERIFY.md listing every rule value marked `verify: true` in the
 * built-in presets plus the non-counter checks in src/presets/verify.ts (Prettier-formatted, so
 * `npm run format:check` stays green).
 *   npx tsx scripts/gen-rules-to-verify.ts          write the file
 *   npx tsx scripts/gen-rules-to-verify.ts --check  exit 1 when the file is out of date
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { format } from "prettier";
import { BUILT_IN_PRESETS } from "../src/presets";
import { rulesToVerifyMarkdown } from "../src/presets/verify";

async function main() {
  const out = join(process.cwd(), "docs", "RULES-TO-VERIFY.md");
  const md = await format(rulesToVerifyMarkdown(BUILT_IN_PRESETS), { parser: "markdown" });
  if (process.argv.includes("--check")) {
    let current = "";
    try {
      current = readFileSync(out, "utf8");
    } catch {
      // a missing file is out of date
    }
    if (current !== md) {
      console.error(
        "docs/RULES-TO-VERIFY.md is out of date: run npx tsx scripts/gen-rules-to-verify.ts",
      );
      process.exit(1);
    }
    console.log("RULES-TO-VERIFY.md is up to date");
    return;
  }
  writeFileSync(out, md);
  console.log(`Wrote ${out}`);
}

void main();
