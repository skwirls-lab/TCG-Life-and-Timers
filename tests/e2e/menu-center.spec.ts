// @req LAY-010 @req LAY-011 @req TMR-020 @req SET-013 @req SET-031 @req PWA-006 @req A11Y-001 @req A11Y-002 @req SEAT-005
/**
 * MENU: the center menu button (default menu style). The toolbar strip is gone; the brand mark in
 * the middle of the board pauses the clocks and opens the menu. Closing resumes what the menu
 * paused; clocks that were already paused stay paused.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./support/axe";
import { closeMenu, menuTap, openMenu } from "./support/menu";
import { gotoClockBoard, timerState } from "./support/timer";

const BANK = "t.mode=bank&t.bankMs=600000";
const NAMES = "Conner,Josh,JP,Bethany,Declan,Maya,Ana,Ben";
const panel = (page: Page) => page.getByTestId("center-menu-panel");

test.describe("pause rules", () => {
  test("opening pauses running clocks; Resume, tap outside, Escape and Back resume them", async ({
    page,
  }) => {
    await gotoClockBoard(page, BANK);
    await expect(page.getByTestId("center-menu")).toHaveAttribute("data-clock", "start");
    await expect(page.getByTestId("center-menu-badge")).toHaveAttribute("data-kind", "start");
    await menuTap(page, "timer-start");
    await expect(panel(page)).toHaveCount(0);
    await expect.poll(async () => (await timerState(page)).status).toBe("running");
    await expect(page.getByTestId("center-menu-badge")).toHaveCount(0);

    const closers: [string, () => Promise<void>][] = [
      ["Resume", () => page.getByTestId("center-menu-resume").click()],
      [
        "tap outside",
        () => page.getByTestId("center-menu-backdrop").click({ position: { x: 5, y: 5 } }),
      ],
      ["Escape", () => page.keyboard.press("Escape")],
      ["Back", async () => void (await page.goBack())],
    ];
    for (const [how, close] of closers) {
      const a = (await timerState(page)).active;
      const before = (await timerState(page)).remaining[a]!;
      await openMenu(page);
      let s = await timerState(page);
      expect(s.status, how).toBe("paused");
      expect(s.pausedReason, how).toBe("menu");
      await expect(page.getByTestId("center-menu-resume")).toHaveText(/Resume/);
      await expect(page.getByTestId("center-menu-status")).toContainText("paused");
      // The PAUSED overlay stays away while the menu is up (one overlay at a time).
      await expect(page.getByTestId("timer-paused")).toHaveCount(0);
      await page.clock.runFor(20_000);
      expect((await timerState(page)).remaining[a], how).toBe(before);
      await close();
      await expect(panel(page), how).toHaveCount(0);
      await expect(page.getByTestId("timer-paused"), how).toHaveCount(0);
      s = await timerState(page);
      expect(s.status, how).toBe("running");
      await expect(page).toHaveURL(/\/play/);
      await page.clock.runFor(1_000);
    }
  });

  test("clocks paused before stay paused; Resume clocks resumes them", async ({ page }) => {
    await gotoClockBoard(page, BANK);
    await menuTap(page, "timer-start");
    // "Pause clocks" in the menu: kept paused after the menu closes (the PAUSED overlay shows).
    await openMenu(page);
    await expect(page.getByTestId("toolbar-clock")).toHaveAttribute("data-state", "running");
    await page.getByTestId("toolbar-clock").click();
    await expect(page.getByTestId("timer-paused")).toHaveAttribute("data-reason", "user");
    await expect(page.getByTestId("center-menu-badge")).toHaveAttribute("data-kind", "paused");
    // The overlay is modal; M / Escape belong to it, not the menu.
    await page.keyboard.press("m");
    await expect(panel(page)).toHaveCount(0);
    // Open the menu while already paused (the PAUSED overlay covers the button, so via script).
    await page.evaluate(() => {
      (document.querySelector('[data-testid="center-menu"]') as HTMLButtonElement).click();
    });
    await expect(panel(page)).toBeVisible();
    await expect(page.getByTestId("timer-paused")).toHaveCount(0);
    await expect(page.getByTestId("center-menu-resume")).toHaveText("Back to game");
    await closeMenu(page);
    expect((await timerState(page)).status).toBe("paused");
    await expect(page.getByTestId("timer-paused")).toBeVisible();
    // Resume clocks from the menu.
    await page.evaluate(() =>
      (document.querySelector('[data-testid="center-menu"]') as HTMLButtonElement).click(),
    );
    await expect(page.getByTestId("toolbar-clock")).toHaveAttribute("data-state", "paused");
    await page.getByTestId("toolbar-clock").click();
    await expect(panel(page)).toHaveCount(0);
    expect((await timerState(page)).status).toBe("running");
  });

  test("a sheet opened from the menu keeps the clocks paused until it closes", async ({ page }) => {
    await gotoClockBoard(page, BANK);
    await menuTap(page, "timer-start");
    await menuTap(page, "toolbar-players");
    await expect(page.getByTestId("players-popover")).toBeVisible();
    await expect(panel(page)).toHaveCount(0);
    expect((await timerState(page)).status).toBe("paused");
    await expect(page.getByTestId("timer-paused")).toHaveCount(0);
    await page.goBack(); // Back closes only the sheet (D-070)
    await expect(page.getByTestId("players-popover")).toHaveCount(0);
    await expect(page).toHaveURL(/\/play/);
    expect((await timerState(page)).status).toBe("running");
  });

  test("Settings from the menu: paused while away, resumed on Back to the board", async ({
    page,
  }) => {
    await gotoClockBoard(page, BANK);
    // Back must land on the plain board URL (the quick-start URL would start a new game).
    await page.evaluate(() => window.history.replaceState(window.history.state, "", "/play"));
    await menuTap(page, "timer-start");
    const a = (await timerState(page)).active;
    await page.clock.runFor(5_000);
    await menuTap(page, "toolbar-settings");
    await expect(page.getByTestId("settings")).toBeVisible();
    expect((await timerState(page)).pausedReason).toBe("menu");
    await page.clock.runFor(30_000);
    await page.goBack();
    await expect(page.getByTestId("seat-0")).toBeVisible();
    await expect(page.getByTestId("timer-paused")).toHaveCount(0);
    const s = await timerState(page);
    expect(s.status).toBe("running");
    expect(s.remaining[a]).toBe(600_000 - 5_000);
    // One Back from Settings was enough: the menu's history entry was replaced.
    expect(await page.evaluate(() => window.history.state?.overlay)).toBeUndefined();
  });

  test("reset from the menu keeps hold-to-confirm and closes the menu", async ({ page }) => {
    await page.goto("/play?quick=mtg.commander&players=2&seed=7&s.hideSystemBars=0");
    await page.getByTestId("seat-0-minus").click();
    await expect(page.getByTestId("seat-0-value")).toHaveText("39");
    await openMenu(page);
    // A tap only hints.
    await page.getByTestId("toolbar-reset").click();
    await expect(page.getByTestId("snackbar")).toContainText("Hold to reset");
    await expect(panel(page)).toBeVisible();
    await page.getByTestId("toolbar-reset").click({ delay: 1300 });
    await expect(panel(page)).toHaveCount(0);
    await expect(page.getByTestId("seat-0-value")).toHaveText("40");
  });
});

test.describe("keyboard and a11y", () => {
  test("M toggles the menu, focus moves in and back, pause/resume are announced", async ({
    page,
  }) => {
    await gotoClockBoard(page, BANK);
    await menuTap(page, "timer-start");
    await page.getByTestId("seat-0").focus();
    await page.keyboard.press("m");
    await expect(panel(page)).toBeVisible();
    await expect(page.getByTestId("center-menu-resume")).toBeFocused();
    await expect(page.getByTestId("live-announcer")).toHaveText("Clocks paused");
    // Tab stays inside the menu.
    for (let i = 0; i < 12; i++) await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() =>
        document
          .querySelector('[data-testid="center-menu-panel"]')!
          .contains(document.activeElement),
      ),
    ).toBe(true);
    await page.keyboard.press("m");
    await expect(panel(page)).toHaveCount(0);
    await expect(page.getByTestId("center-menu")).toBeFocused();
    await expect(page.getByTestId("live-announcer")).toHaveText("Clocks resumed");
    // Escape opens it too when nothing else is open.
    await page.keyboard.press("Escape");
    await expect(panel(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel(page)).toHaveCount(0);
  });

  test("the board and the open menu have no serious axe violations", async ({ page }) => {
    await page.goto(
      `/play?quick=pokemon.standard&players=2&seed=7&s.hideSystemBars=0&names=${NAMES}`,
    );
    await expect(page.getByTestId("center-menu")).toHaveAccessibleName(/Menu \(pauses the clock\)/);
    await expectNoSeriousA11yViolations(page);
    await openMenu(page);
    await expectNoSeriousA11yViolations(page);
  });
});

test.describe("full screen", () => {
  test("the Full screen item toggles full screen", async ({ page }) => {
    await page.goto("/play?quick=mtg.commander&players=4&seed=7&s.hideSystemBars=0");
    await openMenu(page);
    const item = page.getByTestId("center-menu-fullscreen");
    await expect(item).toHaveAttribute("aria-pressed", "false");
    await item.click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
    await expect(item).toHaveAttribute("aria-pressed", "true");
    await expect(item).toContainText("Exit full screen");
    await item.click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(false);
    await expect(item).toHaveAttribute("aria-pressed", "false");
  });

  test("is hidden where pages can't go full screen (iOS Safari)", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Element.prototype, "requestFullscreen", { value: undefined });
    });
    await page.goto("/play?quick=mtg.commander&players=4&seed=7&s.hideSystemBars=0");
    await openMenu(page);
    await expect(page.getByTestId("toolbar-settings")).toBeVisible();
    await expect(page.getByTestId("center-menu-fullscreen")).toHaveCount(0);
  });
});

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width - 0.5 &&
  b.x < a.x + a.width - 0.5 &&
  a.y < b.y + b.height - 0.5 &&
  b.y < a.y + a.height - 0.5;
async function box(l: Locator): Promise<Box> {
  return (await l.boundingBox())!;
}

test.describe("layout: the button sits on the seam and covers no seat value or name", () => {
  for (const [w, h] of [
    [320, 568],
    [360, 740],
    [915, 412],
  ] as const) {
    test(`${w}×${h}: 2/3/4/6/8 seats, with and without a match timer`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      for (const n of [2, 3, 4, 6, 8]) {
        for (const extra of ["", "&t.matchMs=3000000&t.extraTurns=3"]) {
          await page.goto(
            `/play?quick=mtg.commander&players=${n}&seed=7&names=${NAMES}&s.hideSystemBars=0${extra}`,
          );
          await expect(page.getByTestId(`seat-${n - 1}-value`)).toBeVisible();
          const btn = await box(page.getByTestId("center-menu"));
          expect(Math.min(btn.width, btn.height)).toBeGreaterThanOrEqual(48);
          const board = await box(page.getByTestId("board"));
          // Centred on the board's seam point (the middle for every default layout here).
          const cx = btn.x + btn.width / 2;
          const cy = btn.y + btn.height / 2;
          expect(cx).toBeGreaterThan(board.x + board.width * 0.3);
          expect(cx).toBeLessThan(board.x + board.width * 0.7);
          expect(cy).toBeGreaterThan(board.y + board.height * 0.3);
          expect(cy).toBeLessThan(board.y + board.height * 0.7);
          const covers = [btn];
          if (extra) {
            const pill = await box(page.getByTestId("match-clock"));
            expect(overlaps(pill, btn) || Math.abs(pill.y - (btn.y + btn.height)) < 20).toBe(true);
            covers.push(pill);
          }
          for (let i = 0; i < n; i++) {
            for (const part of ["value", "name"]) {
              const b = await box(page.getByTestId(`seat-${i}-${part}`).first());
              for (const c of covers) {
                expect(
                  overlaps(b, c),
                  `${n}p ${w}×${h}${extra ? " match" : ""}: seat-${i}-${part}`,
                ).toBe(false);
              }
            }
          }
        }
      }
    });
  }
});

test.describe("match clock pill", () => {
  test("always visible beside the button: round time, then TIME · N", async ({ page }) => {
    await gotoClockBoard(page, "t.mode=bank&t.bankMs=1200000&t.matchMs=60000&t.extraTurns=2");
    const pill = page.getByTestId("match-clock");
    await expect(pill).toBeVisible();
    await expect(page.getByTestId("match-clock-time")).toHaveText("1:00");
    const p = await box(pill);
    const b = await box(page.getByTestId("center-menu"));
    expect(Math.abs(p.x + p.width / 2 - (b.x + b.width / 2))).toBeLessThan(2);
    // The menu shows it too (only one copy at a time).
    await openMenu(page);
    await expect(page.getByTestId("match-clock")).toHaveCount(1);
    await expect(panel(page).getByTestId("match-clock-time")).toHaveText("1:00");
    await page.getByTestId("timer-start").click();
    await page.clock.runFor(61_000);
    await expect(page.getByTestId("match-time-called")).toHaveText("TIME · 2");
    await expect(pill).toHaveAttribute("data-called", "true");
  });
});

test.describe("Digimon memory gauge", () => {
  test("keeps its strip; the button sits on the strip beside the gauge", async ({ page }) => {
    for (const vp of [
      { width: 360, height: 740 },
      { width: 915, height: 412 },
    ]) {
      await page.setViewportSize(vp);
      await page.goto("/play?quick=digimon.standard&players=2&seed=7&s.hideSystemBars=0");
      const strip = await box(page.getByTestId("toolbar"));
      const gauge = await box(page.getByTestId("track-digimon.memory"));
      const btn = await box(page.getByTestId("center-menu"));
      for (const b of [gauge, btn]) {
        expect(b.x).toBeGreaterThanOrEqual(strip.x - 1);
        expect(b.y).toBeGreaterThanOrEqual(strip.y - 1);
        expect(b.x + b.width).toBeLessThanOrEqual(strip.x + strip.width + 1);
        expect(b.y + b.height).toBeLessThanOrEqual(strip.y + strip.height + 1);
      }
      expect(overlaps(gauge, btn)).toBe(false);
      for (const i of [0, 1])
        expect(overlaps(await box(page.getByTestId(`seat-${i}`)), btn)).toBe(false);
      // No strip buttons: everything is in the menu.
      await expect(page.getByTestId("toolbar").getByTestId("toolbar-settings")).toHaveCount(0);
      await menuTap(page, "toolbar-settings");
      await expect(page).toHaveURL(/\/settings/);
    }
  });
});

test.describe("calculator", () => {
  test("offered where the preset has one; the clocks stay paused until it closes", async ({
    page,
  }) => {
    await page.goto("/play?quick=mtg.commander&players=4&seed=7&s.hideSystemBars=0");
    await openMenu(page);
    await expect(page.getByTestId("toolbar-settings")).toBeVisible();
    await expect(page.getByTestId("center-menu-calc")).toHaveCount(0);
    await page.goto(
      "/play?quick=ygo.advanced&players=2&seed=5&names=Yugi,Kaiba&s.hideSystemBars=0&t.mode=bank&t.bankMs=600000",
    );
    await menuTap(page, "timer-start");
    await expect.poll(async () => (await timerState(page)).status).toBe("running");
    await menuTap(page, "center-menu-calc");
    await expect(page.getByTestId("calc-sheet")).toBeVisible();
    expect((await timerState(page)).status).toBe("paused");
    await expect(page.getByTestId("timer-paused")).toHaveCount(0);
    await page.getByTestId("calc-sheet-close").click();
    await expect(page.getByTestId("calc-sheet")).toHaveCount(0);
    expect((await timerState(page)).status).toBe("running");
  });
});

test.describe("menu style setting", () => {
  test("Toolbar strip brings back the strip (and its auto-hide option)", async ({ page }) => {
    await page.goto("/play?quick=mtg.commander&players=4&seed=7&s.hideSystemBars=0");
    await menuTap(page, "toolbar-settings");
    await expect(page.getByTestId("settings")).toBeVisible();
    await expect(page.getByTestId("setting-menuStyle-control-center")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByTestId("setting-autoHideMenu")).toHaveCount(0);
    await page.getByTestId("setting-menuStyle-control-strip").click();
    await expect(page.getByTestId("setting-autoHideMenu")).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId("toolbar")).toBeVisible();
    await expect(page.getByTestId("center-menu")).toHaveCount(0);
    await expect(page.getByTestId("toolbar-settings")).toBeVisible();
  });
});
