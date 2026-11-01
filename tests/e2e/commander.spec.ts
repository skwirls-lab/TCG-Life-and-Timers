// @req CMD-001 @req CMD-002 @req CMD-003 @req CMD-004 @req CMD-005 @req SEAT-002 @req GAME-015
// PRD Appendix B Scenario 1 (commander parts) and Scenario 2 (partners) through the seat menu.
import { expect, test } from "@playwright/test";
import { gotoHarness, hold, keypadSet, openSeatMenu } from "./support/seatHarness";

const CONNER = 0;
const JP = 2;

test.describe("commander damage", () => {
  // @req CMD-001 @req CMD-004 @req GAME-015
  test("Scenario 1: JP takes 5 from Conner → life 35; undo reverts both", async ({ page }) => {
    await gotoHarness(page);
    await openSeatMenu(page, JP, "commander");
    await expect(page.getByTestId(`cmd-seat-${JP}`)).toContainText("me");
    const cell = page.getByTestId(`cmd-cell-${CONNER}-0`);
    for (let i = 0; i < 5; i++) await cell.click();
    await expect(cell).toHaveAttribute("data-value", "5");
    await expect(cell).toContainText("5");
    await expect(page.getByTestId(`harness-value-${JP}`)).toHaveText("35");
    await expect(page.getByTestId(`harness-cmd-${JP}`)).toHaveText("5");

    await page.evaluate(() => window.__tcg!.dispatch({ type: "UNDO" }));
    await expect(cell).toHaveAttribute("data-value", "0");
    await expect(page.getByTestId(`harness-value-${JP}`)).toHaveText("40");
  });

  test("self-inflicted damage on the 'me' cell; hold options −1 / set / reset", async ({
    page,
  }) => {
    await gotoHarness(page);
    await openSeatMenu(page, JP, "commander");
    const me = page.getByTestId(`cmd-cell-${JP}-0`);
    await me.click();
    await expect(me).toHaveAttribute("data-value", "1");
    await hold(me);
    await expect(page.getByTestId("cmd-options")).toBeVisible();
    await keypadSet(page, "cmd-options-keypad", "6");
    await expect(me).toHaveAttribute("data-value", "6");
    await expect(page.getByTestId(`harness-value-${JP}`)).toHaveText("34");
    await hold(me);
    await page.getByTestId("cmd-options-minus").click();
    await expect(page.getByTestId("cmd-options-value")).toHaveText("5");
    await page.getByTestId("cmd-options-reset").click();
    await expect(page.getByTestId("cmd-options-value")).toHaveText("0");
    await page.getByTestId("cmd-options-back").click();
    await expect(page.getByTestId(`harness-value-${JP}`)).toHaveText("40");
  });

  // @req CMD-003 @req CMD-005
  test("Scenario 2: partners A/B — 12 + 12 alive, +9 from A eliminates", async ({ page }) => {
    await gotoHarness(page);
    await openSeatMenu(page, CONNER);
    await page.getByTestId("seat-commander-0").fill("A");
    await page.getByTestId("seat-partner-toggle").click();
    await page.getByTestId("seat-commander-1").fill("B");
    await page.getByTestId("seat-commander-1").press("Enter");
    await expect(page.getByTestId(`harness-seat-${CONNER}`)).toHaveAttribute(
      "data-commanders",
      "A|B",
    );
    await page.getByTestId("seat-menu-close").click();

    await openSeatMenu(page, JP, "commander");
    const a = page.getByTestId(`cmd-cell-${CONNER}-0`);
    const b = page.getByTestId(`cmd-cell-${CONNER}-1`);
    await expect(a).toContainText("A");
    await expect(b).toContainText("B");

    await hold(a);
    await keypadSet(page, "cmd-options-keypad", "12");
    await hold(b);
    await keypadSet(page, "cmd-options-keypad", "12");
    await expect(a).toHaveAttribute("data-value", "12");
    await expect(b).toHaveAttribute("data-value", "12");
    await expect(page.getByTestId(`cmd-total-${CONNER}`)).toContainText("24");
    await expect(page.getByTestId(`harness-value-${JP}`)).toHaveText("16");
    await expect(page.getByTestId(`harness-seat-${JP}`)).toHaveAttribute(
      "data-eliminated",
      "false",
    );

    for (let i = 0; i < 4; i++) await a.click();
    await expect(a).toHaveAttribute("data-level", "warning");
    for (let i = 0; i < 5; i++) await a.click();
    await expect(a).toHaveAttribute("data-value", "21");
    await expect(page.getByTestId(`harness-seat-${JP}`)).toHaveAttribute("data-eliminated", "true");
    const cause = await page.evaluate(() => {
      const g = window.__tcg!.getState().session!.game;
      const c = g.seats[2]!.eliminatedCause;
      return c?.kind === "threshold"
        ? {
            counter: c.counterId,
            source: g.seats.find((s) => s.id === c.sourceSeatId)?.name,
            index: c.sourceIndex,
          }
        : c;
    });
    expect(cause).toEqual({ counter: "mtg.cmdDamage", source: "Conner", index: 0 });
  });
});
