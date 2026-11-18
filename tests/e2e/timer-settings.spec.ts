// @req SET-010 @req TMR-022 @req SEAT-003 @req TURN-002 @req TMR-030 @req TMR-004
// §13.1-C timer rows and the seat Timer tab.
import { expect, test, type Page } from "@playwright/test";
import { menuTap } from "./support/menu";
import { expectNoSeriousA11yViolations } from "./support/axe";
import { gotoClockBoard, storedTimer, timerState } from "./support/timer";

async function config(page: Page) {
  return page.evaluate(() => window.__tcg!.getState().session!.game.timer.config);
}

async function openSettings(page: Page) {
  await menuTap(page, "toolbar-settings");
  await expect(page.getByTestId("settings")).toBeVisible();
}

test("section C: rows follow the mode and change the game's timer config", async ({ page }) => {
  await gotoClockBoard(page, "");
  await openSettings(page);
  const section = page.getByTestId("settings-section-C");
  // Mode off: only the mode row.
  await expect(section.getByTestId("setting-timer.mode")).toBeVisible();
  await expect(section.getByTestId("setting-timer.bank")).toHaveCount(0);
  await expect(section.getByTestId("setting-timer.responses")).toHaveCount(0);
  await page.getByTestId("setting-timer.mode-control").selectOption("bankIncrement");
  expect((await config(page)).mode).toBe("bankIncrement");
  await expect(page.getByTestId("setting-timer.bank")).toBeVisible();
  await expect(page.getByTestId("setting-timer.step")).toContainText("Increment per pass");
  await expect(page.getByTestId("setting-timer.perTurn")).toHaveCount(0);

  await page.getByTestId("setting-timer.bank-control-15").click();
  expect((await config(page)).bankMs).toBe(15 * 60_000);
  await page.getByTestId("setting-timer.step-control-10").click();
  expect((await config(page)).incrementMs).toBe(10_000);

  // Custom time per player (h:mm on the keypad).
  await page.getByTestId("setting-timer.bank-control-custom").click();
  const pad = page.getByTestId("timer-custom-keypad");
  for (const d of "130") await pad.getByRole("button", { name: d, exact: true }).click();
  await page.getByTestId("timer-custom-keypad-submit").click();
  expect((await config(page)).bankMs).toBe(90 * 60_000);
  await expect(page.getByTestId("setting-timer.bank")).toContainText("1h 30m");

  await page.getByTestId("setting-timer.timeoutAction-control").selectOption("addOnce");
  await expect(page.getByTestId("setting-timer.grace")).toContainText("Extra time amount");
  await page.getByTestId("setting-timer.grace-control-120000").click();
  expect((await config(page)).addOnceMs).toBe(120_000);

  await page.getByTestId("setting-timer.match-control").selectOption("50");
  await page.getByTestId("setting-timer.extraTurns-control").selectOption("3");
  expect((await config(page)).match).toEqual({ totalMs: 50 * 60_000, extraTurns: 3 });

  await page.getByTestId("setting-timer.responses-control").selectOption("freeze");
  await page.getByTestId("setting-timer.passMode-control").selectOption("hold");
  // Low-time warnings is a sub-page (TMR-031); its presets set the thresholds.
  await page.getByTestId("setting-timer.warnings-control").click();
  await page.getByTestId("timer-warnings-preset").selectOption("late");
  await page.getByTestId("page-back").click();
  await expect(page.getByTestId("setting-timer.warnings")).toContainText("1:00 · 0:10");
  await page.getByTestId("setting-timer.showTurnTime-control").click();
  await page.getByTestId("setting-timer.autoPauseMenus-control").click();
  const c = await config(page);
  expect(c.responses).toBe("freeze");
  expect(c.passMode).toBe("hold");
  expect(c.warningsMs).toEqual([60_000, 10_000]);
  expect(c.showTurnTime).toBe(true);
  expect(c.autoPauseMenus).toBe(false);

  await page.getByTestId("setting-timer.mode-control").selectOption("perTurn");
  await expect(page.getByTestId("setting-timer.perTurn")).toBeVisible();
  await expect(page.getByTestId("setting-timer.bank")).toHaveCount(0);
  await page.clock.resume();
  await expectNoSeriousA11yViolations(page);

  // Back on the board: START is offered with the configured clocks.
  await page.goto("/play");
  await expect(page.getByTestId("center-menu")).toHaveAttribute("data-clock", "start");
});

