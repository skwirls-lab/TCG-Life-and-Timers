// @req REL-001 @req TMR-044 @req TMR-021
// Appendix B Scenario 5: reload with P2's clock running, auto-pause on and off.
import { expect, test } from "@playwright/test";
import { gotoClockBoard, mss, setHidden, storedTimer, timerState } from "./support/timer";

const TEN = 600_000;

test("auto-pause on: hiding then reloading restores a paused game at the time of hide", async ({
  page,
}) => {
  await gotoClockBoard(page, `t.mode=bank&t.bankMs=${TEN}`);
  const p1 = (await timerState(page)).active;
  const p2 = (p1 + 1) % 4;
  await page.getByTestId("timer-start").click();
  await page.getByTestId(`seat-${p1}-pass`).click();
  await page.clock.runFor(20_000);
  await setHidden(page, true);
  await expect.poll(async () => (await storedTimer(page))?.status).toBe("paused");
  await page.clock.runFor(45_000);

  await page.goto("/play");
  await expect(page.getByTestId("seat-0")).toBeVisible();
  const overlay = page.getByTestId("timer-paused");
  await expect(overlay).toHaveAttribute("data-reason", "background");
  const s = await timerState(page);
  expect(s.status).toBe("paused");
  expect(s.active).toBe(p2);
  expect(s.remaining[p2]).toBe(TEN - 20_000);
  await page.getByTestId("timer-resume").click();
  await expect(page.getByTestId(`seat-${p2}-clock-time`)).toHaveText("9:40");
  await page.clock.runFor(5_000);
  await expect(page.getByTestId(`seat-${p2}-clock-time`)).toHaveText("9:35");
});

test("auto-pause off: after a reload P2's remaining time accounts for the elapsed time", async ({
  page,
}) => {
  await gotoClockBoard(page, `t.mode=bank&t.bankMs=${TEN}&t.autoPauseBackground=0`);
  const p1 = (await timerState(page)).active;
  const p2 = (p1 + 1) % 4;
  await page.getByTestId("timer-start").click();
  await page.getByTestId(`seat-${p1}-pass`).click();
  await page.clock.runFor(20_000);
  const before = await storedTimer(page);
  await expect.poll(async () => (await storedTimer(page))?.runningSince).not.toBeNull();
  expect(before === null || before.status === "running").toBe(true);

  await page.goto("/play");
  await expect(page.getByTestId("seat-0")).toBeVisible();
  await page.clock.runFor(10_000);
  const s = await timerState(page);
  expect(s.status).toBe("running");
  expect(s.active).toBe(p2);
  await expect(page.getByTestId("timer-paused")).toHaveCount(0);
  // Remaining = bank − all wall time since P2's clock started (before and after the reload).
  expect(s.remaining[p2]).toBeLessThanOrEqual(TEN - 30_000);
  await expect(page.getByTestId(`seat-${p2}-clock-time`)).toHaveText(mss(s.remaining[p2]!));
});
