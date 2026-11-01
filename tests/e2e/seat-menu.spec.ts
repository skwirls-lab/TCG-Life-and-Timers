// @req SEAT-001 @req SEAT-002 @req SEAT-004 @req SEAT-005 @req TOK-001 @req CMD-010 @req LIFE-003
// @req LAY-004 @req A11Y-002
import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./support/axe";
import { gotoHarness, hold, keypadSet, openSeatMenu } from "./support/seatHarness";

test.describe("seat menu", () => {
  test("rename the seat from the Player tab", async ({ page }) => {
    await gotoHarness(page);
    await openSeatMenu(page, 0);
    const input = page.getByTestId("seat-name-input");
    await expect(input).toHaveValue("Conner");
    await input.fill("Declan");
    await expect(page.getByTestId("harness-seat-0")).toHaveAttribute("data-name", "Declan");
    await expect(page.getByRole("dialog")).toHaveAttribute("aria-label", "Declan");
    // ≤ 40 characters
    await input.fill("x".repeat(60));
    await expect(input).toHaveValue("x".repeat(40));
  });

  // @req SEAT-001
  test("counter tap increments; hold options: −1, set exact, reset", async ({ page }) => {
    await gotoHarness(page);
    await openSeatMenu(page, 0, "counters");
    await expect(page.getByText("Tap to increment. Hold for additional options.")).toBeVisible();
    const poison = page.getByTestId("counter-mtg.poison");
    await poison.click();
    await poison.click();
    await expect(page.getByTestId("counter-mtg.poison-value")).toHaveText("2");
    await expect(poison).toHaveAttribute("data-active", "true");

    await hold(poison);
    const opts = page.getByTestId("counter-options");
    await expect(opts).toBeVisible();
    await expect(page.getByTestId("counter-options-value")).toHaveText("2");
    await page.getByTestId("counter-options-minus").click();
    await expect(page.getByTestId("counter-options-value")).toHaveText("1");
    await keypadSet(page, "counter-options-keypad", "7");
    await expect(opts).toBeHidden();
    await expect(page.getByTestId("counter-mtg.poison-value")).toHaveText("7");

    await hold(poison);
    await page.getByTestId("counter-options-reset").click();
    await expect(page.getByTestId("counter-options-value")).toHaveText("0");
    await page.getByTestId("counter-options-back").click();
    await expect(poison).toHaveAttribute("data-active", "false");
  });

  // @req CMD-010
  test("commander tax shows the tax amount and casts", async ({ page }) => {
    await gotoHarness(page);
    await openSeatMenu(page, 2, "counters");
    const tax = page.getByTestId("counter-mtg.tax");
    await tax.click();
    await expect(page.getByTestId("counter-mtg.tax-value")).toHaveText("2 (1 cast)");
    await tax.click();
    await expect(page.getByTestId("counter-mtg.tax-value")).toHaveText("4 (2 casts)");
  });

  test("enable and disable an optional counter for this game", async ({ page }) => {
    await gotoHarness(page);
    await openSeatMenu(page, 0, "counters");
    const energy = page.getByTestId("counter-mtg.energy");
    await expect(energy).toHaveAttribute("data-enabled", "false");
    await energy.click();
    await expect(energy).toHaveAttribute("data-enabled", "true");
    await energy.click();
    await expect(page.getByTestId("counter-mtg.energy-value")).toHaveText("1");
    await hold(energy);
    await page.getByTestId("counter-options-enable").click();
    await expect(page.getByTestId("counter-options")).toBeHidden();
    await expect(energy).toHaveAttribute("data-enabled", "false");
    const enabled = await page.evaluate(() =>
      window.__tcg!.getState().session!.game.enabledCounters.includes("mtg.energy"),
    );
    expect(enabled).toBe(false);
  });

  // @req TOK-001
  test("monarch token transfers between seats", async ({ page }) => {
    await gotoHarness(page);
    await openSeatMenu(page, 0, "counters");
    await page.getByTestId("counter-mtg.monarch").click();
    await expect(page.getByTestId("counter-mtg.monarch-value")).toHaveText("Held");
    await page.getByTestId("seat-menu-close").click();

    await openSeatMenu(page, 1, "counters");
    await expect(page.getByTestId("counter-mtg.monarch-value")).toHaveText("Tap to take");
    await page.getByTestId("counter-mtg.monarch").click();
    await expect(page.getByTestId("counter-mtg.monarch-value")).toHaveText("Held");
    const holder = await page.evaluate(() => {
      const g = window.__tcg!.getState().session!.game;
      return g.seats.findIndex((s) => s.id === g.tokens["mtg.monarch"]);
    });
    expect(holder).toBe(1);
    await page.getByTestId("seat-menu-close").click();
    await openSeatMenu(page, 0, "counters");
    await expect(page.getByTestId("counter-mtg.monarch-value")).toHaveText("Tap to take");
  });

  // @req SEAT-005
  test("closes with X, backdrop tap and browser back", async ({ page }) => {
    await gotoHarness(page);
    const menu = page.getByTestId("seat-menu");
    await openSeatMenu(page, 1);
    await page.getByTestId("seat-menu-close").click();
    await expect(menu).toBeHidden();

    await openSeatMenu(page, 1);
    await page.mouse.click(4, 4);
    await expect(menu).toBeHidden();

    await openSeatMenu(page, 1);
    await page.goBack();
    await expect(menu).toBeHidden();
    await expect(page).toHaveURL(/\/dev\/seat-menu\?/);

    await openSeatMenu(page, 1);
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
  });

  // @req LAY-004
  test("rotated sheet faces the seat; rotate override", async ({ page }) => {
    await gotoHarness(page, "&rot=90");
    await openSeatMenu(page, 0);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toHaveAttribute("style", /rotate\(90deg\)/);
    await page.getByTestId("seat-rotate").click();
    await expect(page.getByTestId("harness-seat-0")).toHaveAttribute("data-rotation", "180");
    await expect(dialog).toHaveAttribute("style", /rotate\(180deg\)/);
    await page.getByTestId("seat-rotate-reset").click();
    await expect(dialog).toHaveAttribute("style", /rotate\(90deg\)/);
  });

  // @req SEAT-004
  test("concede eliminates the seat; revive restores it", async ({ page }) => {
    await gotoHarness(page);
    await openSeatMenu(page, 1);
    await page.getByTestId("seat-concede").click();
    await expect(page.getByTestId("harness-seat-1")).toHaveAttribute("data-eliminated", "true");
    const cause = await page.evaluate(
      () => window.__tcg!.getState().session!.game.seats[1]!.eliminatedCause?.kind,
    );
    expect(cause).toBe("concede");
    await page.getByTestId("seat-revive").click();
    await expect(page.getByTestId("harness-seat-1")).toHaveAttribute("data-eliminated", "false");
  });

  // @req LIFE-003
  test("opening focused on a counter shows the counters tab with it highlighted", async ({
    page,
  }) => {
    await gotoHarness(page, "&focus=mtg.poison");
    await openSeatMenu(page, 0);
    await expect(page.getByTestId("seat-menu-panel-counters")).toBeVisible();
    await expect(page.getByTestId("counter-mtg.poison")).toHaveAttribute("data-focused", "true");
  });

  // @req A11Y-002
  test("every tab of the open seat menu is accessible", async ({ page }) => {
    await gotoHarness(page, "&rot=90");
    await openSeatMenu(page, 2);
    for (const tab of ["player", "counters", "commander", "timer"]) {
      await page.getByTestId(`seat-menu-tab-${tab}`).click();
      await expect(page.getByTestId(`seat-menu-panel-${tab}`)).toBeVisible();
      await expectNoSeriousA11yViolations(page);
    }
    await expect(page.getByTestId("seat-timer-placeholder")).toHaveText(
      "Timers arrive with the clock",
    );
  });
});
