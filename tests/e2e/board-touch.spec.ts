// @req INP-001 @req INP-002 @req INP-003 @req INP-004 @req INP-006 @req LIFE-001
import { expect, test, type Page } from "@playwright/test";

const URL4 =
  "/play?quick=mtg.commander&players=4&seed=7&names=Conner,Josh,JP,Bethany&s.hideSystemBars=0";

const value = (page: Page, i: number) => page.getByTestId(`seat-${i}-value`);

async function centre(page: Page, testId: string) {
  const box = (await page.getByTestId(testId).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
}

test("four simultaneous touches on four seats all register (INP-001)", async ({ page }) => {
  await page.goto(URL4);
  await expect(page.getByTestId("seat-0-name")).toBeVisible();
  await expect(value(page, 3)).toHaveText("40");
  const points = [];
  for (let i = 0; i < 4; i++) {
    const c = await centre(page, `seat-${i}-plus`);
    points.push({ x: c.x, y: c.y, id: i + 1, radiusX: 4, radiusY: 4, force: 1 });
  }
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: points });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  for (let i = 0; i < 4; i++) await expect(value(page, i)).toHaveText("41");
});

test("press-and-hold applies the hold step, then repeats (INP-004)", async ({ page }) => {
  await page.clock.install();
  await page.goto(URL4);
  await expect(page.getByTestId("seat-0-name")).toBeVisible();
  await expect(value(page, 1)).toHaveText("40");
  const c = await centre(page, "seat-1-plus");
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.clock.runFor(600); // hold delay 500 ms → +10
  await expect(value(page, 1)).toHaveText("50");
  await page.clock.runFor(700); // repeats every 400 ms while held (1.3 s total)
  await page.mouse.up();
  await expect(value(page, 1)).toHaveText("70");
});

test("pending bubble aggregates taps into one history entry (INP-006)", async ({ page }) => {
  await page.goto(URL4);
  await expect(page.getByTestId("seat-0-name")).toBeVisible();
  for (let k = 0; k < 3; k++) await page.getByTestId("seat-2-minus").click();
  await expect(value(page, 2)).toHaveText("37");
  await expect(page.getByTestId("seat-2-bubble")).toHaveText("−3");
  const events = await page.evaluate(() => {
    const g = window.__tcg!.getState().session!.game;
    const seat = g.seats[2]!.id;
    return g.log.filter((e) => e.kind === "counter" && e.seatId === seat);
  });
  expect(events).toHaveLength(1);
  expect(events[0]!.delta).toBe(-3);
  // The bubble fades after the configured duration (2 s default).
  await expect(page.getByTestId("seat-2-bubble")).toBeHidden({ timeout: 4000 });
});

test("+ is on the seat player's own right, whatever the rotation (INP-003)", async ({ page }) => {
  await page.goto(URL4);
  await expect(page.getByTestId("seat-0-name")).toBeVisible();
  for (const i of [0, 1]) {
    const tile = page.getByTestId(`seat-${i}`);
    const rotation = Number(await tile.getAttribute("data-rotation"));
    const { x, y, box } = await centre(page, `seat-${i}`);
    // The player's "right" direction on screen: (1,0) rotated clockwise by the seat rotation.
    const right = { 0: [1, 0], 90: [0, 1], 180: [-1, 0], 270: [0, -1] }[rotation]!;
    const reach = 0.3 * (right[0] !== 0 ? box.width : box.height);
    await page.touchscreen.tap(x + right[0]! * reach, y + right[1]! * reach);
    await expect(value(page, i)).toHaveText("41");
    await page.touchscreen.tap(x - right[0]! * reach, y - right[1]! * reach);
    await page.touchscreen.tap(x - right[0]! * reach, y - right[1]! * reach);
    await expect(value(page, i)).toHaveText("39");
  }
});

test("board surfaces disable selection, callouts and default touch actions (INP-002)", async ({
  page,
}) => {
  await page.goto(URL4);
  await expect(page.getByTestId("seat-0-name")).toBeVisible();
  const css = await page.getByTestId("play").evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      userSelect: s.userSelect,
      touchAction: s.touchAction,
      overscroll: s.overscrollBehavior,
    };
  });
  expect(css.userSelect).toBe("none");
  expect(css.touchAction).toBe("manipulation");
  expect(css.overscroll).toContain("none");
});
