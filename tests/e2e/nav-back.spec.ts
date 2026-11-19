// In-app Back retraces a loop-free breadcrumb trail and always ends at Home; the header's brand
// mark goes Home from anywhere (owner feedback: Back used to ping-pong between two pages).
import { expect, test, type Page } from "@playwright/test";
import { openMenu } from "./support/menu";

async function back(page: Page) {
  await page.getByTestId("page-back").click();
}

test("Back retraces Home → Settings → Account → Settings → Home", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("launcher-link-settings").click();
  await expect(page).toHaveURL(/\/settings$/);
  await page.getByTestId("setting-signIn").click();
  await expect(page).toHaveURL(/\/account$/);
  await back(page);
  await expect(page).toHaveURL(/\/settings$/);
  await back(page);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("launcher-brand")).toBeVisible();
});

test("a loop between two pages doesn't ping-pong: Back walks out to Home", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("launcher-link-settings").click();
  await page.getByTestId("setting-myPresets").click();
  await expect(page).toHaveURL(/\/builder$/);
  // the page you land on sends you back to Settings, and you go to the builder again
  await page.goto("/settings");
  await page.getByTestId("setting-myPresets").click();
  await expect(page).toHaveURL(/\/builder$/);
  await back(page);
  await expect(page).toHaveURL(/\/settings$/);
  await back(page);
  await expect(page).toHaveURL(/\/$/);
});

test("a deep link goes up the site structure: Terms → About → Settings → Home", async ({
  page,
}) => {
  await page.goto("/terms");
  await back(page);
  await expect(page).toHaveURL(/\/about$/);
  await back(page);
  await expect(page).toHaveURL(/\/settings$/);
  await back(page);
  await expect(page).toHaveURL(/\/$/);
});

test("the brand mark in the header goes Home from any page", async ({ page }) => {
  await page.goto("/tools/mana");
  await page.getByTestId("page-home").click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("launcher-brand")).toBeVisible();
});

test("Settings opened from the game menu: Back returns to the same game", async ({ page }) => {
  await page.goto("/play?quick=mtg.commander&players=4&seed=3&names=A,B,C,D");
  await expect(page.getByTestId("seat-0-name")).toHaveText("A");
  await openMenu(page);
  await page.getByTestId("toolbar-settings").click();
  await expect(page).toHaveURL(/\/settings/);
  await back(page);
  await expect(page).toHaveURL(/\/play/);
  await expect(page.getByTestId("seat-0-name")).toHaveText("A");
});
