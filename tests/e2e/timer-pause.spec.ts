// @req TMR-001 @req TMR-002 @req TMR-020 @req TMR-021 @req SET-013
import { expect, test } from "@playwright/test";
import { menuTap } from "./support/menu";
import { expectNoSeriousA11yViolations } from "./support/axe";
import { gotoClockBoard, setHidden, timerState } from "./support/timer";

const BANK = "t.mode=bank&t.bankMs=600000";

test("START → Pause (PAUSED overlay freezes all clocks) → Resume", async ({ page }) => {
  await gotoClockBoard(page, BANK);
  const a = (await timerState(page)).active;
  await expect(page.getByTestId("toolbar-clock")).toHaveCount(0);
  await menuTap(page, "timer-start");
  await expect(page.getByTestId("timer-start")).toHaveCount(0);
  await page.clock.runFor(12_000);
  await menuTap(page, "toolbar-clock");
  const overlay = page.getByTestId("timer-paused");
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveAttribute("data-reason", "user");
  await page.clock.runFor(60_000);
  let s = await timerState(page);
  expect(s.status).toBe("paused");
  expect(s.remaining[a]).toBe(600_000 - 12_000);
  await page.getByTestId("timer-resume").click();
  await expect(overlay).toHaveCount(0);
  await page.clock.runFor(3_000);
  s = await timerState(page);
  expect(s.status).toBe("running");
  expect(s.remaining[a]).toBe(600_000 - 15_000);
});

test("PAUSED overlay is accessible", async ({ page }) => {
  await gotoClockBoard(page, BANK);
  await menuTap(page, "timer-start");
  await menuTap(page, "toolbar-clock");
  await expect(page.getByTestId("timer-paused")).toBeVisible();
  await page.clock.resume();
  await expectNoSeriousA11yViolations(page);
});

test("opening Settings pauses the clocks; the board asks to resume on return (SET-013)", async ({
  page,
}) => {
  await gotoClockBoard(page, BANK);
  const a = (await timerState(page)).active;
  await menuTap(page, "timer-start");
  await page.clock.runFor(5_000);
  await menuTap(page, "toolbar-settings");
  await expect(page).toHaveURL(/\/settings/);
  await expect(page.getByTestId("settings")).toBeVisible();
  await expect.poll(async () => (await timerState(page)).pausedReason).toBe("menu");
  await page.clock.runFor(30_000);
  expect((await timerState(page)).remaining[a]).toBe(600_000 - 5_000);
  // Back to the board (a full load resumes the saved game; the quick-start URL would start anew).
  await page.goto("/play");
  const overlay = page.getByTestId("timer-paused");
  await expect(overlay).toHaveAttribute("data-reason", "menu");
  await expect(overlay).toContainText("menus or settings");
  await page.getByTestId("timer-resume").click();
  expect((await timerState(page)).status).toBe("running");
});

test("opening a seat menu pauses; closing it shows the resume prompt", async ({ page }) => {
  await gotoClockBoard(page, BANK);
  await menuTap(page, "timer-start");
  await page.getByTestId("seat-0-name").click();
  await expect(page.getByTestId("seat-menu")).toBeVisible();
  expect((await timerState(page)).pausedReason).toBe("menu");
  // The overlay waits until the menu is closed.
  await expect(page.getByTestId("timer-paused")).toHaveCount(0);
  await page.getByTestId("seat-menu-close").click();
  await expect(page.getByTestId("timer-paused")).toBeVisible();
});

test("with auto-pause for menus off, Settings does not pause", async ({ page }) => {
  // Strip style: the center menu always pauses (MENU); the strip follows the setting.
  await gotoClockBoard(page, `${BANK}&t.autoPauseMenus=0&s.menuStyle=strip`);
  await menuTap(page, "timer-start");
  await menuTap(page, "toolbar-settings");
  await expect(page.getByTestId("settings")).toBeVisible();
  await page.clock.runFor(1_000);
  expect((await timerState(page)).status).toBe("running");
});

test("hiding the app pauses (background notice) when auto-pause is on (TMR-021)", async ({
  page,
}) => {
  await gotoClockBoard(page, BANK);
  await menuTap(page, "timer-start");
  await page.clock.runFor(4_000);
  await setHidden(page, true);
  await page.clock.runFor(20_000);
  await setHidden(page, false);
  const overlay = page.getByTestId("timer-paused");
  await expect(overlay).toHaveAttribute("data-reason", "background");
  await expect(overlay).toContainText("background");
  const s = await timerState(page);
  expect(s.remaining[s.active]).toBe(600_000 - 4_000);
});
