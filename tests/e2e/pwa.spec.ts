// @req PWA-001 @req PWA-002 @req ARCH-001
import { expect, test } from "@playwright/test";

test.describe("PWA shell", () => {
  test("manifest is served and valid", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.ok()).toBe(true);
    const m = await res.json();
    expect(m.display).toBe("standalone");
    expect(m.icons.some((i: { purpose?: string }) => i.purpose === "maskable")).toBe(true);
    expect(m.start_url).toBe("/");
  });

  test("service worker registers and the app reloads offline", async ({ page, context }) => {
    await page.goto("/");
    await expect(page.getByTestId("launcher")).toBeVisible();
    await page.waitForFunction(
      async () => {
        const reg = await navigator.serviceWorker.getRegistration();
        return !!reg?.active;
      },
      undefined,
      { timeout: 20_000 },
    );
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, undefined, {
      timeout: 20_000,
    });
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByTestId("launcher")).toBeVisible();
    await context.setOffline(false);
  });
});
