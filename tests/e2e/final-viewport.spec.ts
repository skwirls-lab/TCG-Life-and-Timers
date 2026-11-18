// @req ENV-003 @req TMR-001
/**
 * ENV-003: the smallest supported viewport, 320×568 portrait. No horizontal scrolling on any
 * page; on the board every seat's number, name and +/− sit inside its tile, and the toolbar
 * buttons stay ≥ 44 px.
 */
import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 320, height: 568 } });

const PLAY = "/play?quick=mtg.commander&seed=7&names=Conner,Josh,JP,Bethany&s.hideSystemBars=0";

async function expectNoHorizontalScroll(page: Page) {
  const m = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
    body: document.body.scrollWidth,
  }));
  expect(m.scroll, "documentElement scrollWidth").toBeLessThanOrEqual(m.client);
  expect(m.body, "body scrollWidth").toBeLessThanOrEqual(m.client);
}

type Box = { x: number; y: number; width: number; height: number };
const inside = (inner: Box, outer: Box, tol = 1) =>
  inner.x >= outer.x - tol &&
  inner.y >= outer.y - tol &&
  inner.x + inner.width <= outer.x + outer.width + tol &&
  inner.y + inner.height <= outer.y + outer.height + tol;

async function expectSeatsFit(page: Page, players: number) {
  for (let i = 0; i < players; i++) {
    const tile = (await page.getByTestId(`seat-${i}`).boundingBox())!;
    expect(tile.x).toBeGreaterThanOrEqual(-1);
    expect(tile.x + tile.width).toBeLessThanOrEqual(321);
    for (const part of ["value", "name", "plus", "minus"]) {
      const el = page.getByTestId(`seat-${i}-${part}`);
      await expect(el).toBeVisible();
      const b = (await el.boundingBox())!;
      expect(inside(b, tile), `seat-${i}-${part} inside its tile`).toBe(true);
    }
    // The name text itself is not clipped away to nothing.
    const name = (await page.getByTestId(`seat-${i}-name`).locator("span").boundingBox())!;
    expect(name.width).toBeGreaterThan(20);
  }
}

async function expectToolbarTargets(page: Page) {
  const toolbar = page.getByTestId("toolbar");
  await expect(toolbar).toBeVisible();
  const buttons = toolbar.locator("button:visible");
  const n = await buttons.count();
  expect(n).toBeGreaterThan(3);
  for (let k = 0; k < n; k++) {
    const b = (await buttons.nth(k).boundingBox())!;
    const label = await buttons.nth(k).getAttribute("data-testid");
    expect(Math.min(b.width, b.height), `${label} target size`).toBeGreaterThanOrEqual(44);
    expect(b.x + b.width).toBeLessThanOrEqual(321);
  }
}

/** MENU: the center menu's items are ≥ 44 px and on screen. */
async function expectMenuTargets(page: Page) {
  await page.getByTestId("center-menu").click();
  const panel = page.getByTestId("center-menu-panel");
  await expect(panel).toBeVisible();
  const p = (await panel.boundingBox())!;
  expect(p.x).toBeGreaterThanOrEqual(-1);
  expect(p.x + p.width).toBeLessThanOrEqual(321);
  expect(p.y + p.height).toBeLessThanOrEqual(569);
  const buttons = panel.locator("button:visible");
  const n = await buttons.count();
  expect(n).toBeGreaterThan(5);
  for (let k = 0; k < n; k++) {
    const b = (await buttons.nth(k).boundingBox())!;
    const label = await buttons.nth(k).getAttribute("data-testid");
    expect(Math.min(b.width, b.height), `${label} target size`).toBeGreaterThanOrEqual(44);
  }
}

for (const players of [2, 4]) {
  test(`board with ${players} players fits 320×568`, async ({ page }) => {
    await page.goto(`${PLAY}&players=${players}`);
    await expect(page.getByTestId("seat-0-value")).toHaveText("40");
    await expectNoHorizontalScroll(page);
    await expectSeatsFit(page, players);
    await expectMenuTargets(page);
  });

  test(`board with ${players} players fits 320×568 (toolbar strip)`, async ({ page }) => {
    await page.goto(`${PLAY}&players=${players}&s.menuStyle=strip`);
    await expect(page.getByTestId("seat-0-value")).toHaveText("40");
    await expectNoHorizontalScroll(page);
    await expectSeatsFit(page, players);
    await expectToolbarTargets(page);
  });
}

