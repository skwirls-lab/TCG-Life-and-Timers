// @req TURN-001 @req LIFE-006 @req TMR-003 @req TMR-004 @req TMR-009
import { expect, test } from "@playwright/test";
import { closeMenu, menuTap, openMenu } from "./support/menu";
import { activeIndex, gotoClockBoard, timerState } from "./support/timer";

test("turn tracking without clocks: ▶ Turn chip, pass, undo snackbar, eliminated seats skipped", async ({
  page,
}) => {
  await gotoClockBoard(page, "");
  // Clocks off: the toolbar clock stays the disabled placeholder.
  await openMenu(page);
  await expect(page.getByTestId("toolbar-clock")).toBeDisabled();
  await closeMenu(page);
  await expect(page.getByTestId("seat-0-timerbar")).toHaveCount(0);
  await page.evaluate(() =>
    window.__tcg!.dispatch({ type: "SET_OPTION", key: "turnTracking", value: true }),
  );
  const a = await activeIndex(page);
  await expect(page.getByTestId(`seat-${a}-turn`)).toHaveText(/Turn 1/);
  await expect(page.getByTestId(`seat-${(a + 1) % 4}-turn`)).toHaveCount(0);
  await expect(page.getByTestId(`seat-${(a + 1) % 4}-pass`)).toHaveCount(0);

  // Tap PASS TURN → next seat, "Passed to … · Undo" snackbar facing the passing seat.
  await page.getByTestId(`seat-${a}-pass`).click();
  const b = (a + 1) % 4;
  expect(await activeIndex(page)).toBe(b);
  await expect(page.getByTestId(`seat-${b}-turn`)).toHaveText(/Turn 2/);
  const snack = page.getByTestId("snackbar");
  await expect(snack).toContainText("Passed to");
  const rot = await page.getByTestId(`seat-${a}`).getAttribute("data-rotation");
  await expect(snack).toHaveAttribute("style", new RegExp(`rotate\\(${rot}deg\\)`));
  await page.getByTestId("snackbar-action").click();
  expect(await activeIndex(page)).toBe(a);
  await expect(page.getByTestId(`seat-${a}-turn`)).toHaveText(/Turn 1/);

  // The undo snackbar goes away after 3 s.
  await page.getByTestId(`seat-${a}-pass`).click();
  await expect(page.getByTestId("snackbar")).toBeVisible();
  await page.clock.runFor(3100);
  await expect(page.getByTestId("snackbar")).toHaveCount(0);

  // Eliminated seats are skipped.
  const s = await timerState(page);
  const skip = (b + 1) % 4;
  await page.evaluate(
    (id) => window.__tcg!.dispatch({ type: "ELIMINATE", seatId: id }),
    s.seatIds[skip]!,
  );
  await page.getByTestId(`seat-${b}-pass`).click();
  expect(await activeIndex(page)).toBe((b + 2) % 4);
  await expect(page.getByTestId(`seat-${skip}-timerbar`)).toHaveCount(0);
});

test("clocks: PASS TURN moves the clock; disabled while a response is open (TMR-009)", async ({
  page,
}) => {
  await gotoClockBoard(page, "t.mode=bank&t.bankMs=600000");
  const a = await activeIndex(page);
  // Before START no seat can pass (TMR-001).
  await expect(page.getByTestId(`seat-${a}-pass`)).toHaveCount(0);
  await menuTap(page, "timer-start");
  await page.clock.runFor(5000);
  const r = (a + 2) % 4;
  await page.getByTestId(`seat-${r}-respond`).click();
  // While someone else responds, the turn holder has "Return" instead of PASS TURN.
  await expect(page.getByTestId(`seat-${a}-pass`)).toHaveCount(0);
  await expect(page.getByTestId(`seat-${a}-return`)).toHaveAttribute(
    "title",
    "Resolve responses first",
  );
  await page.getByTestId(`seat-${a}-return`).click();
  await page.getByTestId(`seat-${a}-pass`).click();
  const s = await timerState(page);
  expect(s.active).toBe((a + 1) % 4);
  expect(s.holder).toBe(s.seatIds[(a + 1) % 4]);
  await expect(page.getByTestId(`seat-${(a + 1) % 4}-clock`)).toHaveAttribute(
    "data-running",
    "true",
  );
});

test("hold-to-pass (600 ms) when the pass mode is 'hold'", async ({ page }) => {
  await gotoClockBoard(page, "t.mode=bank&t.bankMs=600000&t.passMode=hold");
  const a = await activeIndex(page);
  await menuTap(page, "timer-start");
  const pass = page.getByTestId(`seat-${a}-pass`);
  await expect(pass).toHaveAttribute("data-hold", "1");
  // A tap only explains the gesture.
  await pass.click();
  await expect(page.getByTestId("snackbar")).toContainText("Hold to pass");
  expect(await activeIndex(page)).toBe(a);
  // A hold passes.
  const box = (await pass.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.clock.runFor(700);
  await page.mouse.up();
  expect(await activeIndex(page)).toBe((a + 1) % 4);
});
