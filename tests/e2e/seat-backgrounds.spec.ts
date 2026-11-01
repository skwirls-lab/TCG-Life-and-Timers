// @req SET-002 @req SET-003
import { expect, test } from "@playwright/test";
import { gotoHarness, openSeatMenu } from "./support/seatHarness";

test.describe("seat backgrounds", () => {
  // @req SET-002
  test("select a gradient, a solid color, a hue and the default", async ({ page }) => {
    await gotoHarness(page);
    await openSeatMenu(page, 0);
    const seat = page.getByTestId("harness-seat-0");
    await expect(page.getByTestId("art-picker")).toBeVisible(); // the ART lane replaced the slot

    const ocean = page.getByTestId("bg-gradient-ocean");
    await ocean.click();
    await expect(ocean).toHaveAttribute("aria-pressed", "true");
    await expect(seat).toHaveAttribute("data-art-kind", "gradient");
    await expect(seat).toHaveAttribute("data-art-value", /#0ea5e9/);
    await expect(seat).toHaveAttribute("data-color", "#60a5fa");
    const bg = await seat.evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(bg).toContain("linear-gradient");

    await page.getByTestId("bg-mode-solid").click();
    await page.getByTestId("bg-solid-2").click();
    await expect(seat).toHaveAttribute("data-art-kind", "solid");
    await expect(seat).toHaveAttribute("data-art-value", "#facc15");
    await expect(seat).toHaveAttribute("data-color", "#facc15");

    await page.getByTestId("bg-hue").fill("120");
    await expect(seat).not.toHaveAttribute("data-art-value", "#facc15");
    await expect(seat).toHaveAttribute("data-art-kind", "solid");

    await page.getByTestId("bg-default").click();
    await expect(seat).toHaveAttribute("data-art-kind", "none");
  });

  // @req SET-003
  test("toggle increased contrast per seat", async ({ page }) => {
    await gotoHarness(page);
    await openSeatMenu(page, 1);
    const toggle = page.getByTestId("seat-contrast-toggle");
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("harness-seat-1")).toHaveAttribute("data-contrast", "true");
    await expect(page.getByTestId("harness-seat-0")).toHaveAttribute("data-contrast", "false");
    await toggle.click();
    await expect(page.getByTestId("harness-seat-1")).toHaveAttribute("data-contrast", "false");
  });
});
