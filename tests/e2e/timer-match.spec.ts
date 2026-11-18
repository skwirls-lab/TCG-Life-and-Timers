// @req TMR-032 @req TMR-020
import { expect, test } from "@playwright/test";
import { menuTap } from "./support/menu";
import { gotoClockBoard, timerState } from "./support/timer";

test("match timer: toolbar clock, pause freezes it, TIME banner and extra-turn countdown", async ({
  page,
}) => {
  await gotoClockBoard(page, "t.mode=bank&t.bankMs=1200000&t.matchMs=60000&t.extraTurns=2");
  await expect(page.getByTestId("match-clock-time")).toHaveText("1:00");
  await menuTap(page, "timer-start");
  await page.clock.runFor(30_000);
  await expect(page.getByTestId("match-clock-time")).toHaveText("0:30");
  // TMR-020: a global pause freezes the match timer too.
  await menuTap(page, "toolbar-clock");
  await page.clock.runFor(60_000);
  await page.getByTestId("timer-resume").click();
  await expect(page.getByTestId("match-clock-time")).toHaveText("0:30");
  await page.clock.runFor(30_500);
  await expect(page.getByTestId("match-time-called")).toHaveText("TIME · 2");
  await expect(page.getByTestId("match-clock")).toHaveAttribute("data-called", "true");
  await expect(page.getByTestId("snackbar")).toContainText("TIME — extra turns 2");
  // Extra turns count down as turns are passed.
  let a = (await timerState(page)).active;
  await page.getByTestId(`seat-${a}-pass`).click();
  await expect(page.getByTestId("match-time-called")).toHaveText("TIME · 1");
  a = (await timerState(page)).active;
  await page.getByTestId(`seat-${a}-pass`).click();
  await expect(page.getByTestId("match-time-called")).toHaveText("TIME · 0");
});
