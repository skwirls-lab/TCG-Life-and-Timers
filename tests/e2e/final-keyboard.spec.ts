// @req A11Y-005 @req A11Y-001 @req ENV-002
/**
 * Desktop keyboard (A11Y-005): seats are in the tab order (turn order), arrows adjust the focused
 * seat (Shift = hold step), Space/Enter passes the turn on the active seat, R responds, Escape
 * closes sheets; a visible focus ring. The polite live region (A11Y-001) reads the results.
 */
import { expect, test, type Page } from "@playwright/test";
import { activeIndex, gotoClockBoard, timerState } from "./support/timer";

test.use({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false });

const URL4 =
  "/play?quick=mtg.commander&players=4&seed=7&names=Conner,Josh,JP,Bethany&s.hideSystemBars=0";

const focusedTestId = (page: Page) =>
  page.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? null);

async function tabTo(page: Page, testId: string, max = 40) {
  for (let k = 0; k < max; k++) {
    if ((await focusedTestId(page)) === testId) return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`${testId} never received focus`);
}

test("arrow keys adjust the focused seat, with a visible focus ring and live announcements", async ({
  page,
}) => {
  await page.goto(URL4);
  await expect(page.getByTestId("seat-0-value")).toHaveText("40");
  await tabTo(page, "seat-0");
  const seat0 = page.getByTestId("seat-0");
  await expect(seat0).toBeFocused();
  await expect(seat0).toHaveAttribute("aria-label", /Conner, Life 40/);
  // Visible focus indicator (not colour alone: a 4 px outline).
  const outline = await seat0.evaluate((el) => {
    const s = getComputedStyle(el);
    return { style: s.outlineStyle, width: s.outlineWidth };
  });
  expect(outline.style).not.toBe("none");
  expect(outline.width).toBe("4px");

  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("seat-0-value")).toHaveText("42");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("seat-0-value")).toHaveText("41");
  await page.keyboard.press("Shift+ArrowUp");
  await expect(page.getByTestId("seat-0-value")).toHaveText("51");
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("seat-0-value")).toHaveText("50");
  // One polite region; consecutive changes are batched into the final value.
  const live = page.getByTestId("live-announcer");
  await expect(live).toHaveAttribute("aria-live", "polite");
  await expect(live).toHaveText("Conner Life 50", { timeout: 4000 });
  // The +/− controls name the seat, counter and value.
  await expect(page.getByTestId("seat-0-plus")).toHaveAttribute(
    "aria-label",
    "Conner Life 50, increase",
  );

  // Tab order follows the seats (turn order): seat 1 comes after seat 0.
  await tabTo(page, "seat-1");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("seat-1-value")).toHaveText("39");
  await expect(page.getByTestId("seat-0-value")).toHaveText("50");
  await expect(live).toHaveText("Josh Life 39", { timeout: 4000 });

  // Escape closes a sheet opened from the keyboard.
  await page.getByTestId("seat-1-name").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("seat-menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("seat-menu")).toHaveCount(0);
});

test("Space passes the turn on the active seat; R responds from another seat", async ({ page }) => {
  await gotoClockBoard(page, "t.mode=bank&t.bankMs=600000");
  await page.getByTestId("timer-start").click();
  await expect.poll(async () => (await timerState(page)).status).toBe("running");
  const a = await activeIndex(page);
  const b = (a + 1) % 4;

  // Space on a seat whose turn it is NOT does nothing.
  await page.getByTestId(`seat-${b}`).focus();
  await page.keyboard.press("Space");
  expect(await activeIndex(page)).toBe(a);

  // Space on the active seat passes (with the usual undo snackbar).
  await page.getByTestId(`seat-${a}`).focus();
  await expect(page.getByTestId(`seat-${a}`)).toHaveAttribute("aria-label", /their turn/);
  await page.keyboard.press("Space");
  await expect.poll(() => activeIndex(page)).toBe(b);
  await expect(page.getByTestId("snackbar")).toContainText("Passed to");
  await expect(page.getByTestId("live-announcer")).toContainText("turn");

  // R on another seat starts a response (⚡).
  const c = (b + 1) % 4;
  await page.getByTestId(`seat-${c}`).focus();
  await page.keyboard.press("r");
  const s = await timerState(page);
  expect(s.stack).toEqual([s.seatIds[c]]);
  await expect(page.getByTestId(`seat-${c}-clock`)).toContainText("⚡");

  // Enter on the active seat while a response is open does not pass (resolve first).
  await page.getByTestId(`seat-${b}`).focus();
  await page.keyboard.press("Enter");
  expect(await activeIndex(page)).toBe(b);
});
