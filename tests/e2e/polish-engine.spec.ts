// Engine actions that replaced store patches: SET_LAYOUT (sticky) and TIMER_RESET_CLOCKS.
// @req LAY-003 @req TMR-001 @req GAME-015
import { expect, test } from "@playwright/test";
import { menuTap } from "./support/menu";
import { gotoClockBoard, timerState } from "./support/timer";

const BASE =
  "/play?quick=mtg.commander&players=4&seed=7&names=Conner,Josh,JP,Bethany&s.hideSystemBars=0";

// @req LAY-003 @req GAME-015
test("a layout switch is not an undo step: undo reverts life, the layout stays", async ({
  page,
}) => {
  await page.goto(BASE);
  await expect(page.getByTestId("seat-0-name")).toBeVisible();
  await page.getByTestId("seat-0-minus").click();
  await expect(page.getByTestId("seat-0-value")).toHaveText("39");
  await menuTap(page, "toolbar-players");
  await page.getByTestId("players-layout-topBottom").click();
  await page.getByTestId("players-popover-close").click();
  await page.evaluate(() => window.__tcg!.dispatch({ type: "UNDO" }));
  await expect(page.getByTestId("seat-0-value")).toHaveText("40");
  expect(await page.evaluate(() => window.__tcg!.getState().session!.game.layoutId)).toBe(
    "topBottom",
  );
});

// @req TMR-001
test("restarting the clocks from settings logs 'Clocks restarted' and is undoable", async ({
  page,
}) => {
  await gotoClockBoard(page, "t.mode=bank&t.bankMs=600000");
  await menuTap(page, "timer-start");
  await page.clock.runFor(10_000);
  await menuTap(page, "toolbar-settings");
  await page.getByTestId("setting-timer.bank-control-20").click();
  await page.getByTestId("timer-restart-continue").click();
  const s = await timerState(page);
  expect(s.status).toBe("idle");
  expect(s.remaining.every((ms) => ms === 20 * 60_000)).toBe(true);
  const last = await page.evaluate(() => window.__tcg!.getState().session!.game.log.at(-1));
  expect(last).toMatchObject({ kind: "timer", meta: { action: "restart" } });
  await page.evaluate(() => window.__tcg!.dispatch({ type: "UNDO" }));
  const back = await timerState(page);
  expect(back.status).not.toBe("idle");
  expect(back.remaining[back.active]).toBeLessThan(600_000);
});
