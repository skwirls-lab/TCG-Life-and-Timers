// @req INP-005 @req INP-001 @req ENV-001
/**
 * INP-005 swipe to change (setting, off by default): a vertical swipe on the primary number,
 * relative to the seat's rotation, is ±1; the +/− halves keep tap/hold; several seats can swipe at
 * once. Runs on the Pixel 7 / iPhone 14 projects (ENV-001), all in a portrait viewport.
 */
import { expect, test, type CDPSession, type Page } from "@playwright/test";

test.use({ viewport: { width: 412, height: 915 } });

const BASE = "/play?quick=mtg.commander&seed=7&names=Conner,Josh,JP,Bethany&s.hideSystemBars=0";

/** Screen direction of "up" for a player whose content is rotated `r` degrees clockwise. */
function upVector(r: number): { x: number; y: number } {
  switch (r) {
    case 90:
      return { x: 1, y: 0 };
    case 180:
      return { x: 0, y: 1 };
    case 270:
      return { x: -1, y: 0 };
    default:
      return { x: 0, y: -1 };
  }
}

async function rotationOf(page: Page, i: number): Promise<number> {
  return Number(await page.getByTestId(`seat-${i}`).getAttribute("data-rotation"));
}

async function numberCentre(page: Page, i: number) {
  const b = (await page.getByTestId(`seat-${i}-value`).boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

interface Swipe {
  seat: number;
  dir: "up" | "down";
}

/** Real touch input (CDP): every finger moves 90 px in 6 steps, then lifts. */
async function swipe(cdp: CDPSession, page: Page, swipes: Swipe[]) {
  const fingers: { id: number; c: { x: number; y: number }; dx: number; dy: number }[] = [];
  for (const [k, s] of swipes.entries()) {
    const c = await numberCentre(page, s.seat);
    const u = upVector(await rotationOf(page, s.seat));
    const sign = s.dir === "up" ? 1 : -1;
    fingers.push({ id: k + 1, c, dx: u.x * sign, dy: u.y * sign });
  }
  const at = (step: number) =>
    fingers.map((f) => ({
      id: f.id,
      x: f.c.x + f.dx * step * 15,
      y: f.c.y + f.dy * step * 15,
      radiusX: 4,
      radiusY: 4,
      force: 1,
    }));
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(0) });
  for (let step = 1; step <= 6; step++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(step) });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

const value = (page: Page, i: number) => page.getByTestId(`seat-${i}-value`);

test("swipe is off by default: a swipe on the number changes nothing", async ({ page }) => {
  await page.goto(`${BASE}&players=4`);
  await expect(value(page, 0)).toHaveText("40");
  const cdp = await page.context().newCDPSession(page);
  await swipe(cdp, page, [{ seat: 0, dir: "up" }]);
  await page.waitForTimeout(200);
  await expect(value(page, 0)).toHaveText("40");
});

test("upright (0°) seats: swipe up = +1, swipe down = −1; taps still work", async ({ page }) => {
  await page.goto(`${BASE}&players=2&s.swipe=1&s.cameraMode=bottom`);
  await expect(value(page, 1)).toHaveText("40");
  expect(await rotationOf(page, 1)).toBe(0);
  const cdp = await page.context().newCDPSession(page);
  await swipe(cdp, page, [{ seat: 1, dir: "up" }]);
  await expect(value(page, 1)).toHaveText("41");
  await swipe(cdp, page, [{ seat: 1, dir: "up" }]);
  await expect(value(page, 1)).toHaveText("42");
  await swipe(cdp, page, [{ seat: 1, dir: "down" }]);
  await expect(value(page, 1)).toHaveText("41");
  // Tap on the + / − halves is unchanged (no stray swipe on a still finger).
  await page.getByTestId("seat-1-plus").tap();
  await expect(value(page, 1)).toHaveText("42");
  await page.getByTestId("seat-1-minus").tap();
  await page.getByTestId("seat-1-minus").tap();
  await expect(value(page, 1)).toHaveText("40");
  // The other seat was never touched.
  await expect(value(page, 0)).toHaveText("40");
});

test("90° seat: 'up' follows the player's frame (screen-right), and two seats swipe at once", async ({
  page,
}) => {
  await page.goto(`${BASE}&players=4&s.swipe=1`);
  await expect(value(page, 3)).toHaveText("40");
  const rotations = await Promise.all([0, 1, 2, 3].map((i) => rotationOf(page, i)));
  const ninety = rotations.indexOf(90);
  const other = rotations.findIndex((r, i) => i !== ninety && r !== 90);
  expect(ninety).toBeGreaterThanOrEqual(0);
  const cdp = await page.context().newCDPSession(page);

  // A screen-vertical drag is sideways for this player: nothing happens.
  const c = await numberCentre(page, ninety);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ id: 1, x: c.x, y: c.y }],
  });
  for (let k = 1; k <= 6; k++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ id: 1, x: c.x, y: c.y - k * 15 }],
    });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(200);
  await expect(value(page, ninety)).toHaveText("40");

  await swipe(cdp, page, [{ seat: ninety, dir: "up" }]);
  await expect(value(page, ninety)).toHaveText("41");
  await swipe(cdp, page, [{ seat: ninety, dir: "down" }]);
  await swipe(cdp, page, [{ seat: ninety, dir: "down" }]);
  await expect(value(page, ninety)).toHaveText("39");

  // INP-001: two fingers on two seats at the same time both register.
  await swipe(cdp, page, [
    { seat: ninety, dir: "up" },
    { seat: other, dir: "down" },
  ]);
  await expect(value(page, ninety)).toHaveText("40");
  await expect(value(page, other)).toHaveText("39");
});
