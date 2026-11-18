import { expect, type Page } from "@playwright/test";

/**
 * MENU: the board's actions live in the center menu (default menu style). The menu items keep the
 * toolbar's test ids (`toolbar-*`, `timer-start`, `toolbar-clock`), so a spec opens the menu
 * first, then clicks the item as before. Opening the menu pauses running clocks; closing it
 * resumes them (START / Pause / Resume items close it themselves). With `s.menuStyle=strip` the
 * helpers click the strip's buttons directly.
 */

/** True when the board uses the center menu (waits until the button or the strip is shown). */
export async function usesCenterMenu(page: Page): Promise<boolean> {
  await page
    .locator('[data-testid="board"] :is([data-testid="center-menu"], [data-testid="toolbar"])')
    .first()
    .waitFor();
  return (await page.getByTestId("center-menu").count()) > 0;
}

export async function openMenu(page: Page): Promise<void> {
  const panel = page.getByTestId("center-menu-panel");
  if (await panel.isVisible()) return;
  await page.getByTestId("center-menu").click();
  await expect(panel).toBeVisible();
}

/** Open the menu (center style) and click one of its items. */
export async function menuTap(page: Page, testId: string): Promise<void> {
  if (await usesCenterMenu(page)) await openMenu(page);
  await page.getByTestId(testId).click();
}

/** Close the menu with its Resume / Back to game button. */
export async function closeMenu(page: Page): Promise<void> {
  await page.getByTestId("center-menu-resume").click();
  await expect(page.getByTestId("center-menu-panel")).toHaveCount(0);
}
