import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${port}`;
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  workers: isCI ? 2 : 3,
  retries: 1,
  reporter: [["list"], ["json", { outputFile: "test-results/e2e-results.json" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    hasTouch: true,
  },
  projects: [
    { name: "pixel7", use: { ...devices["Pixel 7"], browserName: "chromium" } },
    {
      name: "iphone14-emu",
      use: { ...devices["iPhone 14"], browserName: "chromium", defaultBrowserType: "chromium" },
    },
    {
      name: "landscape",
      use: {
        browserName: "chromium",
        viewport: { width: 915, height: 412 },
        hasTouch: true,
        isMobile: true,
      },
    },
    ...(isCI ? [{ name: "webkit-iphone", use: { ...devices["iPhone 14"] } }] : []),
  ],
  // The static export (out-test/ or out-emu/) served by the Firebase Hosting emulator with
  // firebase.json's headers, rewrites and clean URLs (scripts/serve-hosting.ts).
  webServer: {
    command: `npm run ${process.env.E2E_SERVER === "emu" ? "start:emu" : "start:test"} -- --port ${port} --host 127.0.0.1`,
    url: baseURL,
    reuseExistingServer: !isCI,
    timeout: 120_000,
    env: { NEXT_PUBLIC_TEST_HOOKS: "1" },
  },
});
