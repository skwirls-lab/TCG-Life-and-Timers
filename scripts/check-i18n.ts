/**
 * T0.6 / SET-034: flag hard-coded UI copy in feature components.
 * Looks for JSX text nodes and user-facing string attributes that contain letters.
 * Escape hatch: put `i18n-ignore` in a comment on the same line (with a reason).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["src/features", "src/app"];
const SKIP = [/\.test\.tsx?$/, /\/dev\//, /~offline/];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx") && !SKIP.some((r) => r.test(p))) out.push(p);
  }
  return out;
}

const textNode = />\s*([A-Za-z][A-Za-z ,.'!?&-]{1,})\s*</g;
const attr = /\b(aria-label|title|placeholder|alt)="([^"]*[A-Za-z][^"]*)"/g;

const problems: string[] = [];
for (const root of ROOTS) {
  let files: string[] = [];
  try {
    files = walk(root);
  } catch {
    continue;
  }
  for (const f of files) {
    const lines = readFileSync(f, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (line.includes("i18n-ignore")) return;
      if (line.trim().startsWith("//") || line.trim().startsWith("*")) return;
      for (const m of line.matchAll(textNode))
        problems.push(`${f}:${i + 1}: text "${m[1]?.trim()}"`);
      for (const m of line.matchAll(attr)) problems.push(`${f}:${i + 1}: ${m[1]}="${m[2]}"`);
    });
  }
}

if (problems.length) {
  console.error(`Hard-coded UI strings found (${problems.length}). Use t("...") from @/lib/i18n:`);
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}
console.log("i18n check: no hard-coded UI strings");
