import { defineConfig } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "./tests/screens",
  timeout: 120_000,
  workers: 1,
  reporter: "list",
  use: { baseURL: `http://127.0.0.1:${port}`, hasTouch: true, isMobile: true },
  webServer: {
    command: `npm run start:test -- -p ${port} -H 127.0.0.1`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