test("changing the mode mid-game asks to restart the clocks", async ({ page }) => {
  await gotoClockBoard(page, "t.mode=bank&t.bankMs=600000");
  await menuTap(page, "timer-start");
  await page.clock.runFor(10_000);
  await openSettings(page);
  await page.getByTestId("setting-timer.mode-control").selectOption("perTurn");
  await expect(page.getByTestId("timer-restart-confirm")).toBeVisible();
  // Cancel keeps the running clocks.
  await page.getByTestId("timer-restart-cancel").click();
  expect((await config(page)).mode).toBe("bank");
  // A runtime option applies without a restart.
  await page.getByTestId("setting-timer.passMode-control").selectOption("hold");
  await expect(page.getByTestId("timer-restart-confirm")).toHaveCount(0);
  expect((await config(page)).passMode).toBe("hold");

  await page.getByTestId("setting-timer.mode-control").selectOption("perTurn");
  await page.getByTestId("timer-restart-continue").click();
  const s = await timerState(page);
  expect(s.status).toBe("idle");
  expect((await config(page)).mode).toBe("perTurn");
  await page.clock.runFor(1_000); // autosave
  // the restarted (idle) clocks are on disk before the reload
  await expect.poll(async () => (await storedTimer(page))?.status).toBe("idle");
  await page.goto("/play");
  await expect(page.getByTestId("center-menu")).toHaveAttribute("data-clock", "start");
});

test("seat Timer tab: remaining, adjust (logged as adjusted in history), set exact, concede", async ({
  page,
}) => {
  await gotoClockBoard(page, "t.mode=bank&t.bankMs=600000");
  const a = (await timerState(page)).active;
  await menuTap(page, "timer-start");
  await page.clock.runFor(30_000);
  await page.getByTestId(`seat-${a}-name`).click();
  await page.getByTestId("seat-menu-tab-timer").click();
  await expect(page.getByTestId("seat-timer-remaining")).toHaveText("9:30");
  await expect(page.getByTestId("seat-timer-used")).toHaveText("0:30");
  await page.getByTestId("seat-timer-adjust-60000").click();
  await expect(page.getByTestId("seat-timer-remaining")).toHaveText("10:30");
  await page.getByTestId("seat-timer-adjust--30000").click();
  await expect(page.getByTestId("seat-timer-remaining")).toHaveText("10:00");
  await page.getByTestId("seat-timer-set").click();
  const pad = page.getByTestId("seat-timer-keypad");
  for (const d of "12") await pad.getByRole("button", { name: d, exact: true }).click();
  await page.getByTestId("seat-timer-keypad-submit").click();
  await expect(page.getByTestId("seat-timer-remaining")).toHaveText("12:00");
  await page.clock.resume();
  await expectNoSeriousA11yViolations(page);
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);

  // History shows the adjustments ("adjust" / "set" clock events flagged adjusted).
  const adjusted = await page.evaluate(() =>
    window
      .__tcg!.getState()
      .session!.game.log.filter((e) => e.kind === "timer" && e.meta?.adjusted === true)
      .map((e) => e.meta!.action),
  );
  expect(adjusted).toEqual(["adjust", "adjust", "set"]);
  await page.getByTestId("seat-menu-close").click();
  await page.getByTestId("timer-resume").click();
  await menuTap(page, "toolbar-history");
  await expect(page.getByTestId("log-list")).toContainText("adjust");

  await page.clock.runFor(1_000); // autosave
  await page.goto("/play");
  await page.getByTestId("timer-resume").click();
  // Concede from the Timer tab.
  const other = (a + 1) % 4;
  await page.getByTestId(`seat-${other}-name`).click();
  await page.getByTestId("seat-menu-tab-timer").click();
  await page.getByTestId("seat-timer-concede").click();
  expect((await timerState(page)).eliminated[other]).toBe(true);
});

test("seat Timer tab without clocks: turn stats and concede only", async ({ page }) => {
  await gotoClockBoard(page, "");
  await page.getByTestId("seat-0-name").click();
  await page.getByTestId("seat-menu-tab-timer").click();
  await expect(page.getByTestId("seat-timer-off")).toBeVisible();
  await expect(page.getByTestId("seat-timer-stats")).toContainText("Turns taken: 0");
  await expect(page.locator('[data-testid^="seat-timer-adjust"]')).toHaveCount(0);
  await expect(page.getByTestId("seat-timer-concede")).toBeVisible();
});
