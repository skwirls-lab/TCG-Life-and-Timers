// @req TMR-060 @req GAME-001 @req TMR-001
// Different time per seat (handicap) in setup and settings, and the declare-blockers controls'
// layout at 2/4/6 players on small portrait and landscape phones.
import { expect, test, type Page } from "@playwright/test";
import { menuTap } from "./support/menu";
import { expectNoSeriousA11yViolations } from "./support/axe";
import { gotoClockBoard, timerState } from "./support/timer";

const SHOTS = "artifacts/timers";
const CORNER = { position: { x: 12, y: 12 } };

async function dismissFirstPlayer(page: Page) {
  const overlay = page.getByTestId("first-player-overlay");
  for (let i = 0; i < 4 && (await overlay.count()) > 0; i++) {
    await page.getByTestId("first-player-skip").click(CORNER);
    await page.waitForTimeout(150);
  }
  await expect(overlay).toHaveCount(0);
}

const banks = (page: Page) =>
  page.evaluate(() => {
    const g = window.__tcg!.getState().session!.game;
    return g.seats.map((s) => g.timer.clocks[s.id]!.bankMs);
  });

test("setup: different time per seat → each seat starts with its own bank", async ({
  page,
}, info) => {
  await page.goto("/setup");
  await expect(page.getByTestId("setup")).toBeVisible();
  for (let i = 0; i < 3; i++) await page.getByTestId("setup-next").click();
  await page.getByTestId("setup-clock-mode").selectOption("bank");
  await page.getByTestId("setup-clock-bank-20").click();
  // Blockers timer is on by default for Magic once clocks are on.
  await expect(page.getByTestId("setup-blockers-toggle")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("setup-seat-times-row-0")).toHaveCount(0);
  await page.getByTestId("setup-seat-times-toggle").click();
  await expect(page.getByTestId("setup-seat-times-1-value")).toHaveText("20:00");
  const plus = page.getByRole("button", { name: /\+$/ });
  const seat1Plus = page.getByTestId("setup-seat-times-1").locator("button").last();
  for (let i = 0; i < 5; i++) await seat1Plus.click();
  await expect(page.getByTestId("setup-seat-times-1-value")).toHaveText("25:00");
  await expect(page.getByTestId("setup-seat-times-extra-1")).toHaveText("+5:00");
  expect(await plus.count()).toBeGreaterThan(0);
  const box = (await page
    .getByTestId("setup-seat-times-1")
    .locator("button")
    .last()
    .boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  await page.getByTestId("setup-seat-times").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/handicap-setup-${info.project.name}.png` });
  await expectNoSeriousA11yViolations(page);
  await page.getByTestId("setup-start-game").click();
  await expect(page).toHaveURL(/\/play$/);
  await expect.poll(() => page.evaluate(() => !!window.__tcg?.getState().session)).toBe(true);
  await dismissFirstPlayer(page);
  expect(await banks(page)).toEqual([20, 25, 20, 20].map((m) => m * 60_000));
  await expect(page.getByTestId("seat-1-clock-time")).toHaveText("25:00");
  await expect(page.getByTestId("seat-0-clock-time")).toHaveText("20:00");
});

test("settings: different time per seat mid-game restarts the clocks with the new banks", async ({
  page,
}, info) => {
  await gotoClockBoard(page, "t.mode=bank&t.bankMs=600000");
  await menuTap(page, "timer-start");
  await page.clock.runFor(5_000);
  await page.clock.resume();
  await page.goto("/settings");
  await page.getByTestId("setting-timer.seatTimes-control").click();
  await page.getByTestId("seat-times-toggle").click();
  const minus = page.getByTestId("seat-times-2").locator("button").first();
  await minus.click();
  await minus.click();
  await expect(page.getByTestId("seat-times-2-value")).toHaveText("8:00");
  await page.screenshot({ path: `${SHOTS}/handicap-settings-${info.project.name}.png` });
  await page.getByTestId("seat-times-apply").click();
  await expect(page.getByTestId("timer-restart-confirm")).toBeVisible();
  await page.getByTestId("timer-restart-continue").click();
  await expect(page.getByTestId("setting-timer.seatTimes")).toContainText("−2:00");
  const s = await page.evaluate(() => {
    const g = window.__tcg!.getState().session!.game;
    return { status: g.timer.status, banks: g.seats.map((x) => g.timer.clocks[x.id]!.bankMs) };
  });
  expect(s.status).toBe("idle");
  expect(s.banks).toEqual([10, 10, 8, 10].map((m) => m * 60_000));
});

// Layout: Attack next to PASS TURN, and Blockers declared + Respond on the other tiles, fit
// inside every tile with ≥ 44 px targets.
for (const vp of [
  { w: 320, h: 568, name: "320x568" },
  { w: 915, h: 412, name: "915x412" },
]) {
  for (const players of [2, 4, 6]) {
    test(`blockers controls fit at ${players} players, ${vp.name}`, async ({ page }, info) => {
      test.skip(info.project.name !== "pixel7", "viewport set explicitly");
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await gotoClockBoard(page, "t.mode=bank&t.bankMs=600000", players);
      const a = (await timerState(page)).active;
      await menuTap(page, "timer-start");
      await expect(page.getByTestId(`seat-${a}-attack`)).toBeVisible();
      await page.screenshot({ path: `${SHOTS}/layout-${players}p-${vp.name}-attack.png` });
      await checkInside(page, a, [`seat-${a}-pass`, `seat-${a}-attack`]);
      await page.getByTestId(`seat-${a}-attack`).click();
      await expect(page.getByTestId(`seat-${a}-blockers`)).toBeVisible();
      await page.screenshot({ path: `${SHOTS}/layout-${players}p-${vp.name}-window.png` });
      for (let i = 0; i < players; i++) {
        await expect(page.getByTestId(`seat-${i}-blockers`)).toBeVisible();
        const ids = [`seat-${i}-declared`, `seat-${i}-blockers`];
        if (i === a) ids.push(`seat-${i}-pass`);
        else ids.push(`seat-${i}-respond`);
        await checkInside(page, i, ids);
      }
    });
  }
}

async function checkInside(page: Page, seat: number, ids: string[]) {
  const tile = (await page.getByTestId(`seat-${seat}`).boundingBox())!;
  const boxes = [];
  for (const id of ids) {
    const b = (await page.getByTestId(id).boundingBox())!;
    expect(b, id).toBeTruthy();
    expect(b.x, `${id} left`).toBeGreaterThanOrEqual(tile.x - 1);
    expect(b.y, `${id} top`).toBeGreaterThanOrEqual(tile.y - 1);
    expect(b.x + b.width, `${id} right`).toBeLessThanOrEqual(tile.x + tile.width + 1);
    expect(b.y + b.height, `${id} bottom`).toBeLessThanOrEqual(tile.y + tile.height + 1);
    if (!id.endsWith("-blockers"))
      expect(Math.min(b.width, b.height), id).toBeGreaterThanOrEqual(44);
    boxes.push({ id, ...b });
  }
  // No two controls overlap.
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const p = boxes[i]!;
      const q = boxes[j]!;
      const overlap =
        p.x < q.x + q.width - 1 &&
        q.x < p.x + p.width - 1 &&
        p.y < q.y + q.height - 1 &&
        q.y < p.y + p.height - 1;
      expect(overlap, `${p.id} overlaps ${q.id}`).toBe(false);
    }
}
