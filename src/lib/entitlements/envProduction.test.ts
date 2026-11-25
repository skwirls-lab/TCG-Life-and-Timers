// The committed production config (`.env.production`, read by `next build` through @next/env).
// @next/env expands `$NAME` inside values, so a display price written "$1.99" builds as ".99"
// ("$1" is read as an empty variable). A literal dollar sign must be escaped as "\$".
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parsePriceId } from "./pricing";

const text = readFileSync(join(process.cwd(), ".env.production"), "utf8");
const entries = text
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#") && l.includes("="))
  .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)] as const);
const value = (k: string) => entries.find(([key]) => key === k)?.[1];

describe(".env.production", () => {
  it("has no unescaped $ (it would be expanded as a variable at build time)", () => {
    for (const [key, v] of entries) expect(/(^|[^\\])\$/.test(v), key).toBe(false);
  });

  it("display prices start with a currency symbol", () => {
    for (const plan of ["MONTHLY", "YEARLY", "LIFETIME"]) {
      const v = value(`NEXT_PUBLIC_PRICE_DISPLAY_${plan}`)?.replace(/^\\\$/, "$");
      if (v) expect(v, plan).toMatch(/^[$€£¥]\s?\d/);
    }
  });

  it("every configured Stripe price id is well-formed", () => {
    for (const plan of ["MONTHLY", "YEARLY", "LIFETIME"]) {
      const v = value(`NEXT_PUBLIC_STRIPE_PRICE_${plan}`);
      if (v) expect(parsePriceId(v), plan).toBe(v);
    }
  });
});
