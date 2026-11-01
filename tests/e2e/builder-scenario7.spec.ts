// @req CUS-001 @req CUS-002 @req CUS-004 @req CUS-005 @req CUS-008
// Appendix B Scenario 7 "Lore Race", built entirely through the builder UI, then played.
import { expect, test, type Page } from "@playwright/test";

async function editCounter(page: Page, index: number) {
  await page.getByTestId(`editor-counter-${index}-edit`).click();
  await expect(page.getByTestId("counter-form")).toBeVisible();
}

async function closeSheet(page: Page) {
  await page.getByTestId("counter-done").click();
  await expect(page.getByTestId("counter-sheet")).toBeHidden();
}

test("Scenario 7: build Lore Race in the UI, start a game, reach 20 lore to win", async ({
  page,
}) => {
  await page.goto("/builder");
  await expect(page.getByTestId("builder-empty")).toBeVisible();
  await page.getByTestId("builder-new").click();
  await expect(page).toHaveURL(/\/builder\/edit$/);
  await expect(page.getByTestId("editor-form")).toBeVisible();

  await page.getByTestId("editor-name").fill("Lore Race");
  await page.getByTestId("editor-game").fill("Lorcana");

  // Primary "Lore": counts up, starts at 0, win when ≥ 20.
  await editCounter(page, 0);
  await page.getByTestId("counter-name").fill("Lore");
  await page.getByTestId("counter-icon-lore").click();
  await page.getByTestId("counter-direction-up").click();
  await page.getByTestId("counter-start").fill("0");
  await page.getByTestId("counter-min").fill("0");
  await page.getByTestId("counter-rule").selectOption("winGte");
  await page.getByTestId("counter-rule-value").fill("20");
  await expect(page.getByTestId("counter-primary")).toHaveAttribute("aria-checked", "true");
  await closeSheet(page);

  // Second counter "Ink", reset every turn.
  await page.getByTestId("editor-add-counter").click();
  await expect(page.getByTestId("counter-form")).toBeVisible();
  await page.getByTestId("counter-name").fill("Ink");
  await page.getByTestId("counter-icon-droplet").click();
  await page.getByTestId("counter-reset-turn").click();
  await expect(page.getByTestId("counter-reset-turn")).toHaveAttribute("aria-checked", "true");
  await closeSheet(page);

  // Live preview (CUS-004) reflects the draft.
  await expect(page.getByTestId("preview-value")).toHaveText("0");
  await expect(page.getByTestId("editor-counter-1")).toContainText("Ink");
  await expect(page.getByTestId("editor-errors")).toHaveCount(0);

  await page.getByTestId("editor-save").click();
  await expect(page).toHaveURL(/\/builder\/edit\?id=custom\./);
  await expect(page.getByTestId("editor-save")).toBeDisabled(); // saved, nothing to save

  await page.getByTestId("editor-play").click();
  await expect(page).toHaveURL(/\/play$/);
  await expect(page.getByTestId("seat-0")).toBeVisible();
  await page.waitForFunction(() => !!window.__tcg);

  const info = await page.evaluate(() => {
    const g = window.__tcg!.getState().session!.game;
    const primary = g.preset.counters.find((c) => c.isPrimary)!;
    const ink = g.preset.counters.find((c) => c.name === "Ink")!;
    return {
      name: g.preset.name,
      seats: g.seats.length,
      seatId: g.seats[0]!.id,
      primaryId: primary.id,
      primaryName: primary.name,
      inkReset: ink.resetOnTurnPass,
      status: g.status,
    };
  });
  expect(info).toMatchObject({
    name: "Lore Race",
    seats: 2,
    primaryName: "Lore",
    inkReset: true,
  });
  expect(info.status).not.toBe("ended");

  for (let i = 0; i < 20; i++) {
    await page.evaluate(
      ({ counterId, seatId }) =>
        window.__tcg!.dispatch({ type: "COUNTER_ADD", counterId, seatId, delta: 1 }),
      { counterId: info.primaryId, seatId: info.seatId },
    );
  }
  const result = await page.evaluate(() => {
    const g = window.__tcg!.getState().session!.game;
    return { status: g.status, winners: g.result?.winners ?? [] };
  });
  expect(result).toEqual({ status: "ended", winners: [info.seatId] });
  await expect(page.getByTestId("seat-0-winner")).toBeVisible();
});
