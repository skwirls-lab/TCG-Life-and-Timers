import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup/vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts", "tests/unit/**/*.test.{ts,tsx}"],
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary", "html"],
      // Unit coverage targets logic modules; React UI is covered by Playwright e2e (DECISIONS D-004).
      include: [
        "src/engine/**/*.ts",
        "src/lib/**/*.ts",
        "src/state/**/*.ts",
        "src/presets/**/*.ts",
      ],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/app/**",
        "src/**/*.d.ts",
        "src/**/index.ts",
        "src/sw.ts",
        "src/i18n/**",
        "src/lib/firebase/client.ts", // exercised by emulator e2e (G-E2E-EMU)
      ],
      thresholds: {
        lines: 80,
        branches: 75,
        "src/engine/**": { lines: 90, branches: 90 },
        "src/lib/**": { lines: 80, branches: 80 },
      },
    },
  },
});