// A-5 (review): with a clock configured the START pill (and a match clock) must not push the
// last toolbar buttons off-screen; Settings stays reachable (on the bar or in "More").
for (const [w, h] of [
  [320, 568],
  [360, 740],
] as const) {
  for (const players of [2, 3, 4]) {
    for (const extra of [
      "t.mode=bank&t.bankMs=600000",
      "t.mode=bank&t.bankMs=600000&t.matchMs=3000000&t.extraTurns=3",
    ]) {
      const label = extra.includes("matchMs") ? "clock + match timer" : "clock";
      test(`toolbar with a ${label} fits ${w}×${h}, ${players} players`, async ({ page }) => {
        await page.setViewportSize({ width: w, height: h });
        await page.goto(`${PLAY}&players=${players}&${extra}&s.menuStyle=strip`);
        await expect(page.getByTestId("timer-start")).toBeVisible();
        await expectNoHorizontalScroll(page);
        const toolbar = page.getByTestId("toolbar");
        const buttons = toolbar.locator("button:visible");
        const n = await buttons.count();
        for (let k = 0; k < n; k++) {
          const b = (await buttons.nth(k).boundingBox())!;
          const id = await buttons.nth(k).getAttribute("data-testid");
          expect(Math.min(b.width, b.height), `${id} target size`).toBeGreaterThanOrEqual(44);
          expect(b.x, `${id} left edge`).toBeGreaterThanOrEqual(-1);
          expect(b.x + b.width, `${id} right edge`).toBeLessThanOrEqual(w + 1);
        }
        if (extra.includes("matchMs")) {
          const m = (await page.getByTestId("match-clock").boundingBox())!;
          expect(m.x + m.width).toBeLessThanOrEqual(w + 1);
        }
        // Settings is on the bar, or one tap away in the overflow menu.
        if (!(await page.getByTestId("toolbar-settings").isVisible())) {
          await page.getByTestId("toolbar-more").click();
        }
        const s = (await page.getByTestId("toolbar-settings").boundingBox())!;
        expect(s.x + s.width).toBeLessThanOrEqual(w + 1);
        expect(Math.min(s.width, s.height)).toBeGreaterThanOrEqual(44);
        await page.getByTestId("toolbar-settings").click();
        await expect(page).toHaveURL(/\/settings/);
      });
    }
  }
}

test("seat menu fits 320×568", async ({ page }) => {
  await page.goto(`${PLAY}&players=4`);
  await page.getByTestId("seat-0-name").click();
  const menu = page.getByTestId("seat-menu");
  await expect(menu).toBeVisible();
  for (const tab of ["player", "counters", "commander"]) {
    await page.getByTestId(`seat-menu-tab-${tab}`).click();
    await expectNoHorizontalScroll(page);
    const b = (await menu.boundingBox())!;
    expect(b.width).toBeLessThanOrEqual(321);
    const close = (await page.getByTestId("seat-menu-close").boundingBox())!;
    expect(Math.min(close.width, close.height)).toBeGreaterThanOrEqual(44);
    expect(inside(close, { x: 0, y: 0, width: 320, height: 568 })).toBe(true);
  }
});

for (const path of [
  "/",
  "/setup",
  "/settings",
  "/history",
  "/tools",
  "/profiles",
  "/builder",
  "/pro",
  "/about",
]) {
  test(`${path} has no horizontal scroll at 320×568`, async ({ page }) => {
    if (path === "/history") {
      // History shows the current game: start one first.
      await page.goto(`${PLAY}&players=4`);
      await expect(page.getByTestId("seat-0-value")).toHaveText("40");
      await page.getByTestId("seat-0-minus").click();
    }
    await page.goto(path);
    await expect(page.locator("main").first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expectNoHorizontalScroll(page);
    // Every visible control stays within the viewport width.
    const overflow = await page.evaluate(() =>
      [...document.querySelectorAll("button, a, input, select, [role=switch]")]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          return r.width > 0 && s.visibility !== "hidden" && (r.right > 321 || r.left < -1);
        })
        .map((el) => el.getAttribute("data-testid") ?? el.textContent?.trim().slice(0, 30)),
    );
    expect(overflow).toEqual([]);
  });
}
