// /account and /feedback without cloud configuration (normal build): everything local still works.
// @req AUTH-002 @req AUTH-006 @req A11Y-002
import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./support/axe";

test.describe("account without cloud config", () => {
  // @req AUTH-002
  test("account shows the not-configured state without errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.goto("/account");
    await expect(page.getByTestId("account-unconfigured")).toBeVisible();
    await expect(page.getByTestId("account-signin")).toHaveCount(0);
    await expectNoSeriousA11yViolations(page);

    // AUTH-006: export still works locally.
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("account-export").click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.json$/);

    await page.getByTestId("account-feedback-link").click();
    await expect(page.getByTestId("feedback-page")).toBeVisible();
    await expect(page.getByTestId("feedback-status")).toContainText("isn't available");
    await expect(page.getByTestId("feedback-send")).toBeDisabled();
    await expectNoSeriousA11yViolations(page);
    expect(errors).toEqual([]);
  });
});
