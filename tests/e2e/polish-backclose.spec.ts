// Stacked overlays and the Back button (D-043): closing the top sheet never closes the one below.
// @req SEAT-005 @req PAY-004
import { expect, test, type Page } from "@playwright/test";

async function addProfile(page: Page, name: string) {
  await page.getByTestId("profile-new").click();
  await page.getByTestId("profile-name-input").fill(name);
  await page.getByTestId("profile-save").click();
  await expect(page.getByTestId("deck-new")).toBeVisible();
  await page.getByTestId("page-back").click();
  await expect(page.getByTestId("profile-row-0")).toBeVisible();
}

test.describe("overlay stack", () => {
  // @req SEAT-005 @req PAY-004
  test("paywall over the seat menu: close / Back closes only the paywall", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/profiles?pw=1");
    await page.waitForFunction(() => window.__tcgPay?.state().policy === "TIERED");
    for (const n of ["Ann", "Ben", "Cat", "Dan"]) await addProfile(page, n);

    await page.goto("/play?quick=mtg.commander&players=4&seed=7&names=Conner,Josh,JP,Bethany");
    await expect(page.getByTestId("board")).toBeVisible();
    await page.getByTestId("seat-0-name").click();
    const menu = page.getByTestId("seat-menu");
    await expect(menu).toBeVisible();

    // A 5th profile → paywall on top of the seat menu; the close button closes only the paywall.
    await page.getByTestId("seat-save-profile").click();
    await expect(page.getByTestId("paywall")).toBeVisible();
    await page.getByTestId("paywall-close").click();
    await expect(page.getByTestId("paywall")).toHaveCount(0);
    await page.waitForTimeout(200);
    await expect(menu).toBeVisible();

    // Back with the paywall open also closes only the paywall.
    await page.getByTestId("seat-save-profile").click();
    await expect(page.getByTestId("paywall")).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId("paywall")).toHaveCount(0);
    await page.waitForTimeout(200);
    await expect(menu).toBeVisible();

    // The next Back closes the seat menu and stays on the board.
    await page.goBack();
    await expect(menu).toHaveCount(0);
    await expect(page.getByTestId("board")).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/play");
  });
});
