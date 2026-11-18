// @req SET-032 @req SET-033 @req CMD-002 @req CMD-004 @req CMD-006 @req LIFE-004 @req LIFE-005 @req SET-030
import { expect, test, type Page } from "@playwright/test";
import { menuTap } from "./support/menu";

const BASE =
  "/play?quick=mtg.commander&players=4&seed=7&names=Conner,Josh,JP,Bethany&s.hideSystemBars=0";

const seatIds = (page: Page) =>
  page.evaluate(() => window.__tcg!.getState().session!.game.seats.map((s) => s.id));

test("one-player mode: a single upright tile with a commander grid of all seats (SET-032)", async ({
  page,
}) => {
  await page.goto(`${BASE}&s.onePlayerMode=1`);
  await expect(page.getByTestId("seat-0")).toHaveAttribute("data-rotation", "0");
  await expect(page.getByTestId("seat-1")).toHaveCount(0);
  for (let i = 0; i < 4; i++) await expect(page.getByTestId(`seat-0-cmd-${i}`)).toBeVisible();
  await expect(page.getByTestId("seat-0-cmd-0")).toHaveText("me");
  await page.getByTestId("seat-0-plus").click();
  await expect(page.getByTestId("seat-0-value")).toHaveText("41");
});

test("camera mode faces every seat the same way (SET-033)", async ({ page }) => {
  await page.goto(`${BASE}&s.cameraMode=bottom`);
  await expect(page.getByTestId("seat-0-name")).toBeVisible();
  for (let i = 0; i < 4; i++)
    await expect(page.getByTestId(`seat-${i}`)).toHaveAttribute("data-rotation", "0");
  await page.goto(`${BASE}&s.cameraMode=top`);
  await expect(page.getByTestId("seat-0-name")).toBeVisible();
  for (let i = 0; i < 4; i++)
    await expect(page.getByTestId(`seat-${i}`)).toHaveAttribute("data-rotation", "180");
});

test("mini-grid shows commander damage received per source, 'me' on the own cell (CMD-002)", async ({
  page,
}) => {
  await page.goto(BASE);
  await expect(page.getByTestId("seat-0-name")).toBeVisible();
  const ids = await seatIds(page);
  await page.evaluate(
    ([t, s]) =>
      window.__tcg!.dispatch({
        type: "CMD_DAMAGE_ADD",
        targetSeatId: t!,
        sourceSeatId: s!,
        sourceIndex: 0,
        delta: 5,
      }),
    [ids[0], ids[1]],
  );
  await expect(page.getByTestId("seat-0-cmd-1")).toHaveText("5");
  await expect(page.getByTestId("seat-0-cmd-0")).toHaveText("me");
  await expect(page.getByTestId("seat-1-cmd-0")).toHaveText("");
  // CMD-004 life link.
  await expect(page.getByTestId("seat-0-value")).toHaveText("35");
});

test("quick commander-damage mode: tap adds 1 from that source, hold removes 1, exit restores (CMD-006)", async ({
  page,
}) => {
  await page.goto(BASE);
  await expect(page.getByTestId("seat-0-name")).toBeVisible();
  await menuTap(page, "toolbar-players");
  await page.getByTestId("players-cmd-mode").click();
  const cell = page.getByTestId("seat-2-cmd-0");
  await cell.click();
  await cell.click();
  await expect(cell).toContainText("2");
  await expect(page.getByTestId("seat-2-value")).toHaveText("38");
  const box = (await cell.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(cell).toContainText("1", { timeout: 3000 });
  await page.mouse.up();
  const dmg = await page.evaluate(() => {
    const g = window.__tcg!.getState().session!.game;
    return g.values[`mtg.cmdDamage|${g.seats[2]!.id}|${g.seats[0]!.id}|0`];
  });
  expect(dmg).toBe(1);
  await page.getByTestId("cmd-mode-exit").click();
  await expect(page.getByTestId("seat-2-plus")).toBeVisible();
});

test("eliminated overlay at 0 life; the seat stays interactive; winner overlay on the last seat (LIFE-004/005)", async ({
  page,
}) => {
  await page.goto(BASE);
  await expect(page.getByTestId("seat-0-name")).toBeVisible();
  const ids = await seatIds(page);
  await page.evaluate(
    (id) =>
      window.__tcg!.dispatch({ type: "COUNTER_SET", counterId: "mtg.life", seatId: id, value: 0 }),
    ids[3]!,
  );
  await expect(page.getByTestId("seat-3-eliminated")).toBeVisible();
  await expect(page.getByTestId("seat-0-eliminated")).toHaveCount(0);
  await page.getByTestId("seat-3-plus").click();
  await expect(page.getByTestId("seat-3-value")).toHaveText("1");
  await page.evaluate((list) => {
    for (const id of list) window.__tcg!.dispatch({ type: "ELIMINATE", seatId: id });
  }, ids.slice(1));
  await expect(page.getByTestId("seat-0-winner")).toBeVisible();
});

test("card layouts: name-only hides badges and mini-grid; big font hides them too (SET-030)", async ({
  page,
}) => {
  for (const layout of ["nameOnly", "bigFont"]) {
    await page.goto(`${BASE}&s.cardLayout=${layout}`);
    await expect(page.getByTestId("seat-0-value")).toBeVisible();
    await expect(page.getByTestId("seat-0-cmdgrid")).toHaveCount(0);
    await expect(page.getByTestId("seat-0-name")).toBeVisible();
  }
});

test("buttons-only tap zones (INP-003 setting)", async ({ page }) => {
  await page.goto(`${BASE}&s.tapZones=buttons`);
  await expect(page.getByTestId("seat-0-name")).toBeVisible();
  const plus = page.getByTestId("seat-1-plus");
  const box = (await plus.boundingBox())!;
  expect(box.width).toBeLessThan(80);
  await plus.click();
  await expect(page.getByTestId("seat-1-value")).toHaveText("41");
});
