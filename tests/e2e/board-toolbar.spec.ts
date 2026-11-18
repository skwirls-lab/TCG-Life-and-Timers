// @req LAY-001 @req LAY-003 @req LAY-010 @req LAY-011 @req GAME-010 @req SET-031 @req HIST-001 @req SET-010
import { expect, test, type Page } from "@playwright/test";

const BASE =
  "/play?quick=mtg.commander&players=4&seed=7&names=Conner,Josh,JP,Bethany&s.hideSystemBars=0&s.menuStyle=strip";

async function holdOn(page: Page, testId: string, until: () => Promise<void>) {
  const box = (await page.getByTestId(testId).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  try {
    await until();
  } finally {
    await page.mouse.up();
  }
}

test("navigation buttons open their pages", async ({ page }) => {
  for (const [id, path] of [
    ["toolbar-history", "/history"],
    ["toolbar-settings", "/settings"],
    ["toolbar-tools", "/tools"],
  ] as const) {
    await page.goto(BASE);
    await expect(page.getByTestId("seat-0-name")).toBeVisible();
    await page.getByTestId(id).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
  }
});

test("holding Tools opens the quick menu instead of navigating; Clock is a disabled placeholder", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto(BASE);
  await expect(page.getByTestId("seat-0-name")).toBeVisible();
  await expect(page.getByTestId("toolbar-clock")).toBeDisabled();
  await holdOn(page, "toolbar-tools", () => page.clock.runFor(700));
  await page.clock.runFor(500);
  await expect(page).toHaveURL(/\/play/);
  await expect(page.getByTestId("seat-0")).toBeVisible();
});

test("reset requires a hold (default) and keeps names", async ({ page }) => {
  await page.goto(BASE);
  await expect(page.getByTestId("seat-0-name")).toBeVisible();
  await page.getByTestId("seat-0-minus").click();
  await expect(page.getByTestId("seat-0-value")).toHaveText("39");
  // A plain tap does not reset.
  await page.getByTestId("toolbar-reset").click();
  await expect(page.getByTestId("snackbar")).toContainText("Hold");
  await expect(page.getByTestId("seat-0-value")).toHaveText("39");
  await holdOn(page, "toolbar-reset", () =>
    expect(page.getByTestId("seat-0-value")).toHaveText("40", { timeout: 3000 }),
  );
  await expect(page.getByTestId("seat-0-name")).toHaveText("Conner");
  // GAME-015 undo snackbar after the destructive action.
  await page.getByTestId("snackbar-action").click();
  await expect(page.getByTestId("seat-0-value")).toHaveText("39");
});

test("reset with the dialog confirm style", async ({ page }) => {
  await page.goto(`${BASE}&s.confirmStyle=dialog`);
  await expect(page.getByTestId("seat-0-name")).toBeVisible();
  await page.getByTestId("seat-1-plus").click();
  await expect(page.getByTestId("seat-1-value")).toHaveText("41");
  await page.getByTestId("toolbar-reset").click();
  await expect(page.getByTestId("reset-dialog")).toBeVisible();
  await expect(page.getByTestId("seat-1-value")).toHaveText("41");
  await page.getByTestId("reset-confirm").click();
  await expect(page.getByTestId("seat-1-value")).toHaveText("40");
});

test("player count change needs a confirm and keeps seat names by index", async ({ page }) => {
  await page.goto(BASE);
  await expect(page.getByTestId("seat-0-name")).toBeVisible();
  await page.getByTestId("toolbar-players").click();
  await expect(page.getByTestId("players-popover")).toBeVisible();
  await page.getByTestId("players-count-3").click();
  await expect(page.getByTestId("players-confirm")).toBeVisible();
  // Nothing changes until confirmed.
  await expect(page.getByTestId("seat-3")).toHaveCount(1);
  await page.getByTestId("players-confirm").click();
  await expect(page.getByTestId("seat-3")).toHaveCount(1);
  await holdOn(page, "players-confirm", () =>
    expect(page.getByTestId("seat-3")).toHaveCount(0, { timeout: 3000 }),
  );
  await expect(page.getByTestId("players-popover")).toBeHidden();
  await expect(page.getByTestId("seat-2-name")).toHaveText("JP");
  expect(await page.evaluate(() => window.__tcg!.getState().session!.game.seats.length)).toBe(3);
});

test("player count change with the dialog style", async ({ page }) => {
  await page.goto(`${BASE}&s.confirmStyle=dialog`);
  await expect(page.getByTestId("seat-0-name")).toBeVisible();
  await page.getByTestId("toolbar-players").click();
  await page.getByTestId("players-count-5").click();
  await page.getByTestId("players-confirm").click();
  await expect(page.getByTestId("seat-4")).toBeVisible();
  await expect(page.getByTestId("seat-0-name")).toHaveText("Conner");
});

test("layout variant switches without a reset", async ({ page }) => {
  await page.goto(BASE);
  await expect(page.getByTestId("seat-0-name")).toBeVisible();
  await page.getByTestId("seat-0-minus").click();
  await page.getByTestId("toolbar-players").click();
  await page.getByTestId("players-layout-topBottom").click();
  await expect(page.getByTestId("players-layout-topBottom")).toHaveAttribute(
    "aria-checked",
    "true",
  );
  expect(await page.evaluate(() => window.__tcg!.getState().session!.game.layoutId)).toBe(
    "topBottom",
  );
  await page.getByTestId("players-popover-close").click();
  await expect(page.getByTestId("seat-0-value")).toHaveText("39");
});

test("auto-hide collapses the toolbar to a handle after 5 s (SET-031)", async ({ page }) => {
  await page.clock.install();
  await page.goto(`${BASE}&s.autoHideMenu=1`);
  await expect(page.getByTestId("seat-0-name")).toBeVisible();
  await expect(page.getByTestId("toolbar-reset")).toBeVisible();
  await page.clock.runFor(5200);
  await expect(page.getByTestId("toolbar-handle")).toBeVisible();
  await expect(page.getByTestId("toolbar-reset")).toHaveCount(0);
  await page.getByTestId("toolbar-handle").click();
  await expect(page.getByTestId("toolbar-reset")).toBeVisible();
});

test("/play without a game redirects to setup", async ({ page }) => {
  await page.goto("/play");
  await expect(page).toHaveURL(/\/setup$/);
});
