import { defineConfig } from "vitest/config";
import path from "node:path";

/** Sync engine against the Firestore + Auth emulators (`npm run test:sync`). */
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/sync/**/*.test.ts"],
    setupFiles: ["fake-indexeddb/auto"],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
