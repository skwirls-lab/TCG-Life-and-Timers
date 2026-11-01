// @req TMR-043
// "Time used this turn" sub-label on the active seat's clock when the setting is on.
import { expect, test } from "@playwright/test";

test("show turn time: the active clock shows time used this turn", async ({ page }) => {
  await page.clock.install();
  await page.goto(
    "/play?quick=mtg.commander&players=4&seed=7&t.mode=bank&t.bankMs=600000&t.showTurnTime=1",
  );
  await expect(page.getByTestId("board")).toBeVisible();
  await page.getByTestId("timer-start").click();
  const active = await page.evaluate(() => window.__tcg!.getState().session!.game.turn.activeSeat);
  await page.clock.runFor(65_000);
  await expect(page.getByTestId(`turn-time-${active}`)).toContainText("1:05");
});
