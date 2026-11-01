// @req A11Y-002 @req LAY-007 @req INP-009
import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./support/axe";

test("design system page renders and is accessible", async ({ page }) => {
  await page.goto("/dev/ui");
  await expect(page.getByTestId("dev-ui")).toBeVisible();
  await expectNoSeriousA11yViolations(page);
});

test("rotated sheet opens, faces its seat, and closes with back", async ({ page }) => {
  await page.goto("/dev/ui");
  await page.getByTestId("rot-90").getByRole("button").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const transform = await dialog.evaluate((el) => getComputedStyle(el).transform);
  expect(transform).not.toBe("none");
  await page.goBack();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/dev\/ui$/);
});
