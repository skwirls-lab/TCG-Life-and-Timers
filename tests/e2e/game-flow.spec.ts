// @req GAME-010 @req GAME-011 @req GAME-012 @req GAME-014 @req GAME-015 @req LIFE-005 @req CTR-003
import { expect, test, type Page } from "@playwright/test";

/** Tap a corner of the full-screen overlay (snackbars sit in the center). */
const CORNER = { position: { x: 12, y: 12 } };

const HARNESS = "/dev/game-flow?quick=mtg.commander&players=4&names=A,B,C,D&seed=5";

interface GameView {
  id: string;
  status: string;
  seats: { id: string; name: string; eliminated: boolean }[];
  values: Record<string, number>;
}

async function game(page: Page): Promise<GameView> {
  return page.evaluate(() => window.__tcg!.getState().session!.game as unknown as GameView);
}

async function dismissFirstPlayer(page: Page) {
  const overlay = page.getByTestId("first-player-overlay");
  await expect(overlay).toBeVisible();
  await page.getByTestId("first-player-skip").click(CORNER);
  await expect(page.getByTestId("first-player-result")).toBeVisible();
  await page.getByTestId("first-player-skip").click(CORNER);
  await expect(overlay).toBeHidden();
}

test("first-player overlay appears on a new game and on reset, and can be skipped", async ({
  page,
}) => {
  await page.goto(HARNESS);
  const overlay = page.getByTestId("first-player-overlay");
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveAttribute("data-landed", "0");
  await page.getByTestId("first-player-skip").click(CORNER);
  await expect(overlay).toHaveAttribute("data-landed", "1");
  await expect(page.getByTestId("first-player-result")).toContainText(/^[ABCD] goes first$/);
  await page.getByTestId("first-player-skip").click(CORNER);
  await expect(overlay).toBeHidden();

  const before = await game(page);
  await page.getByTestId("harness-reset").click();
  await expect(overlay).toBeVisible();
  // Undo snackbar after the reset (GAME-015).
  await expect(page.getByTestId("snackbar")).toContainText("Game reset");
  await dismissFirstPlayer(page);
  expect((await game(page)).id).not.toBe(before.id);
});

test("the spin lands on its own (and instantly with reduced motion)", async ({ page }) => {
  await page.goto(HARNESS);
  await expect(page.getByTestId("first-player-overlay")).toHaveAttribute("data-landed", "1", {
    timeout: 4000,
  });
  await expect(page.getByTestId("first-player-overlay")).toBeHidden({ timeout: 5000 });

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByTestId("harness-reset").click();
  await expect(page.getByTestId("first-player-overlay")).toHaveAttribute("data-landed", "1");
});

test("'choose' rule shows a seat picker", async ({ page }) => {
  await page.goto(HARNESS);
  await dismissFirstPlayer(page);
  await page.getByTestId("harness-choose").click();
  await page.getByTestId("harness-reset").click();
  await expect(page.getByTestId("first-player-picker")).toBeVisible();
  await page.getByTestId("first-player-pick-2").click();
  await expect(page.getByTestId("first-player-picker")).toBeHidden();
  await expect(page.getByTestId("first-player-result")).toContainText("C goes first");
  const firstSeat = await page.evaluate(
    () => window.__tcg!.getState().session!.game.turn.firstSeat,
  );
  expect(firstSeat).toBe((await game(page)).seats[2]!.id);
});

test("threshold prompt flow with Auto-KO 'Ask first'", async ({ page }) => {
  await page.goto(HARNESS);
  await dismissFirstPlayer(page);
  await page.getByTestId("harness-autoko-prompt").click();
  await page.getByTestId("harness-zero-1").click();
  const dialog = page.getByTestId("prompt-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Eliminate B? (Life 0)");
  await page.getByTestId("prompt-no").click();
  await expect(dialog).toBeHidden();
  expect((await game(page)).seats[1]!.eliminated).toBe(false);

  await page.getByTestId("harness-zero-2").click();
  await expect(dialog).toContainText("Eliminate C?");
  await page.getByTestId("prompt-yes").click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await game(page)).seats[2]!.eliminated).toBe(true);
  // Undo snackbar after an elimination.
  await expect(page.getByTestId("snackbar").last()).toContainText("C eliminated");
  await page.getByTestId("snackbar-action").last().click();
  await expect.poll(async () => (await game(page)).seats[2]!.eliminated).toBe(false);
});

test("game over on the last elimination; Rematch resets values", async ({ page }) => {
  await page.goto(HARNESS);
  await dismissFirstPlayer(page);
  await page.getByTestId("harness-minus-0").click();
  for (const i of [1, 2, 3]) await page.getByTestId(`harness-eliminate-${i}`).click();
  const over = page.getByTestId("game-over");
  await expect(over).toBeVisible();
  await expect(page.getByTestId("game-over-winner")).toHaveText("A wins!");
  await expect(page.getByTestId("game-over-eliminations")).toContainText("B");
  await expect(page.getByTestId("game-over-turns")).toHaveText("1");
  const ended = await game(page);
  expect(ended.status).toBe("ended");

  await page.getByTestId("game-over-rematch").click();
  await expect(over).toBeHidden();
  await dismissFirstPlayer(page);
  const g = await game(page);
  expect(g.status).toBe("ready");
  expect(g.id).not.toBe(ended.id);
  expect(g.seats.map((s) => s.name)).toEqual(["A", "B", "C", "D"]);
  expect(g.seats.every((s) => !s.eliminated)).toBe(true);
  expect(g.seats.map((s) => g.values[`mtg.life|${s.id}||`])).toEqual([40, 40, 40, 40]);
});

test("game over can be closed to view the board, and New setup opens /setup", async ({ page }) => {
  await page.goto(HARNESS);
  await dismissFirstPlayer(page);
  for (const i of [1, 2, 3]) await page.getByTestId(`harness-eliminate-${i}`).click();
  await page.getByTestId("game-over-close").click();
  await expect(page.getByTestId("game-over")).toBeHidden();
  await page.getByTestId("harness-undo").click();
  await page.getByTestId("harness-eliminate-3").click();
  await expect(page.getByTestId("game-over")).toBeVisible();
  await page.getByTestId("game-over-new").click();
  await expect(page).toHaveURL(/\/setup$/);
});
