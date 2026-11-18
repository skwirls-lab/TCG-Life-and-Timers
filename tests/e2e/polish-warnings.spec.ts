// Low-time warnings sub-page (TMR-031): add / remove thresholds, per-threshold sound/vibrate/flash.
// @req TMR-031 @req SET-010
import { expect, test, type Page } from "@playwright/test";
import { menuTap } from "./support/menu";
import { expectNoSeriousA11yViolations } from "./support/axe";
import { gotoClockBoard, timerState } from "./support/timer";

async function setBank(page: Page, index: number, bankMs: number) {
  await page.evaluate(
    ([i, ms]) => {
      const g = window.__tcg!.getState().session!.game;
      window.__tcg!.dispatch({ type: "TIMER_SET", seatId: g.seats[i]!.id, bankMs: ms });
    },
    [index, bankMs] as const,
  );
}

const warnings = (page: Page) =>
  page.evaluate(() => {
    const c = window.__tcg!.getState().session!.game.timer.config;
    return { warningsMs: c.warningsMs, warnings: c.warnings ?? null };
  });

/** warningsMs of the active game as persisted in IndexedDB (autosave is async). */
const storedWarnings = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number[] | null>((resolve) => {
        const req = indexedDB.open("tcg-life");
        req.onerror = () => resolve(null);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(["kv", "games"], "readonly");
          const ptr = tx.objectStore("kv").get("activeGameId");
          ptr.onsuccess = () => {
            const id = (ptr.result as { value?: string } | undefined)?.value;
            if (!id) return resolve(null);
            const row = tx.objectStore("games").get(id);
            row.onsuccess = () => {
              const g = row.result as
                { game?: { timer?: { config?: { warningsMs?: number[] } } } } | undefined;
              resolve(g?.game?.timer?.config?.warningsMs ?? null);
              db.close();
            };
          };
        };
      }),
  );

// @req TMR-031
test("edit thresholds on the sub-page; a threshold with flash off doesn't flash", async ({
  page,
}) => {
  await gotoClockBoard(page, "t.mode=bank&t.bankMs=600000&t.warnings=60000");
  await menuTap(page, "toolbar-settings");
  await expect(page.getByTestId("settings")).toBeVisible();
  await expect(page.getByTestId("setting-timer.warnings")).toContainText("1:00");
  await page.getByTestId("setting-timer.warnings-control").click();
  await expect(page.getByTestId("settings-sub-warnings")).toBeVisible();
  await expect(page.getByTestId("timer-warning-0")).toHaveAttribute("data-ms", "60000");

  // 1:00: flash off, sound off. Add 2:00 and 0:30, then remove 0:30.
  await page.getByTestId("timer-warning-0-flash").click();
  await page.getByTestId("timer-warning-0-sound").click();
  await page.getByTestId("timer-warning-add-120000").click();
  await page.getByTestId("timer-warning-add-30000").click();
  await expect(page.getByTestId("timer-warning-2")).toHaveAttribute("data-ms", "30000");
  await page.getByTestId("timer-warning-2-remove").click();
  await expect(page.getByTestId("timer-warning-2")).toHaveCount(0);
  await expect(page.getByTestId("timer-warning-1-flash")).toHaveAttribute("aria-checked", "false");
  expect(await warnings(page)).toEqual({
    warningsMs: [120_000, 60_000],
    warnings: [
      { ms: 120_000, sound: true, vibrate: true, flash: true },
      { ms: 60_000, sound: false, vibrate: true, flash: false },
    ],
  });
  await page.getByTestId("page-back").click();
  await expect(page.getByTestId("setting-timer.warnings")).toContainText("2:00 · 1:00");

  // Back on the board (the saved game, not the URL's quick start): 2:00 flashes, 1:00 doesn't.
  await page.clock.runFor(1_000); // autosave
  // The IndexedDB write itself is async: wait until it landed before leaving the page.
  await expect.poll(() => storedWarnings(page)).toEqual([120_000, 60_000]);
  await page.goto("/play");
  await expect(page.getByTestId("center-menu")).toHaveAttribute("data-clock", "start");
  expect((await warnings(page)).warningsMs).toEqual([120_000, 60_000]);
  // The resumed game re-announces its first player: tap through the overlay.
  const overlay = page.getByTestId("first-player-overlay");
  for (let i = 0; i < 4 && (await overlay.count()) > 0; i++) {
    await page.getByTestId("first-player-skip").click({ position: { x: 12, y: 12 } });
    await page.waitForTimeout(100);
  }
  await expect(overlay).toHaveCount(0);
  const a = (await timerState(page)).active;
  await menuTap(page, "timer-start");
  await setBank(page, a, 121_000);
  await page.clock.runFor(1_100);
  await expect(page.getByTestId(`seat-${a}-clock`)).toHaveAttribute("data-flash", "warning");
  await page.clock.runFor(2_000);
  await expect(page.getByTestId(`seat-${a}-clock`)).not.toHaveAttribute("data-flash", "warning");
  await setBank(page, a, 61_000);
  await page.clock.runFor(1_100);
  await expect(page.getByTestId(`seat-${a}-frame`)).not.toHaveClass(/ring-warning/);
  await expect(page.getByTestId(`seat-${a}-clock`)).not.toHaveAttribute("data-flash", "warning");
});

// @req TMR-031 @req A11Y-002
test("the warnings sub-page (next game's defaults) is accessible; presets reset the list", async ({
  page,
}) => {
  await page.goto("/settings");
  await expect(page.getByTestId("settings-scope")).toContainText("next");
  await page.getByTestId("setting-timer.mode-control").selectOption("bank");
  await page.getByTestId("setting-timer.warnings-control").click();
  await expect(page.getByTestId("timer-warning-2")).toHaveAttribute("data-ms", "10000");
  await page.getByTestId("timer-warnings-preset").selectOption("off");
  await expect(page.getByTestId("timer-warnings-empty")).toBeVisible();
  await page.getByTestId("timer-warnings-preset").selectOption("late");
  await expect(page.getByTestId("timer-warning-1")).toHaveAttribute("data-ms", "10000");
  await expectNoSeriousA11yViolations(page);
});
