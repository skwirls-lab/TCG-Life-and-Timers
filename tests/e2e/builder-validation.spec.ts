// @req CUS-005 @req CUS-002 @req CUS-010 @req A11Y-002
import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./support/axe";

test.beforeEach(async ({ page }) => {
  await page.goto("/builder/edit");
  await expect(page.getByTestId("editor-form")).toBeVisible();
});

test("two primary counters show an error and disable Save until fixed", async ({ page }) => {
  await expect(page.getByTestId("editor-save")).toBeEnabled();
  await page.getByTestId("editor-add-counter").click();
  await page.getByTestId("counter-primary").click();
  await expect(page.getByTestId("counter-primary")).toHaveAttribute("aria-checked", "true");
  await page.getByTestId("counter-done").click();

  await expect(page.getByTestId("editor-primary-error")).toContainText(
    "Exactly one counter can be primary",
  );
  await expect(page.getByTestId("editor-errors")).toBeVisible();
  await expect(page.getByTestId("editor-save")).toBeDisabled();
  await expect(page.getByTestId("editor-play")).toBeDisabled();

  // Fix it: the second counter is no longer primary.
  await page.getByTestId("editor-counter-1-edit").click();
  await page.getByTestId("counter-primary").click();
  await page.getByTestId("counter-done").click();
  await expect(page.getByTestId("editor-errors")).toHaveCount(0);
  await expect(page.getByTestId("editor-save")).toBeEnabled();
});

test("a starting value outside min/max is flagged inline and in the summary", async ({ page }) => {
  await page.getByTestId("editor-counter-0-edit").click();
  await page.getByTestId("counter-min").fill("0");
  await page.getByTestId("counter-max").fill("10");
  await page.getByTestId("counter-start").fill("15");
  const sheet = page.getByTestId("counter-sheet");
  await expect(sheet.getByTestId("field-error")).toContainText("outside minimum–maximum");
  await expect(page.getByTestId("counter-start")).toHaveAttribute("aria-invalid", "true");
  await page.getByTestId("counter-done").click();
  await expect(page.getByTestId("editor-counter-0")).toHaveClass(/ring-danger/);
  await expect(page.getByTestId("editor-errors")).toContainText("starting value is outside");
  await expect(page.getByTestId("editor-save")).toBeDisabled();
});

test("counters reorder with the up/down buttons (CUS-010)", async ({ page }) => {
  await page.getByTestId("editor-add-counter").click();
  await page.getByTestId("counter-name").fill("Ink");
  await page.getByTestId("counter-done").click();
  await expect(page.getByTestId("editor-counter-0-up")).toBeDisabled();
  await page.getByTestId("editor-counter-1-up").click();
  await expect(page.getByTestId("editor-counter-0")).toContainText("Ink");
  await expect(page.getByTestId("editor-counter-1")).toContainText("Life");
});

test("unsaved changes ask before leaving", async ({ page }) => {
  await page.getByTestId("editor-name").fill("Changed");
  await page.getByTestId("page-back").click();
  await expect(page.getByTestId("editor-discard-dialog")).toBeVisible();
  await page.getByTestId("editor-discard-cancel").click();
  await expect(page.getByTestId("editor-discard-dialog")).toBeHidden();
  await expect(page.getByTestId("editor-name")).toHaveValue("Changed");
  await page.getByTestId("page-back").click();
  await page.getByTestId("editor-discard-confirm").click();
  await expect(page).toHaveURL(/\/builder$/);
  await expect(page.getByTestId("builder-empty")).toBeVisible();
});

test("a11y: builder list, editor and counter sheet have no serious violations", async ({
  page,
}) => {
  await expectNoSeriousA11yViolations(page);
  await page.getByTestId("editor-counter-0-edit").click();
  await expect(page.getByTestId("counter-form")).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  await page.getByTestId("counter-done").click();
  await page.goto("/builder");
  await expect(page.getByTestId("builder-empty")).toBeVisible();
  await expectNoSeriousA11yViolations(page);
});
