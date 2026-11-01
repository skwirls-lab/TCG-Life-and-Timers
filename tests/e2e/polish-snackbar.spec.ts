// Seat-anchored pass-turn Undo snackbar (TMR-004, D-043/D-058).
// @req TMR-004 @req GAME-015
import { expect, test } from "@playwright/test";
import { gotoClockBoard, timerState } from "./support/timer";

// @req TMR-004
test("the pass-turn Undo snackbar appears at the passing seat, facing its player", async ({
  page,
}) => {
  await gotoClockBoard(page, "t.mode=bank&t.bankMs=600000");
  await page.getByTestId("timer-start").click();
  const a = (await timerState(page)).active;
  const tile = await page.getByTestId(`seat-${a}`).boundingBox();
  await page.getByTestId(`seat-${a}-pass`).click();

  const snack = page.getByTestId("snackbar").filter({ hasText: "Passed to" });
  await expect(snack).toBeVisible();
  await expect(snack).toHaveAttribute("data-anchored", "1");
  const box = (await snack.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  expect(cx).toBeGreaterThanOrEqual(tile!.x);
  expect(cx).toBeLessThanOrEqual(tile!.x + tile!.width);
  expect(cy).toBeGreaterThanOrEqual(tile!.y);
  expect(cy).toBeLessThanOrEqual(tile!.y + tile!.height);

  // Undo from the anchored snackbar restores the turn.
  await snack.getByTestId("snackbar-action").click();
  expect((await timerState(page)).active).toBe(a);
});
