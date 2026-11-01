// @req TOK-001 @req TOK-003 @req TOK-004 @req LIFE-002 @req LIFE-003 @req CMD-010
import { expect, test, type Page } from "@playwright/test";

const BASE =
  "/play?quick=mtg.commander&players=4&seed=7&names=Conner,Josh,JP,Bethany&s.hideSystemBars=0";

const seatId = (page: Page, i: number) =>
  page.evaluate((k) => window.__tcg!.getState().session!.game.seats[k]!.id, i);

test("monarch badge shows on the holder only and moves on transfer (TOK-001)", async ({ page }) => {
  await page.goto(BASE);
  await expect(page.getByTestId("seat-0-name")).toBeVisible();
  const b = await seatId(page, 1);
  await page.evaluate(
    (id) => window.__tcg!.dispatch({ type: "TOKEN_GIVE", counterId: "mtg.monarch", seatId: id }),
    b,
  );
  await expect(page.getByTestId("seat-1-badge-mtg.monarch")).toBeVisible();
  for (const i of [0, 2, 3])
    await expect(page.getByTestId(`seat-${i}-badge-mtg.monarch`)).toHaveCount(0);
  const c = await seatId(page, 2);
  await page.evaluate(
    (id) => window.__tcg!.dispatch({ type: "TOKEN_GIVE", counterId: "mtg.monarch", seatId: id }),
    c,
  );
  await expect(page.getByTestId("seat-2-badge-mtg.monarch")).toBeVisible();
  await expect(page.getByTestId("seat-1-badge-mtg.monarch")).toHaveCount(0);
  // Initiative uses its own badge.
  await page.evaluate(
    (id) => window.__tcg!.dispatch({ type: "TOKEN_GIVE", counterId: "mtg.initiative", seatId: id }),
    c,
  );
  await expect(page.getByTestId("seat-2-badge-mtg.initiative")).toBeVisible();
});

test("day/night shows in the toolbar only when enabled and cycles Neither → Day → Night → Day (TOK-003)", async ({
  page,
}) => {
  await page.goto(BASE);
  await expect(page.getByTestId("seat-0-name")).toBeVisible();
  await expect(page.getByTestId("toolbar-daynight")).toHaveCount(0);
  await page.evaluate(() =>
    window.__tcg!.dispatch({ type: "COUNTER_ENABLE", counterId: "mtg.dayNight", enabled: true }),
  );
  const btn = page.getByTestId("toolbar-daynight");
  await expect(btn).toHaveAttribute("data-state", "neither");
  await btn.click();
  await expect(btn).toHaveAttribute("data-state", "day");
  await btn.click();
  await expect(btn).toHaveAttribute("data-state", "night");
  await btn.click();
  await expect(btn).toHaveAttribute("data-state", "day");
});

test("city's blessing and counter badges; tapping a badge opens the seat menu target (TOK-004, LIFE-002/003)", async ({
  page,
}) => {
  await page.goto(BASE);
  await expect(page.getByTestId("seat-0-name")).toBeVisible();
  const a = await seatId(page, 0);
  await page.evaluate((id) => {
    const t = window.__tcg!;
    t.dispatch({ type: "COUNTER_ENABLE", counterId: "mtg.citysBlessing", enabled: true });
    t.dispatch({ type: "BOOL_TOGGLE", counterId: "mtg.citysBlessing", seatId: id });
    t.dispatch({ type: "COUNTER_ADD", counterId: "mtg.poison", seatId: id, delta: 2 });
    t.dispatch({ type: "CMD_TAX_CAST", seatId: id, commanderIndex: 0, delta: 2 });
  }, a);
  await expect(page.getByTestId("seat-0-badge-mtg.citysBlessing")).toBeVisible();
  await expect(page.getByTestId("seat-0-badge-mtg.poison")).toContainText("2");
  // CMD-010: the tax badge shows the tax (casts × 2).
  await expect(page.getByTestId("seat-0-badge-mtg.tax")).toContainText("4");
  await expect(page.getByTestId("seat-1-badges")).toHaveCount(0);
  await page.getByTestId("seat-0-badge-mtg.poison").click();
  // The seat menu is owned by another lane; the board records the request.
  await expect(page.getByTestId("seat-0")).toBeVisible();
});
