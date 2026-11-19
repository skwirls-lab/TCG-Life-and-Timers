import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...tseslint.configs.strict,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-expect-error": "allow-with-description", "ts-ignore": true },
      ],
      "no-console": ["error", { allow: ["warn", "error"] }],
      // noUncheckedIndexedAccess makes `!` the honest tool after explicit checks.
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  {
    // ARCH-002: the engine is pure TypeScript — no React, Next, browser storage or Firebase.
    files: ["src/engine/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "react",
                "react-*",
                "next",
                "next/*",
                "dexie",
                "firebase",
                "firebase/*",
                "zustand",
                "@/features/*",
                "@/state/*",
                "@/lib/*",
                "@/components/*",
              ],
              message: "src/engine must stay pure (ARCH-002).",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        { name: "window", message: "engine must not touch window (ARCH-002)" },
        { name: "document", message: "engine must not touch document (ARCH-002)" },
        { name: "localStorage", message: "engine must not touch storage (ARCH-002)" },
        { name: "navigator", message: "engine must not touch navigator (ARCH-002)" },
      ],
      "no-restricted-properties": [
        "error",
        {
          object: "Date",
          property: "now",
          message: "engine receives `now` via actions (ARCH-005)",
        },
        { object: "Math", property: "random", message: "engine uses injected Rng" },
      ],
    },
  },
  {
    files: ["scripts/**/*.ts", "tests/**/*.ts", "**/*.test.ts", "**/*.test.tsx", "*.config.ts"],
    rules: { "no-console": "off" },
  },
  globalIgnores([
    ".next/**",
    ".next-test/**",
    ".next-emu/**",
    "out/**",
    "out-test/**",
    "out-emu/**",
    ".firebase/**",
    "build/**",
    "next-env.d.ts",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "artifacts/**",
    "functions/lib/**",
    "functions/node_modules/**",
    "public/**",
    ".lighthouseci/**",
    ".claude/**",
  ]),
]);

export default eslintConfig;
