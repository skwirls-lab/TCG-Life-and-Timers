import { expect, type Locator, type Page } from "@playwright/test";

/** Seat menu test harness (src/app/dev/seat-menu). */
export const HARNESS =
  "/dev/seat-menu?quick=mtg.commander&players=4&seed=7&names=Conner,Josh,JP,Bethany";

export async function gotoHarness(page: Page, extra = "") {
  await page.goto(HARNESS + extra);
  await expect(page.getByTestId("seat-harness")).toBeVisible();
}

/** Open seat i's menu (optionally on a tab). */
export async function openSeatMenu(page: Page, i: number, tab?: string) {
  await page.getByTestId(`harness-open-${i}`).click();
  await expect(page.getByTestId("seat-menu")).toBeVisible();
  if (tab) {
    await page.getByTestId(`seat-menu-tab-${tab}`).click();
    await expect(page.getByTestId(`seat-menu-panel-${tab}`)).toBeVisible();
  }
}

/** Press and hold (longer than the 500 ms default hold delay), then release. */
export async function hold(target: Locator) {
  await target.click({ delay: 800 });
}

/** Type digits on a set-mode keypad and submit. */
export async function keypadSet(page: Page, testId: string, digits: string) {
  const pad = page.getByTestId(testId);
  for (const d of digits) await pad.getByRole("button", { name: d, exact: true }).click();
  await page.getByTestId(`${testId}-submit`).click();
}
