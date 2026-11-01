// Cross-lane integration (W2): board ↔ seat menu ↔ quick tools ↔ history.
// @req SEAT-001 @req SEAT-005 @req LIFE-003 @req CMD-002 @req TOOL-010 @req HIST-012 @req LAY-007
import { expect, test } from "@playwright/test";

const QUICK = "/play?quick=mtg.commander&players=4&seed=7&names=Conner,Josh,JP,Bethany";

test.describe("board integration", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(QUICK);
    await expect(page.getByTestId("board")).toBeVisible();
  });

  test("tapping a name pill opens that seat's menu, rotated to face the player", async ({
    page,
  }) => {
    const rot = await page.getByTestId("seat-0").getAttribute("data-rotation");
    await page.getByTestId("seat-0-name").click();
    const menu = page.getByTestId("seat-menu");
    await expect(menu).toBeVisible();
    const dialog = page.getByRole("dialog");
    const transform = await dialog.evaluate((el) => (el as HTMLElement).style.transform);
    expect(transform).toBe(`rotate(${rot ?? "0"}deg)`);
    await page.getByTestId("seat-menu-close").click();
    await expect(menu).toBeHidden();
  });

  test("tapping the commander mini-grid opens the commander tab", async ({ page }) => {
    await page.getByTestId("seat-2-cmdgrid").click();
    await expect(page.getByTestId("seat-menu")).toBeVisible();
    await expect(page.getByTestId("cmd-cell-0-0")).toBeVisible();
    await page.getByTestId("cmd-cell-0-0").click();
    await page.getByTestId("seat-menu-close").click();
    await expect(page.getByTestId("seat-2-cmd-0")).toContainText("1");
  });

  test("holding the dice button opens quick tools; a d20 roll is logged to history", async ({
    page,
  }) => {
    const tools = page.getByTestId("toolbar-tools");
    const box = (await tools.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(page.getByTestId("quick-tools")).toBeVisible({ timeout: 3000 });
    await page.mouse.up();
    await page.getByTestId("quick-d20").click();
    await expect(page.getByTestId("tool-result-value")).toHaveText(/^\d+$/, { timeout: 5000 });
    const total = Number(await page.getByTestId("tool-result-value").textContent());
    expect(total).toBeGreaterThanOrEqual(1);
    expect(total).toBeLessThanOrEqual(20);
    const notes = await page.evaluate(
      () =>
        window
          .__tcg!.getState()
          .session!.game.log.filter((e) => ["dice", "coin", "random", "note"].includes(e.kind))
          .length,
    );
    expect(notes).toBeGreaterThanOrEqual(1);
  });
});

// @req INP-007 @req TOOL-006
test("Yu-Gi-Oh!: tapping the LP number on the board opens the calculator", async ({ page }) => {
  await page.goto("/play?quick=ygo.advanced&players=2&seed=5&names=Yugi,Kaiba");
  await expect(page.getByTestId("board")).toBeVisible();
  await page.getByTestId("seat-1-calc").click();
  await expect(page.getByTestId("calc-sheet")).toBeVisible();
  const pad = page.getByTestId("calc-keypad");
  for (const k of ["−", "1", "5", "0", "0"])
    await pad.getByRole("button", { name: k, exact: true }).click();
  await page.getByTestId("calc-keypad-submit").click();
  await expect(page.getByTestId("calc-value")).toHaveText("6500");
  await page.getByTestId("calc-sheet-close").click();
  await expect(page.getByTestId("seat-1-value")).toHaveText("6500");
});

test("MTG presets do not turn the number into a calculator", async ({ page }) => {
  await page.goto("/play?quick=mtg.commander&players=4&seed=7");
  await expect(page.getByTestId("board")).toBeVisible();
  await expect(page.getByTestId("seat-0-calc")).toHaveCount(0);
});
