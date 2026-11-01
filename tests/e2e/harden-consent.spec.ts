// T8.3 consent-gated analytics and error reporting (route interception).
// @req LEG-004 @req REL-005
import { expect, test, type Page } from "@playwright/test";

const TELEMETRY_HOSTS =
  /(googletagmanager\.com|google-analytics\.com|analytics\.google\.com|firebaseinstallations\.googleapis\.com|firebase\.googleapis\.com|ingest\.sentry\.io)$/;

/** Intercepts every analytics / Sentry request (nothing leaves the sandbox) and counts them. */
async function interceptTelemetry(page: Page): Promise<string[]> {
  const hits: string[] = [];
  await page.context().route(
    (url) => TELEMETRY_HOSTS.test(url.hostname),
    async (route) => {
      hits.push(route.request().url());
      const isScript = route.request().resourceType() === "script";
      await route.fulfill({
        status: 200,
        contentType: isScript ? "application/javascript" : "application/json",
        body: isScript ? "" : "{}",
      });
    },
  );
  return hits;
}

const QUICK = "/play?quick=mtg.commander&players=4&seed=7";

test("not configured: no banner and no telemetry requests at all", async ({ page }) => {
  const hits = await interceptTelemetry(page);
  await page.goto("/");
  await expect(page.getByTestId("launcher")).toBeVisible();
  await page.goto(QUICK);
  await page.getByTestId("seat-0-plus").click();
  await page.goto("/privacy");
  await expect(page.getByTestId("consent-status")).toHaveAttribute("data-state", "unconfigured");
  await expect(page.getByTestId("consent-banner")).toHaveCount(0);
  expect(hits).toEqual([]);
});

test("configured: nothing is requested before consent, then telemetry starts", async ({ page }) => {
  const hits = await interceptTelemetry(page);
  await page.goto("/?telemetry=1");
  const banner = page.getByTestId("consent-banner");
  await expect(banner).toBeVisible();
  // Play a game and browse before answering: still nothing sent, and no banner over the board.
  await page.goto(QUICK);
  await expect(page.getByTestId("board")).toBeVisible();
  await expect(banner).toHaveCount(0);
  await page.getByTestId("seat-0-plus").click();
  await page.goto("/settings");
  await expect(banner).toBeVisible();
  expect(hits).toEqual([]);

  await page.getByTestId("consent-allow").click();
  await expect(banner).toHaveCount(0);
  await expect.poll(() => hits.length, { timeout: 15_000 }).toBeGreaterThan(0);
  // The choice persists: the banner stays away after a reload.
  await page.reload();
  await expect(page.getByTestId("settings")).toBeVisible();
  await expect(banner).toHaveCount(0);
});

test("declining keeps everything off; consent can be changed later on /privacy", async ({
  page,
}) => {
  const hits = await interceptTelemetry(page);
  await page.goto("/?telemetry=1");
  await page.getByTestId("consent-deny").click();
  await expect(page.getByTestId("consent-banner")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("launcher")).toBeVisible();
  await expect(page.getByTestId("consent-banner")).toHaveCount(0);
  await page.goto("/privacy");
  await expect(page.getByTestId("consent-status")).toHaveAttribute("data-state", "denied");
  expect(hits).toEqual([]);

  await page.getByTestId("consent-grant").click();
  await expect(page.getByTestId("consent-status")).toHaveAttribute("data-state", "granted");
  await expect.poll(() => hits.length, { timeout: 15_000 }).toBeGreaterThan(0);
  await page.getByTestId("consent-withdraw").click();
  await expect(page.getByTestId("consent-status")).toHaveAttribute("data-state", "denied");
});

test("the banner links to the privacy policy", async ({ page }) => {
  await page.goto("/?telemetry=1");
  await page.getByTestId("consent-learn-more").click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByTestId("consent-status")).toHaveAttribute("data-state", "unset");
});
