// @req GAME-001 @req GAME-016 @req A11Y-002 @req CUS-001
import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./support/axe";

test("launcher is accessible and offers a new game", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("launcher")).toBeVisible();
  await expect(page.getByTestId("launcher-resume")).toHaveCount(0);
  await expectNoSeriousA11yViolations(page);
  await page.getByTestId("launcher-new").click();
  await expect(page).toHaveURL(/\/setup$/);
});

for (const [link, path] of [
  ["history", "/history"],
  ["tools", "/tools"],
  ["settings", "/settings"],
  ["profiles", "/profiles"],
  ["presets", "/builder"],
] as const) {
  test(`launcher links to ${path}`, async ({ page }) => {
    await page.goto("/");
    await page.getByTestId(`launcher-link-${link}`).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
  });
}

test("theme setting is applied to the document", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByTestId("setting-theme-control").selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

// Sign-in first: a deployment without cloud config never shows the welcome or a sign-in entry.
test("brand mark and name, no welcome without cloud config", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("launcher-brand")).toContainText("TCGTempo");
  await expect(page.getByTestId("launcher-brand").locator("svg")).toBeVisible();
  await expect(page).toHaveTitle("TCGTempo");
  // give a lazily loaded welcome every chance to appear
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("welcome")).toHaveCount(0);
  await expect(page.getByTestId("launcher-account")).toHaveCount(0);
  await expect(page.getByTestId("launcher-signin")).toHaveCount(0);
});
